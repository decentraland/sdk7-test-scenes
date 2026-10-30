// The debug registry: one place where every planner host of the scene (a playground NPC, a gallery or lab station)
// says what the debugger may read: its domain, its trace recorder, its event history, its metrics, its world and its
// body. A host registers a source (a function that lists its hosts as they are now), so a level that rebuilds its
// agents (Reset) or a station that swaps its world (Scenario >) needs no re-registration. Pure, no SDK.
//
// Recording costs planning time (x5-9 with a recorder attached): `tracing` is on only while the debugger is open,
// and a host that can attach a recorder later (a station) reads it before it plans. Hosts that always record (the
// playground levels, whose boards read the trace) ignore it.
import type { AgentHistory, DomainIR, PlanningMetrics, PlanTraceRecorder, ReplanEvent, Vec3, WorldState } from '../htn-planner'
import type { SenseView } from './senses'

/**
 * Where a host is on the debugger's map, in its area's local metres (x right, z away from the visitor): its position,
 * which way it looks (radians, 0 = +z), where its running step goes and the positions of the rest of its plan.
 */
export interface MapPose {
  position: Vec3
  yaw: number
  target?: Vec3
  route?: readonly Vec3[]
}

/** A prop on the map: a footprint (full width along x, depth along z), its colour; solid ones block. */
export interface MapProp {
  id: string
  x: number
  z: number
  w: number
  d: number
  /** #rrggbb */
  color: string
  solid?: boolean
  /** A sphere or a cylinder: drawn round. */
  round?: boolean
  label?: string
}

/** Someone on the map who is not a host: the level's tester bot, the player. */
export interface MapActor {
  id: string
  label: string
  kind: 'tester' | 'player'
  position: Vec3
}

/** The ground a source's hosts stand on, for the map: a rectangle around 0 in local metres, its props and actors. */
export interface MapArea {
  label: string
  half: { x: number; z: number }
  props?(): readonly MapProp[]
  actors?(): readonly MapActor[]
  /** A local point in scene coordinates (the in-world overlay draws a step's target there); default: the same. */
  toScene?(p: Vec3): Vec3
}

/** What a host is doing now, for the agent list and the header (upstream HTNDemo's NPC panel). */
export interface HostStatus {
  /** One word: an agent's mode ('patrol', 'chase'), a station's 'step' / 'walk' / 'idle' / 'no plan'. */
  state: string
  /** Status of its last planning, '' before the first. */
  lastStatus: string
  /** Why it planned last. */
  reason: string
  /** That replan as an event (a GuardAgent's lastReplan): its trigger and the facts that changed; hosts without one leave it out. */
  replan?: ReplanEvent | null
  /** The running step, formatted, or ''. */
  current: string
  /** The rest of its plan, formatted; the first is `current` while that runs. */
  steps: readonly string[]
  /** The last steps it finished, oldest first. */
  done: readonly string[]
}

export interface DebugHost {
  /** Stable across rebuilds (a level's Reset, a station's next scenario). */
  readonly id: string
  readonly label: string
  /** The playground it belongs to, for grouping. */
  readonly group: string
  readonly domain: DomainIR
  /** null: not recording (yet). */
  readonly recorder: PlanTraceRecorder | null
  readonly world: WorldState
  readonly history?: AgentHistory
  readonly metrics?: PlanningMetrics
  /** Its body in the scene, for picking it with the pointer. */
  readonly entity?: number
  /** Where it stands, in scene coordinates. */
  position?(): Vec3 | undefined
  /** Where it is on its source's map area (local coordinates); hosts without one are not on the map. */
  pose?(): MapPose | undefined
  /** Plan again now (the F key on its body); `reason` shows as why it planned. */
  replan?(reason: string): void
  /** Metres above its feet for the in-world overlay's label (default 2.6): above the host's own labels. */
  readonly overlayHeight?: number
  /** What it senses, for the overlay's gizmos (its sight cone, presence, the last noise), in its map area's
   *  coordinates; hosts without perception (or off-stage now) leave it out or return undefined. */
  senses?(): SenseView | undefined
  status(): HostStatus
}

export type HostSource = () => readonly DebugHost[]

/** A source's map area with its hosts now. */
export interface AreaHosts {
  area: MapArea
  hosts: DebugHost[]
}

export class DebugRegistry {
  private readonly sources = new Map<number, HostSource>()
  private readonly areaOf = new Map<number, MapArea>()
  private nextId = 0
  private changes = 0
  /** Hosts that can attach a recorder on demand read this before they plan. */
  tracing = false
  /** What a click on a host's body does (the debugger UI sets it). */
  onPick: ((id: string) => void) | null = null

  /** A host's body was clicked in the scene. */
  pick(id: string): void {
    this.onPick?.(id)
  }

  /** Add a source of hosts, with the ground they stand on for the map; returns its removal. */
  add(source: HostSource, area?: MapArea): () => void {
    const id = this.nextId++
    this.sources.set(id, source)
    if (area) this.areaOf.set(id, area)
    this.changes++
    return () => {
      this.areaOf.delete(id)
      if (this.sources.delete(id)) this.changes++
    }
  }

  /** Every source with a map area, with its hosts now. */
  areas(): AreaHosts[] {
    const out: AreaHosts[] = []
    for (const [id, area] of this.areaOf) out.push({ area, hosts: [...(this.sources.get(id)?.() ?? [])] })
    return out
  }

  /** Bumps when a source is added or removed. */
  get version(): number {
    return this.changes
  }

  /** Every host now, in the order the sources were added. */
  hosts(): DebugHost[] {
    const out: DebugHost[] = []
    for (const source of this.sources.values()) for (const h of source()) out.push(h)
    return out
  }

  find(id: string | null): DebugHost | undefined {
    if (id === null) return undefined
    for (const source of this.sources.values()) for (const h of source()) if (h.id === id) return h
    return undefined
  }

  /** The host whose body is `entity`. */
  byEntity(entity: number): DebugHost | undefined {
    for (const source of this.sources.values()) for (const h of source()) if (h.entity === entity) return h
    return undefined
  }
}

/** The scene's registry. */
export const debugRegistry = new DebugRegistry()

/** The host standing nearest to `p` (on the ground plane) within `radius` m, or undefined. */
export function nearestHost(hosts: readonly DebugHost[], p: Vec3, radius = Infinity): DebugHost | undefined {
  let best: DebugHost | undefined
  let bestD = radius * radius
  for (const h of hosts) {
    const q = h.position?.()
    if (!q) continue
    const d = (q.x - p.x) * (q.x - p.x) + (q.z - p.z) * (q.z - p.z)
    if (d <= bestD) {
      bestD = d
      best = h
    }
  }
  return best
}
