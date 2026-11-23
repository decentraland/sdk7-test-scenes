import type { Point } from '../../src/arena'
import { gap, interpolate, type TimedPoint } from './time-crowd-support'

export const CLUTTER_CELL = 0.25
export const CLUTTER_RADIUS = 0.045
export const CLUTTER_SPEED = 1.5
export const CLUTTER_START = [2, 10] as const
export const CLUTTER_GOAL = [17, 10] as const
const WIDTH = 20
const size = WIDTH * CLUTTER_CELL
const TICK = 1 / 30

export function clutterPoint([x, z]: readonly [number, number]): Point {
  return [(x + 0.5) * CLUTTER_CELL, 0, (z + 0.5) * CLUTTER_CELL]
}

export function clutterMaps() {
  let rng = 8312
  return [0.1, 0.2, 0.3].map((density) => ({
    density,
    maps: Array.from({ length: 20 }, () => {
      const blocks = new Set<number>()
      while (blocks.size < WIDTH ** 2 * density) {
        rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0
        const index = (rng >>> 12) % (WIDTH ** 2)
        const x = index % WIDTH
        const z = Math.floor(index / WIDTH)
        // Preserve the moving obstacle’s lane in both static and dynamic trials.
        if (x === 9 || x === 10 || (z === 10 && (x === 2 || x === 17))) continue
        blocks.add(index)
      }
      return {
        rows: Array.from({ length: WIDTH }, (_, j) =>
          Array.from({ length: WIDTH }, (_, i) => blocks.has(j * WIDTH + i) ? '@' : '.').join('')),
        obstacles: [...blocks].map((index) => ({ x: index % WIDTH, z: Math.floor(index / WIDTH) }))
      }
    })
  }))
}

function intersectsBox(a: Point, b: Point, x0: number, x1: number, z0: number, z1: number) {
  let enter = 0
  let leave = 1
  for (const [axis, low, high] of [[0, x0, x1], [2, z0, z1]]) {
    const delta = b[axis] - a[axis]
    if (delta === 0) {
      if (a[axis] < low || a[axis] > high) return false
      continue
    }
    const first = (low - a[axis]) / delta
    const second = (high - a[axis]) / delta
    enter = Math.max(enter, Math.min(first, second))
    leave = Math.min(leave, Math.max(first, second))
    if (enter > leave) return false
  }
  return true
}

export function clutterOverlap(a: Point, b: Point, blocks: readonly { x: number; z: number }[], radius = CLUTTER_RADIUS) {
  if ([a, b].some(([x, , z]) => x < radius || x > size - radius || z < radius || z > size - radius)) return true
  return blocks.some(({ x, z }) => {
    const x0 = x * CLUTTER_CELL
    const z0 = z * CLUTTER_CELL
    const x1 = x0 + CLUTTER_CELL
    const z1 = z0 + CLUTTER_CELL
    if (!intersectsBox(a, b, x0 - radius, x1 + radius, z0 - radius, z1 + radius)) return false
    if (intersectsBox(a, b, x0, x1, z0, z1)) return true
    const endDistance = ([px, , pz]: Point) =>
      Math.hypot(Math.max(x0 - px, 0, px - x1), Math.max(z0 - pz, 0, pz - z1))
    if (Math.min(endDistance(a), endDistance(b)) < radius - 1e-6) return true
    const dx = b[0] - a[0]
    const dz = b[2] - a[2]
    const length2 = dx ** 2 + dz ** 2
    if (length2 === 0) return false
    return [[x0, z0], [x1, z0], [x0, z1], [x1, z1]].some(([px, pz]) => {
      const t = Math.min(1, Math.max(0, ((px - a[0]) * dx + (pz - a[2]) * dz) / length2))
      return Math.hypot(px - a[0] - dx * t, pz - a[2] - dz * t) < radius - 1e-6
    })
  })
}

export function clutterTrace(points: readonly Point[], departure = 0, tick = TICK): TimedPoint[] {
  if (!points.length) return []
  let time = departure
  const trace: TimedPoint[] = [{ position: points[0], time: 0 }]
  if (departure > 0) trace.push({ position: points[0], time: departure })
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1]
    const to = points[i]
    const duration = gap(from, to) / CLUTTER_SPEED
    if (duration === 0) continue
    // Include route corners as sweep breakpoints even when they fall between ticks.
    if (tick > 0) {
      for (let boundary = tick * (Math.floor(time / tick) + 1); boundary < time + duration; boundary += tick) {
        if (boundary > time + 1e-8) trace.push({ position: interpolate(from, to, (boundary - time) / duration), time: boundary })
      }
    }
    time += duration
    trace.push({ position: to, time })
  }
  return trace
}
