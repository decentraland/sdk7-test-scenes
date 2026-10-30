import { test } from 'node:test'
import assert from 'node:assert/strict'
import { float, int } from '../../src/htn-planner/htn/atom'
import { GuardBlackboard } from '../../src/htn-planner/npc/blackboard'
import { GUARD_ACTIONS, DEFAULT_TUNING, type ActionContext } from '../../src/htn-planner/npc/actions'
import { FLAT_GROUND } from '../../src/htn-planner/npc/movement'
const route = [{ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }]
function board() {
  const b = new GuardBlackboard()
  b.setRoute(route, 1)
  return b
}
function context(blackboard: GuardBlackboard): ActionContext {
  return {
    id: 'g', blackboard, kinematic: { position: route[0], yaw: 0 }, terrain: FLAT_GROUND,
    tuning: DEFAULT_TUNING, targetPosition: () => undefined, emit: () => {}
  }
}
for (const index of [1.5, -1, 4, NaN, Infinity, 2147483648]) {
  test(`waypoint invalid ${index}: setter rejects without mutating host or facts`, () => {
    const b = board(), revision = b.world.revision
    assert.equal(b.setWaypoint(index), false)
    assert.equal(b.currentWaypoint, 1)
    assert.deepEqual(b.world.rows('current_waypoint', 1), [[int(1)]])
    assert.equal(b.world.revision, revision)
  })
}
for (const index of [1.5, -1, 4, Infinity]) {
  test(`waypoint invalid ${index}: actual action fails, does not silently succeed`, () => {
    const b = board(), revision = b.world.revision
    const action = GUARD_ACTIONS['!set_waypoint']([float(index)], context(b))
    assert.ok(action)
    assert.equal(action.start(), 'failed')
    assert.equal(b.currentWaypoint, 1)
    assert.equal(b.world.revision, revision)
  })
}
test('waypoint accepts valid indices and the route-completed sentinel used by stalker', () => {
  const b = board()
  for (const index of [0, 2, 3]) {
    assert.equal(GUARD_ACTIONS['!set_waypoint']([int(index)], context(b))!.start(), 'done')
    assert.equal(b.currentWaypoint, index)
    assert.deepEqual(b.world.rows('current_waypoint', 1), [[int(index)]])
  }
  assert.equal(b.waypoints[b.currentWaypoint], undefined, 'index=count deliberately means route completed')
})
test('empty route keeps sentinel zero; route starts retain nonnegative integer wrapping', () => {
  const b = board()
  b.setRoute(route, 7)
  assert.equal(b.currentWaypoint, 1)
  b.setRoute([], 7)
  assert.equal(b.currentWaypoint, 0)
  assert.equal(b.setWaypoint(0), true)
  assert.equal(b.setWaypoint(1), false)
})
for (const index of [1.5, -1, NaN, Infinity]) test(`setRoute ${index} rejects before replacing route or facts`, () => {
  const b = board(), revision = b.world.revision
  assert.throws(() => b.setRoute([], index), /nonnegative safe integer/)
  assert.deepEqual(b.waypoints, route)
  assert.equal(b.currentWaypoint, 1)
  assert.equal(b.world.revision, revision)
})
