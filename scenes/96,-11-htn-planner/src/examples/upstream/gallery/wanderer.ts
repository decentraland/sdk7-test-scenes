// Gallery station: Wanderer, async pathfinding facts + deferred &talk_about_destination. Its host is shared with the
// hot reload station (hot-reload.ts).
import { Atom, int, sym, WorldState } from '../../../htn-planner'
import { wandererDomain } from '../generated/Wanderer.htn'
import { GalleryStation, pos, same, StationHost } from '../stations'

// Upstream's demo constants: DemoWanderer.h (speed), AIHTNDemoWandererAgent.h/.cpp (task durations).
const SPEED = 5.5 // cells per second
const SAY_SECONDS = 0.8
const WAIT_SECONDS = 0.15
const IDLE_SECONDS = 0.4
const OTHER_SECONDS = 0.05
const SEGMENTS = 3
const WAYPOINTS = [pos(15, 0), pos(4, 8), pos(12, 12), pos(0, 0), pos(7, 3)]

const cell = (a: Atom | undefined): [number, number] | undefined =>
  a?.t === 'list' && a.v.length === 2 && a.v[0].t === 'int' && a.v[1].t === 'int' ? [a.v[0].v, a.v[1].v] : undefined

/** A cell the wanderer can use: its contextual animation and how long it takes. */
export interface Interactable {
  at: Atom
  animation: string
  seconds: number
}

/** The grid the wanderer walks on (upstream DemoGridTerrain): its size, blocked cells and interactables. */
export interface WandererTerrain {
  width: number
  height: number
  blocked: Atom[]
  interactables: Interactable[]
}

/** Upstream's interactable kinds and usage times (DemoGridTerrain.cpp), on two of the waypoints. */
export const WANDERER_TERRAIN: WandererTerrain = {
  width: 16,
  height: 13,
  blocked: [pos(8, 6)],
  interactables: [
    { at: pos(15, 0), animation: 'look_at_view', seconds: 2.5 },
    { at: pos(12, 12), animation: 'sit_on_bench', seconds: 4 }
  ]
}

interface PathRequest {
  id: number
  from: Atom
  to: Atom
  status: 'in_progress' | 'succeeded' | 'failed'
  ticks: number
  path: Atom[]
}

/**
 * The game side of Wanderer's movement domain, after upstream's HTNDemo: the wanderer (DemoWanderer), its path
 * query (AIHTNDemoPathfinder) and the terrain (AIHTNDemoGridTerrainDaemon), publishing the facts the domain reads.
 * - One path request at a time: request_path_from_to writes `pathfind_state in_progress` at once; a request for
 *   another pair replaces it and its facts, the same pair keeps its countdown. It finishes after |dx| + |dz| updates:
 *   `succeeded` with a straight path in up to 3 segments, or `failed` when either end is blocked.
 * - The world picks the next waypoint when the last segment reaches the destination; at an interactable the wanderer
 *   turns `contextual` (no destination) until its animation completes. `!after_destination_comment` changes nothing.
 * - Steps take upstream's times: a segment its distance / 5.5 cells/s, the animation its interactable's usage time.
 * The scenario's facts are the starting state; the interactables are added to them.
 */
export class WandererWorld implements StationHost {
  /** Destinations reached (upstream's journey count). */
  journeys = 0
  private state: 'walking' | 'contextual'
  private location: Atom
  private destination: Atom
  private waypoint: number
  private request: PathRequest | null = null
  private nextId = 1

  constructor(readonly world: WorldState, readonly terrain: WandererTerrain = WANDERER_TERRAIN) {
    const fact = (name: string) => world.rows(name, 1)[0]?.[0]
    this.state = same(fact('wanderer_state') ?? sym('walking'), sym('contextual')) ? 'contextual' : 'walking'
    this.location = fact('wanderer_location') ?? pos(0, 0)
    this.destination = fact('wanderer_destination') ?? this.location
    this.waypoint = WAYPOINTS.findIndex(w => same(w, this.destination))
    for (const i of terrain.interactables) world.add('contextual_animation_at', i.at, sym(i.animation))
  }

  requestPath = (from: Atom, to: Atom): number => {
    const a = cell(from)
    const b = cell(to)
    if (!a || !b || !this.inside(a) || !this.inside(b)) return 0
    if (this.request && same(this.request.from, from) && same(this.request.to, to)) {
      this.publishPath()
      return this.request.id
    }
    const ticks = Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1])
    const request: PathRequest = { id: this.nextId++, from, to, status: 'in_progress', ticks, path: [] }
    if (ticks === 0) this.findPath(request)
    this.request = request
    this.publishPath()
    return request.id
  }

  /** One tick of the path query. */
  update(_dt: number): boolean {
    const r = this.request
    if (!r || r.status !== 'in_progress' || --r.ticks > 0) return false
    this.findPath(r)
    this.publishPath()
    return true
  }

  duration(name: string, args: readonly Atom[]): number {
    switch (name) {
      case '!walk_segment': {
        const from = cell(this.location)
        const to = cell(args[0])
        const d = from && to ? Math.hypot(to[0] - from[0], to[1] - from[1]) : 1
        return Math.max(0.01, d / SPEED)
      }
      case '!play_contextual_animation': {
        const i = args[1] && this.interactableAt(args[1])
        return i ? Math.max(0.01, i.seconds) : OTHER_SECONDS
      }
      case '!wait_for_pathfinding_query':
        return WAIT_SECONDS
      case '!wanderer_idle':
        return IDLE_SECONDS
      case '!say':
        return SAY_SECONDS
      default:
        return OTHER_SECONDS
    }
  }

  complete(name: string, args: readonly Atom[]): void {
    if (name === '!walk_segment' && cell(args[0])) {
      if (this.state !== 'walking') return
      this.location = args[0]
      if (same(this.location, this.destination)) this.arrive()
    } else if (name === '!play_contextual_animation') {
      if (this.state !== 'contextual') return
      this.selectNextDestination()
    } else return
    this.publishWanderer()
  }

  private arrive() {
    this.journeys++
    if (this.interactableAt(this.location)) this.state = 'contextual'
    else this.selectNextDestination()
  }

  private selectNextDestination() {
    this.waypoint = (this.waypoint + 1) % WAYPOINTS.length
    this.destination = WAYPOINTS[this.waypoint]
    this.state = 'walking'
  }

  private interactableAt(at: Atom): Interactable | undefined {
    return this.terrain.interactables.find(i => same(i.at, at))
  }

  private inside([x, z]: [number, number]): boolean {
    return x >= 0 && x < this.terrain.width && z >= 0 && z < this.terrain.height
  }

  private findPath(r: PathRequest) {
    r.path = []
    if (this.terrain.blocked.some(b => same(b, r.from) || same(b, r.to))) {
      r.status = 'failed'
      return
    }
    r.status = 'succeeded'
    const [fx, fz] = cell(r.from)!
    const [tx, tz] = cell(r.to)!
    for (let i = 1; i <= SEGMENTS; i++) {
      const p = i === SEGMENTS ? r.to : pos(Math.round(fx + ((tx - fx) * i) / SEGMENTS), Math.round(fz + ((tz - fz) * i) / SEGMENTS))
      if (!same(p, r.path[r.path.length - 1] ?? r.from)) r.path.push(p)
    }
  }

  /** The path facts, rebuilt from the one request (AIHTNDemoPathfinder::WriteRequestFacts). */
  private publishPath() {
    const w = this.world
    w.clear('pathfind_state', 4)
    w.clear('pathfinder', 4)
    w.clear('pathfinding_segment', 3)
    const r = this.request
    if (!r) return
    w.add('pathfind_state', sym(r.status), r.from, r.to, int(r.id))
    if (r.status !== 'succeeded') return
    w.add('pathfinder', int(r.id), int(r.path.length), r.from, r.to)
    r.path.forEach((p, i) => w.add('pathfinding_segment', int(r.id), int(i), p))
  }

  /** The wanderer's facts (AIHTNDemoWanderer::OnWriteWorldState): no destination while contextual. */
  private publishWanderer() {
    const w = this.world
    w.set('wanderer_state', sym(this.state))
    w.set('wanderer_location', this.location)
    w.clear('wanderer_destination', 1)
    if (this.state === 'walking') w.add('wanderer_destination', this.destination)
  }
}

export const wandererStation: GalleryStation = {
  id: 'wanderer',
  title: 'Wanderer',
  blurb: 'async pathfinding facts + deferred &talk_about_destination',
  domain: wandererDomain,
  host: world => new WandererWorld(world),
  scenarios: [
    {
      name: 'walking (path query pending)',
      method: 'run',
      setup: w => {
        w.add('wanderer_state', sym('walking'))
        w.add('wanderer_location', pos(0, 0))
        w.add('wanderer_destination', pos(15, 0))
      },
      expect: ['&talk_about_destination', '!after_destination_comment']
    },
    {
      name: 'walking (path ready)',
      method: 'run',
      setup: w => {
        w.add('wanderer_state', sym('walking'))
        w.add('wanderer_location', pos(0, 0))
        w.add('wanderer_destination', pos(15, 0))
        w.add('pathfind_state', sym('succeeded'), pos(0, 0), pos(15, 0), int(100))
        w.add('pathfinder', int(100), int(3), pos(0, 0), pos(15, 0))
        ;[pos(5, 0), pos(10, 0), pos(15, 0)].forEach((p, i) => w.add('pathfinding_segment', int(100), int(i), p))
      },
      expect: ['!walk_segment (5 0)', '!walk_segment (10 0)', '!walk_segment (15 0)', '&talk_about_destination', '!after_destination_comment']
    },
    {
      name: 'contextual animation (at an interactable)',
      method: 'run',
      setup: w => {
        w.add('wanderer_state', sym('contextual'))
        w.add('wanderer_location', pos(15, 0))
      },
      expect: ['!play_contextual_animation look_at_view (15 0)']
    },
    {
      name: 'walking to a blocked cell (the path fails, then idle)',
      method: 'run',
      setup: w => {
        w.add('wanderer_state', sym('walking'))
        w.add('wanderer_location', pos(0, 0))
        w.add('wanderer_destination', pos(8, 6))
      },
      expect: ['&talk_about_destination', '!after_destination_comment']
    }
  ]
}
