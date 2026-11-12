// Runtime HTN planner over a linked DomainIR. Semantics follow upstream
// urosidoki/htn_planner 2.4.0 (docs/DOMAIN_LANGUAGE.md, generated C behavior, HTNTest).
// Ships in the scene bundle: ES2020, synchronous, no eval/Function/Proxy/async/Node APIs.
import type { Atom } from './atom'
import {
  calltermMessage,
  validateCallterms,
  type CallTermDaemons,
  type CallTermErrorInfo,
  type CallTermErrorPolicy,
  type CallTermRegistry
} from './callterms'
import { DEFAULT_MAX_DEPTH, Engine } from './engine'
import type { AxiomId, CondIR, DomainIR, MethodId, SourceLoc, TaskIR } from './ir'
import type { FactRow, WorldState } from './world-state'

export type { CallTerm } from './callterms'

/** Upstream HTNBacktrackingMode flags. Default: both true (HTN_BACKTRACKING_ALL). */
export interface BacktrackingMode {
  /** Retry other fact/axiom solutions when a later condition or task fails. */
  factsAndAxioms: boolean
  /** Try the next branch after a selected branch's task subtree failed. */
  branches: boolean
}

export interface PlannerOptions {
  /** Host functions by name (upstream's registry): plain functions, or `callterm(...)` / `memberCallterm(...)` bindings. */
  callterms?: CallTermRegistry
  /** Instances for member callterms, by daemon id (upstream HTNCallTermBindingContext::SetDaemon). */
  daemons?: CallTermDaemons
  /**
   * What a callterm error does (upstream CallTermErrorPolicy): 'fail_silently' fails the call, 'report' fails it
   * and sends one diagnostic per failed invocation to onDiagnostic. 'unset' (default, as upstream), 'report'
   * without onDiagnostic or an invalid value fail the call unreported, like upstream's release build, and print one
   * console warning per runner and condition (its debug assert). Never throws. Errors: a missing callterm, binding
   * or daemon, arguments a typed binding rejects, a result it cannot convert, a non-bool standalone condition. A
   * callterm must not throw: nothing catches it. Valid calls run the same under every policy. `plannerFor` uses
   * 'report' with a console sink.
   */
  calltermErrorPolicy?: CallTermErrorPolicy
  mode?: BacktrackingMode
  /** Passed through to callterms and their converters (upstream ClientContext). */
  context?: unknown
  /**
   * Upstream call-frame capacity; exceeding it returns 'depth_exceeded'. Default 8192, upstream's. Counted like
   * upstream's frames: the entry method one, every running task one, every called method one more, and a method
   * in its last branch keeps its frames until the decomposition ends. Conditions and axioms do not count.
   */
  maxDepth?: number
  /** Runtime diagnostics: callterm errors (under the 'report' policy), unbound reads, bad arithmetic... */
  onDiagnostic?: (d: RuntimeDiagnostic) => void
  /**
   * Decomposition trace for debuggers: htn/trace.ts PlanTraceRecorder records it as upstream's generated debugger
   * does. Off by default; without it the engine only tests one field per method, branch, task and condition.
   */
  trace?: PlanTracer
  /**
   * Structural counters (upstream --generated-execution-profiling): pass an object (newPlanStats()); every
   * decomposition zeroes it, then counts into it. Off by default; without it each counting point is one field test.
   */
  stats?: PlanStats
}

/**
 * What one decomposition did, for budgets: upstream's structural counters (HTNGeneratedStructuralCounters,
 * HTNGeneratedProfiling.h:65-82: structural events, plus the per-category call counts its profiling macros keep,
 * :153-156), named as upstream names them where ours count the same thing.
 */
export interface PlanStats {
  /** Methods entered (upstream generated_method calls). */
  methods: number
  /** Branches tried, in source order (generated_branch). */
  branches: number
  /** Branches whose condition failed, so the method moved on (branch_retry). */
  branchRetries: number
  /** Selected branches whose tasks failed later, so the method tried its next branch (mode.branches). Ours. */
  branchBacktracks: number
  /** Tasks run, primitive or compound (generated_task). */
  tasks: number
  /** Compound tasks: a method called from a branch (enter_compound). */
  compoundTasks: number
  /** Condition nodes evaluated: and / or / alt / not and every leaf (upstream pushes a checkpoint per node). Ours. */
  conditions: number
  /** Axiom calls (condition_axiom_control). */
  axioms: number
  /** Callterm invocations (callterm). */
  callterms: number
  /** Fact lookups: one per fact condition evaluated, and one more per retry (fact_queries). */
  factQueries: number
  /**
   * World rows compared against a fact condition (fact_rows_tested). Upstream re-scans from the first row for each
   * retry; ours resumes after the last row unless a callterm changed the world, so for a retried fact ours is lower.
   */
  factRowsTested: number
  /** Rows that matched (fact_rows_matched); same note as factRowsTested. */
  factRowsMatched: number
  /** Facts that may have several solutions, on their first try (fact_choice_points). */
  factChoicePoints: number
  /** Such a fact asked for its next solution after a later condition or task failed (fact_choice_retries). */
  factChoiceRetries: number
  /** Variables bound while solving conditions (ours: an undo trail instead of upstream's checkpoints). */
  bindings: number
  /** Bindings undone by backtracking (≈ upstream checkpoint_rollbacks, counted per variable). */
  unbinds: number
}

/** A zeroed PlanStats, to pass as PlannerOptions.stats. */
export function newPlanStats(): PlanStats {
  return {
    methods: 0,
    branches: 0,
    branchRetries: 0,
    branchBacktracks: 0,
    tasks: 0,
    compoundTasks: 0,
    conditions: 0,
    axioms: 0,
    callterms: 0,
    factQueries: 0,
    factRowsTested: 0,
    factRowsMatched: 0,
    factChoicePoints: 0,
    factChoiceRetries: 0,
    bindings: 0,
    unbinds: 0
  }
}

/**
 * Upstream's execution info (get_execution_info, HTNGeneratedPlanner.h:98-109; GENERATED_RECURSION.md:100-103), always
 * on: the call-frame capacity in force (PlannerOptions.maxDepth), the peak call frames and the last runtime error of
 * the last decomposition. Peak and error reset with every decomposition. Upstream's frame bytes have no counterpart.
 */
export interface ExecutionInfo {
  callFrameCapacity: number
  /** The most call frames in use at once: the smallest maxDepth with which this plan still succeeds. */
  peakCallFrames: number
  /** The last diagnostic of the decomposition (also when no onDiagnostic is set), or null. */
  lastError: RuntimeDiagnostic | null
}

/** A variable environment as the engine hands it to a tracer: slot values and their names ('?x'). Read it at once. */
export interface TraceScope {
  readonly v: readonly (Atom | undefined)[]
  readonly names: readonly string[]
}

/**
 * Decomposition events, mirroring the Begin/End events upstream's generated planners send to HTNGeneratedDebugger
 * (HTNGeneratedDebugger.h :128-261; emitted by HTNCCodeGenerator.cpp and HTNConditionContinuation.inl). Every
 * begin is closed by one end(ok), innermost first; `scope` gives the bindings at that moment (Before / After).
 * - plan: one decomposition (a top-level plan, or a deferred `&` step being expanded); then the entry method;
 * - method, then branch per branch tried in source order; a branch's condition, then its tasks; a compound task
 *   holds its method; a task that fails ends its branch, which tries the next branch or ends the method;
 * - cond: a condition is evaluated. A composite (and/or/alt/not, a condition upstream lowers into temporaries, an
 *   axiom call) ends before its continuation runs and begins again (a new node) when the continuation fails and
 *   asks it for another solution; a fact with several possible rows begins again per row tried (`again`: the
 *   handle beginCond returned for its first try, whose Before it repeats); a deterministic leaf ends once;
 * - axiom: the axiom's own scope inside its call site (upstream BeginAxiom), once per body solution tried;
 * - factRows: right before a fact's end(false), the rows of name/arity it was checked against (ours).
 */
export interface PlanTracer {
  beginPlan(method: MethodId, args: readonly Atom[], deferred: boolean, world: WorldState): void
  endPlan(status: DecompositionStatus, plan: readonly PlanStep[]): void
  beginMethod(method: MethodId, scope: TraceScope): void
  beginBranch(method: MethodId, branch: number, scope: TraceScope): void
  beginTask(task: TaskIR, scope: TraceScope): void
  beginCond(cond: CondIR, scope: TraceScope, again?: number): number
  beginAxiom(axiom: AxiomId, scope: TraceScope): void
  end(ok: boolean, scope: TraceScope): void
  factRows(rows: readonly FactRow[]): void
}

/**
 * Planner diagnostics. Decomposition: callterm errors under the 'report' policy (missing_callterm,
 * non_boolean_condition_result, callterm_error), unbound_read, arithmetic_error, type_error, depth_exceeded (the
 * call-frame capacity ran out). PlanRunner dev
 * checks: unregistered_callterm (when created, one per unbound call site), fact_arity_mismatch (once per world
 * table, at plan()). stale_deferred_step: a deferred step planned by another domain object (a hot reload's old
 * revision) was given to decomposeDeferred or a runner; it is not expanded (status 'invalid_call' / 'failed').
 */
export interface RuntimeDiagnostic {
  code:
    | 'missing_callterm' // reasons not_registered, missing_binding, missing_instance
    | 'non_boolean_condition_result'
    | 'callterm_error' // argument count / type and argument / return conversion reasons
    | 'unbound_read'
    | 'arithmetic_error'
    | 'type_error'
    | 'unregistered_callterm'
    | 'fact_arity_mismatch'
    | 'depth_exceeded'
    | 'stale_deferred_step'
  message: string
  source?: { file: string; line: number; col: number }
  /** Callterm diagnostics: the callterm's name (upstream HTNCallTermErrorInfo::Name). */
  callterm?: string
  /** Callterm diagnostics: upstream's HTNCallTermErrorInfo (reason, daemon, source, argument and type details). */
  calltermError?: CallTermErrorInfo
}

export type DecompositionStatus =
  | 'succeeded'
  | 'no_plan'
  | 'invalid_call' // unknown/non-top-level method or wrong argument count
  | 'depth_exceeded' // upstream HTN_DECOMPOSITION_CALL_FRAME_CAPACITY_EXCEEDED

/**
 * One step of a plan. A value: never change a step or its args. A PlanRunner hands out the same step object again in a
 * later plan when that plan makes the same step (same task, same occurrence of it, same arguments by type and value),
 * so a steady replan allocates nothing; compare steps and atoms by value (atomEquals), not by identity.
 */
export type PlanStep =
  | { kind: 'primitive'; name: string; args: Atom[] } // name keeps '!'
  | { kind: 'deferred'; method: MethodId; name: string; args: Atom[] } // `&` call, args already evaluated; name is '&' + method name

export interface DecompositionResult {
  status: DecompositionStatus
  plan: PlanStep[] // empty unless succeeded
}

/** Decompose a top-level method once. Pure with respect to `world` (reads only). */
export function decompose(
  domain: DomainIR,
  world: WorldState,
  method: string,
  args: readonly Atom[],
  options?: PlannerOptions
): DecompositionResult {
  const id = findTopLevel(domain, method, args.length)
  if (id === undefined) return { status: 'invalid_call', plan: [] }
  return result(domain, new Engine(domain, world, options), id, args, false)
}

/**
 * Decompose a deferred step against the world as it is now (not restricted to top-level). Only in the domain that
 * planned it: a step from another domain object (a hot reload's old revision) holds that domain's MethodId and is
 * refused ('invalid_call', a stale_deferred_step diagnostic), as is a copied step whose name is not the method's.
 */
export function decomposeDeferred(
  domain: DomainIR,
  world: WorldState,
  step: Extract<PlanStep, { kind: 'deferred' }>,
  options?: PlannerOptions
): DecompositionResult {
  if (!isDeferrable(domain, step, options?.onDiagnostic)) return { status: 'invalid_call', plan: [] }
  return result(domain, new Engine(domain, world, options), step.method, step.args, true)
}

/** One decomposition by a fresh engine, as a result the caller owns (new steps). */
function result(domain: DomainIR, engine: Engine, method: MethodId, args: readonly Atom[], deferred: boolean): DecompositionResult {
  const status = engine.run(method, args, deferred, false)
  const plan = engine.out.slice(0, engine.outLen)
  stamp(domain, plan, plan.length)
  return { status, plan }
}

/** Upstream entry dispatch: a top-level method selected by name and argument count. */
function findTopLevel(domain: DomainIR, method: string, arity: number): MethodId | undefined {
  if (!hasOwn(domain.topLevel, method)) return undefined
  const byArity = domain.topLevel[method]
  if (!hasOwn(byArity, arity)) return undefined
  const id = byArity[arity]
  const m = domain.methods[id]
  return m !== undefined && m.arity === arity ? id : undefined
}

/**
 * The domain that planned each deferred step. A deferred step holds a MethodId, an index into that domain: in another
 * revision the index is another method (upstream resolves `&calls` by name inside one planning unit, and its hot
 * reload drops the unit with its plan). Steps the planner did not make (copies, hand-built) are checked by name.
 */
const ORIGIN = new WeakMap<PlanStep, DomainIR>()

function stamp(domain: DomainIR, steps: readonly PlanStep[], n: number): void {
  for (let i = 0; i < n; i++) {
    const step = steps[i]
    if (step.kind === 'deferred') ORIGIN.set(step, domain)
  }
}

/** `&name` or a qualified `&Domain::name`, as the engine names a deferred step (TaskIR defer); the `&` is optional. */
function namesMethod(stepName: string, method: string): boolean {
  const name = stepName.startsWith('&') ? stepName.slice(1) : stepName
  return name === method || name.endsWith('::' + method)
}

function isDeferrable(
  domain: DomainIR,
  step: Extract<PlanStep, { kind: 'deferred' }>,
  onDiagnostic?: (d: RuntimeDiagnostic) => void
): boolean {
  const m = hasOwn(domain.methods, step.method) ? domain.methods[step.method] : undefined
  if (m === undefined || m.arity !== step.args.length) return false
  const origin = ORIGIN.get(step)
  if (origin === undefined ? namesMethod(step.name, m.name) : origin === domain) return true
  onDiagnostic?.({
    code: 'stale_deferred_step',
    message:
      origin === undefined
        ? `Deferred step '${step.name}' does not name method ${step.method} ('${m.name}') of domain '${domain.name}': it comes from another domain or revision; plan again`
        : `Deferred step '${step.name}' was planned by another domain or revision than this '${domain.name}': it is not expanded; plan again`
  })
  return false
}

function hasOwn(o: object, key: string | number): boolean {
  return Object.prototype.hasOwnProperty.call(o, key)
}

export type Resolution = 'ready' | 'completed' | 'failed'

export interface PlanRunnerOptions extends PlannerOptions {
  /** Planned by plan() without a name, with no arguments (the HTNPlanningUnit constructor's default top-level method). */
  defaultTopLevel?: string
}

/**
 * Host-side plan cursor, the analogue of upstream HTNPlanningUnit:
 * plan() installs a plan; resolve() expands deferred steps at the cursor until a primitive is
 * ready, the plan ends, or a deferred decomposition fails; the host executes current() and
 * calls complete(). The host owns timing, cancellation and when to replan.
 *
 * Dev checks through options.onDiagnostic: when created, every call site whose callterm is not registered, has no
 * function, or lacks its daemon (unregistered_callterm with calltermError, one per site, like
 * HTNCallTermRegistry::ValidateGeneratedCallTerms; `validateCallterms()` for hosts); at plan(), every world
 * table whose fact name the domain reads only with other arities (fact_arity_mismatch), once per table.
 */
export class PlanRunner {
  // The plan: planSteps[0..count). Reused, never cut (see the engine's header).
  private readonly planSteps: PlanStep[] = []
  private count = 0
  private cursor = 0
  private engine: Engine | undefined
  private tablesChecked = -1
  private reportedTables: Set<string> | undefined
  private idleInfo: ExecutionInfo | undefined

  constructor(
    readonly domain: DomainIR,
    readonly world: WorldState,
    readonly options: PlanRunnerOptions = {}
  ) {
    const sink = options.onDiagnostic
    if (sink === undefined) return
    for (const info of validateCallterms(domain, options.callterms, options.daemons)) {
      const d: RuntimeDiagnostic = {
        code: 'unregistered_callterm',
        message: `${calltermMessage(info)} (domain '${domain.name}' calls it)`,
        callterm: info.name,
        calltermError: info
      }
      const s = info.source
      sink(s === undefined ? d : { ...d, source: { file: s.file, line: s.line, col: s.col } })
    }
  }

  /**
   * Decompose a top-level method (default: options.defaultTopLevel) and install the plan on success;
   * any other status clears the current plan (HTNPlanningUnit::DecomposeTopLevelMethod).
   */
  plan(method?: string, args: readonly Atom[] = []): DecompositionStatus {
    this.checkFactTables()
    const name = method ?? this.options.defaultTopLevel
    const id = name === undefined ? undefined : findTopLevel(this.domain, name, args.length)
    if (id === undefined) {
      this.clear()
      this.engine?.resetInfo() // upstream resets peak and error before it checks the call (HTNCCodeGenerator.cpp:3295)
      return 'invalid_call'
    }
    const engine = this.getEngine()
    const status = engine.run(id, args, false, true)
    const n = engine.outLen
    const steps = this.planSteps
    for (let i = 0; i < n; i++) {
      if (i < steps.length) steps[i] = engine.out[i]
      else steps.push(engine.out[i])
    }
    this.count = n
    this.cursor = 0
    stamp(this.domain, steps, n)
    return status
  }

  /**
   * Expand deferred steps at the cursor, in place, against the world as it is now, until a
   * primitive is ready ('ready'), the plan ends ('completed') or a deferred decomposition fails
   * ('failed', which clears the plan). HTNPlanningUnit::ResolveCurrentPrimitiveTask.
   */
  resolve(): Resolution {
    const steps = this.planSteps
    while (this.cursor < this.count) {
      const step = steps[this.cursor]
      if (step.kind === 'primitive') return 'ready'
      const engine = this.getEngine()
      // New steps: an expansion's steps could repeat steps already in this plan.
      const status = isDeferrable(this.domain, step, this.options.onDiagnostic) ? engine.run(step.method, step.args, true, false) : 'invalid_call'
      if (status !== 'succeeded') {
        this.clear()
        return 'failed'
      }
      // Replace the step at the cursor with the expansion, in place.
      const n = engine.outLen
      const at = this.cursor
      const count = this.count
      const grown = count + n - 1
      while (steps.length < grown) steps.push(step)
      if (n > 1) for (let i = count - 1; i > at; i--) steps[i + n - 1] = steps[i]
      else if (n === 0) for (let i = at + 1; i < count; i++) steps[i - 1] = steps[i]
      for (let i = 0; i < n; i++) steps[at + i] = engine.out[i]
      this.count = grown
      stamp(this.domain, engine.out, n)
    }
    return 'completed'
  }

  /** The primitive at the cursor, or null (plan ended, or a deferred step still needs resolve()). */
  current(): Extract<PlanStep, { kind: 'primitive' }> | null {
    const step = this.cursor < this.count ? this.planSteps[this.cursor] : undefined
    return step !== undefined && step.kind === 'primitive' ? step : null
  }

  /** Advance past the current primitive; no-op unless current() is non-null. */
  complete(): void {
    if (this.current() !== null) this.cursor++
  }

  clear(): void {
    this.count = 0
    this.cursor = 0
  }

  /** Remaining steps from the cursor, including unexpanded deferred ones (a copy). */
  get steps(): readonly PlanStep[] {
    return this.planSteps.slice(this.cursor, this.count)
  }

  /**
   * Execution info of the last decomposition, plan() or a deferred expansion in resolve() (upstream
   * get_execution_info): always on. A live object, rewritten by the next decomposition.
   */
  get executionInfo(): Readonly<ExecutionInfo> {
    if (this.engine !== undefined) return this.engine.info
    return (this.idleInfo ??= { callFrameCapacity: this.options.maxDepth ?? DEFAULT_MAX_DEPTH, peakCallFrames: 0, lastError: null })
  }

  /** options.stats, the structural counters of the last decomposition, or null when counting is off. */
  get stats(): Readonly<PlanStats> | null {
    return this.options.stats ?? null
  }

  private getEngine(): Engine {
    if (this.engine === undefined) this.engine = new Engine(this.domain, this.world, this.options)
    return this.engine
  }

  /** Report wrong-arity tables once each; rescans only when the world has created tables since the last plan(). */
  private checkFactTables(): void {
    const sink = this.options.onDiagnostic
    if (sink === undefined || this.world.tablesCreated === this.tablesChecked) return
    this.tablesChecked = this.world.tablesCreated
    const reported = (this.reportedTables ??= new Set())
    for (const key of checkFacts(this.domain, this.world).wrongArity) {
      if (reported.has(key)) continue
      reported.add(key)
      const name = key.slice(0, key.lastIndexOf('/'))
      const read = this.domain.facts.filter(f => f.slice(0, f.lastIndexOf('/')) === name).join(', ')
      const domain = this.domain.name
      sink({
        code: 'fact_arity_mismatch',
        message: `Fact '${key}' is in the world state, but domain '${domain}' reads '${name}' only as ${read}`
      })
    }
  }
}

/** Callterms the domain calls that `callterms` has no function for, in DomainIR.callterms order. */
export function missingCallterms(domain: DomainIR, callterms?: CallTermRegistry): string[] {
  return domain.callterms.filter(
    name => callterms === undefined || !hasOwn(callterms, name) || typeof callterms[name] !== 'function'
  )
}

export interface FactCheck {
  /**
   * `name/arity` world tables whose fact name the domain never reads. Upstream's WriteFact rejects these and
   * lists them in GetUnregisteredFacts (2.4.0); here they are kept: a host may store its own facts in the world.
   */
  unregistered: string[]
  /** `name/arity` world tables whose name the domain reads only with other arities: never read, likely a typo. */
  wrongArity: string[]
}

/** Compare the world's non-empty tables with the facts the domain reads (DomainIR.facts). A dev check. */
export function checkFacts(domain: DomainIR, world: WorldState): FactCheck {
  const read = new Set(domain.facts)
  const names = new Set<string>()
  for (const f of domain.facts) names.add(f.slice(0, f.lastIndexOf('/')))
  const result: FactCheck = { unregistered: [], wrongArity: [] }
  for (const key of world.tableKeys()) {
    if (read.has(key)) continue
    if (names.has(key.slice(0, key.lastIndexOf('/')))) result.wrongArity.push(key)
    else result.unregistered.push(key)
  }
  return result
}
