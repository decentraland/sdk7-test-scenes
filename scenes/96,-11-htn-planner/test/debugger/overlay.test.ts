// The in-world overlay (src/debugger/overlay.ts): the label above each NPC at each detail level, its change key, the
// goal read from the host's recorder, the 3D segment to a step's target. Pure.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Quaternion, Vector3 } from '@dcl/sdk/math'
import { decompose, PlanTraceRecorder, WorldState } from '../../src/htn-planner'
import { GALLERY_STATIONS } from '../../src/examples/upstream/gallery'
import { galleryCallterms } from '../../src/examples/upstream/stations'
import { goalOf, levelFor, lineKey, nextLevel, OverlayInput, overlayKey, overlayText, segment, whyText } from '../../src/debugger/overlay'
import { stateHex } from '../../src/debugger/map'

const input = (over: Partial<OverlayInput> = {}): OverlayInput => ({
  label: 'guard_3',
  state: 'chase',
  lastStatus: 'succeeded',
  current: '!chase tester',
  reason: 'perception | -> tester|',
  goal: { method: 'behave', branch: 'chase_visible' },
  ...over
})

test('levels cycle off → step → full → off; a host override wins over the global level', () => {
  assert.equal(nextLevel('off'), 'step')
  assert.equal(nextLevel('step'), 'full')
  assert.equal(nextLevel('full'), 'off')
  const overrides = new Map([['b', 'off' as const]])
  assert.equal(levelFor('full', overrides, 'a'), 'full')
  assert.equal(levelFor('full', overrides, 'b'), 'off')
})

test('overlayText: off is empty; step is one line, the running step in the state colour', () => {
  assert.equal(overlayText(input(), 'off'), '')
  const t = overlayText(input(), 'step')
  assert.ok(!t.includes('\n'), t)
  assert.ok(t.includes('▶ !chase tester'), t)
  assert.ok(t.includes(stateHex('chase')), 'state colour')
})

test('overlayText: full adds the name and state, root method → branch, and why it planned in words', () => {
  const t = overlayText(input(), 'full')
  const lines = t.split('\n')
  assert.equal(lines.length, 4, t)
  assert.ok(lines[0].includes('guard_3') && lines[0].includes('chase'))
  assert.ok(lines[1].includes('▶ !chase tester'))
  assert.ok(lines[2].includes('behave → chase_visible'), lines[2])
  assert.ok(lines[3].startsWith('<color') && lines[3].includes('why') && lines[3].includes('sees tester'), lines[3])
})

test('overlayText: no step, a failed plan, no goal, no reason', () => {
  assert.ok(overlayText(input({ current: '' }), 'step').includes('· chase'), 'idle: the state')
  const failed = overlayText(input({ current: '', lastStatus: 'no_plan', state: 'no plan' }), 'step')
  assert.ok(failed.includes('× no_plan'), failed)
  const bare = overlayText(input({ goal: null, reason: '' }), 'full').split('\n')
  assert.equal(bare.length, 2, 'no goal and no why lines')
})

test('overlayText: long steps are cut, rich-text brackets in values escaped', () => {
  const long = '!say "' + 'x'.repeat(200) + '"'
  const t = overlayText(input({ current: long }), 'step')
  assert.ok(t.length < 120, `${t.length}`)
  assert.ok(t.includes('…'))
  assert.ok(!overlayText(input({ current: '!say "<b>"' }), 'step').includes('<b>"'), 'escaped')
})

test('overlayKey: changes with what the label shows, not with the reason at step level', () => {
  const a = overlayKey(input(), 'step')
  assert.equal(a, overlayKey(input({ reason: 'other' }), 'step'))
  assert.notEqual(a, overlayKey(input({ current: '!forget tester' }), 'step'))
  assert.notEqual(a, overlayKey(input(), 'full'))
  assert.notEqual(overlayKey(input(), 'full'), overlayKey(input({ reason: 'other' }), 'full'))
  assert.equal(overlayKey(input(), 'off'), overlayKey(input({ current: 'x' }), 'off'), 'off: one key')
})

test('whyText: the trigger, the reason in words, the changed facts by name', () => {
  assert.equal(whyText('perception | -> tester|', 'perception', ['+ (target_visible tester)']), 'perception: now sees tester · +target_visible')
  assert.equal(whyText('facts a -> b', 'facts', ['+ (door_open store)', '- (door_open store)']), 'facts · +door_open −door_open', 'a facts key says nothing')
  assert.equal(whyText('debug', 'debug', []), 'debug', 'the reason already says the trigger; no change, no list')
  assert.equal(whyText('plan completed', 'plan_done'), 'plan_done: plan completed')
  assert.equal(whyText('reload', 'reload', ['+ (door_open store)']), 'reload · +door_open', 'the trigger said once')
  assert.equal(whyText('debugger: replan', 'debug'), 'debug: debugger: replan', 'a word, not a prefix')
  assert.equal(whyText('noise footstep alert'), 'noise footstep alert', 'no structured event: the reason')
  assert.equal(whyText('facts a -> b'), 'facts a -> b', 'nothing else to say: the raw reason')
  assert.equal(whyText(''), '')
})

test('overlayText / overlayKey: full shows the structured why; its key moves with the trigger and the changes', () => {
  const i = input({ trigger: 'perception', changes: ['+ (target_visible tester)'] })
  const why = overlayText(i, 'full').split('\n')[3]
  assert.ok(why.includes('perception: now sees tester · +target_visible'), why)
  assert.notEqual(overlayKey(i, 'full'), overlayKey(input(), 'full'))
  assert.notEqual(overlayKey(i, 'full'), overlayKey({ ...i, changes: [] }, 'full'))
  assert.equal(overlayKey(i, 'step'), overlayKey(input(), 'step'), 'step level shows no why')
})

test('goalOf: the root method and the branch the newest top-level run chose', () => {
  const station = GALLERY_STATIONS.find(s => s.id === 'aaa')!
  const s = station.scenarios[0]
  const domain = s.domain ?? station.domain
  const world = new WorldState()
  s.setup(world)
  const recorder = new PlanTraceRecorder(domain)
  assert.equal(goalOf(recorder), null, 'nothing planned yet')
  assert.equal(goalOf(null), null)
  decompose(domain, world, s.method, s.args ?? [], { callterms: s.callterms ?? galleryCallterms, context: s.context?.(world) ?? station.host?.(world) ?? { world }, mode: s.mode, calltermErrorPolicy: 'report', onDiagnostic: () => {}, trace: recorder })
  const goal = goalOf(recorder)!
  assert.equal(goal.method, s.method)
  assert.equal(goal.branch, recorder.chosenBranch)
  assert.ok(goal.branch.length > 0)
})

test('segment: a box along +z from a to b, centred, its rotation pointing at b', () => {
  const a = { x: 1, y: 0.5, z: 2 }
  const b = { x: 4, y: 1.5, z: 6 }
  const s = segment(a, b)!
  assert.ok(Math.abs(s.length - Math.sqrt(9 + 1 + 16)) < 1e-9)
  assert.deepEqual(s.position, { x: 2.5, y: 1, z: 4 })
  const q = Quaternion.fromEulerDegrees(s.pitch, s.yaw, 0)
  const d = Vector3.rotate(Vector3.Forward(), q)
  const n = Vector3.normalize(Vector3.create(3, 1, 4))
  assert.ok(Math.abs(d.x - n.x) < 1e-5 && Math.abs(d.y - n.y) < 1e-5 && Math.abs(d.z - n.z) < 1e-5, JSON.stringify(d))
  assert.equal(segment(a, { ...a, x: a.x + 0.01 }), null, 'too short to draw')
})

test('lineKey: 0.2 m steps; no target is its own key', () => {
  const a = { x: 1, y: 0, z: 2 }
  assert.equal(lineKey(a, { x: 5, y: 0, z: 5 }), lineKey({ ...a, x: 1.05 }, { x: 5.04, y: 0, z: 5 }))
  assert.notEqual(lineKey(a, { x: 5, y: 0, z: 5 }), lineKey({ ...a, x: 1.3 }, { x: 5, y: 0, z: 5 }))
  assert.equal(lineKey(a, undefined), '-')
})
