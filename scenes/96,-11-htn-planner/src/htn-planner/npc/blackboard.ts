// Guard memory mirrored into the HTN WorldState. Every mutation writes its facts immediately, so a
// replan or deferred decomposition in the same tick sees what an executor just did.
// Fact schema (must match src/examples/guard/guard.domain):
//   (now ?time)                          guard clock, float seconds
//   (self_position ?position)            (x y z) floats, feet
//   (target_visible ?target ?position)   one row per detected target, closest first
//   (last_seen ?target ?position ?time)  lost target memory, until forgotten
//   (waypoint ?index ?position)          patrol route, int index
//   (waypoint_count ?count)
//   (current_waypoint ?index)            next waypoint to walk to
//   (heard_noise ?kind ?position ?time ?loudness)  the noise of interest, until forgotten: kind symbol
//                                        (steps, run, land, impact, bell, voice, test...), where, guard time
//                                        it was heard, perceived level 0..1 at the guard. One row: a newer
//                                        heard noise replaces it (latest knowledge of where the sound is)
//   (alert ?level)                       calm | wary | alarmed (hearing alert meter, hearing.ts)
import { float, int, sym, vec3, type Atom } from '../htn/atom'
import { WorldState } from '../htn/world-state'
import type { AlertLevel } from './hearing'
import type { LostTarget, SeenTarget } from './perception'
import { copy, Vec3 } from './vec'

export interface Memory {
  position: Vec3
  time: number
}

export interface NoiseMemory {
  kind: string
  position: Vec3
  time: number // guard clock when heard
  loudness: number // perceived level 0..1
}

export class GuardBlackboard {
  readonly world = new WorldState()
  private visible: SeenTarget[] = []
  private readonly lastSeen = new Map<string, Memory>()
  private route: Vec3[] = []
  private waypointIndex = 0
  private noise: NoiseMemory | null = null
  private alert: AlertLevel = 'calm'

  /** Equal values are no-ops; inspect current facts so external clears/writes are repaired. */
  setTime(now: number): void {
    const rows = this.world.rows('now', 1)
    if (rows.length === 1 && scalarEquals(rows[0][0], now)) return
    this.world.set('now', float(now))
  }

  setSelfPosition(p: Vec3): void {
    const rows = this.world.rows('self_position', 1)
    if (rows.length === 1 && positionEquals(rows[0][0], p)) return
    this.world.set('self_position', vec3(p.x, p.y, p.z))
  }

  setVisible(targets: readonly SeenTarget[]): void {
    // Preserve detached public snapshots. A distance-only change needs a new snapshot, not new planner facts.
    if (!sameVisibleSnapshot(targets, this.visible)) {
      this.visible = targets.map(t => ({ id: t.id, position: copy(t.position), distance: t.distance }))
    }
    if (!sameVisibleFacts(this.world.rows('target_visible', 2), targets)) {
      this.world.clear('target_visible', 2)
      for (const t of this.visible) this.world.add('target_visible', sym(t.id), vec3(t.position.x, t.position.y, t.position.z))
    }
    // Seeing a target again supersedes the memory of where it was lost.
    for (const t of this.visible) if (this.lastSeen.has(t.id)) this.forget(t.id)
  }

  remember(lost: LostTarget): void {
    this.lastSeen.set(lost.id, { position: copy(lost.position), time: lost.time })
    this.writeLastSeen()
  }

  forget(id: string): void {
    if (this.lastSeen.delete(id)) this.writeLastSeen()
  }

  /** Remember a heard noise; it replaces any earlier one. */
  hear(noise: NoiseMemory): void {
    this.noise = { kind: noise.kind, position: copy(noise.position), time: noise.time, loudness: noise.loudness }
    this.world.set('heard_noise', sym(noise.kind), vec3(noise.position.x, noise.position.y, noise.position.z), float(noise.time), float(noise.loudness))
  }

  /**
   * Forget the heard noise. With `heardAt`, only if it is still the noise heard then (a newer noise
   * heard meanwhile survives, so the guard goes on to it). Returns true if something was forgotten.
   */
  forgetNoise(heardAt?: number): boolean {
    if (this.noise === null) return false
    // Domain timestamps are float32 atoms; compare in that representation, not with a fixed epsilon.
    // Distinct noises within one float32 time bucket still share the existing timestamp identity.
    if (heardAt !== undefined && Math.fround(this.noise.time) !== Math.fround(heardAt)) return false
    this.noise = null
    this.world.clear('heard_noise', 4)
    return true
  }

  setAlert(level: AlertLevel): void {
    if (level === this.alert && this.world.rows('alert', 1).length > 0) return
    this.alert = level
    this.world.set('alert', sym(level))
  }

  get heardNoise(): NoiseMemory | null {
    return this.noise
  }

  get alertLevel(): AlertLevel {
    return this.alert
  }

  /** Nonnegative integer starts wrap around a nonempty route; an empty route starts at sentinel 0. */
  setRoute(points: readonly Vec3[], startIndex = 0): void {
    if (!Number.isSafeInteger(startIndex) || startIndex < 0) throw new RangeError('route start must be a nonnegative safe integer')
    this.route = points.map(copy)
    this.world.clear('waypoint', 2)
    this.route.forEach((p, i) => this.world.add('waypoint', int(i), vec3(p.x, p.y, p.z)))
    this.world.set('waypoint_count', int(this.route.length))
    this.setWaypoint(this.route.length === 0 ? 0 : startIndex % this.route.length)
  }

  /** 0..count are valid; count means route completed (also 0 for an empty route). Invalid input changes nothing. */
  setWaypoint(index: number): boolean {
    if (!Number.isInteger(index) || index < 0 || index > this.route.length) return false
    this.waypointIndex = index
    this.world.set('current_waypoint', int(index))
    return true
  }

  get currentWaypoint(): number {
    return this.waypointIndex
  }

  get waypoints(): readonly Vec3[] {
    return this.route
  }

  get visibleTargets(): readonly SeenTarget[] {
    return this.visible
  }

  visibleTarget(id: string): SeenTarget | undefined {
    for (const t of this.visible) if (t.id === id) return t
    return undefined
  }

  memoryOf(id: string): Memory | undefined {
    return this.lastSeen.get(id)
  }

  get memories(): ReadonlyMap<string, Memory> {
    return this.lastSeen
  }

  private writeLastSeen(): void {
    this.world.clear('last_seen', 3)
    this.lastSeen.forEach((m, id) =>
      this.world.add('last_seen', sym(id), vec3(m.position.x, m.position.y, m.position.z), float(m.time))
    )
  }
}

/** Match the planner's float32 representation without allocating temporary atoms. */
function scalarEquals(atom: Atom, value: number): boolean {
  return atom.t === 'float' && Object.is(atom.v, Math.fround(value))
}

function positionEquals(atom: Atom, position: Vec3): boolean {
  return atom.t === 'list' && atom.v.length === 3 && scalarEquals(atom.v[0], position.x) &&
    scalarEquals(atom.v[1], position.y) && scalarEquals(atom.v[2], position.z)
}

/** Public snapshots retain host precision and distance, unlike planner facts below. */
function sameVisibleSnapshot(a: readonly SeenTarget[], b: readonly SeenTarget[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id || !Object.is(a[i].distance, b[i].distance) ||
        !Object.is(a[i].position.x, b[i].position.x) || !Object.is(a[i].position.y, b[i].position.y) ||
        !Object.is(a[i].position.z, b[i].position.z)) return false
  }
  return true
}

/** Planner facts contain IDs and float32 positions; distance is not a fact. */
function sameVisibleFacts(rows: readonly (readonly Atom[])[], targets: readonly SeenTarget[]): boolean {
  if (rows.length !== targets.length) return false
  for (let i = 0; i < targets.length; i++) {
    const id = rows[i][0]
    if (id.t !== 'sym' || id.v !== targets[i].id || !positionEquals(rows[i][1], targets[i].position)) return false
  }
  return true
}
