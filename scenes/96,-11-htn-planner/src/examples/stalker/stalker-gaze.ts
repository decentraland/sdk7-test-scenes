// Presentation/perception actuator, not a behavior planner. The HTN primitive owns
// deliberate looking; locomotion can add this idle scan while following its route.
import { DEG } from '../../htn-planner/npc/vec'

// The head may turn a full 90° to either side (a look along the path, not a short glance).
export const GAZE_LIMIT = 90
export const GAZE_CLIPS = ['GazeLeft', 'GazeCenter', 'GazeRight'] as const
const SCAN = [[0, 0], [.8, 0], [2.1, -40], [3, -40], [4.1, 0], [5.8, 0], [7.3, 42], [8.1, 42], [9.4, 0], [11.7, 0]] as const
const clamp = (x: number) => Math.max(-GAZE_LIMIT, Math.min(GAZE_LIMIT, Number.isFinite(x) ? x : 0))
const smooth = (t: number) => t * t * (3 - 2 * t)

function curve(keys: readonly (readonly [number, number])[], t: number): number {
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1], b = keys[i]
    if (t <= b[0]) return a[1] + (b[1] - a[1]) * smooth(Math.max(0, (t - a[0]) / (b[0] - a[0])))
  }
  return keys[keys.length - 1][1]
}
export const patrolScanYaw = (seconds: number) => curve(SCAN, Math.max(0, seconds) % 11.7)
export const lookAroundYaw = (progress: number) => curve([[0, 0], [.25, -45], [.4, -45], [.7, 45], [.82, 45], [1, 0]], progress)

/** Inverse normalized-quaternion blend: not a linear degrees -> weight mapping.
 * Both active pose weights sum to one. +/-GAZE_LIMIT endpoints are baked in v19.
 */
export function gazeWeights(degrees: number): readonly [number, number, number] {
  const d = clamp(degrees), a = Math.abs(d) * DEG / 2, end = GAZE_LIMIT * DEG / 2
  const t = Math.tan(a) / (Math.sin(end) + Math.tan(a) * (1 - Math.cos(end)))
  return d < 0 ? [t, 1 - t, 0] : [0, 1 - t, t]
}

export class StalkerGaze {
  degrees = 0
  private time = 0
  reset() { this.degrees = 0; this.time = 0 }
  update(dt: number, scanning: boolean, target: number | null = null) {
    if (!Number.isFinite(dt) || dt <= 0) return
    dt = Math.min(dt, .1)
    if (scanning && target === null) this.time += dt
    const wanted = target === null ? (scanning ? patrolScanYaw(this.time) : 0) : clamp(target)
    const step = 100 * dt // bounded actuator speed for explicit commands and returning to neutral
    this.degrees += Math.max(-step, Math.min(step, wanted - this.degrees))
  }
}
