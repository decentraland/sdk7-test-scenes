// The Domain Runner: pick a domain of the scene, a top-level method, a world state and a backtracking mode, run the
// planner once with a recorder, and read the result with the same views as a live NPC. Port of upstream HTNDemo's
// Domain Runner tab (HTNDemo/src/main.cpp :346-462: Domain / Top level method / Backtracking / World state, Run,
// Success or Failure in ms, the plan, then the world, the tree and the watch). Its world states are the gallery and
// lab scenarios (a compiled .worldstate plus its edits, with the plan upstream or our planner expects), an empty
// world, or a copy of a live NPC's world. It plans on a fresh WorldState: a live world is never touched. Pure.
// The same code runs the CLI (`npm run htn:run`, tools/htn/run.ts), so a terminal and the tab agree on a run.
import { nowMs } from '../htn-planner/htn/time'
import { decompose, decomposeDeferred, formatTask, PlanTraceRecorder, snapshotWorld, validateCallterms, WorldState } from '../htn-planner'
import { checkFacts } from '../htn-planner/htn/planner'
import { calltermMessage } from '../htn-planner/htn/callterms'
import type { Atom, BacktrackingMode, CallTerm, DecompositionStatus, DomainIR, PlanRun, PlanStep, RuntimeDiagnostic, WorldSnapshot } from '../htn-planner'
import { expectedStatus, galleryCallterms, MODES } from '../examples/upstream/stations'
import type { GalleryStation } from '../examples/upstream/stations'

export interface RunnerWorld {
  id: string
  label: string
  setup(world: WorldState): void
  callterms?: Readonly<Record<string, CallTerm>>
  /** The callterm context for a world (a station host); default `{ world }`. */
  context?(world: WorldState): unknown
  /** A scenario's own entry and what it expects there. */
  method?: string
  args?: readonly Atom[]
  expect?: readonly string[] | null
  status?: DecompositionStatus
  /** A scenario that fixes its mode expects its plan only in that mode. */
  mode?: BacktrackingMode
  maxDepth?: number
  /** Callterms the scenario leaves unbound on purpose (GalleryScenario.unbound): not reported as missing. */
  unbound?: readonly string[]
}

export interface RunnerDomain {
  /** The domain's name; one entry per DomainIR object. */
  id: string
  label: string
  domain: DomainIR
  worlds: RunnerWorld[]
}

export interface TopLevel {
  name: string
  arity: number
}

/** Top-level methods (upstream lists the domain's top-level methods), by name and arity. */
export function topLevelMethods(domain: DomainIR): TopLevel[] {
  const out: TopLevel[] = []
  for (const m of domain.methods) if (m.topLevel) out.push({ name: m.name, arity: m.arity })
  return out
}

/**
 * Every domain the scene can run: the gallery and lab stations' domains with their scenarios as world states, and
 * `extra` domains (the playground NPCs') with an empty world. The same DomainIR is listed once.
 */
export function runnerCatalogue(stations: readonly GalleryStation[], extra: readonly { domain: DomainIR; label?: string }[] = []): RunnerDomain[] {
  const byDomain = new Map<DomainIR, RunnerDomain>()
  const entry = (domain: DomainIR, label: string) => {
    let e = byDomain.get(domain)
    if (!e) byDomain.set(domain, (e = { id: domain.name, label, domain, worlds: [] }))
    return e
  }
  for (const station of stations) {
    for (const s of station.scenarios) {
      const domain = s.domain ?? station.domain
      const e = entry(domain, domain.name)
      e.worlds.push({
        id: `${station.id}/${s.name}`,
        label: `${station.title}: ${s.name}`,
        setup: s.setup,
        callterms: s.callterms ?? galleryCallterms,
        context: world => s.context?.(world) ?? station.host?.(world) ?? { world },
        method: s.method,
        args: s.args ?? [],
        expect: s.expect,
        status: expectedStatus(s),
        mode: s.mode,
        maxDepth: s.maxDepth,
        unbound: s.unbound
      })
    }
  }
  for (const x of extra) entry(x.domain, x.label ?? x.domain.name)
  const out = [...byDomain.values()]
  for (const e of out) e.worlds.push(EMPTY_WORLD)
  return out
}

export const EMPTY_WORLD: RunnerWorld = { id: 'empty', label: 'empty world', setup: () => {} }

/** A world id a shell takes unquoted: `hierarchical/fact backtracking` -> `hierarchical/fact-backtracking`. */
export function worldSlug(id: string): string {
  return id
    .toLowerCase()
    .split('/')
    .map(part => part.replace(/[^a-z0-9_.]+/g, '-').replace(/^-+|-+$/g, ''))
    .join('/')
}

/** Every world state of the catalogue but the empty ones, with its domain, in catalogue order. */
export function runnerWorlds(catalogue: readonly RunnerDomain[]): { world: RunnerWorld; domain: RunnerDomain }[] {
  return catalogue.flatMap(d => d.worlds.filter(w => w !== EMPTY_WORLD).map(world => ({ world, domain: d })))
}

/** Every world state by a unique slug: worldSlug, `-2`, `-3`... after a slug seen before (two cases may share a name). */
export function worldSlugs(catalogue: readonly RunnerDomain[]): Map<RunnerWorld, string> {
  const out = new Map<RunnerWorld, string>()
  const seen = new Map<string, number>()
  for (const { world } of runnerWorlds(catalogue)) {
    const slug = worldSlug(world.id)
    const n = (seen.get(slug) ?? 0) + 1
    seen.set(slug, n)
    out.set(world, n === 1 ? slug : `${slug}-${n}`)
  }
  return out
}

/** A world state by its id or its slug (worldSlugs), or undefined. */
export function findRunnerWorld(catalogue: readonly RunnerDomain[], id: string): { world: RunnerWorld; domain: RunnerDomain; slug: string } | undefined {
  const slugs = worldSlugs(catalogue)
  const all = runnerWorlds(catalogue).map(x => ({ ...x, slug: slugs.get(x.world)! }))
  return all.find(x => x.world.id === id) ?? all.find(x => x.slug === id) ?? all.find(x => x.slug === worldSlug(id))
}

/** A world state with the rows of a snapshot, e.g. a copy of a live NPC's world. */
export function worldFrom(snapshot: WorldSnapshot): WorldState {
  const world = new WorldState()
  copyInto(world, snapshot)
  return world
}

/** A world state option that copies `world` as it is now (rows are shared, never mutated). */
export function cloneWorld(id: string, label: string, world: WorldState): RunnerWorld {
  const snapshot = snapshotWorld(world)
  return { id, label, setup: w => copyInto(w, snapshot) }
}

function copyInto(world: WorldState, snapshot: WorldSnapshot): void {
  for (const key of Object.keys(snapshot.tables)) {
    const name = key.slice(0, key.lastIndexOf('/'))
    for (const row of snapshot.tables[key]) world.add(name, ...row)
  }
}

export interface RunnerRequest {
  domain: DomainIR
  method: string
  args?: readonly Atom[]
  world: RunnerWorld
  mode: BacktrackingMode
  /** Untraced repeats to time the planner alone, at least. Default 20. */
  repeats?: number
  /**
   * Then repeat on until the readings add up to this many ms (default 20): the Explorer's clock moves in 1 ms steps
   * and a plan takes far less, so a mean needs a few dozen ticks to mean anything. 0: exactly `repeats`.
   */
  minTotalMs?: number
  /** Wall time the timing may take, ms (default 60), whatever the counts. */
  budgetMs?: number
  clock?: () => number
  /**
   * Planner calls at most (the top-level plan counts one): above 1, the deferred `&` steps of the plan are expanded
   * in order (PlanRunner.resolve) against the world it planned on, primitive effects not applied. Default 1: plan
   * once, as upstream's Domain Runner.
   */
  maxPasses?: number
}

/** One deferred step expanded after the plan. */
export interface Expansion {
  step: string
  status: DecompositionStatus
  plan: string[]
  run: PlanRun
}

export interface Expectation {
  plan: readonly string[] | null
  status: DecompositionStatus
  /** The run's status and plan are the expected ones. */
  same: boolean
}

export interface RunnerResult {
  status: DecompositionStatus
  /** The planner alone, mean of the untraced repeats, ms. */
  ms: number
  /** The traced run (recording included), ms. */
  tracedMs: number
  repeats: number
  plan: string[]
  run: PlanRun
  recorder: PlanTraceRecorder
  /** The world it planned against (a fresh copy). */
  world: WorldState
  /** What the scenario expects for this method and mode, when it says. */
  expected?: Expectation
  /** Dev checks first (unbound callterms, fact tables of a wrong arity), then the run's: `code: message`. */
  diagnostics: string[]
  /** Deferred steps expanded (maxPasses > 1), in order. */
  expansions: Expansion[]
  /** The plan with every deferred step expanded, when each expansion succeeded within maxPasses. */
  expanded?: string[]
  /** Traced planner calls made: 1 + expansions. */
  passes: number
}

const MAX_DIAGNOSTICS = 20

/** A runtime diagnostic as one line: `code: message`, its source appended unless the message has it. */
export function diagnosticLine(d: Pick<RuntimeDiagnostic, 'code' | 'message' | 'source'>): string {
  const s = d.source
  const where = s && !d.message.includes(`${s.file}:${s.line}`) ? ` at ${s.file}:${s.line}:${s.col}` : ''
  return `${d.code}: ${d.message}${where}`
}

/**
 * The dev checks a PlanRunner reports when it is created and at plan() (upstream ValidateGeneratedCallTerms): call
 * sites whose callterm the world's registry lacks (but those it leaves out on purpose), world tables the domain
 * reads only with another arity.
 */
export function preflight(domain: DomainIR, world: RunnerWorld, planned: WorldState): string[] {
  const out: string[] = []
  const skip = new Set(world.unbound ?? [])
  for (const info of validateCallterms(domain, world.callterms)) {
    if (skip.has(info.name)) continue
    out.push(`unregistered_callterm: ${calltermMessage(info)} (domain '${domain.name}' calls it; the call fails when reached)`)
  }
  for (const key of checkFacts(domain, planned).wrongArity) {
    const name = key.slice(0, key.lastIndexOf('/'))
    const read = domain.facts.filter(f => f.slice(0, f.lastIndexOf('/')) === name).join(', ')
    out.push(`fact_arity_mismatch: Fact '${key}' is in the world state, but domain '${domain.name}' reads '${name}' only as ${read}`)
  }
  return out
}

const sameMode = (a: BacktrackingMode, b: BacktrackingMode) => a.factsAndAxioms === b.factsAndAxioms && a.branches === b.branches

/** Run the planner once with a recorder (and a few times without, for the time) on a fresh world. */
export function runDomain(req: RunnerRequest): RunnerResult {
  const clock = req.clock ?? nowMs
  const args = req.args ?? req.world.args ?? []
  const fresh = () => {
    const w = new WorldState()
    req.world.setup(w)
    return w
  }
  const world = fresh()
  const diagnostics: string[] = preflight(req.domain, req.world, world)
  const counts = new Map<string, number>()
  const options = (w: WorldState) => ({
    callterms: req.world.callterms,
    context: req.world.context ? req.world.context(w) : { world: w },
    mode: req.mode,
    maxDepth: req.world.maxDepth,
    // As the stations: a callterm error is a diagnostic to show, never a throw out of the panel.
    calltermErrorPolicy: 'report' as const,
    onDiagnostic: (d: RuntimeDiagnostic) => {
      // The same error at each attempt: one line with its count.
      const line = diagnosticLine(d)
      const n = counts.get(line)
      if (n !== undefined) counts.set(line, n + 1)
      else if (counts.size < MAX_DIAGNOSTICS) counts.set(line, 1)
    }
  })
  const passes = Math.max(1, Math.floor(req.maxPasses ?? 1))
  const recorder = new PlanTraceRecorder(req.domain, { keep: passes, clock })
  const traced = { ...options(world), trace: recorder }
  const result = decompose(req.domain, world, req.method, args, traced)
  const run = recorder.lastPlan ?? emptyRun(req, result.status, world)
  // PlanRunner.resolve over the whole plan, on the same world and callterm context as the plan.
  const expansions: Expansion[] = []
  let expanded: PlanStep[] | undefined = result.status === 'succeeded' && passes > 1 ? result.plan.slice() : undefined
  for (let i = 0; expanded !== undefined && i < expanded.length; ) {
    const step = expanded[i]
    if (step.kind === 'primitive') {
      i++
      continue
    }
    if (1 + expansions.length >= passes) {
      expanded = undefined
      break
    }
    const before = recorder.lastDeferred
    const r = decomposeDeferred(req.domain, world, step, traced)
    const own = recorder.lastDeferred
    expansions.push({
      step: formatTask(step.name, step.args),
      status: r.status,
      plan: r.plan.map(s => formatTask(s.name, s.args)),
      run: own && own !== before ? own : emptyRun(req, r.status, world)
    })
    if (r.status !== 'succeeded') expanded = undefined
    else expanded.splice(i, 1, ...r.plan)
  }
  for (const [line, n] of counts) diagnostics.push(n > 1 ? `${line} (x${n})` : line)

  // Timing: a fresh world each time (a callterm context may keep state), the planner without a recorder.
  const want = Math.max(0, req.repeats ?? 20)
  const minTotal = req.minTotalMs ?? 20
  let total = 0
  let repeats = 0
  const budget = clock() + (req.budgetMs ?? 60)
  const more = () => repeats < want || (want > 0 && total < minTotal)
  while (more() && (repeats === 0 || clock() < budget)) {
    const w = fresh()
    const o = { ...options(w), calltermErrorPolicy: 'fail_silently' as const, onDiagnostic: undefined }
    const t0 = clock()
    decompose(req.domain, w, req.method, args, o)
    total += clock() - t0
    repeats++
  }
  const plan = result.plan.map(s => formatTask(s.name, s.args))
  const out: RunnerResult = {
    status: result.status,
    ms: repeats > 0 ? total / repeats : run.ms,
    tracedMs: run.ms,
    repeats,
    plan,
    run,
    recorder,
    world,
    diagnostics,
    expansions,
    passes: 1 + expansions.length
  }
  if (expanded !== undefined && expansions.length > 0) out.expanded = expanded.map(s => formatTask(s.name, s.args))
  const w = req.world
  const expectsHere = w.method === req.method && w.status !== undefined && sameArgs(w.args ?? [], args)
  const modeOk = w.mode ? sameMode(w.mode, req.mode) : sameMode(MODES[0].mode, req.mode)
  if (expectsHere && modeOk && w.status) {
    const status = w.status
    const same = result.status === status && (w.expect === null || w.expect === undefined || JSON.stringify(plan) === JSON.stringify(w.expect))
    out.expected = { plan: w.expect ?? null, status, same }
  }
  return out
}

const sameArgs = (a: readonly Atom[], b: readonly Atom[]) => JSON.stringify(a) === JSON.stringify(b)

/** invalid_call never begins a run: an empty one so the views have something to show. */
function emptyRun(req: RunnerRequest, status: DecompositionStatus, world: WorldState): PlanRun {
  return { seq: 0, deferred: false, method: -1, args: (req.args ?? []).slice(), status, plan: [], ms: 0, world: world.revision, nodes: [] }
}
