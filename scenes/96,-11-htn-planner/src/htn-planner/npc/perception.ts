// Guard perception: range + horizontal field-of-view cone (+ a small all-around "feel" radius),
// a pluggable line-of-sight test, and a simple suspicion meter so detection is not instant at range.
// Two options for the host's world: a target's own `visibility` scales the sight range (its light, camouflage: lit
// far, shielded nearer, dark only close), and `presenceRadius` senses a target all around and through walls whatever
// its light (smell, a presence: right on its heels is never safe). Both off by default.
// Pure: no SDK imports. The scene plugs in a raycast line of sight (raycast-los.ts);
// tests plug in GeometricLineOfSight.
import { angleDiff, DEG, distance, distanceXZ, Vec3, yawTo } from './vec'

export interface PerceptionConfig {
  range: number // m, max sight distance (3D, eye to target aim point)
  fovDeg: number // full horizontal cone angle
  nearRadius: number // m, sensed all around (still needs line of sight)
  eyeHeight: number // m above the guard's feet
  targetHeight: number // m above the target's root (player root is at the feet)
  detectTime: number // s of continuous sight to detect at max range; 0 = instant
  nearDetectTime: number // s of continuous sight to detect at point blank
  decayPerSecond: number // suspicion lost per second while unseen
  loseGrace: number // s a detected target may stay unseen before it counts as lost
  /** m, sensed all around without line of sight and whatever the target's visibility (smell, presence); 0 = off. */
  presenceRadius: number
}

export const DEFAULT_PERCEPTION: PerceptionConfig = {
  range: 12,
  fovDeg: 110,
  nearRadius: 1.5,
  eyeHeight: 1.6,
  targetHeight: 1.2,
  detectTime: 1.2,
  nearDetectTime: 0.2,
  decayPerSecond: 0.35,
  loseGrace: 0.4,
  presenceRadius: 0
}

/**
 * Line of sight between an eye and a target point. May answer from a cached asynchronous result
 * (SDK raycasts resolve a frame or more later), so callers must tolerate a short lag.
 */
export interface LineOfSight {
  check(observerId: string, eye: Vec3, target: Vec3, now: number): boolean
  /** Drop any per-observer resources (raycast entities). */
  release?(observerId: string): void
}

export const CLEAR_LINE_OF_SIGHT: LineOfSight = { check: () => true }

/** Axis-aligned box occluder. */
export interface Box {
  min: Vec3
  max: Vec3
}

/** Synchronous geometric line of sight against axis-aligned boxes (tests, headless scenarios). */
export class GeometricLineOfSight implements LineOfSight {
  constructor(public occluders: Box[] = []) {}

  check(_observerId: string, eye: Vec3, target: Vec3): boolean {
    for (const box of this.occluders) if (segmentHitsBox(eye, target, box)) return false
    return true
  }
}

/** Slab test: does the segment a→b intersect the box? */
export function segmentHitsBox(a: Vec3, b: Vec3, box: Box): boolean {
  let t0 = 0
  let t1 = 1
  const axes: ('x' | 'y' | 'z')[] = ['x', 'y', 'z']
  for (const ax of axes) {
    const d = b[ax] - a[ax]
    if (Math.abs(d) < 1e-9) {
      if (a[ax] < box.min[ax] || a[ax] > box.max[ax]) return false
      continue
    }
    let near = (box.min[ax] - a[ax]) / d
    let far = (box.max[ax] - a[ax]) / d
    if (near > far) {
      const t = near
      near = far
      far = t
    }
    t0 = Math.max(t0, near)
    t1 = Math.min(t1, far)
    if (t0 > t1) return false
  }
  return true
}

export const eyeOf = (feet: Vec3, cfg: PerceptionConfig): Vec3 => ({ x: feet.x, y: feet.y + cfg.eyeHeight, z: feet.z })
export const aimOf = (root: Vec3, cfg: PerceptionConfig): Vec3 => ({ x: root.x, y: root.y + cfg.targetHeight, z: root.z })

/** Range + cone test only (no occlusion). `yaw` is the observer's facing; `range` defaults to cfg.range (pass
 *  sightRange(cfg, target) for a target's own visibility, or a longer one for an outer ring). */
export function inViewCone(observerFeet: Vec3, yaw: number, targetRoot: Vec3, cfg: PerceptionConfig, range = cfg.range): boolean {
  const d = distance(eyeOf(observerFeet, cfg), aimOf(targetRoot, cfg))
  if (d > range) return false
  if (distanceXZ(observerFeet, targetRoot) <= cfg.nearRadius) return true
  return Math.abs(angleDiff(yaw, yawTo(observerFeet, targetRoot))) <= (cfg.fovDeg * DEG) / 2
}

export interface TargetSample {
  id: string // becomes the HTN symbol, e.g. 'player'
  position: Vec3 // root (feet)
  /**
   * How visible it is now, a factor on the sight range (default 1): its light (lit 1, a shielded light less, dark
   * less still), camouflage, fog. 0: never seen (still sensed within presenceRadius). NaN counts as 1, below 0 as 0.
   */
  visibility?: number
}

/** The sight range for this target now: cfg.range times its visibility (TargetSample.visibility). */
export function sightRange(cfg: PerceptionConfig, target: TargetSample): number {
  const v = target.visibility
  if (v === undefined || Number.isNaN(v)) return cfg.range
  return cfg.range * Math.max(0, v)
}

/** How a target was sensed on the last update: in sight, or within the presence radius (no sight needed). */
export type SenseKind = 'sight' | 'presence'

/** What perception holds on one target now (Perception.senses), for debug views. */
export interface TargetSense {
  id: string
  /** m: its sight range on the last update (sightRange: the range times its visibility). */
  range: number
  /** Sensed on the last update, and how (sight first); null: not sensed. */
  by: SenseKind | null
  suspicion: number
  detected: boolean
}

export interface SeenTarget {
  id: string
  position: Vec3 // where it is now (while detected)
  distance: number
}

export interface LostTarget {
  id: string
  position: Vec3 // where it was last actually seen
  time: number
}

export interface PerceptionResult {
  visible: SeenTarget[] // detected targets, closest first
  lost: LostTarget[] // detected targets that became lost this update
  suspicion: number // max over targets, 0..1
}

interface Track {
  suspicion: number
  detected: boolean
  unseenFor: number
  lastSeen: Vec3 | null
  lastSeenAt: number
  range: number
  by: SenseKind | null
}

/** Per-guard perception memory: suspicion and detection per target. */
export class Perception {
  private readonly tracks = new Map<string, Track>()

  constructor(public cfg: PerceptionConfig = DEFAULT_PERCEPTION) {}

  update(
    dt: number,
    now: number,
    observerId: string,
    self: { position: Vec3; yaw: number },
    targets: readonly TargetSample[],
    los: LineOfSight
  ): PerceptionResult {
    const cfg = this.cfg
    const visible: SeenTarget[] = []
    const lost: LostTarget[] = []
    let suspicion = 0
    const present = new Set<string>()
    for (const target of targets) {
      present.add(target.id)
      let track = this.tracks.get(target.id)
      if (!track) {
        track = { suspicion: 0, detected: false, unseenFor: 0, lastSeen: null, lastSeenAt: 0, range: cfg.range, by: null }
        this.tracks.set(target.id, track)
      }
      const range = sightRange(cfg, target)
      const inSight =
        range > 0 &&
        inViewCone(self.position, self.yaw, target.position, cfg, range) &&
        los.check(observerId, eyeOf(self.position, cfg), aimOf(target.position, cfg), now)
      const smelled = !inSight && cfg.presenceRadius > 0 && distanceXZ(self.position, target.position) <= cfg.presenceRadius
      const sees = inSight || smelled
      track.range = range
      track.by = inSight ? 'sight' : smelled ? 'presence' : null
      const dist = distance(self.position, target.position)
      if (sees) {
        track.unseenFor = 0
        track.lastSeen = { x: target.position.x, y: target.position.y, z: target.position.z }
        track.lastSeenAt = now
        if (!track.detected) {
          // Detection is quicker up close, measured against the sight range (presence alone: against its radius).
          const reach = inSight ? range : cfg.presenceRadius
          const t = reach > 0 ? Math.min(1, dist / reach) : 1
          const needed = cfg.nearDetectTime + (cfg.detectTime - cfg.nearDetectTime) * t
          track.suspicion = needed <= 0 ? 1 : Math.min(1, track.suspicion + dt / needed)
          if (track.suspicion >= 1) track.detected = true
        } else track.suspicion = 1
      } else {
        track.unseenFor += dt
        track.suspicion = Math.max(0, track.suspicion - dt * cfg.decayPerSecond)
        if (track.detected && track.unseenFor > cfg.loseGrace) {
          track.detected = false
          if (track.lastSeen) lost.push({ id: target.id, position: track.lastSeen, time: track.lastSeenAt })
        }
      }
      if (track.detected) visible.push({ id: target.id, position: target.position, distance: dist })
      suspicion = Math.max(suspicion, track.suspicion)
    }
    // A target that vanished (left the scene) while detected counts as lost where it was last seen.
    this.tracks.forEach((track, id) => {
      if (present.has(id)) return
      if (track.detected && track.lastSeen) lost.push({ id, position: track.lastSeen, time: track.lastSeenAt })
      this.tracks.delete(id)
    })
    visible.sort((a, b) => a.distance - b.distance)
    return { visible, lost, suspicion }
  }

  /** Every tracked target: its sight range now, how it was sensed, suspicion, detection (debug views). */
  senses(): TargetSense[] {
    const out: TargetSense[] = []
    this.tracks.forEach((t, id) => out.push({ id, range: t.range, by: t.by, suspicion: t.suspicion, detected: t.detected }))
    return out
  }

  /** Suspicion for one target (0..1), for debugging. */
  suspicionOf(id: string): number {
    return this.tracks.get(id)?.suspicion ?? 0
  }

  reset(): void {
    this.tracks.clear()
  }
}
