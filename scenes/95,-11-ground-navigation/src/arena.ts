import type { Point } from './navmesh/types'
export type { Point, Surface } from './navmesh/types'
export { GATE, GATE_SIZE, SCENARIOS, SLABS, getSurfaces } from './navmesh/examples/layout'
export type { Scenario, Slab } from './navmesh/examples/layout'

export const OPPOSING_GROUPS = {
  agents: [4.1, 11.9].flatMap((x) => [10, 10.8, 11.6].map((z) => ({
    start: [x, 3, z] as Point,
    goal: [16 - x, 3, z] as Point
  }))),
  radius: 0.3,
  height: 1.6,
  maxSpeed: 2,
  maxAcceleration: 8,
  stepSeconds: 1 / 30,
  steps: 450,
  arrivalRadius: 0.35
}
