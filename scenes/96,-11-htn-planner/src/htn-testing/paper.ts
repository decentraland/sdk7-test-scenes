// Portable pure host model for game-owned HTN tests and canonical examples.
// A Stage holds agents and an expected-trace story. PaperHost reduces executors and sensors to the
// facts they write; agents plan, run effects, replan on interruption/failure and record DebugSessions.
// No catalogue, Node or SDK dependencies. This models host contracts, not physical scene execution.
import { AgentHistory } from '../htn-planner/npc/history'
import { buildSession } from '../htn-planner/debug/session'
import { decompose, decomposeDeferred } from '../htn-planner/htn/planner'
import { float, formatAtom, formatTask, int, list, str, sym } from '../htn-planner/htn/atom'
import { HTN_IR_VERSION } from '../htn-planner/htn/ir'
import { PlanTraceRecorder } from '../htn-planner/htn/trace'
import { WorldState } from '../htn-planner/htn/world-state'
import type { Atom } from '../htn-planner/htn/atom'
import type { BacktrackingMode, DecompositionStatus, PlannerOptions, PlanStep } from '../htn-planner/htn/planner'
import type { DebugSession } from '../htn-planner/debug/session'
import type { DomainIR } from '../htn-planner/htn/ir'
import type { GuardEvent } from '../htn-planner/npc/actions'

// ---- world helpers (host effects and story edits use these) ---------------------------------------------------

/** The symbol or string of an atom, else the atom as a .worldstate writes it ('' for none). */
export const text = (a: Atom | undefined): string =>
  a === undefined ? '' : a.t === 'sym' || a.t === 'str' ? a.v : formatAtom(a)

/** A number atom's value (int or float), else NaN. */
export const num = (a: Atom | undefined): number => (a !== undefined && (a.t === 'int' || a.t === 'float') ? a.v : NaN)

const same = (a: Atom, b: Atom): boolean => a.t === b.t && (a.t === 'list' ? JSON.stringify(a.v) === JSON.stringify(b.v) : a.v === b.v)

/** The first row of `name`/`arity`, or undefined. */
export const first = (w: WorldState, name: string, arity: number): readonly Atom[] | undefined => w.rows(name, arity)[0]

/** The number in the first row of a one-argument fact (`trunk_health 3`), or `fallback`. */
export function count(w: WorldState, name: string, fallback = 0): number {
  const n = num(first(w, name, 1)?.[0])
  return Number.isNaN(n) ? fallback : n
}

/** Whether `w` has a row of `name` equal to `args`. */
export const has = (w: WorldState, name: string, ...args: Atom[]): boolean => w.rows(name, args.length).some(r => r.every((a, i) => same(a, args[i])))

/** Replace every row of `name`/`args.length` with one row. */
export function put(w: WorldState, name: string, ...args: Atom[]): void {
  w.clear(name, args.length)
  w.add(name, ...args)
}

/** Remove the rows of `name`/`arity` whose first argument is `key` (every row when `key` is undefined). */
export function drop(w: WorldState, name: string, arity: number, key?: Atom): void {
  if (key === undefined) w.clear(name, arity)
  else w.removeWhere(name, arity, r => r[0] !== undefined && same(r[0], key))
}

/** The rows of a fact as text, `a b, c d`; `(none)` when there is none. */
export function rowsText(w: WorldState, name: string): string {
  const rows: string[] = []
  for (const key of w.tableKeys()) {
    const at = key.lastIndexOf('/')
    if (key.slice(0, at) !== name) continue
    for (const r of w.rows(name, Number(key.slice(at + 1)))) rows.push(formatTask('', r).trim())
  }
  return rows.length === 0 ? '(none)' : rows.join(', ')
}

/** Every fact of a world as `name arg...` lines, sorted: for comparing worlds. */
export function factLines(w: WorldState): string[] {
  const out: string[] = []
  for (const key of w.tableKeys()) {
    const at = key.lastIndexOf('/')
    const name = key.slice(0, at)
    for (const r of w.rows(name, Number(key.slice(at + 1)))) out.push(formatTask(name, r))
  }
  return out.sort()
}

const TOKEN = /\s*("(?:[^"\\]|\\.)*"|\(|\)|[^\s()"]+)/y
const INT = /^[+-]?\d+$/
const FLOAT = /^[+-]?(\d+\.\d*|\.\d+|\d+(\.\d*)?[eE][+-]?\d+)$/

/**
 * Add the facts of `text` to `w`, in the .worldstate syntax: one fact per line, `name arg...`; arguments are ints,
 * floats (with a '.'), "strings", symbols and (lists); `//` comments and blank lines are skipped. Rows keep their
 * order. Returns the lines it could not read (nothing is thrown).
 */
export function addFacts(w: WorldState, text: string): string[] {
  const bad: string[] = []
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\/\/.*$/, '').trim()
    if (line === '') continue
    const tokens: string[] = []
    TOKEN.lastIndex = 0
    for (let m = TOKEN.exec(line); m !== null; m = TOKEN.exec(line)) tokens.push(m[1])
    let at = 0
    const atom = (): Atom | undefined => {
      const t = tokens[at++]
      if (t === undefined || t === ')') return undefined
      if (t === '(') {
        const items: Atom[] = []
        while (tokens[at] !== undefined && tokens[at] !== ')') {
          const a = atom()
          if (a === undefined) return undefined
          items.push(a)
        }
        if (tokens[at++] !== ')' || items.length === 0) return undefined
        return list(...items)
      }
      if (INT.test(t)) return int(Number(t))
      if (FLOAT.test(t)) return float(Number(t))
      if (t.startsWith('"')) return str(t.slice(1, -1).replace(/\\(.)/g, '$1'))
      return sym(t)
    }
    const name = tokens[at++]
    const args: Atom[] = []
    let ok = name !== undefined && /^[A-Za-z_][\w-]*$/.test(name)
    while (ok && at < tokens.length) {
      const a = atom()
      if (a === undefined) ok = false
      else args.push(a)
    }
    if (ok) w.add(name, ...args)
    else bad.push(raw.trim())
  }
  return bad
}

// ---- the host contract ------------------------------------------------------------------------------------------

/**
 * What a step writes into the world when it finishes (the planner itself writes nothing). Return false when the
 * step fails at run time: the agent drops its plan and plans again. `now` is the agent's clock after the step.
 */
export type StepEffect = (args: readonly Atom[], world: WorldState, now: number) => boolean | void

/** A scripted host: an example's executors and sensors reduced to the facts they write. */
export interface PaperHost {
  /** Effects per primitive name (with '!'); a primitive not listed only takes time. */
  effects?: Readonly<Record<string, StepEffect>>
  /** What a step leaves when a story's `fails` makes it fail (e.g. the taxi broke down). */
  failures?: Readonly<Record<string, StepEffect>>
  /** Seconds a step takes; default 1. */
  duration?(name: string, args: readonly Atom[], now: number): number
  /**
   * Sensors and upkeep: facts derived from the rest of the world (a path step, the taxis that work), facts whose
   * lifetime ran out. Runs when the agent starts, before every root plan, after every step and every story event.
   */
  sense?(world: WorldState, now: number): void
  /** Write `(now ?seconds)` before every root plan. */
  clock?: boolean
  /** What dropping a running plan leaves (a replan switched away from it, a step failed). */
  dropped?(world: WorldState, now: number): void
}

/**
 * Killzone-style plan brackets: `!begin_plan ?name ?args...` writes `(active_plan ?name ?args...)`, `!end_plan` and a
 * dropped plan remove it, so the next replan sees what is running (a continue branch reads it).
 */
export const ACTIVE_PLAN: Required<Pick<PaperHost, 'dropped'>> & { effects: Record<string, StepEffect> } = {
  effects: {
    '!begin_plan': (args, w) => {
      clearAll(w, 'active_plan')
      w.add('active_plan', ...args)
    },
    '!end_plan': (_args, w) => clearAll(w, 'active_plan')
  },
  dropped: w => clearAll(w, 'active_plan')
}

/** Remove every row of `name`, any arity. */
export function clearAll(w: WorldState, name: string): void {
  for (const key of w.tableKeys()) {
    const at = key.lastIndexOf('/')
    if (key.slice(0, at) === name) w.clear(name, Number(key.slice(at + 1)))
  }
}

// ---- stage, agents, stories -------------------------------------------------------------------------------------

/** Domains and fresh scenario worlds supplied by the caller, keyed by a host-chosen name. */
export interface StageEnv {
  /** The domain of a station (its .domain file's stem), or undefined. */
  domain(station: string): DomainIR | undefined
  /** A fresh copy of a station's scenario world, or undefined. */
  scenario(station: string, name: string): WorldState | undefined
  /** Record the planner's runs and the timeline, for `session()`. */
  record?: boolean
  /** Optional checks at stable boundaries, after sensing/effects. Throws on invalid worlds. */
  validate?(station: string, world: WorldState, agent: string): void
}

export interface AgentOptions {
  /** Prefixes the agent's trace lines (`d1: plan: ...`) and names it in a session; default: no prefix, the station. */
  id?: string
  /** Default: the story's station. */
  station?: string
  world: WorldState
  method: string
  args?: readonly Atom[]
  host?: PaperHost
  mode?: BacktrackingMode
  /** Optional game-owned host calls, fresh for this agent. */
  callterms?: PlannerOptions['callterms']
  daemons?: PlannerOptions['daemons']
  context?: unknown
  /** The agent's clock at the start (seconds). */
  start?: number
  /** Optional test-harness hook, separate from production planner execution. */
  validateWorld?(world: WorldState): void
}

/** An outside change during `simulate`: a sensor update, another character, time passing. */
export interface StoryEvent {
  /** Comes once this many steps have run or failed (0: before the first plan). */
  afterStep: number
  note: string
  edit?(world: WorldState, now: number): void
  /**
   * The host replans on it while a plan runs: `switch` to the new plan, or `keep` the running one when the new plan
   * is its rest (or `continue` when the domain answers `(!continue)`). Default false: the change is read at the
   * next plan or deferred step.
   */
  replan?: boolean
}

export interface SimulateOptions {
  events?: readonly StoryEvent[]
  /** A scripted run-time failure: whether this run of a step fails (`attempt` counts runs of the same step, from 1). */
  fails?(step: string, world: WorldState, attempt: number): boolean
  /** Stop when this holds (checked after every step that ran). */
  until?(world: WorldState): boolean
  /** Steps (run or failed) at most; default 40. */
  maxSteps?: number
}

const stepText = (s: PlanStep): string => formatTask(s.name, s.args)
const planText = (steps: readonly PlanStep[]): string => (steps.length === 0 ? '(empty)' : steps.map(stepText).join(', '))

export interface TickResult {
  status: DecompositionStatus
  /** The new plan, as planned. */
  plan: string[]
  /** The running plan goes on (`keep`, `continue`, or no plan while one runs). */
  kept: boolean
}

/**
 * One planning agent on a stage: its domain, its own world, its root task and its host. `tick` plans the root and
 * decides; `step` / `run` execute; `simulate` is the whole loop. Every decision is a trace line:
 * `plan: <steps>` (nothing was running), `switch: <steps>`, `keep: <rest>`, `continue: <rest>` (the domain answered
 * `(!continue)`), `no plan (<status>)` (a running plan goes on), `expand <&step>: <its steps>` or `... : no plan`
 * (the plan is dropped), `run <step>`, `fail <step>` (dropped), `diagnostic: <message>`.
 */
export class Agent {
  readonly id: string
  readonly domain: DomainIR
  readonly world: WorldState
  readonly method: string
  readonly args: readonly Atom[]
  readonly host: PaperHost
  /** The agent's clock, seconds: each step adds its duration. */
  now: number
  readonly recorder: PlanTraceRecorder | undefined
  private plan: PlanStep[] = []
  private cursor = 0
  private readonly attempts = new Map<string, number>()
  private readonly prefix: string
  private readonly options: PlannerOptions

  constructor(
    private readonly stage: Stage,
    domain: DomainIR,
    private readonly o: AgentOptions,
    /** Prefix the trace lines with the id. */
    named = true
  ) {
    this.id = o.id ?? 'agent'
    this.prefix = named ? `${this.id}: ` : ''
    this.domain = domain
    this.world = o.world
    this.method = o.method
    this.args = o.args ?? []
    this.host = o.host ?? {}
    this.now = o.start ?? 0
    this.recorder = stage.recording ? new PlanTraceRecorder(domain, { keep: 1024, time: () => stage.t }) : undefined
    this.options = {
      mode: o.mode,
      callterms: o.callterms,
      daemons: o.daemons,
      context: o.context,
      trace: this.recorder,
      calltermErrorPolicy: 'report',
      onDiagnostic: d => this.log(`diagnostic: ${d.message}`)
    }
    this.sense()
  }

  /** The steps left in the running plan (deferred ones unexpanded). */
  get remaining(): string[] {
    return this.plan.slice(this.cursor).map(stepText)
  }

  get running(): boolean {
    return this.cursor < this.plan.length
  }

  /** A line of this agent's trace. */
  log(line: string): void {
    this.stage.log(this.prefix + line)
  }

  /** Run the host's sensors now. */
  sense(): void {
    this.host.sense?.(this.world, this.now)
    this.validateWorld()
  }

  /** Assert complete host state; never called between individual fact writes. */
  validateWorld(): void {
    this.o.validateWorld?.(this.world)
  }

  /** Plan the root once against the world as it is now (the clock and sensors first). */
  private root(): { status: DecompositionStatus; steps: PlanStep[] } {
    if (this.host.clock) put(this.world, 'now', float(this.now))
    this.sense()
    const r = decompose(this.domain, this.world, this.method, this.args, this.options)
    return { status: r.status, steps: r.plan }
  }

  /** Plan the root and log it, without touching the running plan (a host that runs plans side by side). */
  propose(reason = 'propose'): { status: DecompositionStatus; plan: string[]; steps: PlanStep[] } {
    const r = this.root()
    const plan = r.steps.map(stepText)
    this.log(r.status === 'succeeded' ? `plan: ${planText(r.steps)}` : `no plan (${r.status})`)
    this.history({ type: 'replan', guard: this.id, reason, status: r.status, plan, kept: false, passes: 1, trigger: 'request' })
    return { status: r.status, plan, steps: r.steps }
  }

  /** Plan the root and decide: adopt the new plan, or keep the running one (see the class comment). */
  tick(reason = 'tick'): TickResult {
    const r = this.root()
    const previous = this.remaining
    const plan = r.steps.map(stepText)
    let kept = this.running
    if (r.status !== 'succeeded') {
      this.log(`no plan (${r.status})`)
    } else if (plan.length === 1 && plan[0] === '!continue') {
      this.log(`continue: ${this.running ? previous.join(', ') : '(nothing running)'}`)
    } else if (this.running && this.isRest(r.steps)) {
      this.log(`keep: ${previous.join(', ')}`)
    } else {
      this.log(`${this.running ? 'switch' : 'plan'}: ${planText(r.steps)}`)
      if (this.running) this.dropPlan()
      this.plan = r.steps.slice()
      this.cursor = 0
      kept = false
    }
    this.history({ type: 'replan', guard: this.id, reason, status: r.status, plan: kept ? previous : plan, kept, passes: 1, trigger: 'request', previous })
    return { status: r.status, plan, kept }
  }

  /** The candidate is the rest of the running plan (a leading deferred step of the candidate expanded first). */
  private isRest(candidate: readonly PlanStep[]): boolean {
    let c = candidate
    if (c.length > 0 && c[0].kind === 'deferred') {
      const r = decomposeDeferred(this.domain, this.world, c[0] as Extract<PlanStep, { kind: 'deferred' }>, { mode: this.options.mode })
      if (r.status !== 'succeeded') return false
      c = [...r.plan, ...c.slice(1)]
    }
    const rest = this.plan.slice(this.cursor)
    return c.length === rest.length && c.every((s, i) => stepText(s) === stepText(rest[i]))
  }

  private dropPlan(): void {
    this.plan = []
    this.cursor = 0
    this.host.dropped?.(this.world, this.now)
    this.validateWorld()
  }

  /**
   * Execute the next step: expand the deferred steps at the cursor against the world as it is now, then run one
   * primitive (`fails` decides a scripted failure). 'ended': no step left (after expansions to nothing).
   */
  step(fails?: SimulateOptions['fails']): 'ran' | 'failed' | 'dropped' | 'ended' {
    this.validateWorld()
    while (this.cursor < this.plan.length && this.plan[this.cursor].kind === 'deferred') {
      const deferred = this.plan[this.cursor] as Extract<PlanStep, { kind: 'deferred' }>
      const r = decomposeDeferred(this.domain, this.world, deferred, this.options)
      if (r.status !== 'succeeded') {
        this.log(`expand ${stepText(deferred)}: no plan`)
        this.dropPlan()
        return 'dropped'
      }
      this.log(`expand ${stepText(deferred)}: ${planText(r.plan)}`)
      this.plan.splice(this.cursor, 1, ...r.plan)
    }
    if (this.cursor >= this.plan.length) return 'ended'
    const step = this.plan[this.cursor] as Extract<PlanStep, { kind: 'primitive' }>
    const name = stepText(step)
    const attempt = (this.attempts.get(name) ?? 0) + 1
    this.attempts.set(name, attempt)
    this.history({ type: 'step', guard: this.id, name: step.name, args: step.args })
    this.now += this.host.duration?.(step.name, step.args, this.now) ?? 1
    let ok: boolean
    if (fails?.(name, this.world, attempt)) {
      this.host.failures?.[step.name]?.(step.args, this.world, this.now)
      ok = false
    } else ok = this.host.effects?.[step.name]?.(step.args, this.world, this.now) !== false
    this.sense()
    this.history({ type: 'step_end', guard: this.id, name: step.name, status: ok ? 'done' : 'failed' })
    if (!ok) {
      this.log(`fail ${name}`)
      this.dropPlan()
      return 'failed'
    }
    this.log(`run ${name}`)
    this.cursor++
    return 'ran'
  }

  /** Run up to `n` primitives of the running plan; stops at a failure or the end. Returns the steps that ran. */
  run(n = Infinity): string[] {
    const done: string[] = []
    while (done.length < n && this.running) {
      if (this.step() !== 'ran') break
      done.push(stepText(this.plan[this.cursor - 1]))
    }
    return done
  }

  /**
   * The host loop: plan when nothing runs, run the steps with their effects, replan when the plan ends, a step or a
   * deferred step fails, or an event asks for it. Ends at an empty plan, no plan, a plan that expanded to nothing
   * (`until: done` when `until` holds, `stop: <n> steps` at the cap).
   */
  simulate(o: SimulateOptions = {}): void {
    const maxSteps = o.maxSteps ?? 40
    const events = [...(o.events ?? [])].sort((a, b) => a.afterStep - b.afterStep)
    let next = 0
    let steps = 0
    let ranThisPlan = 0
    let plans = 0
    const fire = () => {
      while (next < events.length && events[next].afterStep <= steps) {
        const e = events[next++]
        this.stage.event(e.note, () => e.edit?.(this.world, this.now))
        this.sense()
        if (e.replan && this.running) this.tick(`event: ${e.note}`)
      }
    }
    fire()
    while (steps < maxSteps) {
      if (!this.running) {
        if (++plans > 2 * maxSteps + 2) break
        this.tick(steps === 0 ? 'start' : 'plan ended')
        if (!this.running) return
        ranThisPlan = 0
      }
      const r = this.step(o.fails)
      if (r === 'ended') {
        if (ranThisPlan === 0) return
        continue
      }
      if (r === 'dropped') continue
      steps++
      ranThisPlan++
      this.stage.t = Math.max(this.stage.t, this.now)
      if (r === 'ran' && o.until?.(this.world)) {
        this.log('until: done')
        return
      }
      fire()
    }
    this.log(`stop: ${steps} steps`)
  }

  /** Log the rows of a fact: `<name>: a b, c d` or `<name>: (none)`. */
  show(name: string): void {
    this.log(`${name}: ${rowsText(this.world, name)}`)
  }

  /** Log whether the world is a scenario's world: `world is <name>`, else the facts that differ. */
  matches(scenario: string, station?: string): void {
    const other = this.stage.scenario(scenario, station ?? this.stage.stationOf(this))
    const mine = factLines(this.world)
    const theirs = factLines(other)
    const plus = mine.filter(f => !theirs.includes(f))
    const minus = theirs.filter(f => !mine.includes(f))
    this.log(plus.length + minus.length === 0 ? `world is ${scenario}` : `world differs from ${scenario}: ${[...plus.map(f => '+' + f), ...minus.map(f => '-' + f)].join('; ')}`)
  }

  /** Record a step a custom executor ran (a host that runs plans side by side), with its trace line. */
  record(step: PlanStep, line = `run ${stepText(step)}`): void {
    this.history({ type: 'step', guard: this.id, name: step.name, args: step.args })
    this.history({ type: 'step_end', guard: this.id, name: step.name, status: 'done' })
    this.log(line)
  }

  private history(event: GuardEvent): void {
    this.stage.history?.push({ t: this.stage.t, event })
  }
}

/**
 * Where a story plays: its agents, one shared trace, the session clock `t` (`at`), outside events and probes.
 * Unknown stations or scenarios are trace lines (`problem: ...`), never exceptions.
 */
export class Stage {
  readonly trace: string[] = []
  readonly agents: Agent[] = []
  /** The session clock (seconds) stamped on recorded runs and events. */
  t = 0
  readonly history: AgentHistory | undefined
  private readonly stations = new Map<Agent, string>()

  constructor(
    readonly story: Story,
    private readonly env: StageEnv
  ) {
    this.history = env.record ? new AgentHistory(4096, { collapse: false }) : undefined
  }

  get recording(): boolean {
    return this.env.record === true
  }

  log(line: string): void {
    this.trace.push(line)
  }

  /** Set the session clock. */
  at(t: number): void {
    this.t = t
  }

  /** An outside change: applies `edit`, logs `event: <note>`. */
  event(note: string, edit?: () => void): void {
    edit?.()
    this.log(`event: ${note}`)
    this.history?.push({ t: this.t, event: { type: 'signal', guard: 'story', name: note } })
  }

  /** A fresh copy of a scenario's world (default: of the story's station); empty and a `problem:` line if unknown. */
  scenario(name: string, station = this.story.station): WorldState {
    const w = this.env.scenario(station, name)
    if (w !== undefined) return w
    this.log(`problem: no scenario '${station}/${name}'`)
    return new WorldState()
  }

  /** A world from facts text (the .worldstate syntax); unreadable lines are `problem:` lines. */
  facts(text: string, into = new WorldState()): WorldState {
    for (const bad of addFacts(into, text)) this.log(`problem: cannot read the fact '${bad}'`)
    return into
  }

  /** A new agent (its domain: the station's). */
  agent(o: AgentOptions): Agent {
    const station = o.station ?? this.story.station
    let domain = this.env.domain(station)
    if (domain === undefined) {
      this.log(`problem: no station '${station}'`)
      domain = this.env.domain(this.story.station) ?? EMPTY_DOMAIN
    }
    const agent = new Agent(this, domain, { ...o, id: o.id ?? station,
      validateWorld: w => {
        this.env.validate?.(station, w, o.id ?? station)
        o.validateWorld?.(w)
      }
    }, o.id !== undefined)
    this.agents.push(agent)
    this.stations.set(agent, station)
    return agent
  }

  stationOf(agent: Agent): string {
    return this.stations.get(agent) ?? this.story.station
  }

  /** The recording as a DebugSession (each agent's planner runs and worlds, the timeline), when recording. */
  session(): DebugSession | undefined {
    if (this.history === undefined) return undefined
    const main = this.env.domain(this.story.station) ?? this.agents[0]?.domain
    if (main === undefined) return undefined
    const agents = this.agents.flatMap(a => (a.recorder ? [{ id: a.id, recorder: a.recorder, world: a.world }] : []))
    return buildSession({ domain: main, agents, histories: [this.history] })
  }
}

const EMPTY_DOMAIN: DomainIR = { version: HTN_IR_VERSION, name: 'Missing', methods: [], axioms: [], topLevel: {}, facts: [], callterms: [] }

/** A story: a script on a stage and the trace it must give. */
export interface Story {
  /** Domain key understood by StageEnv; consumer checks use 'game'. */
  station: string
  name: string
  /** What it shows. */
  blurb: string
  play(stage: Stage): void
  expect: readonly string[]
}

/** A one-agent story as data: a start world, the host, outside events, scripted failures, a stop rule. */
export interface SimpleStory extends SimulateOptions {
  station: string
  name: string
  blurb: string
  /** Start from this scenario's world (of the station); default: an empty world. */
  from?: string
  /** Facts added to the start world (the .worldstate syntax). */
  facts?: string
  edit?(world: WorldState): void
  method: string
  args?: readonly Atom[]
  host?: PaperHost
  mode?: BacktrackingMode
  start?: number
  /** Facts logged (`show`) when the run ends. */
  show?: readonly string[]
  expect: readonly string[]
}

/** A story that simulates one agent (Agent.simulate) from its start world. */
export function story(s: SimpleStory): Story {
  return {
    station: s.station,
    name: s.name,
    blurb: s.blurb,
    expect: s.expect,
    play: stage => {
      const world = s.from !== undefined ? stage.scenario(s.from) : new WorldState()
      if (s.facts !== undefined) stage.facts(s.facts, world)
      s.edit?.(world)
      const agent = stage.agent({ world, method: s.method, args: s.args, host: s.host, mode: s.mode, start: s.start })
      agent.simulate(s)
      for (const name of s.show ?? []) agent.show(name)
    }
  }
}

/** The primitives a trace ran, in order (to compare with a source's expected plan). */
export const executed = (trace: readonly string[]): string[] => trace.filter(l => l.startsWith('run ')).map(l => l.slice(4))
