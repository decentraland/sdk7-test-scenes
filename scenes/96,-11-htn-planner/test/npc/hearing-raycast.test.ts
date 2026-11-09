// Real SDK registration/results: asynchronous one-shot hearing and scoped lifetime.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { engine, Raycast, RaycastResult, Transform } from '@dcl/sdk/ecs'
import { float } from '../../src/htn-planner/htn/atom'
import { GuardAgent } from '../../src/htn-planner/npc/agent'
import { GuardSquad, createCapsuleBody } from '../../src/htn-planner/npc/guard-scene'
import { DEFAULT_HEARING, Hearing } from '../../src/htn-planner/npc/hearing'
import { NoiseBus } from '../../src/htn-planner/npc/noise'
import { CLEAR_LINE_OF_SIGHT } from '../../src/htn-planner/npc/perception'
import { RaycastLineOfSight } from '../../src/htn-planner/npc/raycast-los'
import { v3 } from '../../src/htn-planner/npc/vec'
import { prim, scripted } from './fake-planner'
const entities = () => [...engine.getEntitiesWith(Transform)].length
const rays = () => [...engine.getEntitiesWith(Raycast)]
const step = () => engine.update(1 / 30)
const plan = () => scripted(() => [prim('!wait', float(100))]).factory
const targets = [{ id: 'player', position: v3(0, 0, 5) }]
const emit = (bus: NoiseBus, x = 7, loudness = 10) => bus.emit({ kind: 'test', position: v3(x, 0, 0), loudness, source: 'scene' })
const targetX = (ray: ReturnType<typeof Raycast.get>) => ray.direction?.$case === 'globalTarget' ? ray.direction.globalTarget.x : NaN
function answer(entity: Parameters<typeof RaycastResult.createOrReplace>[0], blocked = false) {
  RaycastResult.createOrReplace(entity, { globalOrigin: v3(0, 1, 0), direction: v3(0, 0, 1), tickNumber: 0,
    hits: blocked ? [{ length: 1, globalOrigin: v3(0, 1, 0), direction: v3(0, 0, 1), position: v3(0, 1, 1), normalHit: v3(0, 0, -1) }] : [] })
}

for (const shared of [false, true]) for (const how of ['remove', 'despawn'] as const) test(`hearing ${shared ? 'shared' : 'separate'} LOS releases own queries on ${how}`, async () => {
  const before = entities(), sight = new RaycastLineOfSight(), hearing = shared ? sight : new RaycastLineOfSight(), bus = new NoiseBus()
  const squad = new GuardSquad({ planner: plan(), lineOfSight: sight, hearingLineOfSight: hearing, noise: bus, targets: () => targets, system: false })
  try {
    squad.spawn([{ id: 'g', route: [v3(0, 0, 0)], body: createCapsuleBody }])
    emit(bus); squad.update(0.1); await step()
    assert.equal(rays().length, 2)
    if (how === 'remove') squad.remove('g'); else squad.despawn()
    await step()
    assert.equal(rays().length, 0)
    assert.equal(entities(), before)
  } finally { squad.despawn(); sight.releaseAll(); hearing.releaseAll(); await step() }
})

test('one-shot events from different buses sharing seq/source get independent answers and deliver once', async () => {
  const before = entities(), h = new Hearing(), los = new RaycastLineOfSight()
  const a = emit(new NoiseBus(), -7), b = emit(new NoiseBus(), 7)
  assert.equal(a.seq, b.seq); assert.equal(a.source, b.source)
  try {
    assert.deepEqual(h.update(0.1, 0, 'g', v3(0, 0, 0), [a, b], los).heard, [])
    await step()
    assert.deepEqual(rays().map(([, r]) => targetX(r)).sort((a, b) => a - b), [-7, 7])
    for (const [e, r] of rays()) answer(e, targetX(r) > 0)
    await step()
    const result = h.update(0.1, 0.1, 'g', v3(0, 0, 0), [], los)
    assert.equal(result.heard.length, 1)
    assert.equal(result.heard[0].position.x, -7)
    assert.equal(result.heard[0].muffled, false)
    await step()
    assert.equal(rays().length, 0)
    assert.deepEqual(h.update(0.1, 0.2, 'g', v3(0, 0, 0), [a, b], los).heard, [], 'replayed resolved objects do not deliver or query twice')
    await step(); assert.equal(entities(), before)
  } finally { h.reset(); los.releaseAll(); await step() }
})

test('direct hear callers poll the original event, complete once, and reset cancels a late answer', async () => {
  const before = entities(), h = new Hearing(), los = new RaycastLineOfSight(), bus = new NoiseBus(), a = emit(bus)
  try {
    assert.equal(h.hear('g', v3(0, 0, 0), a, los, 0), null)
    await step(); answer(rays()[0][0]); await step()
    assert.equal(h.hear('g', v3(0, 0, 0), a, los, 0.1)?.position.x, 7)
    assert.equal(h.hear('g', v3(0, 0, 0), a, los, 0.2), null)
    const b = emit(bus, -7)
    h.hear('g', v3(0, 0, 0), b, los, 0.2); await step()
    const old = rays()[0][0]
    h.reset(); answer(old); await step(); RaycastResult.deleteFrom(old)
    assert.equal(h.hear('g', v3(0, 0, 0), b, los, 0.3), null)
    assert.deepEqual(h.update(0.1, 0.3, 'g', v3(0, 0, 0), [], los).heard, [])
    await step(); assert.equal(rays().length, 0); assert.equal(entities(), before)
  } finally { h.reset(); los.releaseAll(); await step() }
})

test('pending queries are bounded, expire on listener time, and their late answers cannot revive them', async () => {
  const before = entities(), h = new Hearing({ ...DEFAULT_HEARING, maxPending: 2, pendingLifetime: 0.2 }), los = new RaycastLineOfSight(), bus = new NoiseBus()
  const noises = [-7, 7, 8].map(x => emit(bus, x))
  try {
    h.update(0.1, 100, 'g', v3(0, 0, 0), noises, los); await step()
    assert.equal(rays().length, 2, 'overflow cancels oldest query even when SDK registration was queued')
    const pending = rays().map(([e]) => e)
    h.update(0.1, 100.3, 'g', v3(0, 0, 0), [], los); await step()
    assert.equal(rays().length, 0)
    for (const e of pending) answer(e)
    await step()
    for (const e of pending) RaycastResult.deleteFrom(e)
    assert.deepEqual(h.update(0.1, 100.4, 'g', v3(0, 0, 0), noises, los).heard, [])
    await step(); assert.equal(entities(), before)
  } finally { h.reset(); los.releaseAll(); await step() }
})

test('asynchronous hearing uses the captured listener sample rather than a later moving position', async () => {
  const before = entities(), h = new Hearing(), los = new RaycastLineOfSight(), noise = emit(new NoiseBus())
  try {
    h.update(0.1, 0, 'g', v3(0, 0, 0), [noise], los); await step()
    answer(rays()[0][0]); await step()
    const result = h.update(0.1, 0.1, 'g', v3(100, 0, 0), [], los)
    assert.equal(result.heard.length, 1)
    assert.equal(result.heard[0].distance, 7)
    assert.equal(result.heard[0].observedAt, 0)
    assert.ok(Math.abs(result.heard[0].perceived - 0.3) < 1e-9)
  } finally { h.reset(); los.releaseAll(); await step(); assert.equal(entities(), before) }
})

test('late older loud noise cannot hide eligible newer quiet noise or extend its stored lifetime', async () => {
  const before = entities(), los = new RaycastLineOfSight(), bus = new NoiseBus()
  const agent = new GuardAgent({ id: 'g', planner: plan(), lineOfSight: CLEAR_LINE_OF_SIGHT, hearingLineOfSight: los, start: { position: v3(0, 0, 0), yaw: 0 } })
  try {
    const a = emit(bus, -1, 100), b = emit(bus, 5, 10)
    agent.tick(0.1, [], [a]); await step()
    const aRay = rays()[0][0]
    agent.tick(0.1, [], [b]); await step()
    const bRay = rays().find(([, r]) => targetX(r) === 5)![0]
    answer(bRay); await step()
    agent.tick(0.1, [], [])
    assert.equal(agent.blackboard.heardNoise?.position.x, 5)
    assert.equal(agent.blackboard.heardNoise?.time, 0.2, 'B memory starts at observation, not completion')
    const c = emit(bus, 9, 10)
    agent.tick(0.1, [], [c]); await step()
    const cRay = rays().find(([, r]) => targetX(r) === 9)![0]
    answer(aRay); answer(cRay); await step()
    agent.tick(0.1, [], [])
    assert.equal(agent.lastHearing.loudest?.position.x, -1, 'older A is louder in this completion batch')
    assert.equal(agent.lastHearing.latest?.position.x, 9, 'latest means last originally observed among this completed batch')
    assert.equal(agent.blackboard.heardNoise?.position.x, 9, 'choose eligible C instead of skipping the whole stale-loudest batch')
    assert.equal(agent.blackboard.heardNoise?.time, 0.4)
    assert.equal(agent.lastHeard?.at, 0.4)
  } finally { agent.stop(); los.releaseAll(); await step(); assert.equal(entities(), before) }
})

test('reload cancels pending answers but preserves delivered alert/memory; stopping hearing is scoped', async () => {
  const before = entities(), los = new RaycastLineOfSight(), bus = new NoiseBus()
  const make = (id: string) => new GuardAgent({ id, planner: plan(), lineOfSight: CLEAR_LINE_OF_SIGHT, hearingLineOfSight: los, start: { position: v3(0, 0, 0), yaw: 0 } })
  const a = make('a'), b = make('b')
  try {
    a.tick(0.1, [], [emit(bus)]); await step(); answer(rays()[0][0]); await step(); a.tick(0.1, [], [])
    const remembered = a.blackboard.heardNoise, alert = a.hearing.alert
    a.tick(0.1, [], [emit(bus, -7)]); b.tick(0.1, [], [emit(bus, 8)]); await step()
    assert.equal(rays().length, 2)
    a.reload(plan()); await step()
    assert.deepEqual(a.blackboard.heardNoise, remembered)
    assert.equal(a.hearing.alert, alert - 0.1 * DEFAULT_HEARING.alertDecayPerSecond)
    assert.equal(rays().length, 1, 'reload releases only its own ear namespace')
    b.reload(scripted(() => [prim('!wait', float(100))], undefined, { facts: [], callterms: [] }).factory)
    b.tick(0.1, [], []); await step()
    assert.equal(rays().length, 0)
    assert.deepEqual(a.lastHearing.heard.map(h => h.position.x), [], 'reload does not deliver cancelled pending noise')
  } finally { a.stop(); b.stop(); los.releaseAll(); await step(); assert.equal(entities(), before) }
})

test('sync hearing remains immediate/repeatable and default hearing creates no ear rays', async () => {
  const before = entities(), h = new Hearing(), noise = emit(new NoiseBus()), sight = new RaycastLineOfSight()
  const agent = new GuardAgent({ id: 'default', planner: plan(), lineOfSight: sight, start: { position: v3(0, 0, 0), yaw: 0 } })
  try {
    assert.equal(h.hear('g', v3(0, 0, 0), noise, CLEAR_LINE_OF_SIGHT, 0)?.muffled, false)
    assert.equal(h.hear('g', v3(0, 0, 0), noise, CLEAR_LINE_OF_SIGHT, 0.1)?.muffled, false)
    assert.equal(h.update(0.1, 0.2, 'g', v3(0, 0, 0), [noise, noise], CLEAR_LINE_OF_SIGHT).heard.length, 2, 'sync update still processes every supplied entry')
    agent.tick(0.1, targets, [noise]); await step()
    assert.equal(agent.lastHearing.heard.length, 1)
    assert.equal(rays().length, 1)
    agent.stop(); await step(); assert.equal(entities(), before)
  } finally { agent.stop(); sight.releaseAll(); await step() }
})

test('pending limits reject invalid numbers before allocating a query', () => {
  for (const maxPending of [0, -1, 1.5, Infinity, NaN]) assert.throws(() => new Hearing({ ...DEFAULT_HEARING, maxPending }), RangeError)
  for (const pendingLifetime of [0, -1, Infinity, NaN]) assert.throws(() => new Hearing({ ...DEFAULT_HEARING, pendingLifetime }), RangeError)
})


test('turning sight off does not release new hearing queries in a shared LOS', async () => {
  const before = entities(), los = new RaycastLineOfSight(), bus = new NoiseBus()
  const agent = new GuardAgent({ id: 'g', planner: plan(), lineOfSight: los, hearingLineOfSight: los, start: { position: v3(0, 0, 0), yaw: 0 } })
  try {
    agent.tick(0.1, targets, [emit(bus)]); await step()
    assert.equal(rays().length, 2)
    agent.reload(scripted(() => [prim('!wait', float(100))], undefined, { facts: ['heard_noise/4'], callterms: [] }).factory)
    agent.tick(0.1, targets, [emit(bus, -7)]); await step()
    assert.deepEqual(agent.sensing, { sight: false, hearing: true })
    assert.equal(rays().length, 1)
    assert.equal(targetX(rays()[0][1]), -7)
    answer(rays()[0][0]); await step(); agent.tick(0.1, targets, [])
    assert.equal(agent.blackboard.heardNoise?.position.x, -7)
  } finally { agent.stop(); los.releaseAll(); await step(); assert.equal(entities(), before) }
})

test('wallMuffle=1 stays immediate with a configured async LOS and stop cancels queued registrations', async () => {
  const before = entities(), los = new RaycastLineOfSight(), bus = new NoiseBus()
  const agent = new GuardAgent({ id: 'g', planner: plan(), lineOfSight: CLEAR_LINE_OF_SIGHT, hearingLineOfSight: los,
    hearing: { wallMuffle: 1 }, start: { position: v3(0, 0, 0), yaw: 0 } })
  try {
    agent.tick(0.1, [], [emit(bus)]); await step()
    assert.equal(agent.lastHearing.heard.length, 1)
    assert.equal(rays().length, 0)
    agent.hearing.cfg.wallMuffle = 0.5
    agent.tick(0.1, [], [emit(bus, -7)])
    agent.stop(); await step()
    assert.equal(rays().length, 0)
    assert.equal(entities(), before)
  } finally { agent.stop(); los.releaseAll(); await step() }
})


test('same-tick observations retain stable recency when the newer answer arrives before the older one', async () => {
  const before = entities(), los = new RaycastLineOfSight(), bus = new NoiseBus()
  const agent = new GuardAgent({ id: 'g', planner: plan(), lineOfSight: CLEAR_LINE_OF_SIGHT, hearingLineOfSight: los, start: { position: v3(0, 0, 0), yaw: 0 } })
  try {
    agent.tick(0.1, [], [emit(bus, -1, 100), emit(bus, 5, 10)]); await step()
    const a = rays().find(([, r]) => targetX(r) === -1)![0]
    const b = rays().find(([, r]) => targetX(r) === 5)![0]
    answer(b); await step(); agent.tick(0.1, [], [])
    assert.equal(agent.blackboard.heardNoise?.position.x, 5)
    answer(a); await step(); agent.tick(0.1, [], [])
    assert.equal(agent.lastHearing.loudest?.position.x, -1, 'A can still contribute to alert')
    assert.equal(agent.blackboard.heardNoise?.position.x, 5, 'A must not replace newer B even with identical observedAt')
  } finally { agent.stop(); los.releaseAll(); await step(); assert.equal(entities(), before) }
})
