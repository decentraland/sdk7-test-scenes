// What a gallery station is: a domain, a list of scenarios (a world state plus edits that change the plan) and,
// where the domain needs it, effects that its primitives apply to the world and a host simulation; and the world
// edit helpers the stations share. The stations themselves are one file each in gallery/ (the list:
// gallery/index.ts), the language lab in lab.ts. Pure (no SDK): the scene runs them in src/demo/upstream-zone.ts,
// tests plan them headless (test/examples/upstream-stations.test.ts). Expected plans come from the conformance
// suite and from running the planner; see docs/htn-examples-catalog.md.
import { addFacts, Atom, BacktrackingMode, CallTerm, DecompositionStatus, DomainIR, int, list, RuntimeDiagnostic, str, WorldFacts, WorldState } from '../../htn-planner'
import { CalltermContext, upstreamCallterms } from './callterms'

export interface GalleryScenario {
  name: string
  /** Default: the station's domain. */
  domain?: DomainIR
  method: string
  args?: Atom[]
  setup(world: WorldState): void
  /**
   * The plan under the default mode (ALL), formatted with formatTask; checked by the tests. Empty: no plan.
   * null: upstream checks only parts of it.
   */
  expect: string[] | null
  /** Default: succeeded, or no_plan when `expect` is empty. */
  status?: DecompositionStatus
  /** The Domain > switch jumps to the next scenario of another group. */
  group?: string
  /** Default: galleryCallterms. */
  callterms?: Readonly<Record<string, CallTerm>>
  /**
   * Callterms the domain calls that `callterms` leaves out on purpose: the upstream test binds only the ones its
   * methods reach, or checks what a missing one does. A PlanRunner still reports the others (unregistered_callterm).
   */
  unbound?: readonly string[]
  /** The callterm context; default: the station host. */
  context?(world: WorldState): StationHost
  /** A fixed backtracking mode; default: the station's Mode switch (ALL). */
  mode?: BacktrackingMode
  /** Default: the planner's (upstream's call-frame capacity, 8192). */
  maxDepth?: number
}

/** Whether a runner diagnostic of the scenario is worth reporting: not an unregistered callterm it leaves out on purpose. */
export const reported = (s: GalleryScenario, d: RuntimeDiagnostic): boolean =>
  !(d.code === 'unregistered_callterm' && d.callterm !== undefined && (s.unbound ?? []).includes(d.callterm))

/** The status a scenario expects. */
export const expectedStatus = (s: GalleryScenario): DecompositionStatus =>
  s.status ?? (s.expect?.length === 0 ? 'no_plan' : 'succeeded')

/** Host-side simulation next to the planner (e.g. async path queries). `update` returns whether the world changed;
 *  the zone ignores it and, like upstream's demo host, plans again only when the plan ends or fails. */
export interface StationHost extends CalltermContext {
  update?(dt: number): boolean
  /** How long a step takes, in seconds; default: the zone's timed step, or its walk to the target. */
  duration?(name: string, args: readonly Atom[]): number
  /** The host's world hears that a step finished (after the station's effects), e.g. a walk segment reached. */
  complete?(name: string, args: readonly Atom[]): void
  /** A host that keeps its NPC going counts journeys; Auto moves on after AUTO_RUNS of them instead of plans. */
  journeys?: number
}

export interface GalleryStation {
  id: string
  title: string
  blurb: string
  domain: DomainIR
  scenarios: GalleryScenario[]
  /** Show the backtracking mode switch. */
  modes?: boolean
  /** Primitive effects applied to the world when the step finishes (the planner itself never writes facts). */
  effects?: Record<string, (args: readonly Atom[], world: WorldState) => void>
  /** One host per world (scenario run). Default: callterms see the world only. */
  host?(world: WorldState): StationHost
  /** Hot reload: the Reload > button swaps the domain to the next of these on the same world and host. */
  reloads?: GalleryReload[]
  /** What a reload keeps of the world, shown after it (e.g. the NPC's place). */
  keeps?(world: WorldState): string
}

/** A domain swap a station offers: a compiled revision, or a source that did not compile. */
export interface GalleryReload {
  name: string
  /** The new domain; undefined: the compile failed (`error`) and the active domain stays. */
  domain?: DomainIR
  error?: string
  /** A step the plans of the new domain carry (the self-test's marker). */
  marker?: string
}

export const MODES: { name: string; mode: BacktrackingMode }[] = [
  { name: 'ALL', mode: { factsAndAxioms: true, branches: true } },
  { name: 'FACTS_AND_AXIOMS', mode: { factsAndAxioms: true, branches: false } },
  { name: 'BRANCHES', mode: { factsAndAxioms: false, branches: true } },
  { name: 'NONE', mode: { factsAndAxioms: false, branches: false } }
]

export const galleryCallterms = upstreamCallterms

// ---- world edits ---------------------------------------------------------------------------------

export const same = (a: Atom, b: Atom) => a.t === b.t && JSON.stringify(a.v) === JSON.stringify(b.v)
export const ws = (facts: WorldFacts, edit: (w: WorldState) => void = () => {}) => (w: WorldState) => {
  addFacts(w, facts)
  edit(w)
}
/** Replace the rows of `name` keyed by the same first argument (all rows for a 0/1-argument fact). */
export function put(w: WorldState, name: string, ...args: Atom[]) {
  if (args.length >= 2) w.removeWhere(name, args.length, r => same(r[0], args[0]))
  else w.clear(name, args.length)
  w.add(name, ...args)
}
export const drop = (w: WorldState, name: string, arity: number) => w.clear(name, arity)
export const pos = (x: number, z: number) => list(int(x), int(z))

/** Gallery shorthands for a string and an entity id. */
export const S = (text: string) => str(text)
export const E = (id: number) => int(id)
