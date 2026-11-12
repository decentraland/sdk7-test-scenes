// What an agent did, for a debugger's timeline: a bounded ring of its events (replans with their reason, kept plans
// and planner passes; steps and their ends; senses that asked for a replan; noises heard), stamped with the agent's
// clock. Upstream HTNDemo keeps a History tab per NPC (HTNNPCSimulationPanel.cpp); this is its data. Pure, no SDK.
//
// A run of identical events of one agent is one entry (first time, last time, count), merged as it is recorded: a
// stuck agent retries planning every tick (H7) and would otherwise push its older events out of the ring. Upstream
// HTNDemo's history does not (AIHTNDemoWandererAgent.cpp:301 logs "Planning failed; retrying next update" on every
// update into a 160-entry deque, :468-473, AIHTNDemoWandererAgent.h:92); its debugger tree folds the same idea, a
// node visited again shows once with "retry xN" in Normal mode (HTNGeneratedDebuggerView.h:378-398, :755-761).
import type { GuardEvent } from './actions'

/** The newest `capacity` items, oldest first. */
export class EventRing<T> {
  private readonly items: (T | undefined)[]
  private start = 0
  private size = 0
  /** Items pushed since creation (or clear), including the ones dropped and the ones merged into a slot (replace). */
  total = 0

  /** Slots filled since creation (or clear); an item's serial is the count before it. */
  private slots = 0

  constructor(readonly capacity: number) {
    this.items = new Array(Math.max(1, Math.floor(capacity))).fill(undefined)
  }

  /** Append; returns the item's serial (for at / replace while it is in the ring). */
  push(item: T): number {
    const cap = this.items.length
    if (this.size < cap) this.items[(this.start + this.size++) % cap] = item
    else {
      this.items[this.start] = item
      this.start = (this.start + 1) % cap
    }
    this.total++
    return this.slots++
  }

  /** The item with this serial, undefined once dropped. */
  protected at(serial: number): T | undefined {
    const i = this.indexOf(serial)
    return i === undefined ? undefined : this.items[i]
  }

  /** Put `item` in the slot of `serial` (still in the ring) and count it as pushed. */
  protected replace(serial: number, item: T): void {
    const i = this.indexOf(serial)
    if (i === undefined) return
    this.items[i] = item
    this.total++
  }

  private indexOf(serial: number): number | undefined {
    const offset = serial - (this.slots - this.size)
    return offset < 0 || offset >= this.size ? undefined : (this.start + offset) % this.items.length
  }

  get length(): number {
    return this.size
  }

  /** Oldest first. */
  toArray(): T[] {
    const out: T[] = []
    for (let i = 0; i < this.size; i++) out.push(this.items[(this.start + i) % this.items.length] as T)
    return out
  }

  clear(): void {
    this.items.fill(undefined)
    this.start = 0
    this.size = 0
    this.total = 0
    this.slots = 0
  }
}

/**
 * One agent event at the agent's time (GuardAgent.time, seconds), or a run of identical ones (eventKey): `t` and
 * `event` are the first, `until` the time of the last, `count` how many. A single event has neither (count 1).
 */
export interface AgentLogEntry {
  t: number
  event: GuardEvent
  until?: number
  count?: number
}

/** Events an entry stands for: 1 unless it is a collapsed run (also for entries saved before runs were collapsed). */
export function entryCount(e: AgentLogEntry): number {
  return e.count ?? 1
}

/**
 * When two events of an agent are the same for a timeline: the type and every field a reader tells them apart by,
 * not the time. Only `heard` leaves out its measurements (perceived and alert change every footstep); its level,
 * kind and source stay. Agents are told apart by `guard`.
 */
export function eventKey(e: GuardEvent): string {
  switch (e.type) {
    case 'heard':
      return JSON.stringify([e.type, e.guard, e.kind, e.source, e.muffled, e.level])
    case 'replan':
      return JSON.stringify([e.type, e.guard, e.reason, e.status, e.kept, e.passes, e.plan, e.continued])
    case 'step':
      return JSON.stringify([e.type, e.guard, e.name, e.args])
    case 'step_end':
      return JSON.stringify([e.type, e.guard, e.name, e.status])
    case 'sense':
      return JSON.stringify([e.type, e.guard, e.what, e.from, e.to])
    case 'check':
      return JSON.stringify([e.type, e.guard, e.method, e.step, e.status])
    case 'diagnostic':
      return JSON.stringify([e.type, e.guard, e.code, e.message])
    case 'signal':
      return JSON.stringify([e.type, e.guard, e.name, e.target ?? null])
    case 'catch':
      return JSON.stringify([e.type, e.guard, e.target])
  }
}

export interface AgentHistoryOptions {
  /** Merge a run of identical events of an agent into one entry (default true). */
  collapse?: boolean
}

/**
 * GuardAgentOptions.history: a ring the agent appends every event to. Several agents may share one: a run is per
 * agent (the newest entry of that agent), so another agent's events in between do not end it; any other event of
 * that agent does. A merged entry is a new object (a snapshot taken earlier does not change). `total` counts events.
 */
export class AgentHistory extends EventRing<AgentLogEntry> {
  private readonly collapse: boolean
  /** Per agent: the serial and key of its newest entry. */
  private readonly newest = new Map<string, { serial: number; key: string }>()

  constructor(capacity: number, opts: AgentHistoryOptions = {}) {
    super(capacity)
    this.collapse = opts.collapse ?? true
  }

  push(entry: AgentLogEntry): number {
    if (!this.collapse) return super.push(entry)
    const key = eventKey(entry.event)
    const guard = entry.event.guard
    const last = this.newest.get(guard)
    if (last !== undefined && last.key === key) {
      const prev = this.at(last.serial)
      if (prev !== undefined) {
        this.replace(last.serial, { ...prev, until: entry.until ?? entry.t, count: entryCount(prev) + entryCount(entry) })
        return last.serial
      }
    }
    const serial = super.push(entry)
    this.newest.set(guard, { serial, key })
    return serial
  }

  clear(): void {
    super.clear()
    this.newest.clear()
  }
}

/** A history of the last `capacity` agent entries (runs of identical events collapsed unless opts.collapse is false). */
export function agentHistory(capacity = 256, opts: AgentHistoryOptions = {}): AgentHistory {
  return new AgentHistory(capacity, opts)
}
