import { test } from 'node:test'
import assert from 'node:assert/strict'
import { layoutDomain, type GraphLayout, type Segment } from '../../src/debugger/graph-layout'
import { domainGraph } from '../../src/htn-planner'
import { fullModel } from '../../src/debugger/domain-focus'
import type { GraphModel } from '../../src/debugger/model'
import { complexScenarioDomain } from '../../src/examples/upstream/generated/complex_scenario.htn'
import { aaaCombatDomain } from '../../src/examples/upstream/generated/AAACombatNPC.htn'

const small: GraphModel = {
  root: 'T',
  nodes: [
    { id: 'T', kind: 'task', label: 'serve' },
    { id: 'U', kind: 'task', label: 'walk' },
    { id: 'b1', kind: 'branch', label: 'serve:fast', chips: ['ready'] },
    { id: 'b2', kind: 'branch', label: 'serve:slow' },
    { id: 'b3', kind: 'branch', label: 'walk:any' },
    { id: '!go', kind: 'primitive', label: '!go' }
  ],
  edges: [
    { from: 'T', to: 'b1' },
    { from: 'T', to: 'b2' },
    { from: 'b1', to: 'U' },
    { from: 'b1', to: '!go' },
    { from: 'b2', to: '!go' },
    { from: 'b2', to: 'T' }, // recursion
    { from: 'U', to: 'b3' },
    { from: 'b3', to: '!go' }
  ]
}

const overlaps = (a: { x: number; y: number; w: number; h: number }, b: typeof a) =>
  a.x < b.x + b.w - 0.01 && b.x < a.x + a.w - 0.01 && a.y < b.y + b.h - 0.01 && b.y < a.y + a.h - 0.01

function checkInvariants(l: GraphLayout) {
  for (const n of l.nodes) {
    assert.ok(n.x >= 0 && n.y >= 0, `${n.id} inside the canvas`)
    assert.ok(n.x + n.w <= l.width + 0.01 && n.y + n.h <= l.height + 0.01, `${n.id} fits`)
  }
  for (let i = 0; i < l.nodes.length; i++)
    for (let j = i + 1; j < l.nodes.length; j++)
      assert.ok(!overlaps(l.nodes[i], l.nodes[j]), `${l.nodes[i].id} overlaps ${l.nodes[j].id}`)
  const thin = (s: Segment) => Math.min(s.w, s.h) <= 2.01
  assert.ok(l.segments.every(thin), 'every segment is a thin axis-aligned rectangle')
}

test('layoutDomain: layers, per-use primitives, back-edge', () => {
  const l = layoutDomain(small)
  const byId = new Map(l.nodes.map(n => [n.id, n]))
  assert.equal(byId.get('T')!.layer, 0)
  assert.equal(byId.get('b1')!.layer, 1)
  assert.equal(byId.get('U')!.layer, 2)
  assert.equal(byId.get('b3')!.layer, 3)
  assert.equal(l.nodes.filter(n => n.kind === 'primitive').length, 3, 'a primitive box per use')
  assert.equal(l.backEdges, 1)
  assert.ok(l.segments.some(s => s.back))
  // The back-edge lane runs outside every node (left or right of the graph).
  const lane = l.segments.filter(s => s.back && s.h > s.w).sort((a, b) => b.h - a.h)[0]
  assert.ok(l.nodes.every(n => n.x + n.w < lane.x) || l.nodes.every(n => lane.x + lane.w < n.x))
  checkInvariants(l)
})

test('layoutDomain: long edges go through dummies, nodes are below their parents', () => {
  const g: GraphModel = {
    root: 'A',
    nodes: [
      { id: 'A', kind: 'task', label: 'a' },
      { id: 'B', kind: 'task', label: 'b' },
      { id: 'a1', kind: 'branch', label: 'a1' },
      { id: 'a2', kind: 'branch', label: 'a2' },
      { id: 'b1', kind: 'branch', label: 'b1' }
    ],
    edges: [
      { from: 'A', to: 'a1' },
      { from: 'A', to: 'a2' },
      { from: 'a1', to: 'B' },
      { from: 'B', to: 'b1' },
      { from: 'a2', to: 'b1' } // b1 sits at layer 3 (under B), so this edge spans two layers
    ]
  }
  const l = layoutDomain(g)
  assert.equal(l.dummies, 1)
  const byId = new Map(l.nodes.map(n => [n.id, n]))
  assert.ok(byId.get('a1')!.y > byId.get('A')!.y + byId.get('A')!.h)
  assert.ok(byId.get('b1')!.y > byId.get('B')!.y + byId.get('B')!.h)
  checkInvariants(l)
})

test('layoutDomain: segments of a single edge connect end to end', () => {
  const g: GraphModel = {
    root: 'A',
    nodes: [
      { id: 'A', kind: 'task', label: 'a' },
      { id: 'a1', kind: 'branch', label: 'a1' },
      { id: 'a2', kind: 'branch', label: 'a2' }
    ],
    edges: [
      { from: 'A', to: 'a1' },
      { from: 'A', to: 'a2' }
    ]
  }
  const l = layoutDomain(g)
  // One bus: drop from A, a horizontal track, two drops into the branches.
  assert.equal(l.segments.length, 4)
  const [drop, bus] = l.segments
  assert.ok(Math.abs(drop.y + drop.h - (bus.y + bus.h / 2)) < 0.01, 'the drop ends on the bus')
  assert.ok(drop.x >= bus.x && drop.x + drop.w <= bus.x + bus.w + 0.01, 'the drop lands inside the bus')
  assert.equal(l.ports.length, 2)
})

test('layoutDomain: a whole upstream domain (complex_scenario, recursive) lays out without overlaps', () => {
  const m = fullModel(domainGraph(complexScenarioDomain))
  assert.ok(m.model.nodes.length > 40)
  const l = layoutDomain(m.model)
  checkInvariants(l)
  assert.ok(l.backEdges > 0, 'complex_scenario recurses')
})

test('layoutDomain: zoom scales the canvas', () => {
  const g = fullModel(domainGraph(aaaCombatDomain), 80).model
  const a = layoutDomain(g, { scale: 1 })
  const b = layoutDomain(g, { scale: 0.5 })
  assert.ok(Math.abs(b.width / a.width - 0.5) < 0.05)
  assert.ok(Math.abs(b.height / a.height - 0.5) < 0.05)
  checkInvariants(b)
})

test('parentAlign first: a parent sits over its first child, so a wide graph starts at its top-left', () => {
  const wide: GraphModel = {
    root: 'T',
    nodes: [{ id: 'T', kind: 'task', label: 'run' }, ...Array.from({ length: 12 }, (_, i) => ({ id: `b${i}`, kind: 'branch' as const, label: `branch_number_${i}` }))],
    edges: Array.from({ length: 12 }, (_, i) => ({ from: 'T', to: `b${i}` }))
  }
  const centred = layoutDomain(wide)
  const first = layoutDomain(wide, { parentAlign: 'first' })
  checkInvariants(first)
  const x = (l: GraphLayout, id: string) => l.nodes.find(n => n.id === id)!.x
  const mid = (l: GraphLayout, id: string) => x(l, id) + l.nodes.find(n => n.id === id)!.w / 2
  assert.ok(x(centred, 'T') > 600, 'centred: the root is far right of the start')
  assert.ok(Math.abs(mid(first, 'T') - mid(first, 'b0')) < 1, 'first: over its first child')
  assert.ok(x(first, 'T') < 200)
})
