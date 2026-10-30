import { test } from 'node:test'
import assert from 'node:assert/strict'
import { engine, Transform } from '@dcl/sdk/ecs'
import { compileDomainSource } from '../../tools/htn/compiler'
import { GuardSquad, createCapsuleBody, plannerFor, possessEntityBody } from '../../src/htn-planner/npc/guard-scene'
import { CLEAR_LINE_OF_SIGHT } from '../../src/htn-planner/npc/perception'

// Characterize the existing fail-fast contract, rather than silently suppressing an invalid hierarchy.
test('a runtime body error aborts the current squad update; repairing the hierarchy permits the next update', () => {
  const compiled = compileDomainSource('BodyFailure.domain', `(:domain BodyFailure top_level_domain
    (:method (behave) top_level_method (waiting () ((!wait 100.0)))))`)
  assert.ok(compiled.ok)
  const parent = engine.addEntity(), figure = engine.addEntity()
  Transform.create(parent)
  Transform.create(figure, { parent })
  const squad = new GuardSquad({
    planner: plannerFor(compiled.ir), lineOfSight: CLEAR_LINE_OF_SIGHT,
    system: false, noise: null, targets: () => []
  })
  squad.spawn([
    { id: 'invalid', route: [], body: () => possessEntityBody(figure, { groundY: 0 }) },
    { id: 'later', route: [], body: createCapsuleBody }
  ])
  const [first, later] = squad.guards
  try {
    Transform.getMutable(parent).scale.x = 2
    assert.throws(() => squad.update(0.1), /uniform positive scale/)
    assert.equal(first.agent.time, 0.1, 'agent tick before body.write is not rolled back')
    assert.equal(later.agent.time, 0, 'the remaining roster did not tick after the exception')
    assert.equal(squad.guards.length, 2, 'no implicit removal or shutdown')
    assert.throws(() => squad.update(0.1), /uniform positive scale/)
    assert.equal(later.agent.time, 0)
    Transform.getMutable(parent).scale.x = 1
    squad.update(0.1)
    assert.ok(first.agent.time > 0.2)
    assert.equal(later.agent.time, 0.1, 'next explicit update resumes after the invalid input is repaired')
  } finally {
    squad.despawn()
    engine.removeEntity(figure)
    engine.removeEntity(parent)
  }
})
