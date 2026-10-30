// A planning budget per frame, shared by every planner of a set of agents: their replans and a squad decision.
//
// Upstream has none: its demo plans synchronously whenever an NPC has no plan (AIHTNDemoWandererAgent.cpp:163-167, "no
// artificial cooldown") and ticks every NPC every frame (HTNNPCSimulationPanel.cpp:73-86); USE_CASES leaves it to the
// host ("The host owns update cadence and budgets", docs/USE_CASES.md:106). The cost to cap is the frame in which many
// NPCs replan at once (a visitor seen by all, a bell heard by all, a reload): this spreads such runs over frames.
//
// One run is one owner's whole planning: a guard's replan with all its passes, or one squad decision. A requester asks
// with `tryRun(requester, urgent, run)`: granted, `run` is called now and timed; refused, nothing runs, and the
// requester keeps what it is doing (its running plan and step) and asks again next frame. The host calls
// `beginFrame()` once per frame, before the requesters tick (GuardSquad does).
//
// Fairness: requests refused in earlier frames wait in a queue. At the start of a frame the first `maxPlansPerFrame`
// of the queue are reserved (all of it with a time budget only); a request that is not reserved runs only if the
// budget left covers every reserved one (estimated at the mean run time with `planBudgetMs`). The queue is ordered by
// frames waited, an urgent request (its owner has no plan to run) counting `urgentHeadStart` frames more; ties go
// to the one served longest ago. Every frame grants at least one run (a reserved one if any), so nobody starves: a
// plain request waits at most about (requesters / maxPlansPerFrame + urgentHeadStart) frames.
// A run that starts under `planBudgetMs` may end above it: the budget is checked before a run, never cuts one.

import { nowMs } from '../htn/time'

export interface PlanBudgetOptions {
  /** Runs per frame (a guard's replan with all its passes, a squad decision). Default: no limit. The deterministic
   *  budget: who plans in which frame depends only on the simulation, so a seeded run replays exactly. */
  maxPlansPerFrame?: number
  /** Planning ms per frame, by `clock`; checked before a run, the first run of a frame always goes. Default: none.
   *  Wall-clock: who plans when then varies with the machine's speed; for a reproducible run (tests, `htn:level`)
   *  use maxPlansPerFrame, or inject a `clock` that counts something deterministic. */
  planBudgetMs?: number
  /** Frames an urgent request counts as having waited already. Default 4. */
  urgentHeadStart?: number
  /** ms; default performance.now(), else Date.now() (the Explorer's 1 ms steps: prefer maxPlansPerFrame there). */
  clock?: () => number
}

export interface PlanBudgetStats {
  /** Frames begun. */
  frame: number
  /** Runs granted, in all and in this frame; planning ms in this frame. */
  runs: number
  runsThisFrame: number
  msThisFrame: number
  /** The most runs in one frame. */
  maxRunsInFrame: number
  /** Refused requests, one per requester and frame. */
  deferred: number
  /** Requests waiting now. */
  waiting: number
  /** The longest a request waited before it ran, frames (0: it ran in the frame it was made). */
  maxWaitFrames: number
}

interface Waiter {
  since: number
  urgent: boolean
  lastAsk: number
}

/** A mean run time for the estimate: the moving average's weight of a new run. */
const MEAN_WEIGHT = 0.2

export class PlanBudget {
  readonly maxPlansPerFrame: number
  readonly planBudgetMs: number
  readonly urgentHeadStart: number
  readonly stats: PlanBudgetStats = { frame: 0, runs: 0, runsThisFrame: 0, msThisFrame: 0, maxRunsInFrame: 0, deferred: 0, waiting: 0, maxWaitFrames: 0 }
  /** Frames the last granted run waited. */
  lastWaitFrames = 0
  private readonly clock: () => number
  private readonly waiters = new Map<object, Waiter>()
  private readonly lastServed = new WeakMap<object, number>()
  private reserved = new Set<object>()
  private reservedRan = false
  private meanMs = 0

  constructor(opts: PlanBudgetOptions = {}) {
    this.maxPlansPerFrame = Math.max(1, Math.floor(opts.maxPlansPerFrame ?? Infinity))
    this.planBudgetMs = Math.max(0, opts.planBudgetMs ?? Infinity)
    this.urgentHeadStart = Math.max(0, opts.urgentHeadStart ?? 4)
    this.clock = opts.clock ?? nowMs
  }

  /** Start a frame: reset the frame's counters and reserve runs for the requests that waited longest. */
  beginFrame(): void {
    const s = this.stats
    s.frame++
    s.runsThisFrame = 0
    s.msThisFrame = 0
    this.reservedRan = false
    // A requester that did not ask again last frame has nothing to plan any more (stopped, removed, served otherwise).
    for (const [who, w] of this.waiters) if (w.lastAsk < s.frame - 1) this.waiters.delete(who)
    s.waiting = this.waiters.size
    const queue = [...this.waiters.keys()]
    if (queue.length > this.maxPlansPerFrame) queue.sort((a, b) => this.before(a, b))
    this.reserved = new Set(queue.slice(0, this.maxPlansPerFrame))
  }

  /** Frames `requester`'s request has waited so far; 0 if it waits for nothing. */
  waitOf(requester: object): number {
    const w = this.waiters.get(requester)
    return w === undefined ? 0 : this.stats.frame - w.since
  }

  get waiting(): number {
    return this.waiters.size
  }

  /** Drop `requester`'s waiting request (it stopped or left). */
  forget(requester: object): void {
    this.waiters.delete(requester)
    this.reserved.delete(requester)
    this.stats.waiting = this.waiters.size
  }

  /**
   * Run `run` now if the frame's budget allows (true), else remember the request (false: ask again next frame). Ask
   * once per frame: a second refusal in the same frame counts once more in `deferred`.
   */
  tryRun(requester: object, urgent: boolean, run: () => void): boolean {
    const s = this.stats
    if (!this.allows(requester)) {
      s.deferred++
      const w = this.waiters.get(requester)
      if (w === undefined) this.waiters.set(requester, { since: s.frame, urgent, lastAsk: s.frame })
      else {
        w.lastAsk = s.frame
        w.urgent = w.urgent || urgent
      }
      s.waiting = this.waiters.size
      return false
    }
    const w = this.waiters.get(requester)
    this.lastWaitFrames = w === undefined ? 0 : s.frame - w.since
    s.maxWaitFrames = Math.max(s.maxWaitFrames, this.lastWaitFrames)
    if (this.reserved.delete(requester)) this.reservedRan = true
    this.waiters.delete(requester)
    s.waiting = this.waiters.size
    this.lastServed.set(requester, s.frame)
    s.runs++
    s.runsThisFrame++
    s.maxRunsInFrame = Math.max(s.maxRunsInFrame, s.runsThisFrame)
    const started = this.clock()
    try {
      run()
    } finally {
      const ms = Math.max(0, this.clock() - started)
      s.msThisFrame += ms
      this.meanMs = s.runs === 1 ? ms : this.meanMs + MEAN_WEIGHT * (ms - this.meanMs)
    }
    return true
  }

  private allows(requester: object): boolean {
    const s = this.stats
    if (s.runsThisFrame >= this.maxPlansPerFrame) return false
    if (this.reserved.has(requester)) return !this.reservedRan || s.msThisFrame < this.planBudgetMs
    const ahead = this.reserved.size
    if (s.runsThisFrame + ahead >= this.maxPlansPerFrame) return false
    if (s.runsThisFrame === 0 && ahead === 0) return true
    return s.msThisFrame + ahead * this.meanMs < this.planBudgetMs
  }

  /** Queue order: frames waited (urgent ones `urgentHeadStart` more), then served longest ago, then asked first. */
  private before(a: object, b: object): number {
    const wa = this.waiters.get(a)!
    const wb = this.waiters.get(b)!
    const score = (w: Waiter) => this.stats.frame - w.since + (w.urgent ? this.urgentHeadStart : 0)
    return score(wb) - score(wa) || (this.lastServed.get(a) ?? -1) - (this.lastServed.get(b) ?? -1) || wa.since - wb.since
  }
}
