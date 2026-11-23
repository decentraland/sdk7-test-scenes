export type Point = readonly [number, number, number]

export type Surface = {
  vertices: readonly Point[]
  triangles: readonly number[]
}

export type Slab = {
  kind: 'floor' | 'ramp' | 'bridge' | 'island'
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  nearY: number
  farY: number
  behindGate?: boolean
}

export const SLABS: readonly Slab[] = [
  { kind: 'floor', minX: 2, maxX: 14, minZ: 2, maxZ: 14, nearY: 0, farY: 0 },
  { kind: 'ramp', minX: 2, maxX: 5, minZ: 3, maxZ: 9, nearY: 0, farY: 3 },
  { kind: 'ramp', minX: 11, maxX: 14, minZ: 3, maxZ: 7, nearY: 0, farY: 2 },
  { kind: 'ramp', minX: 11, maxX: 14, minZ: 7, maxZ: 8, nearY: 2, farY: 2.5, behindGate: true },
  { kind: 'ramp', minX: 11, maxX: 14, minZ: 8, maxZ: 9, nearY: 2.5, farY: 3 },
  { kind: 'bridge', minX: 2, maxX: 14, minZ: 9, maxZ: 13, nearY: 3, farY: 3 },
  { kind: 'island', minX: 6, maxX: 9, minZ: 2, maxZ: 4, nearY: 3, farY: 3 }
]

export const GATE = { x: 12.5, y: 3.05, z: 7.5 } as const

export function getSurfaces(doorOpen: boolean): Surface[] {
  return SLABS.filter((slab) => doorOpen || !slab.behindGate).map((slab) => ({
    vertices: [
      [slab.minX, slab.nearY, slab.minZ],
      [slab.minX, slab.farY, slab.maxZ],
      [slab.maxX, slab.farY, slab.maxZ],
      [slab.maxX, slab.nearY, slab.minZ]
    ],
    triangles: [0, 1, 2, 0, 2, 3]
  }))
}

export type Scenario = {
  id: string
  start: Point
  goal: Point
  doorOpen: boolean
  expected: 'complete' | 'unreachable'
  via?: 'east' | 'west'
}

export const SCENARIOS: readonly Scenario[] = [
  { id: 'gate-open', start: [12.4, 0, 2.6], goal: [8, 3, 11.5], doorOpen: true, expected: 'complete', via: 'east' },
  { id: 'gate-closed', start: [12.4, 0, 2.6], goal: [8, 3, 11.5], doorOpen: false, expected: 'complete', via: 'west' },
  { id: 'underpass', start: [8, 0, 7], goal: [8, 0, 11.5], doorOpen: true, expected: 'complete' },
  { id: 'isolated-upper-platform', start: [8, 0, 7], goal: [7.5, 3, 3], doorOpen: true, expected: 'unreachable' }
]
