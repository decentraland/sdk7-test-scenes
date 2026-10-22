// The stalker as a model in the scene (ECS): assets/stalker/stalker.glb with its clips driven by a StalkerRig
// (stalker-rig.ts), the head turned by weights on three one-frame gaze poses, footsteps in time with its feet and
// its voice on cues, from AudioSources on it (spatial: heard from where it stands).
// The recipe for an HTN NPC with animation and sound reactions: the agent's executors talk to the rig (pure, tested
// headless), and this reads the rig every frame. The planner never sees an asset; copy the two files and the assets.
// Per frame: model.update(dt, rig, pose, shown). A new rig (a respawn) starts the cycle, the steps and the voice
// over. No `~system/*` imports: it runs on the headless engine in tests.
import { Animator, AudioSource, engine, Entity, GltfContainer, Transform } from '@dcl/sdk/ecs'
import { Quaternion } from '@dcl/sdk/math'
import type { Vec3 } from '../../htn-planner'
import type { StalkerClip } from './stalker-actions'
import { GAZE_CLIPS, gazeWeights } from './stalker-gaze'
import { isOneShotClip, isPatrolClip, StalkerRig, VoiceGate, VoiceRules } from './stalker-rig'

const DIR = 'assets/stalker/'
export const STALKER_ASSETS = {
  model: `${DIR}stalker.glb`,
  /** One step each, cut from a footsteps take: four for a walk, four harder ones for a run. */
  steps: {
    walk: [1, 2, 3, 4].map(i => `${DIR}stalker-step-walk-${i}.ogg`),
    run: [1, 2, 3, 4].map(i => `${DIR}stalker-step-run-${i}.ogg`)
  },
  /** "Mmm, your fear. It tastes delicious." / "Run, little one! It only makes the hunt more... enjoyable." */
  voice: { notice: `${DIR}stalker-voice-notice.ogg`, fear: `${DIR}stalker-voice-fear.ogg`, run: `${DIR}stalker-voice-run.ogg` }
}
/** Its height at scale 1 (m), for labels above it. */
export const STALKER_HEIGHT = 3.84
const BODY_CLIPS: readonly StalkerClip[] = ['PatrolWalk', 'PatrolIdle', 'PatrolTurn', 'HeadTurnLeft', 'AggroRun', 'BodyTurnLeft']
/** Its lines: it noticed you (at most every 20 s), heard something (once a spawn), lost you in a chase (once a spawn).
 *  None on the catch: that line is long and the run ends there. */
export const STALKER_VOICE: VoiceRules = {
  lines: { noticed: STALKER_ASSETS.voice.notice, heard: STALKER_ASSETS.voice.fear, lost: STALKER_ASSETS.voice.run },
  seconds: { [STALKER_ASSETS.voice.notice]: 5.71, [STALKER_ASSETS.voice.fear]: 6.79, [STALKER_ASSETS.voice.run]: 8.86 },
  once: ['heard', 'lost'],
  every: { noticed: 20 },
  urgency: { heard: 0, noticed: 1, lost: 2 }
}
const STEP_MIX = { walk: { volume: 0.9, pitch: 0.9 }, hurry: { volume: 0.95, pitch: 0.95 }, run: { volume: 1, pitch: 1 } }
/** No two steps alike: a fixed round of pitch offsets (no random numbers in the scene). */
const STEP_JITTER = [0, -0.03, 0.025, -0.012, 0.035, -0.02, 0.01]
const STEP_SOURCES = 2
const FADE = 0.18 // s, crossfade between the patrol clips
const HIDDEN_Y = -40 // m: off-stage

export interface StalkerModelOptions {
  parent?: Entity
  scale: number
  /** Sound on (default): steps and voice. */
  sound?: boolean
}

/** Crossfades between the patrol clips; any other clip is selected outright (full-body poses do not blend). */
class ClipPlayer {
  private current: StalkerClip = 'PatrolIdle'
  private from: StalkerClip = 'PatrolIdle'
  private fade = 1

  constructor(private readonly entity: Entity) {
    Animator.create(entity, {
      states: [
        ...BODY_CLIPS.map(clip => ({ clip, playing: clip === 'PatrolIdle', loop: !isOneShotClip(clip), speed: 1, weight: clip === 'PatrolIdle' ? 1 : 0, shouldReset: true })),
        ...GAZE_CLIPS.map((clip, i) => ({ clip, playing: true, loop: true, speed: 0, weight: i === 1 ? 1 : 0, shouldReset: false }))
      ]
    })
  }

  select(clip: StalkerClip, speed: number) {
    Animator.playSingleAnimation(this.entity, clip, true)
    for (const s of Animator.getMutable(this.entity).states) {
      if ((GAZE_CLIPS as readonly string[]).includes(s.clip)) continue
      s.weight = s.clip === clip ? 1 : 0
      s.speed = s.clip === clip ? speed : 1
      s.loop = !isOneShotClip(s.clip as StalkerClip)
    }
    this.current = this.from = clip
    this.fade = 1
  }

  blend(next: StalkerClip, speed: number, dt: number) {
    const changed = next !== this.current
    if (changed) {
      this.from = this.current
      this.current = next
      this.fade = 0
      for (const s of Animator.getMutable(this.entity).states) {
        if ((GAZE_CLIPS as readonly string[]).includes(s.clip)) continue
        s.playing = s.clip === next || s.clip === this.from
        s.shouldReset = s.clip === next
        s.weight = s.clip === this.from ? 1 : 0
        if (s.clip === next) s.speed = speed
      }
    }
    if (this.fade >= 1) return
    this.fade = Math.min(1, this.fade + Math.max(0, dt) / FADE)
    for (const s of Animator.getMutable(this.entity).states) {
      if ((GAZE_CLIPS as readonly string[]).includes(s.clip)) continue
      if (!changed) s.shouldReset = false
      s.weight = s.clip === this.current ? this.fade : s.clip === this.from ? 1 - this.fade : 0
      if (this.fade === 1 && s.clip !== this.current) s.playing = false
    }
  }

  setSpeed(clip: StalkerClip, speed: number) {
    for (const s of Animator.getMutable(this.entity).states) if (s.clip === clip) s.speed = speed
  }

  /** The head: weights on the gaze poses (only the head pivot moves); written only when they change. */
  gaze(degrees: number) {
    const w = gazeWeights(degrees)
    const now = Animator.get(this.entity).states
    const same = GAZE_CLIPS.every((clip, i) => {
      const s = now.find(x => x.clip === clip)
      return s?.playing === true && s.speed === 0 && Math.abs((s.weight ?? 1) - w[i]) < 1e-4
    })
    if (same) return
    const a = Animator.getMutable(this.entity)
    GAZE_CLIPS.forEach((clip, i) => {
      let s = a.states.find(x => x.clip === clip)
      if (!s) {
        s = { clip }
        a.states.push(s)
      }
      s.playing = true
      s.speed = 0
      s.loop = true
      s.shouldReset = false
      s.weight = w[i]
    })
  }
}

export class StalkerModel {
  /** Unscaled: where it stands and which way it faces. */
  readonly root: Entity
  /** The model (scaled). */
  readonly model: Entity
  /** An invisible box around its body, for the pointer (and labels riding on it). */
  readonly hit: Entity
  /** Steps and lines started (tests, debugging). */
  stepsPlayed = 0
  linesSaid: string[] = []
  private readonly clips: ClipPlayer
  private readonly steps: Entity[] = []
  private readonly voice: Entity
  private readonly gate = new VoiceGate(STALKER_VOICE)
  private rig: StalkerRig | null = null
  private shown: { clip: StalkerClip | ''; speed: number; starts: number } = { clip: '', speed: 1, starts: -1 }
  private stepsSeen = 0
  private cueSeen = 0
  private nextSource = 0
  private clock = 0
  private visible = true

  constructor(private readonly opts: StalkerModelOptions) {
    const s = opts.scale
    this.root = engine.addEntity()
    Transform.create(this.root, opts.parent !== undefined ? { parent: opts.parent } : {})
    this.model = engine.addEntity()
    Transform.create(this.model, { parent: this.root, scale: { x: s, y: s, z: s } })
    // It never blocks anyone, nor sight (the agent's line of sight is the level's, not the renderer's).
    GltfContainer.create(this.model, { src: STALKER_ASSETS.model, visibleMeshesCollisionMask: 0, invisibleMeshesCollisionMask: 0 })
    this.clips = new ClipPlayer(this.model)
    const h = STALKER_HEIGHT * s * 0.8
    this.hit = engine.addEntity()
    Transform.create(this.hit, { parent: this.root, position: { x: 0, y: h / 2, z: 0 }, scale: { x: 1.1 * s, y: h, z: 1.1 * s } })
    for (let i = 0; i < STEP_SOURCES; i++) {
      const e = engine.addEntity()
      Transform.create(e, { parent: this.root, position: { x: 0, y: 0.3, z: 0 } })
      this.steps.push(e)
    }
    this.voice = engine.addEntity()
    Transform.create(this.voice, { parent: this.root, position: { x: 0, y: STALKER_HEIGHT * s * 0.85, z: 0 } })
  }

  /** Height of the top of its head (m), for labels. */
  get height(): number {
    return STALKER_HEIGHT * this.opts.scale
  }

  /** One frame: follow the rig and the pose; `shown` false keeps it off-stage and silent. */
  update(dt: number, rig: StalkerRig, pose: { position: Vec3; yaw: number }, shown: boolean): void {
    this.clock += Math.max(0, dt)
    if (rig !== this.rig) this.adopt(rig)
    const t = Transform.getMutable(this.root)
    t.position = { x: pose.position.x, y: shown ? pose.position.y : HIDDEN_Y, z: pose.position.z }
    t.rotation = Quaternion.fromEulerDegrees(0, (pose.yaw * 180) / Math.PI, 0)
    if (shown !== this.visible) {
      this.visible = shown
      if (!shown) for (const e of [...this.steps, this.voice]) if (AudioSource.has(e)) AudioSource.getMutable(e).playing = false
    }
    if (!shown) {
      this.stepsSeen = rig.steps
      this.cueSeen = rig.cueSeq
      return
    }
    this.animate(dt, rig)
    this.clips.gaze(rig.gaze.degrees)
    if (this.opts.sound !== false) this.sound(rig)
  }

  /** A new NPC behind the same body: its clip starts over, past steps and cues are not replayed, every line again. */
  private adopt(rig: StalkerRig) {
    this.rig = rig
    this.shown = { clip: '', speed: 1, starts: -1 }
    this.stepsSeen = rig.steps
    this.cueSeen = rig.cueSeq
    this.gate.reset()
  }

  private animate(dt: number, rig: StalkerRig) {
    const clip = rig.clip
    const restart = rig.clipStarts !== this.shown.starts && isOneShotClip(clip)
    const changed = restart || clip !== this.shown.clip || rig.speed !== this.shown.speed
    if (!restart && isPatrolClip(clip) && this.shown.clip !== '' && isPatrolClip(this.shown.clip)) {
      this.clips.blend(clip, rig.speed, dt)
      if (changed) this.clips.setSpeed(clip, rig.speed)
    } else if (changed) this.clips.select(clip, rig.speed)
    this.shown = { clip, speed: rig.speed, starts: rig.clipStarts }
  }

  private sound(rig: StalkerRig) {
    // At most two a frame: a long frame does not burst.
    const n = Math.min(2, rig.steps - this.stepsSeen)
    for (let i = 0; i < n; i++) this.step(rig.stepGait)
    this.stepsSeen = rig.steps
    for (const c of rig.cues) {
      if (c.seq <= this.cueSeen) continue
      const url = this.gate.say(c.cue, this.clock)
      if (url) {
        AudioSource.createOrReplace(this.voice, { audioClipUrl: url, playing: true, volume: 1, loop: false, currentTime: 0 })
        this.linesSaid.push(url)
      }
    }
    this.cueSeen = rig.cueSeq
  }

  private step(gait: 'walk' | 'hurry' | 'run') {
    const k = this.stepsPlayed++
    const clips = gait === 'walk' ? STALKER_ASSETS.steps.walk : STALKER_ASSETS.steps.run
    const mix = STEP_MIX[gait]
    const source = this.steps[this.nextSource]
    this.nextSource = (this.nextSource + 1) % this.steps.length
    AudioSource.createOrReplace(source, {
      audioClipUrl: clips[k % clips.length],
      playing: true,
      volume: mix.volume,
      pitch: mix.pitch * (1 + STEP_JITTER[k % STEP_JITTER.length]),
      loop: false,
      currentTime: 0
    })
  }

  dispose(): void {
    for (const e of [...this.steps, this.voice, this.hit, this.model, this.root]) engine.removeEntity(e)
  }
}
