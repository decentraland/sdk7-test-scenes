// The stalker's body controller, pure (no SDK): what the HTN executors ask of the body (StalkerHost: a clip, a head
// turn, a world-space look) turned into what a model shows every frame: the clip and its speed, the head's angle (a
// StalkerGaze: a scan while it walks its round, the looks the domain asks for, at a bounded turn speed), its
// footfalls in time with the walk and run clips, and cues for its voice (noticed, heard, chase, lost, caught, gave up).
// The head's angle also aims its sight: give the agent `sightYaw: () => rig.sightYaw(agent)`.
// Per frame, around agent.tick: rig.beforeTick(dt, agent); agent.tick(...); rig.afterTick(dt). Route the agent's
// events through rig.onEvent. The scene side (stalker-model.ts) reads `clip`, `speed`, `gaze.degrees`, `steps`
// and `cues`; tests read the same headless. Deterministic: sim time only, no random numbers.
import type { GuardAgent } from '../../htn-planner/npc/agent'
import type { GuardEvent } from '../../htn-planner/npc/actions'
import { angleDiff, DEG, Vec3 } from '../../htn-planner/npc/vec'
import type { StalkerClip, StalkerGait, StalkerHost } from './stalker-actions'
import { stalkerFacts } from './stalker-actions'
import { StalkerGaze } from './stalker-gaze'

/** Seconds per semantic gait cycle at speed 1; kept consistent across visual adapters. */
export const STALKER_CYCLES: Partial<Record<StalkerClip, number>> = { PatrolWalk: 3.2, AggroRun: 0.8 }
/** Where a foot touches down, as a fraction of the cycle (both clips: the right foot, then the left). */
export const STALKER_FOOTFALLS: readonly number[] = [0.472, 0.972]

/** How many touch-downs a clip's phase passes going from `from` to `to` (cycles; `to` >= `from`). */
export function footfallsBetween(from: number, to: number, footfalls: readonly number[] = STALKER_FOOTFALLS): number {
  let n = 0
  for (const f of footfalls) n += Math.floor(to - f) - Math.floor(from - f)
  return n
}

export const isPatrolClip = (clip: StalkerClip) => clip === 'PatrolWalk' || clip === 'PatrolIdle' || clip === 'PatrolTurn'
export const isOneShotClip = (clip: StalkerClip) => clip === 'HeadTurnLeft' || clip === 'BodyTurnLeft'

export type StalkerCue = 'noticed' | 'heard' | 'chase' | 'lost' | 'caught' | 'gave_up'

export interface StalkerRigOptions {
  /** The gait clips the actions play (StalkerActionConfig.gaitClips): which clip is a walk, a hurry, a run. */
  gaitClips: Record<StalkerGait, { clip: StalkerClip; speed: number }>
  /** On a patrol round: the head scans while it walks, and recognition turns are world-space looks. */
  patrol: boolean
  /** Where the hunted target is now (StalkerHost.targetPosition). */
  target: () => Vec3 | undefined
  cycles?: Partial<Record<StalkerClip, number>>
  footfalls?: readonly number[]
}

/** Cues kept for a reader that polls (the newest last). */
const CUE_KEEP = 8

export class StalkerRig implements StalkerHost {
  /** The clip the body should show now, and its speed. */
  clip: StalkerClip = 'PatrolIdle'
  speed = 1
  /** Bumps whenever a clip must (re)start from its first frame: a one-shot played again. */
  clipStarts = 0
  readonly gaze = new StalkerGaze()
  /** Footfalls so far, and the gait of the last one ('walk' | 'hurry' | 'run'). */
  steps = 0
  stepGait: StalkerGait = 'walk'
  /** The latest cues, `seq` counting from 1; a reader keeps the last seq it handled. */
  readonly cues: { seq: number; cue: StalkerCue }[] = []
  cueSeq = 0
  /** World-space look while recognising a target on a patrol (lookWorldYaw), radians; null: none. */
  attentionYaw: number | null = null
  /** The head's angle the executors ask for (lookYaw), degrees from the body; null: released. */
  private look: number | null = null
  private gait: StalkerGait | null = null
  private gaitClip: StalkerClip | '' = ''
  private phase = 0
  private chased = false
  /** The last step was a chase: a next step that is not a chase or a catch means the target got away. */
  private chasing = false
  private noticed = false
  private focused = false
  private yaw = 0

  /** StalkerHost.lookWorldYaw: only on a patrol (see the domain's notice_target). */
  readonly lookWorldYaw?: (radians: number | null) => void

  constructor(private readonly opts: StalkerRigOptions) {
    if (opts.patrol) this.lookWorldYaw = radians => (this.attentionYaw = radians)
  }

  // ---- StalkerHost --------------------------------------------------------------------------------

  play(clip: StalkerClip, speed = 1): void {
    if (isOneShotClip(clip) || clip !== this.clip) this.clipStarts++
    this.clip = clip
    this.speed = speed
  }
  /** Timers decide (the domain's clips have fixed lengths): a renderer's "finished" would make a scene run and a
   *  headless one differ. */
  clipFinished(): boolean {
    return false
  }
  targetPosition(): Vec3 | undefined {
    return this.opts.target()
  }
  lookYaw(degrees: number | null): void {
    this.look = degrees
  }

  // ---- per frame ----------------------------------------------------------------------------------

  /** Where it looks, world radians: the body's yaw plus the head's angle. */
  sightYaw(agent: { kinematic: { yaw: number } }): number {
    return agent.kinematic.yaw + this.gaze.degrees * DEG
  }

  /** Before agent.tick: turn the head (it aims the sight the agent senses with). */
  beforeTick(dt: number, agent: GuardAgent): void {
    const w = agent.blackboard.world
    this.focused = stalkerFacts.focused(w)
    this.noticed = w.rows('noticed', 1).length > 0
    this.yaw = agent.kinematic.yaw
    const patrolClip = isPatrolClip(this.clip)
    const wanted = !patrolClip ? 0 : this.attentionYaw !== null ? angleDiff(this.yaw, this.attentionYaw) / DEG : this.look
    this.gaze.update(dt, patrolClip && this.opts.patrol && !this.focused && !this.noticed, wanted)
    if (!patrolClip) this.gaze.degrees = 0
  }

  /** After agent.tick: footfalls of the walking clip; a clip that is not a patrol one holds the head straight. */
  afterTick(dt: number): void {
    if (!isPatrolClip(this.clip)) this.gaze.degrees = 0
    const g = this.opts.gaitClips
    const gait: StalkerGait | null =
      this.clip === g.walk.clip ? 'walk' : this.clip === g.run.clip ? (this.speed < g.run.speed - 1e-9 ? 'hurry' : 'run') : null
    if (gait !== this.gait) {
      if (gait && this.clip !== this.gaitClip) this.phase = 0 // a newly selected clip starts its cycle
      this.gaitClip = gait ? this.clip : ''
      this.gait = gait
    }
    if (!gait || !(dt > 0)) return
    const cycle = (this.opts.cycles ?? STALKER_CYCLES)[this.clip]
    if (!cycle) return
    const from = this.phase
    this.phase += (dt * this.speed) / cycle
    const n = footfallsBetween(from, this.phase, this.opts.footfalls)
    if (n > 0) {
      this.steps += n
      this.stepGait = gait
    }
  }

  /** The agent's events: attention, and the cues. */
  onEvent(e: GuardEvent, agent: { kinematic: { yaw: number } }): void {
    if (e.type === 'step') {
      if (this.chasing && e.name !== '!chase' && e.name !== '!catch') this.cue('lost')
      this.chasing = e.name === '!chase'
      if (e.name !== '!notice' && e.name !== '!stand' && e.name !== '!head_turn' && e.name !== '!body_turn') this.attentionYaw = null
      if (e.name === '!chase' && !this.chased) {
        this.chased = true
        this.cue('chase')
      }
    } else if (e.type === 'catch') this.cue('caught')
    else if (e.type === 'signal') {
      if (e.name === 'noticed') {
        // Keep the bearing it saw the target at through the notice pause (no sweeping away from it).
        if (this.opts.patrol) this.attentionYaw = this.sightYaw(agent)
        this.cue('noticed')
      } else if (e.name === 'heard') this.cue('heard')
      else if (e.name === 'gave_up') this.cue('gave_up')
    }
  }

  private cue(cue: StalkerCue): void {
    this.cues.push({ seq: ++this.cueSeq, cue })
    if (this.cues.length > CUE_KEEP) this.cues.shift()
  }
}

// ---- voice -------------------------------------------------------------------------------------------

export interface VoiceRules {
  /** The line per cue (a clip url); a cue with none stays silent. */
  lines: Partial<Record<StalkerCue, string>>
  /** Seconds each line lasts (by url): a lesser line does not cut in meanwhile. */
  seconds: Readonly<Record<string, number>>
  /** Said at most once per spawn. */
  once: readonly StalkerCue[]
  /** At least this many seconds between two of the same cue. */
  every: Partial<Record<StalkerCue, number>>
  /** Higher cuts in on a lower one still speaking; equal or lower is skipped, never queued. */
  urgency: Partial<Record<StalkerCue, number>>
}

/** One line at a time from its head: which line a cue says now, if any. Pure; `now` in seconds (sim time). */
export class VoiceGate {
  private busyUntil = -Infinity
  private speaking: StalkerCue | null = null
  private readonly said = new Set<StalkerCue>()
  private readonly lastAt = new Map<StalkerCue, number>()

  constructor(private readonly rules: VoiceRules) {}

  /** A new spawn: every line may be said again. */
  reset(): void {
    this.busyUntil = -Infinity
    this.speaking = null
    this.said.clear()
    this.lastAt.clear()
  }

  /** The url to play for `cue` at `now`, or null (no line, said already, too soon, someone more urgent speaks). */
  say(cue: StalkerCue, now: number): string | null {
    const r = this.rules
    const url = r.lines[cue]
    if (!url) return null
    if (r.once.includes(cue) && this.said.has(cue)) return null
    const every = r.every[cue]
    const last = this.lastAt.get(cue)
    if (every !== undefined && last !== undefined && now - last < every) return null
    if (now < this.busyUntil && this.speaking !== null && (r.urgency[cue] ?? 0) <= (r.urgency[this.speaking] ?? 0)) return null
    this.said.add(cue)
    this.lastAt.set(cue, now)
    this.speaking = cue
    this.busyUntil = now + (r.seconds[url] ?? 0)
    return url
  }
}
