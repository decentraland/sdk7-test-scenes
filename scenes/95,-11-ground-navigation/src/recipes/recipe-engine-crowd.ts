import type { Point } from '../arena'
import { centroid } from './recipe-engine-query'
import { FLOOR_Y, PUBLIC, STAFF, WALK, type EngineDefinition } from './recipe-engine-types'
import { marker, slab } from './recipe-runtime-support'

const stepSize = 1 / 30
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

function crowdOverride(makeMesh: Parameters<EngineDefinition['run']>[0], variant: string) {
  const floor = slab('hall with side pocket', 1, 10, 1, 6, FLOOR_Y)
  const from: Point = [2, FLOOR_Y, 2]
  const goalA: Point = [9, FLOOR_Y, 2]
  const goalB: Point = [6, FLOOR_Y, 4.5]
  const mesh = makeMesh({ surfaces: [floor.surface] })
  try {
    const group = mesh.crowd(1)
    try {
      const agent = group.add(from)
      const trace = [[group.position(agent)]]
      function advance(steps: number) {
        for (let i = 0; i < steps; i++) {
          group.step(stepSize)
          trace.push([group.position(agent)])
        }
      }
      let accepted = group.goal(agent, goalA)
      advance(20)
      const preOverride = group.position(agent)
      const goalMovedFirst = preOverride[0] > from[0] + 0.5 && Math.abs(preOverride[2] - from[2]) < 0.12
      if (variant !== 'no-override') accepted = group.velocity(agent, [0, 0, 2]) && accepted
      advance(35)
      const pocket = group.position(agent)
      const stop = variant !== 'no-reset'
      if (stop) group.reset(agent)
      // An explicit standstill remains in force while the agent has no destination.
      // In navcat 0.4.1 resetMoveTarget can leave steering corners for the old goal.
      if (variant === 'normal') {
        accepted = group.velocity(agent, [0, 0, 0]) && accepted
      }
      advance(24)
      const afterReset = group.position(agent)
      const stopDrift = distance(afterReset, trace[trace.length - 9][0])
      const entersPocket = pocket[2] > 3.6
      // A separate wall push tests mesh constraint after the observable stop window.
      if (variant === 'normal') {
        accepted = group.velocity(agent, [0, 0, 2]) && accepted
        advance(75)
        group.reset(agent)
      }
      if (stop) {
        accepted = group.goal(agent, goalB) && accepted
        advance(170)
      }
      const last = group.position(agent)
      const maxZ = Math.max(...trace.map(([point]) => point[2]))
      const bounded = trace.every(([point]) => point[2] < 5.96 && point[2] > 1.03)
      const neverArrivedA = trace.every(([point]) => distance(point, goalA) > 0.3)
      return {
        shapes: [floor.shape, marker('goal A', goalA, 'guide'), marker('goal B', goalB)],
        crowdTrace: trace,
        passed: accepted && goalMovedFirst && neverArrivedA && bounded &&
          (variant === 'raw-reset' ? entersPocket && distance(last, goalB) < 0.35
            : variant === 'no-override' ? !entersPocket && distance(last, goalB) < 0.35
            : variant === 'no-reset' ? entersPocket && stopDrift > 0.15 && distance(last, goalB) > 0.5
              : entersPocket && stopDrift < 0.06 && maxZ > 5.5 && distance(last, goalB) < 0.35),
        detail: (variant === 'raw-reset' ? 'Measure residual motion when clearing the target without an explicit hold. '
          : 'The same crowd processes the authored requests without writing an agent position. ') +
          JSON.stringify({ accepted, goalMovedFirst, pocket, afterReset, stopDrift, maxZ, last, neverArrivedA }),
        metrics: { crowdSteps: trace.length - 1, stopDriftMetres: stopDrift, farthestZ: maxZ,
          enteredPocket: Number(entersPocket), arrivedAtB: Number(distance(last, goalB) < 0.35) }
      }
    } finally { group.dispose() }
  } finally { mesh.dispose() }
}

function crowdPolicies(makeMesh: Parameters<EngineDefinition['run']>[0], variant: string) {
  const floors = [
    slab('start room', 1, 4, 1.2, 8.8, FLOOR_Y),
    slab('staff lane', 4, 8, 1.2, 3.9, FLOOR_Y),
    slab('public lane', 4, 8, 6.1, 8.8, FLOOR_Y),
    slab('goal room', 8, 11, 1.2, 8.8, FLOOR_Y)
  ]
  const starts: Point[] = [[2, FLOOR_Y, 4.1], [2, FLOOR_Y, 5.9]]
  const goal: Point = [10, FLOOR_Y, 5]
  const mesh = makeMesh({ surfaces: floors.map(({ surface }) => surface), tiled: true })
  try {
    for (const poly of mesh.polygons()) {
      const [x, , z] = centroid(poly)
      if (x >= 5 && x <= 7) mesh.setFlags(poly.ref, z < 5 ? STAFF : PUBLIC)
    }
    const group = mesh.crowd(2)
    try {
      const common = variant === 'shared'
      const policies = [{ flags: WALK | STAFF }, { flags: WALK | (common ? STAFF : PUBLIC) }]
      const agents = starts.map((point, i) => group.add(point, policies[i]))
      const trace = [agents.map((id) => group.position(id))]
      const oneLeg = (targets: readonly Point[]) => {
        const acknowledged = agents.map((id, i) => group.goal(id, targets[i])).every(Boolean)
        const crossings: number[][] = agents.map(() => [])
        for (let tick = 0; tick < 270; tick++) {
          group.step(stepSize)
          const positions = agents.map((id) => group.position(id))
          trace.push(positions)
          positions.forEach((point, i) => {
            if (point[0] > 5.75 && point[0] < 6.25) crossings[i].push(point[2])
          })
        }
        return { acknowledged, lanes: crossings.map((points) => points.length && points.every((z) => z < 4.0) ? -1
          : points.length && points.every((z) => z > 6.0) ? 1 : 0),
          arrived: agents.filter((id, i) => distance(group.position(id), targets[i]) < 0.55).length }
      }
      const first = oneLeg([goal, goal])
      const expected = common ? [-1, -1] : [-1, 1]
      let returnLanes: number[] = []
      let secondArrived = 0
      if (!common) {
        agents.forEach((id, i) => group.setPolicy(id, policies[1 - i]))
        const second = oneLeg(starts)
        returnLanes = second.lanes
        secondArrived = second.arrived
        if (!second.acknowledged) throw new Error('Swapping crowd policy rejected the new request')
      }
      return {
        shapes: [...floors.map(({ shape }) => shape), marker('shared goal', goal)],
        crowdTrace: trace,
        passed: first.acknowledged && first.lanes.join(',') === expected.join(',') &&
          (common || first.arrived === 2 && returnLanes.join(',') === '1,-1' && secondArrived === 2),
        detail: common ? 'The shared-filter control sends both agents through Staff.' + ' ' + JSON.stringify(first)
          : 'Two agents in one crowd take distinct lanes. Swapping the filters swaps lanes on the way back. ' +
            JSON.stringify({ first, returnLanes, secondArrived }),
        metrics: { crowdSteps: trace.length - 1, arrivedAtSharedGoal: first.arrived, arrivedBack: secondArrived,
          initialStaffLane: first.lanes.filter((lane) => lane < 0).length, initialPublicLane: first.lanes.filter((lane) => lane > 0).length }
      }
    } finally { group.dispose() }
  } finally { mesh.dispose() }
}

export const engineCrowdDefinitions: EngineDefinition[] = [
  { caseId: 'RECIPE-CROWD-OVERRIDE', label: 'Crowd velocity override', run: crowdOverride,
    variants: [{ id: 'normal', label: 'Override, hold still and retarget' }, { id: 'no-override', label: 'No velocity override' },
      { id: 'no-reset', label: 'Never reset velocity' }, { id: 'raw-reset', label: 'Reset without explicit hold' }] },
  { caseId: 'RECIPE-CROWD-POLICY', label: 'Crowd access policies', run: crowdPolicies,
    variants: [{ id: 'individual', label: 'Two access policies' }, { id: 'shared', label: 'Shared filter sends both to Staff' }] }
]
