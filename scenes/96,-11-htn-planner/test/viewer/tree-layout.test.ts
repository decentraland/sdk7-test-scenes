// The refinement tree laid out left to right (a tidy tree): a parent beside its children, centred on them, children
// in the order tried from top to bottom; a closed node gets a fold stub; boxes never overlap.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { int, sym } from '../../src/htn-planner/htn/atom'
import { planTree } from '../../tools/viewer/model/plan-tree'
import { layoutTree, TreeBox } from '../../tools/viewer/model/tree-layout'
import { planned } from './helpers'

const measure = (text: string, size: number) => text.length * size * 0.6

const DOMAIN = `(:domain Lay top_level_domain
  (:method (run) top_level_method
    (a (and (x ?v) (> ?v 3)) ((!one ?v)))
    (b (and (y ?w)) ((!two) (sub ?w)))
    (c () ((!three))))
  (:method (sub ?inp_w)
    (s1 (and (z ?inp_w)) ((!four)))
    (s2 () ((!five ?inp_w)))))`

function boxes() {
  const p = planned(DOMAIN, [['x', int(1)], ['y', sym('k')]], 'run')
  const tree = planTree(p.run, p.graph)!
  return layoutTree(tree, { measure })
}

const overlap = (a: TreeBox, b: TreeBox) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

test('left to right: each child right of its parent, siblings top to bottom in order, the parent centred on them', () => {
  const l = boxes()
  const byTitle = new Map(l.boxes.map(b => [b.fig.title, b]))
  const root = byTitle.get('run')!
  const [a, b, c] = ['a', 'b', 'not tried'].map(t => byTitle.get(t)!)
  assert.ok(c, 'the untried branch c is a leaf')
  for (const k of [a, b, c]) assert.ok(k.x >= root.x + root.w + 20, `${k.fig.title} right of the root`)
  assert.ok(a.y + a.h <= b.y && b.y + b.h <= c.y, 'in the order tried')
  const mid = (k: TreeBox) => k.y + k.h / 2
  assert.ok(Math.abs(mid(root) - (a.y + (c.y + c.h)) / 2) < 1, 'centred on its children')
  assert.equal(l.edges.length, l.boxes.length - 1, 'one edge per child')
  for (let i = 0; i < l.boxes.length; i++) for (let j = i + 1; j < l.boxes.length; j++) assert.ok(!overlap(l.boxes[i], l.boxes[j]), `${l.boxes[i].fig.title} / ${l.boxes[j].fig.title}`)
  assert.ok(l.width >= Math.max(...l.boxes.map(k => k.x + k.w)))
  assert.ok(l.height >= Math.max(...l.boxes.map(k => k.y + k.h)))
})

test('a card is as tall as its lines and as wide as its longest line; long cards are cut with "+N more"', () => {
  const l = boxes()
  const a = l.boxes.find(b => b.fig.title === 'a')!
  assert.equal(a.lines.length, 2)
  assert.ok(a.h > l.boxes.find(b => b.fig.title === 'c' || b.fig.title === 'not tried')!.h)
  const many = layoutTree(
    { key: 'r', kind: 'branch', status: 'failed', title: 'r', lines: Array.from({ length: 20 }, (_, i) => ({ node: i, depth: 0, text: `fact_${i}(1)`, status: 'chosen' as const })), node: 0, children: [], open: true, hiddenFailures: 0 },
    { measure, maxLines: 6 }
  )
  assert.equal(many.boxes[0].lines.length, 5, 'the sixth row says how many more')
  assert.equal(many.boxes[0].more, 15)
})

test('a closed node with failures below it gets a stub "× N attempts" to its right', () => {
  const p = planned(
    `(:domain Back top_level_domain
  (:method (go) top_level_method
    (pick (and (item ?x)) ((use ?x)))
    (none () ((!give_up))))
  (:method (use ?inp_x)
    (ok (and (usable ?inp_x)) ((!use ?inp_x)))))`,
    [['item', sym('a')]],
    'go'
  )
  const l = layoutTree(planTree(p.run, p.graph)!, { measure })
  const pick = l.boxes.find(b => b.fig.title === 'pick')!
  assert.equal(l.stubs.length, 1)
  const stub = l.stubs[0]
  assert.equal(stub.key, pick.key)
  assert.equal(stub.text, '× 1 attempt')
  assert.ok(stub.x > pick.x + pick.w)
  assert.ok(!l.boxes.some(b => b.fig.title === 'use(a)'), 'the folded subtree is not laid out')
})
