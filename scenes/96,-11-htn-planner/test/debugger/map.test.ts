// The debugger's map (src/debugger/map.ts): the projection of an area onto the panel, the scene it draws (hosts,
// their heading, target and route, props, the tester and the player), its hit test and its change key. Pure.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sym, vec3 } from '../../src/htn-planner'
import { buildMap, dotsAlong, fitProjection, hitTest, MapInput, mapKey, MAX_MARKS, planPoints, project, stateHex } from '../../src/debugger/map'

const VIEW = { w: 600, h: 400 }
const HALF = { x: 10, z: 5 }

const input = (over: Partial<MapInput> = {}): MapInput => ({
  label: 'area',
  half: HALF,
  selected: null,
  hosts: [
    { id: 'a', label: 'a', state: 'patrol', current: '!move_to', pose: { position: { x: 0, y: 0, z: 0 }, yaw: 0, target: { x: 0, y: 0, z: 4 }, route: [{ x: 0, y: 0, z: 4 }, { x: 8, y: 0, z: 4 }] } },
    { id: 'b', label: 'b', state: 'chase', current: '', pose: { position: { x: -9, y: 0, z: -4 }, yaw: Math.PI / 2 } }
  ],
  props: [{ id: 'wall', x: 5, z: 0, w: 1, d: 6, color: '#888888', solid: true }],
  actors: [{ id: 'tester', label: 'tester', kind: 'tester', position: { x: 2, y: 0, z: -2 } }],
  ...over
})

test('fitProjection: the area fills the view at one scale, centred; +z is up', () => {
  const p = fitProjection(HALF, VIEW, 20)
  assert.equal(p.scale, Math.min((600 - 40) / 20, (400 - 40) / 10))
  const c = project(p, 0, 0)
  assert.deepEqual(c, { x: 300, y: 200 }, 'the area centre is the view centre')
  const tl = project(p, -10, 5)
  const br = project(p, 10, -5)
  assert.ok(tl.x >= 20 - 1e-9 && tl.y >= 20 - 1e-9, 'top-left inside the padding')
  assert.ok(br.x <= 580 + 1e-9 && br.y <= 380 + 1e-9)
  assert.ok(project(p, 0, 1).y < c.y, 'away from the visitor is up')
  assert.ok(project(p, 1, 0).x > c.x)
})

test('buildMap: a dot per host at its position with its state colour and a nose where it looks', () => {
  const m = buildMap(input(), VIEW)
  assert.equal(m.dots.length, 2)
  const a = m.dots.find(d => d.id === 'a')!
  const c = project(m.proj, 0, 0)
  assert.deepEqual({ x: a.x, y: a.y }, c)
  assert.equal(a.color, stateHex('patrol'))
  assert.ok(a.nose.y < a.y && Math.abs(a.nose.x - a.x) < 1e-9, 'yaw 0 looks up (+z)')
  const b = m.dots.find(d => d.id === 'b')!
  assert.ok(b.nose.x > b.x && Math.abs(b.nose.y - b.y) < 1e-9, 'yaw 90° looks right (+x)')
  assert.equal(b.color, stateHex('chase'))
  assert.notEqual(stateHex('chase'), stateHex('patrol'))
  assert.equal(stateHex('some new mode'), stateHex('some new mode'), 'an unknown state gets a stable colour')
})

test('buildMap: target line for every host, the whole route for the selected one only; the selected dot is drawn last', () => {
  const none = buildMap(input(), VIEW)
  const targetOnly = none.marks.filter(k => k.kind === 'target').length
  assert.ok(targetOnly > 0, 'a target line')
  assert.equal(none.marks.filter(k => k.kind === 'route').length, 0, 'no route without a selection')
  const sel = buildMap(input({ selected: 'a' }), VIEW)
  assert.ok(sel.marks.filter(k => k.kind === 'route').length > 0, 'the selected route')
  assert.equal(sel.dots[sel.dots.length - 1].id, 'a', 'selected on top')
  assert.equal(sel.dots[sel.dots.length - 1].selected, true)
  assert.ok(sel.waypoints.length === 2, 'the route points are marked')
})

test('buildMap: props and actors in view coordinates, things outside the area clamped to its edge', () => {
  const m = buildMap(input({ hosts: [{ id: 'far', label: 'far', state: 'walk', current: '', pose: { position: { x: 50, y: 0, z: 0 }, yaw: 0 } }] }), VIEW)
  const wall = m.rects.find(r => r.id === 'wall')!
  assert.equal(wall.w, 1 * m.proj.scale)
  assert.equal(wall.h, 6 * m.proj.scale)
  assert.equal(m.actors[0].kind, 'tester')
  const far = m.dots[0]
  assert.ok(Math.abs(far.x - project(m.proj, 10, 0).x) < 1e-9, 'clamped to the right edge')
})

test('buildMap: hosts on the same spot spread around it, so each stays clickable', () => {
  const same = (id: string) => ({ id, label: id, state: 'idle', current: '', pose: { position: { x: 1, y: 0, z: 1 }, yaw: 0 } })
  const m = buildMap(input({ hosts: [same('p'), same('q'), same('r')] }), VIEW)
  const ids = new Set(m.dots.map(d => `${d.x.toFixed(1)},${d.y.toFixed(1)}`))
  assert.equal(ids.size, 3)
  for (const d of m.dots) assert.equal(hitTest(m, d.x, d.y), d.id)
})

test('hitTest: the topmost dot within its radius plus slack, else null', () => {
  const m = buildMap(input({ selected: 'b' }), VIEW)
  const a = m.dots.find(d => d.id === 'a')!
  assert.equal(hitTest(m, a.x + a.r + 2, a.y), 'a')
  assert.equal(hitTest(m, a.x + a.r + 20, a.y), null)
  // Two overlapping: the one drawn last wins.
  const two = buildMap(input({ selected: 'b', hosts: [input().hosts[0], { ...input().hosts[1], pose: { position: { x: 0.2, y: 0, z: 0 }, yaw: 0 } }] }), VIEW)
  const top = two.dots[two.dots.length - 1]
  assert.equal(top.id, 'b')
  const mid = { x: (two.dots[0].x + top.x) / 2, y: top.y }
  assert.equal(hitTest(two, mid.x, mid.y), 'b')
})

test('dotsAlong: evenly spaced, both ends excluded at the start, capped', () => {
  const pts = dotsAlong({ x: 0, y: 0 }, { x: 100, y: 0 }, 10, 50)
  assert.equal(pts.length, 10)
  assert.equal(pts[0].x, 10)
  assert.equal(pts[pts.length - 1].x, 100)
  assert.equal(dotsAlong({ x: 0, y: 0 }, { x: 1000, y: 0 }, 10, 12).length, 12, 'capped: the spacing grows')
  assert.equal(dotsAlong({ x: 0, y: 0 }, { x: 0, y: 0 }, 10, 12).length, 0)
})

test('the marks stay under their cap however long the routes', () => {
  const route = Array.from({ length: 200 }, (_, i) => ({ x: (i % 2 ? 9 : -9), y: 0, z: (i % 10) - 5 }))
  const m = buildMap(input({ selected: 'a', hosts: [{ id: 'a', label: 'a', state: 'walk', current: '', pose: { position: { x: 0, y: 0, z: 0 }, yaw: 0, route } }] }), VIEW)
  assert.ok(m.marks.length <= MAX_MARKS, `${m.marks.length}`)
})

test('planPoints: a step goes where its first position argument says, or to whoever its id names', () => {
  const steps = [
    { name: '!move_to', args: [vec3(1, 0, 2), sym('walk')] },
    { name: '!wait', args: [] },
    { name: '!chase', args: [sym('you')] },
    { name: '!chase', args: [sym('nobody')] }
  ]
  const pts = planPoints(steps, id => (id === 'you' ? { x: 5, y: 0, z: 5 } : undefined))
  assert.deepEqual(pts, [{ x: 1, y: 0, z: 2 }, undefined, { x: 5, y: 0, z: 5 }, undefined])
})

test('mapKey: changes when someone moves a pixel-worth, turns, changes state or the selection; not otherwise', () => {
  const k = mapKey(input())
  assert.equal(mapKey(input()), k)
  const moved = input()
  moved.hosts[0].pose.position = { x: 0.3, y: 0, z: 0 }
  assert.notEqual(mapKey(moved), k)
  const jitter = input()
  jitter.hosts[0].pose.position = { x: 0.01, y: 0, z: 0 }
  assert.equal(mapKey(jitter), k, 'a centimetre does not rebuild')
  assert.notEqual(mapKey(input({ selected: 'a' })), k)
  const state = input()
  state.hosts[1].state = 'patrol'
  assert.notEqual(mapKey(state), k)
})
