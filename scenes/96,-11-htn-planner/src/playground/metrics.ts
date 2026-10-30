// Outcome metrics of a playground level run (docs/htn-level-metrics.md): what the NPCs did with their time and how
// the encounter with the visitor (the tester) went, so a feature's benefit can be put next to its cost (the bench).
// A reader outside the scene: it only observes a LevelSim (a frame after every update, the NPCs' events through
// LevelSim.observer) and never changes it; the scene never loads this file. Deterministic: sim time and sim state only,
// no wall clock (planning ms is the bench's). The reader takes plain frames and events, so its rules are tested on
// small hand-made streams (test/playground/metrics.test.ts); observeLevel feeds it from a level. Pure, no SDK.
import { distanceXZ } from '../htn-planner'
import type { GuardEvent, Vec3 } from '../htn-planner'
import type { CrewMember, LevelSim, Post } from './sim'

/** What a tick of an NPC counts as. */
export type Activity = 'moving' | 'acting' | 'waiting' | 'idle'

/** m an NPC must move in a tick for the tick to count as moving (less is standing, turning on the spot). */
export const MOVE_EPSILON = 1e-3

/**
 * A tick of one NPC: `idle` with no step running (no plan, or between steps), else `moving` when its body moved
 * (more than MOVE_EPSILON m: walking, running, chasing along a plan), else `waiting` for a `!wait…` step, else
 * `acting` (any other step standing: looking around, turning, catching, handing over).
 */
export function activityOf(step: string, moved: number): Activity {
  if (step === '') return 'idle'
  if (moved > MOVE_EPSILON) return 'moving'
  return step.startsWith('!wait') ? 'waiting' : 'acting'
}

/** One NPC as a frame sees it. `key` tells NPCs apart (a respawned NPC is a new key with the same id). */
export interface NpcFrame {
  key: unknown
  id: string
  /** Out in the level (LevelSim.present): an NPC off-stage neither senses nor acts, and is not counted. */
  present: boolean
  /** The running primitive ('' between steps). */
  step: string
  position: Vec3
  /** The targets it has detected now (its blackboard's visible targets). */
  sees: readonly string[]
  /** It sensed some target by presence alone on this update (Perception.senses: by 'presence', not in sight). */
  smells?: boolean
  /** Planner calls it made so far (its decisions and its belief upkeep: metrics.plansMade + reasoningMade). */
  calls?: number
}

/** The level after an update. */
export interface Frame {
  /** Level time after the update, and the update's dt. */
  t: number
  dt: number
  /** The tester script's round, and the level time it started at. */
  round: number
  roundStart: number
  npcs: readonly NpcFrame[]
  /** The visitors the NPCs were offered to sense this update (LevelSim.targetsNow). */
  visitors: readonly string[]
  /** Each NPC's role, for a level with roles. */
  roles?: Readonly<Record<string, string>> | null
  /** The level's own outcome counts so far (LevelSim.outcomes). */
  outcomes?: Readonly<Record<string, number>>
}

export interface NpcMetrics {
  id: string
  /** s present. */
  present: number
  /** Shares of the present time (sum 1). */
  moving: number
  acting: number
  waiting: number
  idle: number
  /** m walked (XZ) while present. */
  walked: number
  replans: number
  /** Replans that found no plan (status other than succeeded). */
  plansFailed: number
  stepsFailed: number
  stepsCancelled: number
  /** Replans a noise asked for (trigger or also 'hearing'). */
  noiseReactions: number
  /** New plans (a successful replan that did not keep the running plan), their steps, those of one step, and those
   *  whose every step is bookkeeping (BOOKKEEPING: forget, unfocus, set, watch...). */
  plansNew: number
  planSteps: number
  plansOneStep: number
  plansBookkeeping: number
  /** Belief upkeep steps run before its plans (ReplanEvent.upkeep). */
  upkeepSteps: number
  /** Planner calls (frames' `calls`, summed over its lives). */
  plannerCalls: number
}

/**
 * A bookkeeping primitive: a step that only changes what the NPC believes or marks (docs/htn-lint.md:
 * memory / state bookkeeping), not what its body does.
 */
export function isBookkeeping(step: string): boolean {
  return /^!(forget|unfocus|refocus|set_|watch|remember|clear_)/.test(step)
}

export interface RoundMetrics {
  round: number
  start: number
  /** s from the round's start to the first detection of a visitor by any NPC (0 when before it); null: none. */
  notice: number | null
  /** s from the round's start to its first catch; null: none. */
  caught: number | null
  catches: number
}

export interface EncounterMetrics {
  /** s some visitor was offered to a present NPC, and s some present NPC had one detected at the same time. */
  exposed: number
  covered: number
  /** s any NPC had a visitor detected. */
  seen: number
  /** s some present NPC sensed a visitor by presence alone (smell: not in sight). */
  presence: number
  /** Detection episodes (an NPC detecting a visitor until it no longer does), those that ended with no catch of that
   *  visitor (by any NPC) during them, and those with one; episodes still open at the end are in `chases` only. */
  chases: number
  lost: number
  won: number
}

export interface SquadMetrics {
  /** Changes of any NPC's role (its first role is not a change). */
  roleChanges: number
  /** s each post was held (some present NPC within its radius). */
  held: Record<string, number>
}

export interface LevelMetrics {
  /** s observed (sum of the frames' dt), and from round 1's start to the last frame. */
  seconds: number
  played: number
  /** Rounds the frames reached (up to the reader's `rounds`). */
  rounds: RoundMetrics[]
  npcs: NpcMetrics[]
  /** Null when no visitor was ever offered to a present NPC. */
  encounter: EncounterMetrics | null
  /** Null for a level without roles or posts. */
  squad: SquadMetrics | null
  /** The level's own outcome counts at the last frame that counted (LevelSim.outcomes). */
  outcomes: Record<string, number>
}

interface Episode {
  won: boolean
}

export interface MetricsReaderOptions {
  /** Rounds that count (frames and events of later rounds are ignored); default all. */
  rounds?: number
  posts?: readonly Post[]
  /** The level hands out roles: count their changes. */
  roles?: boolean
}

/** Reads frames and events into LevelMetrics; see the rules on each field. */
export class MetricsReader {
  private readonly npcs = new Map<string, NpcMetrics>()
  private readonly lastAt = new Map<unknown, Vec3>()
  private readonly lastCalls = new Map<unknown, number>()
  private readonly rounds = new Map<number, RoundMetrics>()
  private readonly episodes = new Map<unknown, Map<string, Episode>>()
  private readonly enc: EncounterMetrics = { exposed: 0, covered: 0, seen: 0, presence: 0, chases: 0, lost: 0, won: 0 }
  private readonly lastRole = new Map<string, string>()
  private readonly held: Record<string, number> = {}
  private roleChanges = 0
  private seconds = 0
  private firstStart = NaN
  private lastT = 0
  private outcomes: Record<string, number> = {}

  constructor(private readonly opts: MetricsReaderOptions = {}) {
    for (const p of opts.posts ?? []) this.held[p.id] = 0
  }

  private counts(round: number): boolean {
    return this.opts.rounds === undefined || round <= this.opts.rounds
  }

  private npc(id: string): NpcMetrics {
    let n = this.npcs.get(id)
    if (!n) {
      n = {
        id,
        present: 0,
        moving: 0,
        acting: 0,
        waiting: 0,
        idle: 0,
        walked: 0,
        replans: 0,
        plansFailed: 0,
        stepsFailed: 0,
        stepsCancelled: 0,
        noiseReactions: 0,
        plansNew: 0,
        planSteps: 0,
        plansOneStep: 0,
        plansBookkeeping: 0,
        upkeepSteps: 0,
        plannerCalls: 0
      }
      this.npcs.set(id, n)
    }
    return n
  }

  private round(round: number, start: number): RoundMetrics {
    let r = this.rounds.get(round)
    if (!r) {
      r = { round, start, notice: null, caught: null, catches: 0 }
      this.rounds.set(round, r)
      if (Number.isNaN(this.firstStart)) this.firstStart = start
    }
    return r
  }

  frame(f: Frame): void {
    if (!this.counts(f.round)) return
    const round = this.round(f.round, f.roundStart)
    this.seconds += f.dt
    this.lastT = f.t
    if (f.outcomes) this.outcomes = { ...f.outcomes }
    let anyPresent = false
    let seen = false
    let smelled = false
    for (const n of f.npcs) {
      const m = this.npc(n.id)
      const before = this.lastAt.get(n.key)
      this.lastAt.set(n.key, { x: n.position.x, y: n.position.y, z: n.position.z })
      const open = this.episodes.get(n.key) ?? new Map<string, Episode>()
      this.episodes.set(n.key, open)
      const sees = n.present ? n.sees : []
      for (const [target, ep] of open) {
        if (sees.includes(target)) continue
        open.delete(target)
        if (ep.won) this.enc.won++
        else this.enc.lost++
      }
      for (const target of sees) {
        if (open.has(target)) continue
        open.set(target, { won: false })
        this.enc.chases++
        if (round.notice === null) round.notice = Math.max(0, f.t - round.start)
      }
      if (!n.present) continue
      anyPresent = true
      if (sees.length > 0) seen = true
      if (n.smells) smelled = true
      if (n.calls !== undefined) {
        m.plannerCalls += Math.max(0, n.calls - (this.lastCalls.get(n.key) ?? 0))
        this.lastCalls.set(n.key, n.calls)
      }
      const moved = before ? distanceXZ(before, n.position) : 0
      m.present += f.dt
      m[activityOf(n.step, moved)] += f.dt
      m.walked += moved
    }
    // A post held by several NPCs at once counts once.
    for (const p of this.opts.posts ?? []) {
      if (f.npcs.some(n => n.present && distanceXZ(n.position, p.at) <= p.radius)) this.held[p.id] += f.dt
    }
    const exposed = anyPresent && f.visitors.length > 0
    if (exposed) this.enc.exposed += f.dt
    if (exposed && seen) this.enc.covered += f.dt
    if (seen) this.enc.seen += f.dt
    if (smelled) this.enc.presence += f.dt
    if (this.opts.roles && f.roles) {
      for (const [id, role] of Object.entries(f.roles)) {
        const was = this.lastRole.get(id)
        if (was !== undefined && was !== role) this.roleChanges++
        this.lastRole.set(id, role)
      }
    }
  }

  /** An NPC's event at level time `t` in `round`; `key` and `id` as in its frames. */
  event(round: number, roundStart: number, t: number, key: unknown, id: string, e: GuardEvent): void {
    if (!this.counts(round)) return
    const m = this.npc(id)
    if (e.type === 'replan') {
      m.replans++
      if (e.status !== 'succeeded') m.plansFailed++
      if (e.trigger === 'hearing' || e.also?.includes('hearing')) m.noiseReactions++
      m.upkeepSteps += e.upkeep?.length ?? 0
      if (e.status === 'succeeded' && !e.kept && e.plan.length > 0) {
        m.plansNew++
        m.planSteps += e.plan.length
        if (e.plan.length === 1) m.plansOneStep++
        if (e.plan.every(isBookkeeping)) m.plansBookkeeping++
      }
    } else if (e.type === 'step_end') {
      if (e.status === 'failed') m.stepsFailed++
      else if (e.status === 'cancelled') m.stepsCancelled++
    } else if (e.type === 'catch') {
      const r = this.round(round, roundStart)
      r.catches++
      if (r.caught === null) r.caught = Math.max(0, t - r.start)
      // A catch ends the chase for the team: every NPC's open episode of that visitor is won.
      for (const open of this.episodes.values()) {
        const ep = open.get(e.target)
        if (ep) ep.won = true
      }
    }
  }

  result(): LevelMetrics {
    const rounds = [...this.rounds.values()].sort((a, b) => a.round - b.round)
    const played = Number.isNaN(this.firstStart) ? 0 : Math.max(0, this.lastT - this.firstStart)
    const out: LevelMetrics = {
      seconds: this.seconds,
      played,
      rounds: rounds.map(r => ({ ...r })),
      npcs: [...this.npcs.values()].map(n => {
        const share = (s: number) => (n.present > 0 ? s / n.present : 0)
        return { ...n, moving: share(n.moving), acting: share(n.acting), waiting: share(n.waiting), idle: share(n.idle) }
      }),
      encounter: this.enc.exposed > 0 ? { ...this.enc } : null,
      squad: this.opts.roles || (this.opts.posts ?? []).length > 0 ? { roleChanges: this.roleChanges, held: { ...this.held } } : null,
      outcomes: { ...this.outcomes }
    }
    return out
  }
}

/** The frame a level is in now (after an update of `dt`). */
export function levelFrame(level: LevelSim, dt: number): Frame {
  return {
    t: level.time,
    dt,
    round: level.round,
    roundStart: level.roundStartedAt,
    npcs: level.crew.map(m => ({
      key: m,
      id: m.id,
      present: level.present(m),
      step: m.agent.currentAction,
      position: m.agent.kinematic.position,
      sees: m.agent.blackboard.visibleTargets.map(t => t.id),
      smells: m.agent.perception.cfg.presenceRadius > 0 && m.agent.perception.senses().some(s => s.by === 'presence'),
      calls: m.agent.metrics.plansMade + m.agent.metrics.reasoningMade
    })),
    visitors: level.targetsNow.map(t => t.id),
    roles: level.roles(),
    outcomes: level.outcomes()
  }
}

/**
 * A reader on `level` (before init(): it hears the events from the first update): its events come through
 * LevelSim.observer; call `sample(dt)` after every update.
 */
export function observeLevel(level: LevelSim, rounds?: number): { reader: MetricsReader; sample: (dt: number) => void } {
  const reader = new MetricsReader({ rounds, posts: level.posts(), roles: level.roles() !== null })
  level.observer = (e: GuardEvent, member: CrewMember) => reader.event(level.round, level.roundStartedAt, level.time, member, member.id, e)
  return { reader, sample: dt => reader.frame(levelFrame(level, dt)) }
}

// ---- the flat view: one number per metric, for tables and means ------------------------------------------------

export type MetricGroup = 'run' | 'crew' | 'plans' | 'encounter' | 'squad' | 'level'

/** A metric of the tables: its key, group and one-line definition (docs/htn-level-metrics.md lists them all). */
export interface MetricDef {
  key: string
  group: MetricGroup
  definition: string
}

export const METRICS: readonly MetricDef[] = [
  { key: 'rounds', group: 'run', definition: 'rounds of the tester script the run reached (the last one may be cut off by --seconds)' },
  { key: 'round_s', group: 'run', definition: 's from round 1\'s start to the end of the run, per round' },
  { key: 'moving', group: 'crew', definition: 'share of an NPC\'s present time with a step running and its body moving (mean over NPCs)' },
  { key: 'acting', group: 'crew', definition: 'share with a step running, standing, not a !wait… step (looking, turning, catching...)' },
  { key: 'waiting', group: 'crew', definition: 'share with a !wait… step running, standing' },
  { key: 'idle', group: 'crew', definition: 'share with no step running (no plan, or between steps)' },
  { key: 'walked_m', group: 'crew', definition: 'm walked per NPC per round (XZ, while present)' },
  { key: 'replans_per_min', group: 'crew', definition: 'replans per NPC per minute present (kept plans too)' },
  { key: 'plans_failed', group: 'crew', definition: 'replans that found no plan, per NPC per round' },
  { key: 'steps_failed', group: 'crew', definition: 'steps that ended failed, per NPC per round' },
  { key: 'steps_cancelled', group: 'crew', definition: 'steps cancelled (a new plan, a rejected running step), per NPC per round' },
  { key: 'noise_reactions', group: 'crew', definition: 'replans a noise asked for (trigger hearing), per NPC per round' },
  { key: 'plans_per_min', group: 'plans', definition: 'new plans per NPC per minute present (a successful replan that did not keep the running plan)' },
  { key: 'plan_len', group: 'plans', definition: 'steps per new plan (deferred steps count one)' },
  { key: 'plan_1step', group: 'plans', definition: 'share of new plans of one step' },
  { key: 'plan_bookkeeping', group: 'plans', definition: 'share of new plans whose every step is bookkeeping (forget, unfocus, refocus, set_, watch...)' },
  { key: 'upkeep_per_min', group: 'plans', definition: 'belief upkeep steps (GuardAgentOptions.reasoning) per NPC per minute present' },
  { key: 'planner_calls_per_min', group: 'plans', definition: 'planner calls (decisions, candidates, upkeep passes) per NPC per minute present' },
  { key: 'noticed_rate', group: 'encounter', definition: 'share of rounds in which some NPC detected the visitor' },
  { key: 'notice_s', group: 'encounter', definition: 's from a round\'s start to the first detection (mean over the rounds with one)' },
  { key: 'catch_rate', group: 'encounter', definition: 'share of rounds with a catch' },
  { key: 'catch_s', group: 'encounter', definition: 's from a round\'s start to its first catch (mean over the rounds with one)' },
  { key: 'notice_to_catch_s', group: 'encounter', definition: 's from the first detection to the first catch of a round (mean over the rounds with both)' },
  { key: 'seen_s', group: 'encounter', definition: 's per round that some NPC had the visitor detected' },
  { key: 'presence_s', group: 'encounter', definition: 's per round that some NPC sensed the visitor by presence alone (smell, out of sight)' },
  { key: 'coverage', group: 'encounter', definition: 'share of the time the visitor was offered to the NPCs\' senses that some NPC had it detected' },
  { key: 'chases', group: 'encounter', definition: 'detection episodes per round (an NPC detecting the visitor until it no longer does)' },
  { key: 'chases_lost', group: 'encounter', definition: 'episodes per round that ended with no catch of the visitor (by any NPC) during them: it got away' },
  { key: 'role_changes', group: 'squad', definition: 'changes of any NPC\'s role per round (the first role is not a change)' },
  { key: 'gate_held', group: 'squad', definition: 'share of the run some NPC stood at the gate (within the post\'s radius)' },
  { key: 'served', group: 'level', definition: 'level 10: crates handed over per round' },
  { key: 'lures', group: 'level', definition: 'level 12: glimpses of a light in its far ring that sent it to look, per round' }
]

const mean = (xs: readonly number[]): number | null => (xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length)

/** The metrics as one number per key (null: not defined for this run, e.g. no catch to time). */
export function flatMetrics(m: LevelMetrics): Record<string, number | null> {
  const rounds = Math.max(1, m.rounds.length)
  const npcs = m.npcs.filter(n => n.present > 0)
  const perNpc = (f: (n: NpcMetrics) => number) => mean(npcs.map(f))
  const out: Record<string, number | null> = {
    rounds: m.rounds.length,
    round_s: m.played / rounds,
    moving: perNpc(n => n.moving),
    acting: perNpc(n => n.acting),
    waiting: perNpc(n => n.waiting),
    idle: perNpc(n => n.idle),
    walked_m: perNpc(n => n.walked / rounds),
    replans_per_min: perNpc(n => (n.replans * 60) / n.present),
    plans_failed: perNpc(n => n.plansFailed / rounds),
    steps_failed: perNpc(n => n.stepsFailed / rounds),
    steps_cancelled: perNpc(n => n.stepsCancelled / rounds),
    noise_reactions: perNpc(n => n.noiseReactions / rounds),
    plans_per_min: perNpc(n => (n.plansNew * 60) / n.present),
    plan_len: perNpc(n => (n.plansNew > 0 ? n.planSteps / n.plansNew : 0)),
    plan_1step: perNpc(n => (n.plansNew > 0 ? n.plansOneStep / n.plansNew : 0)),
    plan_bookkeeping: perNpc(n => (n.plansNew > 0 ? n.plansBookkeeping / n.plansNew : 0)),
    upkeep_per_min: perNpc(n => (n.upkeepSteps * 60) / n.present),
    planner_calls_per_min: perNpc(n => (n.plannerCalls * 60) / n.present)
  }
  const e = m.encounter
  if (e) {
    const noticed = m.rounds.filter(r => r.notice !== null)
    const caught = m.rounds.filter(r => r.caught !== null)
    const both = m.rounds.filter(r => r.notice !== null && r.caught !== null && r.caught >= r.notice)
    out.noticed_rate = noticed.length / rounds
    out.notice_s = mean(noticed.map(r => r.notice as number))
    out.catch_rate = caught.length / rounds
    out.catch_s = mean(caught.map(r => r.caught as number))
    out.notice_to_catch_s = mean(both.map(r => (r.caught as number) - (r.notice as number)))
    out.seen_s = e.seen / rounds
    out.presence_s = e.presence / rounds
    out.coverage = e.exposed > 0 ? e.covered / e.exposed : null
    out.chases = e.chases / rounds
    out.chases_lost = e.lost / rounds
  }
  const s = m.squad
  if (s) {
    out.role_changes = s.roleChanges / rounds
    for (const [id, held] of Object.entries(s.held)) out[`${id}_held`] = m.seconds > 0 ? held / m.seconds : 0
  }
  for (const [name, n] of Object.entries(m.outcomes)) out[name] = n / rounds
  return out
}

/** Per key, the mean over the runs that define it (null where none does). */
export function meanMetrics(runs: readonly Record<string, number | null>[]): Record<string, number | null> {
  const keys = [...new Set(runs.flatMap(r => Object.keys(r)))]
  const out: Record<string, number | null> = {}
  for (const k of keys) out[k] = mean(runs.map(r => r[k]).filter((v): v is number => v !== null && v !== undefined))
  return out
}

/** A number for a table: 3 significant digits at most, no trailing zeros; '-' for null. */
export function formatMetric(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '-'
  if (v === 0) return '0'
  const a = Math.abs(v)
  const digits = a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : 3
  return String(Number(v.toFixed(digits)))
}

/** Rows: the metrics any column has, in METRICS order (then any other key); columns: the named flat metrics. */
export function formatMetricsTable(columns: readonly { label: string; metrics: Record<string, number | null> }[]): string {
  const known = METRICS.map(d => d.key)
  const present = new Set(columns.flatMap(c => Object.keys(c.metrics)))
  const keys = [...known.filter(k => present.has(k)), ...[...present].filter(k => !known.includes(k)).sort()]
  const head = ['metric', ...columns.map(c => c.label)]
  const rows = keys.map(k => [k, ...columns.map(c => formatMetric(c.metrics[k]))])
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map(r => r[i].length)))
  const line = (cells: string[]) => cells.map((c, i) => (i === 0 ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join('  ').trimEnd()
  return [line(head), line(widths.map(w => '-'.repeat(w))), ...rows.map(line)].join('\n')
}
