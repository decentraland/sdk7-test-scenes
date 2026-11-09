// Decomposition engine behind planner.ts. Internal: hosts use decompose()/PlanRunner.
//
// Semantics follow the code upstream generates (vendor/htn_planner, HTNFramework/src/Translator):
// - Conditions are solved with success continuations, like HTNConditionContinuation.inl. A branch
//   condition commits on its first accepted solution (EmitLoweredCondition, .inl:228-236:
//   `inCommit(); goto success`), so fact/axiom choice points never stay open across the branch's
//   tasks; mode.factsAndAxioms only gates retries inside a condition (.inl:108-110 alt, :209 facts).
// - Methods run on an explicit frame stack (no JS recursion per nesting level), like the generated
//   _RUN dispatcher (HTNCCodeGenerator.cpp:2744, GENERATED_RECURSION.md). A failed task makes its
//   method restore the plan and try the next branch when mode.branches is on (HTNCCodeGenerator.cpp
//   :3141 CanRetryNextBranch, :3231 BRANCHES gate, :3232-3247 rollback); otherwise the method fails
//   and its caller's branch fails in turn. A completed child method stays committed.
//   Deliberate deviation: upstream lets a frame in its last branch keep consuming its ancestors'
//   pending tasks (:3206-3209, PendingBase "0u"), so such a later task's failure is caught by the
//   nearest retryable descendant frame, which retries its own next branch after those pending tasks
//   were already popped; the resulting plan can silently miss the failed task. We keep the
//   documented hierarchical behavior instead (HTNBacktrackingMode.h BRANCHES comment).
// - maxDepth is upstream's call-frame capacity (GENERATED_RECURSION.md, default 8192), counted the way
//   its _RUN dispatcher fills the array (HTNCCodeGenerator.cpp:2744): the entry method takes one frame;
//   every task, primitive or compound, takes one while it runs (:3213 `return 2`), and a compound
//   task's method one more on top (:3056). Conditions and axioms run inside their method's frame.
//   A method in its last branch keeps its frames until the decomposition ends, because there it pops
//   pending tasks down to 0 (:3206-3209, the borrowing above): we do not borrow, but count as if.
// - Variable bindings made while solving a condition go on an undo trail; backtracking unbinds.
// - With options.trace, the same walk reports upstream's debugger events (PlanTracer in planner.ts): methods,
//   branches and tasks at the points the generated _RUN dispatcher emits them, conditions by wrapping the success
//   continuation (end before it runs, begin again when it fails), as HTNConditionContinuation.inl does. Without a
//   tracer every hook is one field test and the condition solver takes its untraced path.
// - With options.stats, the same points count into upstream's structural counters (PlanStats in planner.ts); without
//   it each counting point is one field test. Execution info (peak call frames, last error) is always kept, as
//   upstream's get_execution_info: a compare per frame push and a field write per diagnostic.
// - No heap allocation per decomposition once warm, as upstream's generated planner keeps its frames, checkpoints and
//   plan in preallocated execution storage (GENERATED_RECURSION.md: "no allocation or resizing of call frames while
//   decomposing"; its benchmark's 0 alloc/plan). Every buffer belongs to the engine (one per PlanRunner) and only
//   grows: method frames, branch and axiom environments, continuations, planned steps, the trail and the scratch
//   stacks are reused run after run, counted with a top index (a pooled array's length is never cut: V8 frees the
//   storage of an array cut to 0). An array a reader sees whole (an environment, a callterm's arguments) comes from a
//   per-owner pool keyed by length, so its length is exact. Continuations are records, not closures (defunctionalized:
//   cont() dispatches on the kind); they nest as the JS stack does, so a solver takes one on entry and gives it back
//   on every return. Planned steps stay internal records until the decomposition succeeds, then become PlanSteps
//   (writePlan: a runner hands out its earlier step again when it is equal). Still allocating: values the domain
//   creates (float arithmetic, an int outside atom.ts's shared range, runtime lists, split_list of a list not split before),
//   host callterms, diagnostics, a new plan step, and everything under a tracer.
//
// Ships in the scene bundle: ES2020, synchronous, no module-level mutable state.
import { int, type Atom } from './atom'
import {
  callSiteIndex,
  CallTermInvoker,
  CallTermWarnings,
  reportCalltermError,
  type CallNode,
  type CallSite,
  type CallTermDaemons,
  type CallTermErrorInfo,
  type CallTermErrorPolicy,
  type CallTermRegistry
} from './callterms'
import type { AxiomIR, CondIR, DomainIR, ExprIR, MethodIR, SourceLoc, TaskIR, TermIR } from './ir'
import { atomEquals, isNumeric } from './match'
import type {
  BacktrackingMode,
  DecompositionStatus,
  ExecutionInfo,
  PlannerOptions,
  PlanStats,
  PlanStep,
  PlanTracer,
  RuntimeDiagnostic,
  TraceScope
} from './planner'
import type { WorldState } from './world-state'

type Slots = (Atom | undefined)[]

/** A variable environment: one method branch attempt or one axiom invocation. Pooled: its owner refills it. */
interface Scope {
  v: Slots
  names: readonly string[]
}

// Frozen placeholders: released trail entries point here so they do not retain environments.
const EMPTY_ENV = Object.freeze([]) as unknown as Slots
const NO_NAMES = Object.freeze([]) as readonly string[]
const EMPTY_SCOPE: Scope = Object.freeze({ v: EMPTY_ENV, names: NO_NAMES })
const NO_ARGS: readonly Atom[] = Object.freeze([]) as readonly Atom[]
const NO_ITEMS = Object.freeze([]) as readonly CondIR[]
const NO_PLAN = Object.freeze([]) as readonly PlanStep[]
const INT32_MIN = -2147483648
const INT32_MAX = 2147483647
const FLT_MAX = 3.4028234663852886e38
const NO_CALLTERMS: CallTermRegistry = Object.freeze({})
const DEFAULT_MODE: BacktrackingMode = Object.freeze({ factsAndAxioms: true, branches: true })
/** Upstream frames a method adds at stack height `below`: the entry method one, a called one its task's too. */
const frameCost = (below: number) => (below === 0 ? 1 : 2)

/** Upstream default call-frame capacity (HTNTranslator --call-frame-capacity, GENERATED_RECURSION.md). */
export const DEFAULT_MAX_DEPTH = 8192

/** An array of exactly `n` slots from `pool` (one per length, reused): what a reader may see whole. */
function sized(pool: Slots[], n: number): Slots {
  let a = pool[n]
  if (a === undefined) {
    a = []
    for (let i = 0; i < n; i++) a.push(undefined)
    pool[n] = a
  }
  return a
}

// Continuation kinds (Cont.kind).
const K_ACCEPT = 0
const K_SEQ = 1 // and: solve items[i + 1..] in sc
const K_OR = 2 // or: commit to the first child solution (a: reached, b: accepted)
const K_ALT = 3 // alt: a child produced a solution (a: matched)
const K_AXIOM = 4 // an axiom body solution: check and publish the outputs (c: the call, sc: the caller's scope)
const K_TRACE_COMPOSITE = 5 // traced composite: ends before its continuation, begins again when that fails
const K_TRACE_LEAF = 6 // traced deterministic leaf (a: ended)
const K_TRACE_FACT = 7 // traced fact choice point (a: open, b: a choice, n: its first node)

/**
 * A continuation: called once per solution of a condition (Engine.cont); true accepts it (stop searching), false asks
 * for the next. The `() => boolean` closures of a continuation-passing solver as records: one class for every kind
 * (one shape), taken from the engine's stack by the solver that creates it and given back when that solver returns.
 */
class Cont {
  kind = K_ACCEPT
  k: Cont = this // the continuation this one goes on to
  items: readonly CondIR[] = NO_ITEMS
  i = 0
  sc: Scope = EMPTY_SCOPE
  c: CondIR | null = null
  a = false
  b = false
  n = 0
  // K_AXIOM: the axiom invocation's own environment and its caller-supplied ?io_ values (undefined: none).
  readonly ax: Scope = { v: EMPTY_ENV, names: NO_NAMES }
  inputs: Slots | undefined = undefined
  readonly axPool: Slots[] = []
  readonly inPool: Slots[] = []
}

/** Accepts the first solution. Shared and never changed: it is never taken from a stack. */
const ACCEPT = new Cont()

/** A method on the frame stack. Pooled by stack height: it owns its branch environments and its arguments. */
class Frame {
  m: MethodIR = undefined as unknown as MethodIR
  args: readonly Atom[] = NO_ARGS
  b = -1 // selected branch
  sc: Scope = EMPTY_SCOPE
  t = 0 // next task index
  planMark = 0 // plan length when the branch was selected
  calls = 0 // upstream call frames in use with this frame pushed
  stays = false // upstream keeps this frame to the end: it or a completed descendant was in its last branch
  readonly scope: Scope = { v: EMPTY_ENV, names: NO_NAMES } // the branch environment, refilled per branch tried
  readonly params: Scope = { v: EMPTY_ENV, names: NO_NAMES } // the parameters as a trace scope
  readonly vPool: Slots[] = []
  readonly argPool: Slots[] = [] // arguments of the compound task that pushes this frame
}

type StepTask = Extract<TaskIR, { k: 'prim' | 'defer' }>

/** A planned step while decomposing: its task and evaluated arguments (pooled, exact length). */
class StepRec {
  task: StepTask = undefined as unknown as StepTask
  args: Slots = EMPTY_ENV
  readonly pool: Slots[] = []
}

/** The PlanSteps a runner's earlier plans made from one task, by occurrence in the plan (writePlan). */
interface StepCache {
  steps: PlanStep[]
  used: number
  run: number
}

/** Same type and same value (not atomEquals: BOOL 1 is not INT 1 here), lists element by element. */
function sameAtom(a: Atom, b: Atom): boolean {
  if (a === b) return true
  if (a.t !== b.t) return false
  if (a.t === 'list') {
    const x = a.v
    const y = (b as typeof a).v
    if (x.length !== y.length) return false
    for (let i = 0; i < x.length; i++) if (!sameAtom(x[i], y[i])) return false
    return true
  }
  return Object.is(a.v, b.v)
}

/**
 * Each body solution must produce every ?out_/?io_ output, match bound ?io_ arguments and agree on repeated caller
 * variables before outputs are published (HTNCCodeGenerator.cpp axiom END helper :2290-2330).
 */
function axiomOutputsValid(
  params: AxiomIR['params'],
  terms: readonly TermIR[],
  v: Slots,
  inputs: readonly (Atom | undefined)[] | undefined
): boolean {
  for (let i = 0; i < params.length; i++) {
    if (params[i].mode === 'inp') continue
    const out = v[i]
    if (out === undefined) return false
    const given = inputs === undefined ? undefined : inputs[i]
    if (given !== undefined) {
      if (!atomEquals(out, given)) return false
    } else if (terms[i].k !== 'var' && terms[i].k !== 'discard') {
      return false // literal/expression argument that failed to evaluate
    }
    const t = terms[i]
    if (t.k !== 'var') continue
    for (let j = 0; j < i; j++) {
      const u = terms[j]
      if (params[j].mode !== 'inp' && u.k === 'var' && u.slot === t.slot && !atomEquals(out, v[j] as Atom)) return false
    }
  }
  return true
}

const LOWERED = new WeakMap<CondIR, boolean>()

/**
 * Upstream lowers a condition whose arguments hold a call or a runtime list (an assignment: below its root) into a
 * hidden sequence of temporaries plus the condition (HTNCompilerIRBuilder.cpp AddCondition :574-627,
 * HasNestedAssignmentCall :504-515). We evaluate such arguments in place; the debugger still shows one row that is
 * retried like a composite, as upstream's sequence is.
 */
export function loweredCond(c: CondIR): boolean {
  let r = LOWERED.get(c)
  if (r === undefined) {
    r = computeLowered(c)
    LOWERED.set(c, r)
  }
  return r
}

function computeLowered(c: CondIR): boolean {
  const nested = (e: TermIR, root: boolean): boolean => {
    if (e.k === 'list') return !root
    if (e.k === 'call') return !root || e.args.some(a => nested(a, false))
    if (e.k === 'arith') return e.args.some(a => nested(a, false))
    return false
  }
  switch (c.k) {
    case 'and':
    case 'or':
    case 'alt':
    case 'not':
      return false
    case 'assign':
      return nested(c.expr, true)
    case 'fact':
    case 'axiom':
    case 'call':
      return c.args.some(a => nested(a, false))
    case 'cmp':
      return nested(c.a, false) || nested(c.b, false)
    case 'split':
      return nested(c.list, false) || nested(c.a, false) || nested(c.b, false)
  }
}

export class Engine {
  private callterms: CallTermRegistry = NO_CALLTERMS
  private daemons: CallTermDaemons | undefined = undefined
  private policy: CallTermErrorPolicy | undefined = undefined
  private readonly invoker = new CallTermInvoker()
  private readonly warnings = new CallTermWarnings()
  private sites: Map<CallNode, CallSite> | undefined = undefined
  private mode: BacktrackingMode = DEFAULT_MODE
  private context: unknown = undefined
  private maxDepth = DEFAULT_MAX_DEPTH
  private onDiagnostic: ((d: RuntimeDiagnostic) => void) | undefined = undefined
  private tr: PlanTracer | undefined = undefined
  private st: PlanStats | undefined = undefined

  /** Upstream get_execution_info of the last run (planner.ts ExecutionInfo). */
  readonly info: ExecutionInfo = { callFrameCapacity: DEFAULT_MAX_DEPTH, peakCallFrames: 0, lastError: null }
  private peak = 0
  private lastError: RuntimeDiagnostic | null = null

  // Undo trail: (environment, slot) pairs bound since a mark.
  private trailEnv: Slots[] = []
  private trailSlot: number[] = []
  private trailLen = 0

  // The frame stack: frames[0..depth) are live.
  private readonly frames: Frame[] = []
  private depth = 0
  private calls = 0 // upstream call frames in use (see the header)
  private aborted: DecompositionStatus | null = null
  // Planned steps: steps[0..planLen) so far.
  private readonly steps: StepRec[] = []
  private planLen = 0
  private src: SourceLoc | undefined = undefined

  // Continuations: conts[0..contTop) are in use, innermost last.
  private readonly conts: Cont[] = []
  private contTop = 0
  // A fact's evaluated expression arguments, vals[base..base + arity) per fact being solved.
  private readonly vals: Slots = []
  private valTop = 0
  // A callterm's argument arrays, per nesting depth of calls being evaluated, then per argument count.
  private readonly callArgs: Slots[][] = []
  private callDepth = 0
  // Arithmetic operand scratch stack, reused across (nested) evaluations: num[0..numTop).
  private readonly num: number[] = []
  private numTop = 0
  // The rest of every list split_list split (atoms never change).
  private readonly restFront = new WeakMap<readonly Atom[], Atom>()
  private readonly restBack = new WeakMap<readonly Atom[], Atom>()

  /** The last successful decomposition's plan: out[0..outLen). Copy the references: the next run rewrites it. */
  readonly out: PlanStep[] = []
  outLen = 0
  private stepCache: Map<TaskIR, StepCache> | undefined = undefined
  private runs = 0

  /** `options` is re-read at the start of every run, like upstream's per-execution context copy. */
  constructor(
    readonly domain: DomainIR,
    readonly world: WorldState,
    readonly options: PlannerOptions = {}
  ) {}

  /**
   * Decompose `methodId` with already-validated arguments (read during the run only); `deferred` only labels the
   * trace. On success the plan is out[0..outLen), else outLen is 0. `reuse`: a step equal to one an earlier run made
   * from the same task (same occurrence of it in the plan, same arguments by type and value) is that same PlanStep
   * object again, so a steady replan allocates nothing; otherwise every step is new.
   */
  run(methodId: number, args: readonly Atom[], deferred: boolean, reuse: boolean): DecompositionStatus {
    this.configure()
    this.reset()
    if (this.st !== undefined) zeroStats(this.st)
    const tr = this.tr
    if (tr !== undefined) tr.beginPlan(methodId, args, deferred, this.world)
    let ok = this.pushMethod(methodId, args)
    const frames = this.frames
    while (ok && this.depth > 0 && this.aborted === null) {
      const f = frames[this.depth - 1]
      const tasks = f.m.branches[f.b].tasks
      if (f.t >= tasks.length) {
        this.depth-- // method succeeded; its caller continues with its next task
        if (!f.stays) this.calls = f.calls - frameCost(this.depth)
        else if (this.depth > 0) frames[this.depth - 1].stays = true
        if (tr !== undefined) {
          // END_BRANCH(1), END_METHOD(1), then the caller's task resumes: END_TASK(1) (HTNCCodeGenerator.cpp :3264-3267, :2791)
          tr.end(true, f.sc)
          tr.end(true, f.sc)
          if (this.depth > 0) tr.end(true, frames[this.depth - 1].sc)
        }
        continue
      }
      if (!this.runTask(tasks[f.t++], f.sc)) ok = this.backtrack()
    }
    const status: DecompositionStatus = this.aborted ?? (ok ? 'succeeded' : 'no_plan')
    this.outLen = 0
    if (status === 'succeeded') this.writePlan(reuse)
    if (tr !== undefined) tr.endPlan(status, this.outLen === 0 ? NO_PLAN : this.out.slice(0, this.outLen))
    this.info.peakCallFrames = this.peak
    this.info.lastError = this.lastError
    this.st = undefined // the cleanup below is not part of the decomposition
    this.reset()
    return status
  }

  private configure(): void {
    const o = this.options
    this.mode = o.mode ?? DEFAULT_MODE
    this.context = o.context
    this.maxDepth = o.maxDepth ?? DEFAULT_MAX_DEPTH
    this.onDiagnostic = o.onDiagnostic
    this.callterms = o.callterms ?? NO_CALLTERMS
    this.daemons = o.daemons
    this.policy = o.calltermErrorPolicy
    this.tr = o.trace
    this.st = o.stats
    this.info.callFrameCapacity = this.maxDepth
  }

  /** Execution info before any frame: what an invalid call reports. */
  resetInfo(): void {
    this.info.callFrameCapacity = this.options.maxDepth ?? DEFAULT_MAX_DEPTH
    this.info.peakCallFrames = 0
    this.info.lastError = null
  }

  /** Every stack empty. Also at the start of a run: a callterm that threw left the last one unfinished. */
  private reset(): void {
    this.trailUndo(0)
    this.depth = 0
    this.calls = 0
    this.aborted = null
    this.planLen = 0
    this.src = undefined
    this.contTop = 0
    this.valTop = 0
    this.callDepth = 0
    this.numTop = 0
    this.peak = 0
    this.lastError = null
  }

  /**
   * The planned steps as PlanSteps, into out[0..outLen). With `reuse`, the n-th step made from a task this run is the
   * n-th one an earlier run made from it when that one has the same arguments (sameAtom), else a new one that
   * replaces it. Steps are values: no one changes a PlanStep or its args (planner.ts, PlanStep).
   */
  private writePlan(reuse: boolean): void {
    const out = this.out
    const n = this.planLen
    let cache: Map<TaskIR, StepCache> | undefined
    if (reuse) {
      cache = this.stepCache ??= new Map()
      this.runs++
    }
    for (let i = 0; i < n; i++) {
      const rec = this.steps[i]
      let step: PlanStep | undefined
      if (cache !== undefined) {
        let e = cache.get(rec.task)
        if (e === undefined) cache.set(rec.task, (e = { steps: [], used: 0, run: 0 }))
        if (e.run !== this.runs) {
          e.run = this.runs
          e.used = 0
        }
        const at = e.used++
        const old = at < e.steps.length ? e.steps[at] : undefined
        if (old !== undefined && sameArgs(old.args, rec.args)) step = old
        else {
          step = this.newStep(rec)
          if (at < e.steps.length) e.steps[at] = step
          else e.steps.push(step)
        }
      } else step = this.newStep(rec)
      if (i < out.length) out[i] = step
      else out.push(step)
    }
    this.outLen = n
  }

  private newStep(rec: StepRec): PlanStep {
    const task = rec.task
    const args = rec.args.slice() as Atom[]
    if (task.k === 'prim') return { kind: 'primitive', name: task.name, args }
    return { kind: 'deferred', method: task.method, name: task.name ?? '&' + this.domain.methods[task.method].name, args }
  }

  // ---------------------------------------------------------------------------------------------
  // Methods and tasks

  private runTask(task: TaskIR, sc: Scope): boolean {
    this.src = undefined
    // The task's own frame; upstream pushes it before evaluating the arguments.
    if (this.calls >= this.maxDepth) return this.abort('depth_exceeded')
    if (this.calls >= this.peak) this.peak = this.calls + 1
    const st = this.st
    if (st !== undefined) st.tasks++
    const tr = this.tr
    if (tr !== undefined) tr.beginTask(task, sc) // BEGIN_TASK precedes argument evaluation (HTNCCodeGenerator.cpp :2796)
    const n = task.args.length
    if (task.k === 'method') {
      // Evaluated into the arguments of the frame the method will take.
      const args = sized(this.frameAt(this.depth).argPool, n)
      if (!this.evalInto(task.args, sc, args)) {
        if (tr !== undefined) tr.end(false, sc)
        return false
      }
      if (st !== undefined) st.compoundTasks++
      // The task stays open while its method runs; run() or backtrack() ends it.
      if (this.pushMethod(task.method, args as Atom[])) return true
      if (tr !== undefined) tr.end(false, sc)
      return false
    }
    const rec = this.stepAt(this.planLen)
    const args = sized(rec.pool, n)
    if (!this.evalInto(task.args, sc, args)) {
      if (tr !== undefined) tr.end(false, sc)
      return false
    }
    rec.task = task
    rec.args = args
    this.planLen++
    if (tr !== undefined) tr.end(true, sc)
    return true
  }

  private frameAt(i: number): Frame {
    const frames = this.frames
    if (i < frames.length) return frames[i]
    const f = new Frame()
    frames.push(f)
    return f
  }

  private stepAt(i: number): StepRec {
    const steps = this.steps
    if (i < steps.length) return steps[i]
    const r = new StepRec()
    steps.push(r)
    return r
  }

  /** A method frame's parameters as a trace scope (method Before, and After once its branches are rolled back). */
  private paramScope(f: Frame): TraceScope {
    const p = f.params
    p.v = f.args as Slots
    p.names = f.m.params
    return p
  }

  /** Push a frame and select its first satisfiable branch. False: no branch applies (or aborted). */
  private pushMethod(methodId: number, args: readonly Atom[]): boolean {
    const cost = frameCost(this.depth)
    if (this.calls + cost > this.maxDepth) return this.abort('depth_exceeded')
    this.calls += cost
    if (this.calls > this.peak) this.peak = this.calls
    if (this.st !== undefined) this.st.methods++
    const f = this.frameAt(this.depth)
    f.m = this.domain.methods[methodId]
    f.args = args
    f.b = -1
    f.sc = EMPTY_SCOPE
    f.t = 0
    f.planMark = this.planLen
    f.calls = this.calls
    f.stays = false
    this.depth++
    const tr = this.tr
    if (tr !== undefined) tr.beginMethod(methodId, this.paramScope(f))
    if (this.selectBranch(f, 0)) return true
    this.depth--
    this.calls -= cost
    if (tr !== undefined) tr.end(false, this.paramScope(f))
    return false
  }

  /**
   * Branches in source order; a branch whose condition fails always falls through
   * (HTNBacktrackingMode.h: "Ordinary branch selection after a branch-precondition failure is not
   * controlled by this flag"). The first accepted solution commits.
   */
  private selectBranch(f: Frame, from: number): boolean {
    const branches = f.m.branches
    const tr = this.tr
    const args = f.args
    const sc = f.scope
    for (let b = from; b < branches.length; b++) {
      const br = branches[b]
      const n = br.vars.length
      const v = sized(f.vPool, n)
      for (let i = 0; i < n; i++) v[i] = i < args.length ? args[i] : undefined
      sc.v = v
      sc.names = br.vars
      const st = this.st
      if (st !== undefined) st.branches++
      if (tr !== undefined) tr.beginBranch(f.m.id, b, sc)
      if (br.cond === null || this.solve(br.cond, sc, ACCEPT)) {
        // The branch stays open over its tasks (END_BRANCH after them, HTNCCodeGenerator.cpp :3264).
        this.trailCommit()
        f.b = b
        f.sc = sc
        f.t = 0
        f.planMark = this.planLen
        f.stays = b === branches.length - 1 && br.tasks.length > 0 // upstream CanRetryNextBranch is false
        return true
      }
      if (st !== undefined) st.branchRetries++
      if (tr !== undefined) tr.end(false, sc)
      if (this.aborted !== null) return false
    }
    return false
  }

  /**
   * The top frame's selected branch failed (a task or child method failed). With mode.branches,
   * restore the plan and try the method's next branch; otherwise the method fails and the failure
   * moves to its caller. Returns false when the root method failed.
   */
  private backtrack(): boolean {
    const frames = this.frames
    const tr = this.tr
    while (this.depth > 0) {
      if (this.aborted !== null) return false
      const f = frames[this.depth - 1]
      let after: TraceScope = f.sc
      if (this.mode.branches && f.b + 1 < f.m.branches.length) {
        if (this.st !== undefined) this.st.branchBacktracks++
        // Upstream restores the branch's snapshot, then END_BRANCH(0) (HTNCCodeGenerator.cpp :3232-3245).
        if (tr !== undefined) tr.end(false, (after = this.paramScope(f)))
        this.planLen = f.planMark
        this.calls = f.calls // the failure unwound every frame above this one
        if (this.selectBranch(f, f.b + 1)) return true
        if (this.aborted !== null) return false
      } else if (tr !== undefined) tr.end(false, f.sc) // END_BRANCH(0), END_METHOD(0) without a restore (:3251-3253)
      this.depth--
      this.calls = f.calls - frameCost(this.depth)
      if (tr !== undefined) {
        tr.end(false, after) // END_METHOD(0)
        if (this.depth > 0) tr.end(false, frames[this.depth - 1].sc) // the caller's task: END_TASK(0)
      }
    }
    return false
  }

  /** Stop the whole decomposition (upstream HTN_DECOMPOSITION_CALL_FRAME_CAPACITY_EXCEEDED unwinds without retries). */
  private abort(status: DecompositionStatus): false {
    if (this.aborted !== null) return false
    this.aborted = status
    // Upstream fills its frame array to the capacity and sets last_error (HTNCCodeGenerator.cpp:2757-2762).
    this.peak = this.maxDepth
    this.src = undefined
    this.diag('depth_exceeded', `Domain '${this.domain.name}' exceeded its call-frame capacity (${this.maxDepth}). Raise PlannerOptions.maxDepth.`)
    return false
  }

  // ---------------------------------------------------------------------------------------------
  // Conditions. Contract: solve() returns true iff `k` accepted a solution (bindings stay);
  // false means every binding made since entry has been undone. A solver that takes a continuation
  // record gives it back (contTop) before it returns, whatever it returns.

  /** Take a continuation record of `kind` going on to `k`, in scope `sc`. */
  private take(kind: number, k: Cont, sc: Scope): Cont {
    const conts = this.conts
    let r: Cont
    if (this.contTop < conts.length) r = conts[this.contTop]
    else conts.push((r = new Cont()))
    this.contTop++
    r.kind = kind
    r.k = k
    r.sc = sc
    return r
  }

  /** Run continuation `k` for the solution just found. */
  private cont(k: Cont): boolean {
    switch (k.kind) {
      case K_ACCEPT:
        return true
      case K_SEQ:
        return this.solveSeq(k.items, k.i + 1, k.sc, k.k)
      case K_OR:
        k.a = true
        k.b = this.cont(k.k)
        return true // stop the child's enumeration either way
      case K_ALT:
        k.a = true
        return this.cont(k.k)
      case K_AXIOM:
        return this.axiomSolution(k)
      case K_TRACE_COMPOSITE: {
        const tr = this.tr as PlanTracer
        tr.end(true, k.sc)
        if (this.cont(k.k)) return true
        tr.beginCond(k.c as CondIR, k.sc)
        return false
      }
      case K_TRACE_LEAF:
        ;(this.tr as PlanTracer).end(true, k.sc)
        k.a = true
        return this.cont(k.k)
      case K_TRACE_FACT: {
        const tr = this.tr as PlanTracer
        tr.end(true, k.sc)
        k.a = false
        if (this.cont(k.k)) return true
        // The choice point tries its next row: a new node (.inl :207-212), unless retries are off (:209).
        if (k.b && this.mode.factsAndAxioms) {
          tr.beginCond(k.c as CondIR, k.sc, k.n)
          k.a = true
        }
        return false
      }
    }
    return false
  }

  private solve(c: CondIR, sc: Scope, k: Cont): boolean {
    if (this.st !== undefined) this.st.conditions++
    if (this.tr !== undefined) return this.solveTraced(c, sc, k, this.tr)
    return this.solveRaw(c, sc, k)
  }

  private solveRaw(c: CondIR, sc: Scope, k: Cont): boolean {
    switch (c.k) {
      case 'and':
        return this.solveSeq(c.items, 0, sc, k)
      case 'or':
        return this.solveOr(c.items, sc, k)
      case 'alt':
        return this.solveAlt(c.items, sc, k)
      case 'not': {
        const mark = this.trailLen
        const found = this.solve(c.item, sc, ACCEPT)
        this.trailUndo(mark)
        if (found || this.aborted !== null) return false
        return this.cont(k)
      }
      case 'fact':
        return this.solveFact(c, sc, k)
      case 'axiom':
        return this.solveAxiom(c, sc, k)
      case 'call': {
        this.src = c.source
        const r = this.callTerm(c, sc)
        if (r === undefined) return false
        if (r.t !== 'bool') {
          // Upstream NonBooleanConditionResult (RELEASE_NOTES_BOOLEAN_CALLTERMS.md:37-39), through the policy.
          if (this.policy !== 'fail_silently') {
            this.calltermError(c, {
              name: c.name,
              reason: 'non_boolean_condition_result',
              actualArgumentCount: c.args.length,
              expectedType: 'bool',
              expectedTypeName: 'bool',
              actualType: r.t
            })
          }
          return false
        }
        return r.v ? this.cont(k) : false
      }
      case 'assign': {
        // An already-bound destination (only possible for an ?io_ parameter) fails before the
        // initializer runs (ASSIGNMENT.md; HTNConditionContinuation.inl AssignmentGuardValue).
        if (sc.v[c.slot] !== undefined) return false
        this.src = c.source
        const value = this.eval(c.expr, sc)
        if (value === undefined) return false
        const mark = this.trailLen
        this.bind(sc.v, c.slot, value)
        if (this.cont(k)) return true
        this.trailUndo(mark)
        return false
      }
      case 'cmp':
        this.src = c.source
        return this.compare(c.op, c.a, c.b, sc) ? this.cont(k) : false
      case 'split':
        return this.solveSplit(c, sc, k)
    }
  }

  private solveSeq(items: readonly CondIR[], i: number, sc: Scope, k: Cont): boolean {
    if (i === items.length) return this.cont(k)
    if (i === items.length - 1) return this.solve(items[i], sc, k)
    const top = this.contTop
    const next = this.take(K_SEQ, k, sc)
    next.items = items
    next.i = i
    const ok = this.solve(items[i], sc, next)
    this.contTop = top
    return ok
  }

  /** `or` commits to the first child solution; a later failure does not reopen it or try later children. */
  private solveOr(items: readonly CondIR[], sc: Scope, k: Cont): boolean {
    const mark = this.trailLen
    const top = this.contTop
    const once = this.take(K_OR, k, sc)
    once.a = false // reached
    once.b = false // accepted
    let ok = false
    for (let i = 0; i < items.length; i++) {
      this.solve(items[i], sc, once)
      if (once.a) {
        if (once.b) ok = true
        else this.trailUndo(mark)
        break
      }
      if (this.aborted !== null) break
    }
    this.contTop = top
    return ok
  }

  /**
   * `alt` keeps every child's alternatives, in order. Without factsAndAxioms, once a child produced
   * a solution no further alternative is tried (HTNConditionContinuation.inl, `alt_matched_`).
   */
  private solveAlt(items: readonly CondIR[], sc: Scope, k: Cont): boolean {
    const top = this.contTop
    const inner = this.take(K_ALT, k, sc)
    inner.a = false // matched
    let ok = false
    for (let i = 0; i < items.length; i++) {
      if (this.solve(items[i], sc, inner)) {
        ok = true
        break
      }
      if (this.aborted !== null) break
      if (inner.a && !this.mode.factsAndAxioms) break
    }
    this.contTop = top
    return ok
  }

  /**
   * Fact rows of name/arity in insertion order. Bound variables and values constrain, unbound
   * variables bind, discards match anything (HTNCCodeGenerator.cpp EmitGeneratedFactChoiceHelper).
   * A retry takes the next solution of the table as it is then: upstream's n-th retry rescans the live table for
   * its n-th matching row (target_solution, HTNCCodeGenerator.cpp:874-937; HTNConditionContinuation.inl:192-213).
   * Ours resumes after the last row while the world is unchanged (the same row), and rescans by solution count
   * once a callterm changed it, so rows added are seen and rows deleted shift the solutions as upstream.
   * A `once` fact (no variable the compiler could not prove bound) has only its first matching row
   * (EmitDirectDeterministicFact), and a variable that is unbound anyway (an ?inp_ parameter fed a failed
   * expression) matches nothing, as HTNAtom_Equals with NULL.
   * Expression arguments are evaluated first, into vals[base + i] (base -1: none).
   */
  private solveFact(c: Extract<CondIR, { k: 'fact' }>, sc: Scope, k: Cont): boolean {
    const terms = c.args
    const n = terms.length
    const top = this.valTop
    let base = -1
    for (let i = 0; i < n; i++) {
      const t = terms[i]
      if (t.k === 'var' || t.k === 'discard' || t.k === 'lit') continue
      if (base < 0) {
        base = top
        this.valTop = top + n
        const vals = this.vals
        while (vals.length < top + n) vals.push(undefined)
      }
      this.src = c.source
      const v = this.eval(t, sc)
      if (v === undefined) {
        this.valTop = top
        return false
      }
      this.vals[base + i] = v
    }
    const ok = this.solveRows(c, sc, k, base)
    this.valTop = top
    return ok
  }

  private solveRows(c: Extract<CondIR, { k: 'fact' }>, sc: Scope, k: Cont, base: number): boolean {
    const terms = c.args
    const n = terms.length
    const env = sc.v
    const once = c.once === true
    const mark = this.trailLen
    const st = this.st
    if (st !== undefined) {
      st.factQueries++
      if (!once) st.factChoicePoints++
    }
    const world = this.world
    let rows = world.rows(c.name, n)
    let revision = world.revision
    let solution = 0 // matching rows accepted so far: the next one is upstream's target_solution
    for (let r = 0; r < rows.length; r++) {
      if (st !== undefined) st.factRowsTested++
      if (!this.matchRow(terms, rows[r], env, once, base)) {
        this.trailUndo(mark)
        continue
      }
      if (st !== undefined) st.factRowsMatched++
      if (once) return this.cont(k) // binds nothing
      if (this.cont(k)) return true
      this.trailUndo(mark)
      // Without factsAndAxioms a fact keeps only its first solution.
      if (this.aborted !== null || !this.mode.factsAndAxioms) return false
      if (st !== undefined) {
        st.factQueries++ // upstream calls its choice helper again for the next solution (HTNCCodeGenerator.cpp:888-889)
        st.factChoiceRetries++
      }
      solution++
      if (world.revision === revision) continue
      // A callterm changed the facts: skip the first `solution` matching rows of the table as it is now.
      revision = world.revision
      rows = world.rows(c.name, n)
      let skipped = 0
      r = -1
      while (skipped < solution && ++r < rows.length) {
        if (st !== undefined) st.factRowsTested++
        if (this.matchRow(terms, rows[r], env, false, base)) skipped++
        this.trailUndo(mark)
      }
    }
    return false
  }

  /** One fact row against the fact's terms: binds unbound variables (undone by the caller), true if it matches. */
  private matchRow(terms: readonly TermIR[], row: readonly Atom[], env: Slots, once: boolean, base: number): boolean {
    for (let i = 0; i < terms.length; i++) {
      const t = terms[i]
      const cell = row[i]
      switch (t.k) {
        case 'discard':
          break
        case 'var': {
          const cur = env[t.slot]
          if (cur !== undefined) {
            if (!atomEquals(cell, cur)) return false
          } else if (once) return false
          else this.bind(env, t.slot, cell)
          break
        }
        case 'lit':
          if (!atomEquals(cell, t.v)) return false
          break
        default:
          if (!atomEquals(cell, this.vals[base + i] as Atom)) return false
      }
    }
    return true
  }

  /**
   * Axiom call (HTNConditionContinuation.inl HTN_CONDITION_AXIOM; HTNCCodeGenerator.cpp axiom
   * BEGIN/END helpers): `?out_` arguments must be unbound caller variables, checked before anything
   * else; `?inp_`/`?io_` values initialize the axiom's own environment; each body solution must
   * produce every output, match bound `?io_` arguments and agree on repeated caller variables
   * before outputs are published to the caller. Later failures resume the body for more solutions.
   */
  private solveAxiom(c: Extract<CondIR, { k: 'axiom' }>, sc: Scope, k: Cont): boolean {
    const ax: AxiomIR = this.domain.axioms[c.axiom]
    const params = ax.params
    const terms = c.args
    const n = params.length
    if (this.st !== undefined) this.st.axioms++
    // Traced: the call site is a composite condition node, the axiom's scope an Axiom node below it.
    const tr = this.tr
    if (tr !== undefined) tr.beginCond(c, sc) // BEGIN_CONDITION precedes the ?out_ guard (.inl :66, :138)
    for (let i = 0; i < n; i++) {
      if (params[i].mode !== 'out') continue
      const t = terms[i]
      if (t.k !== 'var' || sc.v[t.slot] !== undefined) {
        if (tr !== undefined) tr.end(false, sc)
        return false
      }
    }
    const top = this.contTop
    // The axiom's activation: its environment, its ?io_ inputs, the continuation its body solutions go to.
    const r = this.take(K_AXIOM, k, sc)
    r.c = c
    const v = sized(r.axPool, ax.vars.length)
    for (let i = 0; i < v.length; i++) v[i] = undefined
    let inputs: Slots | undefined // caller-supplied values of ?io_ parameters
    for (let i = 0; i < n; i++) {
      const mode = params[i].mode
      if (mode === 'out') continue
      const t = terms[i]
      let value: Atom | undefined
      if (t.k === 'var') value = sc.v[t.slot]
      else if (t.k !== 'discard') {
        this.src = c.source
        // A failed input expression leaves the parameter unbound (generated code passes NULL).
        value = this.eval(t, sc)
      }
      if (value === undefined) continue
      v[i] = value
      if (mode === 'io') {
        if (inputs === undefined) {
          inputs = sized(r.inPool, n)
          for (let j = 0; j < n; j++) inputs[j] = undefined
        }
        inputs[i] = value
      }
    }
    r.inputs = inputs
    const axScope = r.ax
    axScope.v = v
    axScope.names = ax.vars
    if (tr !== undefined) tr.beginAxiom(c.axiom, axScope) // end of the BEGIN helper, inputs set (HTNCCodeGenerator.cpp :2287)

    const ok = ax.cond === null ? this.axiomSolution(r) : this.solve(ax.cond, axScope, r)
    this.contTop = top
    if (ok) return true
    if (tr !== undefined) {
      tr.end(false, axScope) // the body ran out: END_AXIOM(0), END_CONDITION(0) (.inl :186-190)
      tr.end(false, sc)
    }
    return false
  }

  /** A body solution of the axiom invocation `r` (K_AXIOM): check the outputs, publish them, continue. */
  private axiomSolution(r: Cont): boolean {
    const c = r.c as Extract<CondIR, { k: 'axiom' }>
    const params = this.domain.axioms[c.axiom].params
    const terms = c.args
    const n = params.length
    const axScope = r.ax
    const v = axScope.v
    const sc = r.sc
    const k = r.k
    const tr = this.tr
    const valid = axiomOutputsValid(params, terms, v, r.inputs)
    if (tr !== undefined) {
      tr.end(valid, axScope) // END_AXIOM(valid) in the END helper (HTNCCodeGenerator.cpp :2360)
      if (!valid) {
        tr.beginAxiom(c.axiom, axScope) // the Resume label: BEGIN_AXIOM, then the body's retry (.inl :182)
        return false
      }
    } else if (!valid) return false
    const caller = sc.v
    const mark = this.trailLen
    for (let i = 0; i < n; i++) {
      const t = terms[i]
      if (params[i].mode === 'inp' || t.k !== 'var') continue
      if (caller[t.slot] === undefined) this.bind(caller, t.slot, v[i] as Atom)
    }
    if (tr === undefined) {
      if (this.cont(k)) return true
    } else {
      tr.end(true, sc) // the call site's END_CONDITION(1) before its continuation (.inl :71)
      if (this.cont(k)) return true
      tr.beginCond(c, sc) // resumed: a new call-site node, then a new axiom scope (.inl :76, :182)
      tr.beginAxiom(c.axiom, axScope)
    }
    this.trailUndo(mark)
    return false
  }

  /**
   * solve() with a tracer: where upstream's generated code emits BEGIN/END_CONDITION. A composite (and/or/alt/not,
   * or a condition upstream lowers into hidden temporaries) ends before its continuation and begins again when
   * that fails (HTNConditionContinuation.inl :58-79); a fact with several possible rows is one node per row tried
   * (:192-213); a deterministic leaf (HTNCCodeGenerator.cpp EmitGeneratedConditionLeaf :1175-1457, direct facts
   * :966-1047) ends once, and a later failure goes straight to what came before it (.inl :214-219).
   */
  private solveTraced(c: CondIR, sc: Scope, k: Cont, tr: PlanTracer): boolean {
    if (c.k === 'axiom') return this.solveAxiom(c, sc, k)
    const lowered = loweredCond(c)
    if (c.k === 'fact' && !lowered) return this.solveFactTraced(c, sc, k, tr)
    tr.beginCond(c, sc)
    const top = this.contTop
    if (lowered || c.k === 'and' || c.k === 'or' || c.k === 'alt' || c.k === 'not') {
      const next = this.take(K_TRACE_COMPOSITE, k, sc)
      next.c = c
      const ok = this.solveRaw(c, sc, next)
      this.contTop = top
      if (ok) return true
      if (c.k === 'fact') tr.factRows(this.world.rows(c.name, c.args.length))
      tr.end(false, sc)
      return false
    }
    const next = this.take(K_TRACE_LEAF, k, sc)
    next.a = false // ended
    const ok = this.solveRaw(c, sc, next)
    const ended = next.a
    this.contTop = top
    if (ok) return true
    if (!ended) tr.end(false, sc)
    return false
  }

  private solveFactTraced(c: Extract<CondIR, { k: 'fact' }>, sc: Scope, k: Cont, tr: PlanTracer): boolean {
    const first = tr.beginCond(c, sc)
    const top = this.contTop
    const next = this.take(K_TRACE_FACT, k, sc)
    next.c = c
    next.n = first
    next.a = true // open
    next.b = c.once !== true // a choice point
    const ok = this.solveFact(c, sc, next)
    const open = next.a
    this.contTop = top
    if (ok) return true
    if (open) {
      tr.factRows(this.world.rows(c.name, c.args.length))
      tr.end(false, sc)
    }
    return false
  }

  /**
   * split_list / split_list_front: element, rest. split_list_back: rest, element. Empty or
   * non-list input fails; outputs bind or match (HTNCCodeGenerator.cpp EmitGeneratedConditionLeaf,
   * HTN_CONDITION_BUILTIN_LIST_SPLIT). A discard output always fails there (it has no slot);
   * the upstream validator rejects it anyway. The rest of a list is made once per list (atoms never change).
   */
  private solveSplit(c: Extract<CondIR, { k: 'split' }>, sc: Scope, k: Cont): boolean {
    this.src = c.source
    const l = this.eval(c.list, sc)
    if (l === undefined) return false
    if (l.t !== 'list') {
      this.diag('type_error', `split_list input is ${l.t}, expected list`)
      return false
    }
    const items = l.v
    if (items.length === 0) return false
    let first: Atom
    let second: Atom
    if (c.from === 'front') {
      first = items[0]
      let rest = this.restFront.get(items)
      if (rest === undefined) this.restFront.set(items, (rest = { t: 'list', v: items.slice(1) }))
      second = rest
    } else {
      let rest = this.restBack.get(items)
      if (rest === undefined) this.restBack.set(items, (rest = { t: 'list', v: items.slice(0, items.length - 1) }))
      first = rest
      second = items[items.length - 1]
    }
    const mark = this.trailLen
    if (this.unify(c.a, first, sc) && this.unify(c.b, second, sc)) {
      if (this.cont(k)) return true
    }
    this.trailUndo(mark)
    return false
  }

  private unify(t: TermIR, value: Atom, sc: Scope): boolean {
    if (t.k === 'discard') return false
    if (t.k === 'var') {
      const cur = sc.v[t.slot]
      if (cur === undefined) {
        this.bind(sc.v, t.slot, value)
        return true
      }
      return atomEquals(cur, value)
    }
    const v = this.eval(t, sc)
    return v !== undefined && atomEquals(v, value)
  }

  /**
   * Built-in comparison (HTNCCodeGenerator.cpp _COMPARE_ATOMS): unbound fails both `==` and `!=`;
   * numbers compare numerically across int/float; other equality uses atomEquals (BOOL~INT 1/0);
   * ordering requires two numbers.
   */
  private compare(op: string, ea: ExprIR, eb: ExprIR, sc: Scope): boolean {
    const a = this.eval(ea, sc)
    if (a === undefined) return false
    const b = this.eval(eb, sc)
    if (b === undefined) return false
    const numeric = isNumeric(a) && isNumeric(b)
    if (op === '==' || op === '!=') {
      const equal = numeric ? a.v === b.v : atomEquals(a, b)
      return op === '==' ? equal : !equal
    }
    if (!numeric) {
      this.diag('type_error', `Comparison '${op}' needs numbers, got ${a.t} and ${b.t}`)
      return false
    }
    const x = a.v as number
    const y = b.v as number
    switch (op) {
      case '<': return x < y
      case '<=': return x <= y
      case '>': return x > y
      case '>=': return x >= y
    }
    return false
  }

  // ---------------------------------------------------------------------------------------------
  // Values. Evaluation is depth-first, left to right, and stops at the first failure (upstream
  // lowers nested calls/operands in source order: HTNCompilerIRBuilder.cpp PrepareAssignmentExpression).
  // `owned`: inside a runtime list, where upstream builds every value as an owned atom and a variable
  // must be bound (EmitGeneratedOwnedValue, HTNCCodeGenerator.cpp:1145-1166), also a call's argument.

  private eval(e: ExprIR, sc: Scope, owned = false): Atom | undefined {
    switch (e.k) {
      case 'lit':
        return e.v
      case 'var': {
        const v = sc.v[e.slot]
        if (v === undefined) this.diag('unbound_read', `Variable '${sc.names[e.slot] ?? '#' + e.slot}' is unbound`)
        return v
      }
      case 'list': {
        const out: Atom[] = []
        for (let i = 0; i < e.items.length; i++) {
          const v = this.eval(e.items[i], sc, true)
          if (v === undefined) return undefined
          out.push(v)
        }
        return { t: 'list', v: out }
      }
      case 'arith':
        return this.arith(e.op, e.args, sc, owned)
      case 'call':
        return this.callTerm(e, sc, owned)
    }
  }

  /** Evaluate `exprs` into `out` (exactly as long); false at the first failure. */
  private evalInto(exprs: readonly ExprIR[], sc: Scope, out: Slots): boolean {
    for (let i = 0; i < exprs.length; i++) {
      const v = this.eval(exprs[i], sc)
      if (v === undefined) return false
      out[i] = v
    }
    return true
  }

  /**
   * A variable argument goes in as it is, unbound too: upstream passes the variable's atom, NULL when unbound
   * (HTNCCodeGenerator.cpp:676-686, :1361-1371, :2840-2844), and the invoker decides (callterms.ts: not_registered
   * first, then the binding's argument check). Not inside a runtime list (`owned`). A failed expression argument
   * leaves the call uninvoked. The arguments array is the engine's, valid during the call (CallTerm).
   */
  private callTerm(c: CallNode, sc: Scope, owned = false): Atom | undefined {
    let args: readonly (Atom | undefined)[] = NO_ARGS
    const n = c.args.length
    if (n > 0) {
      const depth = this.callDepth
      const pools = this.callArgs
      while (pools.length <= depth) pools.push([])
      const out = sized(pools[depth], n)
      this.callDepth = depth + 1 // a nested call's arguments go one level up
      for (let i = 0; i < n; i++) {
        const a = c.args[i]
        let v: Atom | undefined
        if (a.k === 'var' && !owned) v = sc.v[a.slot]
        else if ((v = this.eval(a, sc, owned)) === undefined) {
          this.callDepth = depth
          return undefined // the call is not invoked
        }
        out[i] = v
      }
      this.callDepth = depth
      args = out
    }
    if (this.st !== undefined) this.st.callterms++
    const inv = this.invoker
    const r = inv.invoke(this.callterms, this.daemons, c.name, args, this.context)
    // undefined with no error: an ordinary failed / unbound result, not reported. An error that would be neither
    // reported nor warned about (fail_silently, or its warning already shown) builds no info.
    if (inv.reason !== undefined && !this.warnings.quiet(this.policy, this.onDiagnostic)) this.calltermError(c, inv.info())
    return r
  }

  /** A callterm error at call node `c`, through the policy: once per failed invocation (MISSING_CALLTERMS.md:61). */
  private calltermError(c: CallNode, info: CallTermErrorInfo): void {
    const at = (this.sites ??= callSiteIndex(this.domain)).get(c)
    if (at !== undefined) {
      info.site = at.site
      if (at.source !== undefined) info.source = { ...at.source } // the `(call` itself, also when nested
    }
    // Not execution info's last_error: upstream sets that only for value errors and the frame capacity
    // (HTNCCodeGenerator.cpp:1072, :2760); callterm errors go through the policy alone.
    reportCalltermError(this.policy, this.onDiagnostic, info, this.warnings)
  }

  /**
   * Upstream _EVALUATE_ARITHMETIC (HTNCCodeGenerator.cpp): operands must be INT/FLOAT (checked in
   * order, stopping at the first bad one); all-int arithmetic is checked int32 with truncating
   * division; any float makes the whole expression float (computed in double, rejected if NaN or
   * beyond FLT_MAX, stored single precision). `%` is int-only; division/remainder by zero fails.
   * Unary int negation is not range-checked upstream (-INT32_MIN wraps), mirrored here.
   * Operands go on the num stack: num[base..numTop).
   */
  private arith(op: string, exprs: readonly ExprIR[], sc: Scope, owned: boolean): Atom | undefined {
    const num = this.num
    const base = this.numTop
    let useFloat = false
    for (let i = 0; i < exprs.length; i++) {
      const v = this.eval(exprs[i], sc, owned)
      if (v === undefined) return this.popArith(base)
      if (!isNumeric(v)) {
        this.diag('arithmetic_error', `Operand ${i + 1} of '${op}' is ${v.t}, expected a number`)
        return this.popArith(base)
      }
      if (v.t === 'float') useFloat = true
      if (this.numTop < num.length) num[this.numTop] = v.v
      else num.push(v.v)
      this.numTop++
    }
    const n = this.numTop - base
    let result: Atom | undefined
    if (n === 0) {
      result = undefined
    } else if (op === '%' && (n !== 2 || useFloat)) {
      this.diag('arithmetic_error', `'%' needs exactly two integer operands`)
    } else if (op === '++' || op === '--') {
      const r = num[base] + (op === '++' ? 1 : -1)
      if (n !== 1) result = undefined
      else if (!useFloat) result = r < INT32_MIN || r > INT32_MAX ? this.overflow(op) : int(r)
      else result = r !== r || r < -FLT_MAX || r > FLT_MAX ? this.overflow(op) : { t: 'float', v: Math.fround(r) }
    } else {
      result = useFloat ? this.arithFloat(op, base, n) : this.arithInt(op, base, n)
    }
    this.popArith(base)
    return result
  }

  private arithInt(op: string, base: number, n: number): Atom | undefined {
    const num = this.num
    if (op === '-' && n === 1) return int(-num[base] | 0)
    let r = op === '*' ? 1 : num[base]
    for (let i = op === '*' ? 0 : 1; i < n; i++) {
      const x = num[base + i]
      switch (op) {
        case '+': r += x; break
        case '-': r -= x; break
        case '*': r *= x; break
        case '/':
          if (x === 0) return this.divByZero(op)
          r = Math.trunc(r / x)
          break
        case '%':
          if (x === 0) return this.divByZero(op)
          r = r % x
          break
        default: return undefined
      }
      if (r < INT32_MIN || r > INT32_MAX) return this.overflow(op)
    }
    return int(r | 0)
  }

  private arithFloat(op: string, base: number, n: number): Atom | undefined {
    const num = this.num
    if (op === '-' && n === 1) return { t: 'float', v: Math.fround(-num[base]) }
    let r = op === '*' ? 1 : num[base]
    for (let i = op === '*' ? 0 : 1; i < n; i++) {
      const x = num[base + i]
      switch (op) {
        case '+': r += x; break
        case '-': r -= x; break
        case '*': r *= x; break
        case '/':
          if (x === 0) return this.divByZero(op)
          r /= x
          break
        default: return undefined
      }
      if (r !== r || r < -FLT_MAX || r > FLT_MAX) return this.overflow(op)
    }
    return { t: 'float', v: Math.fround(r) }
  }

  private popArith(base: number): undefined {
    this.numTop = base
    return undefined
  }

  private overflow(op: string): undefined {
    this.diag('arithmetic_error', `Arithmetic overflow in '${op}'`)
    return undefined
  }

  private divByZero(op: string): undefined {
    this.diag('arithmetic_error', `Division by zero in '${op}'`)
    return undefined
  }

  // ---------------------------------------------------------------------------------------------
  // Trail and diagnostics

  private bind(env: Slots, slot: number, value: Atom): void {
    if (this.st !== undefined) this.st.bindings++
    env[slot] = value
    const i = this.trailLen++
    if (i < this.trailEnv.length) {
      this.trailEnv[i] = env
      this.trailSlot[i] = slot
    } else {
      this.trailEnv.push(env)
      this.trailSlot.push(slot)
    }
  }

  private trailUndo(mark: number): void {
    const envs = this.trailEnv
    const slots = this.trailSlot
    if (this.st !== undefined && mark < this.trailLen) this.st.unbinds += this.trailLen - mark
    for (let i = this.trailLen - 1; i >= mark; i--) {
      envs[i][slots[i]] = undefined
      envs[i] = EMPTY_ENV
    }
    if (mark < this.trailLen) this.trailLen = mark
  }

  /** Keep the current bindings; forget how to undo them (a branch condition was accepted). */
  private trailCommit(): void {
    const envs = this.trailEnv
    for (let i = 0; i < this.trailLen; i++) envs[i] = EMPTY_ENV
    this.trailLen = 0
  }

  private diag(code: RuntimeDiagnostic['code'], message: string): void {
    const s = this.src
    const d: RuntimeDiagnostic = s === undefined ? { code, message } : { code, message, source: { file: s.file, line: s.line, col: s.col } }
    this.lastError = d // upstream last_error, kept without a sink too
    const sink = this.onDiagnostic
    if (sink !== undefined) sink(d)
  }
}

/** Two argument lists of the same task: equal atom by atom (sameAtom). */
function sameArgs(a: readonly Atom[], b: Slots): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (!sameAtom(a[i], b[i] as Atom)) return false
  return true
}

function zeroStats(st: PlanStats): void {
  st.methods = st.branches = st.branchRetries = st.branchBacktracks = st.tasks = st.compoundTasks = 0
  st.conditions = st.axioms = st.callterms = 0
  st.factQueries = st.factRowsTested = st.factRowsMatched = st.factChoicePoints = st.factChoiceRetries = 0
  st.bindings = st.unbinds = 0
}
