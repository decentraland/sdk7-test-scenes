// Stable writes and roster membership should not allocate new snapshot containers on every tick.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GuardBlackboard } from '../../src/htn-planner/npc/blackboard'
import { createCapsuleBody, GuardSquad } from '../../src/htn-planner/npc/guard-scene'
import { CLEAR_LINE_OF_SIGHT, DEFAULT_PERCEPTION, Perception } from '../../src/htn-planner/npc/perception'
import { float, sym, vec3 } from '../../src/htn-planner/htn/atom'
import { Hearing } from '../../src/htn-planner/npc/hearing'
import { v3 } from '../../src/htn-planner/npc/vec'
import { prim, scripted } from './fake-planner'

const seen = (x = 1, distance = 1) => [{ id: 'player', position: v3(x, 0, 0), distance }]

test('unchanged blackboard values keep immutable fact containers and visible snapshots', () => {
  const bb = new GuardBlackboard(), targets = seen()
  bb.setTime(1); bb.setSelfPosition(v3(2, 0, 3)); bb.setVisible(targets)
  const time = bb.world.rows('now', 1), position = bb.world.rows('self_position', 1)
  const visible = bb.world.rows('target_visible', 2), snapshot = bb.visibleTargets
  const revision = bb.world.revision, tables = bb.world.tablesCreated
  for (let i = 0; i < 100; i++) {
    bb.setTime(1); bb.setSelfPosition(v3(2, 0, 3)); bb.setVisible(targets)
  }
  assert.equal(bb.world.rows('now', 1), time)
  assert.equal(bb.world.rows('self_position', 1), position)
  assert.equal(bb.world.rows('target_visible', 2), visible)
  assert.equal(bb.visibleTargets, snapshot)
  assert.equal(bb.world.revision, revision)
  assert.equal(bb.world.tablesCreated, tables)
})

test('blackboard skips empty visibility writes but still repairs externally changed facts', () => {
  const bb = new GuardBlackboard()
  bb.setVisible([])
  const revision = bb.world.revision
  for (let i = 0; i < 100; i++) bb.setVisible([])
  assert.equal(bb.world.revision, revision)
  bb.world.add('target_visible', sym('wrong'), vec3(9, 9, 9))
  bb.setVisible([])
  assert.equal(bb.world.rows('target_visible', 2).length, 0)
  bb.setSelfPosition(v3(1, 2, 3)); bb.setTime(4); bb.setVisible(seen())
  bb.world.clear('self_position', 1); bb.world.set('now', float(9)); bb.world.clear('target_visible', 2)
  bb.setSelfPosition(v3(1, 2, 3)); bb.setTime(4); bb.setVisible(seen())
  assert.deepEqual(bb.world.rows('self_position', 1), [[vec3(1, 2, 3)]])
  assert.deepEqual(bb.world.rows('now', 1), [[float(4)]])
  assert.deepEqual(bb.world.rows('target_visible', 2), [[sym('player'), vec3(1, 0, 0)]])
})

test('changed distances update public visibility without rewriting equal planner facts', () => {
  const bb = new GuardBlackboard()
  bb.setVisible(seen())
  const before = bb.visibleTargets, facts = bb.world.rows('target_visible', 2), revision = bb.world.revision
  bb.setVisible(seen(1, 2))
  assert.equal(bb.visibleTargets[0].distance, 2)
  assert.equal(before[0].distance, 1, 'a retained public snapshot never changes')
  assert.equal(bb.world.rows('target_visible', 2), facts)
  assert.equal(bb.world.revision, revision)
  bb.setVisible(seen(3, 3))
  assert.deepEqual(before[0].position, v3(1, 0, 0))
  assert.deepEqual(bb.world.rows('target_visible', 2), [[sym('player'), vec3(3, 0, 0)]])
})

test('ordinary squad updates do not copy the roster, and callback spawns join on the next frame', () => {
  let slices = 0, spawn = false
  const squad = new GuardSquad({
    planner: scripted(() => [prim('!wait', float(100))], undefined, { facts: [], callterms: [] }).factory,
    lineOfSight: CLEAR_LINE_OF_SIGHT, noise: null, targets: () => [], system: false,
    onEvent: event => {
      if (event.type === 'step' && spawn) {
        spawn = false
        squad.spawn([{ id: 'later', route: [], body: createCapsuleBody }])
      }
    }
  })
  try {
    squad.spawn([{ id: 'first', route: [], body: createCapsuleBody }])
    Object.defineProperty(squad.guards, 'slice', { value() { slices++; return Array.prototype.slice.call(this) } })
    squad.update(0.1)
    for (let i = 0; i < 10; i++) squad.update(0.1)
    assert.equal(slices, 0, 'stable membership needs no per-frame roster slice')
    spawn = true
    squad.guards[0].agent.requestReplan('new action', true)
    squad.reload(scripted(() => [prim('!wait', float(100))], undefined, { facts: [], callterms: [] }).factory)
    squad.update(0.1)
    assert.equal(squad.guards.length, 2)
    assert.equal(squad.guards[1].agent.time, 0)
    squad.update(0.1)
    assert.ok(squad.guards[1].agent.time > 0)
  } finally { squad.despawn() }
})

test('empty perception creates no presence Set and old results remain detached', () => {
  const OriginalSet = globalThis.Set
  let allocated = 0
  const p = new Perception({ ...DEFAULT_PERCEPTION, detectTime: 0, nearDetectTime: 0, loseGrace: 0 })
  const pose = { position: v3(0, 0, 0), yaw: 0 }
  globalThis.Set = class CountingSet<T> extends OriginalSet<T> {
    constructor(values?: Iterable<T> | null) { super(values); allocated++ }
  }
  try {
    for (let i = 0; i < 100; i++) p.update(.1, i / 10, 'g', pose, [], CLEAR_LINE_OF_SIGHT)
  } finally { globalThis.Set = OriginalSet }
  assert.equal(allocated, 0)
  const first = p.update(.1, 11, 'g', pose, [{ id: 'target', position: v3(0, 0, 2) }], CLEAR_LINE_OF_SIGHT)
  const lost = p.update(.1, 12, 'g', pose, [], CLEAR_LINE_OF_SIGHT)
  p.update(.1, 13, 'g', pose, [{ id: 'target', position: v3(0, 0, 8) }], CLEAR_LINE_OF_SIGHT)
  assert.deepEqual(first.visible[0].position, v3(0, 0, 2))
  assert.deepEqual(lost.lost[0].position, v3(0, 0, 2))
})


test('common single-player perception needs no presence Set, while larger target lists stay linear', () => {
  const OriginalSet = globalThis.Set
  let allocated = 0
  const p = new Perception(), pose = { position: v3(0, 0, 0), yaw: 0 }
  const far = [{ id: 'player', position: v3(100, 0, 100) }]
  globalThis.Set = class CountingSet<T> extends OriginalSet<T> {
    constructor(values?: Iterable<T> | null) { super(values); allocated++ }
  }
  try {
    for (let i = 0; i < 100; i++) p.update(.1, i / 10, 'g', pose, far, CLEAR_LINE_OF_SIGHT)
    assert.equal(allocated, 0, 'a normal one-player scene must not allocate a Set per guard/frame')
    let reads = 0
    const crowd = new Proxy(Array.from({ length: 100 }, (_, i) => ({ id: 'p' + i, position: v3(100, 0, i) })), {
      get(target, key, receiver) {
        if (typeof key === 'string' && /^\d+$/.test(key)) reads++
        return Reflect.get(target, key, receiver)
      }
    })
    p.update(.1, 11, 'g', pose, crowd, CLEAR_LINE_OF_SIGHT)
    assert.equal(allocated, 1, 'crowds retain the Set path rather than a quadratic membership scan')
    assert.ok(reads < 1000, '100-target membership must stay linear')
  } finally { globalThis.Set = OriginalSet }
})


test('an idle asynchronous hearing provider does not allocate candidate Sets without pending/new noises', () => {
  const OriginalSet = globalThis.Set
  let allocated = 0, checks = 0
  const h = new Hearing(), feet = v3(0, 0, 0)
  const los = { check: () => { checks++; return false }, result: () => undefined }
  globalThis.Set = class CountingSet<T> extends OriginalSet<T> {
    constructor(values?: Iterable<T> | null) { super(values); allocated++ }
  }
  try {
    for (let i = 0; i < 100; i++) h.update(.1, i / 10, 'g', feet, [], los)
  } finally { globalThis.Set = OriginalSet }
  assert.equal(allocated, 0)
  assert.equal(checks, 0)
})


test('float32-equal fact writes are no-ops while signed-zero snapshot changes are preserved', () => {
  const bb = new GuardBlackboard(), point = v3(.1, .2, .3)
  bb.setSelfPosition(point); bb.setTime(.1); bb.setVisible(seen(.1))
  const position = bb.world.rows('self_position', 1), time = bb.world.rows('now', 1)
  const visible = bb.world.rows('target_visible', 2), revision = bb.world.revision
  bb.setSelfPosition(v3(.1 + 1e-10, .2, .3)); bb.setTime(.1 + 1e-10); bb.setVisible(seen(.1 + 1e-10))
  assert.equal(bb.world.rows('self_position', 1), position)
  assert.equal(bb.world.rows('now', 1), time)
  assert.equal(bb.world.rows('target_visible', 2), visible)
  assert.equal(bb.world.revision, revision)
  assert.equal(bb.visibleTargets[0].position.x, .1 + 1e-10, 'public snapshot keeps full host precision')
  bb.setVisible(seen(-0))
  const old = bb.visibleTargets
  bb.setVisible(seen(0))
  assert.ok(Object.is(bb.visibleTargets[0].position.x, 0))
  assert.ok(Object.is(old[0].position.x, -0))
  assert.deepEqual(bb.world.rows('target_visible', 2), [[sym('player'), vec3(0, 0, 0)]])
})

test('unchanged visible facts still supersede lost memory and snapshots detach from source samples', () => {
  const bb = new GuardBlackboard(), input = seen(2)
  bb.setVisible(input)
  const snapshot = bb.visibleTargets
  bb.remember({ id: 'player', position: v3(9, 0, 0), time: 1 })
  bb.setVisible(input)
  assert.equal(bb.memoryOf('player'), undefined)
  input[0].position.x = 4
  assert.equal(snapshot[0].position.x, 2)
  bb.setVisible(input)
  assert.equal(bb.visibleTargets[0].position.x, 4)
  assert.equal(snapshot[0].position.x, 2)
})
