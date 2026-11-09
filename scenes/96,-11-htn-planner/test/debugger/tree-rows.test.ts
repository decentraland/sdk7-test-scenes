// Tree rows of a real run (src/debugger/tree-rows.ts): guides, the window, one rich line per row with values,
// retry ×N and the rows a failed fact was checked against, and the watch.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decompose, int, PlanTraceRecorder, sym, viewRows, WorldState } from '../../src/htn-planner'
import { compileDomainSource } from '../../tools/htn/compiler'
import { maxOffset, revealOffset, rowRich, rowStatus, rowWindow, sameNode, treeGuides, watchOf, UNBOUND } from '../../src/debugger/tree-rows'

const DOMAIN = `
(:domain shop top_level_domain
    (:method (behave) top_level_method
        (buy
            (and (have_money ?m) (> ?m 10) (item ?i ?price) (<= ?price ?m))
            ((!buy ?i)))
        (wait () ((!wait)))))
`

function plan(setup: (w: WorldState) => void) {
  const r = compileDomainSource('shop.domain', DOMAIN)
  assert.ok(r.ok && r.ir, JSON.stringify(r.diagnostics))
  const domain = r.ir!
  const world = new WorldState()
  setup(world)
  const recorder = new PlanTraceRecorder(domain)
  decompose(domain, world, 'behave', [], { trace: recorder })
  return { run: recorder.lastPlan!, graph: recorder.graph }
}

test('treeGuides: lines, tees and elbows from the depths', () => {
  const depths = [0, 1, 2, 2, 1, 2].map(depth => ({ depth }))
  assert.deepEqual(treeGuides(depths), [[], ['tee'], ['line', 'tee'], ['line', 'elbow'], ['elbow'], ['none', 'elbow']])
  assert.deepEqual(treeGuides([]), [])
})

test('rowWindow, maxOffset and revealOffset clamp to the rows', () => {
  assert.deepEqual(rowWindow(100, 10, 30), { start: 10, end: 40 })
  assert.deepEqual(rowWindow(100, 95, 30), { start: 70, end: 100 })
  assert.deepEqual(rowWindow(100, -5, 30), { start: 0, end: 30 })
  assert.deepEqual(rowWindow(10, 3, 30), { start: 0, end: 10 })
  assert.equal(maxOffset(10, 30), 0)
  assert.equal(revealOffset(10, 5, 20), 5)
  assert.equal(revealOffset(10, 35, 20), 16)
  assert.equal(revealOffset(10, 15, 20), 10)
})

test('a fact matched on several rows: numbered choice rows, the committed one open, the values substituted', () => {
  const { run, graph } = plan(w => {
    w.add('have_money', int(20))
    w.add('item', sym('car'), int(500))
    w.add('item', sym('bread'), int(3))
  })
  assert.equal(run.status, 'succeeded')
  const rows = viewRows(run, 'normal')
  const text = (rs: typeof rows, values = true) => rs.map(r => rowRich(run, graph, r, { values }).replace(/<[^>]+>/g, ''))
  const lines = text(rows)
  assert.ok(lines.includes('✓  2/2 (item ?i=bread ?price=3)'), lines.join('\n'))
  assert.ok(lines.includes('✓  (‹= ?price=3 ?m=20)'), lines.join('\n'))
  assert.ok(lines.includes('✓  buy  branch'))
  const parent = rows.find(r => r.choice >= 0)!.choiceParent!
  const listed = text(viewRows(run, 'normal', { choice: new Map([[parent, -1]]) }))
  assert.ok(listed.includes('×  1/2 (item ?i=car ?price=500)'), listed.join('\n'))
  assert.ok(text(rows, false).includes('✓  2/2 (item ?i ?price)'))
})

test('a failed branch is folded; open, it shows the fact that found no rows', () => {
  const { run, graph } = plan(w => {
    w.add('have_money', int(20))
  })
  const text = (rs: ReturnType<typeof viewRows>) => rs.map(r => rowRich(run, graph, r, { values: true }).replace(/<[^>]+>/g, ''))
  assert.deepEqual(text(viewRows(run, 'normal')), ['✓  plan (behave)', '✓  (behave)', '×  buy  branch', '✓  wait  branch', '✓  (!wait)'])
  const buy = run.nodes.find(n => n.kind === 'branch' && !n.succeeded)!
  const lines = text(viewRows(run, 'normal', { open: new Map([[buy.id, true]]) }))
  assert.ok(lines.includes('×  (item ?i ?price)   no rows'), lines.join('\n'))
  const money = plan(w => w.add('have_money', int(5)))
  const failed = money.run.nodes.find(n => n.kind === 'cmp')!
  assert.equal(rowStatus(money.run, { node: failed.id, ok: false }), 'failed')
  const branch = money.run.nodes.find(n => n.kind === 'branch' && !n.succeeded)!
  assert.equal(rowStatus(money.run, { node: branch.id, ok: false }), 'failed', 'its condition failed')
  const pricey = plan(w => {
    w.add('have_money', int(20))
    w.add('item', sym('car'), int(500))
  })
  const cmp = pricey.run.nodes.find(n => n.kind === 'cmp' && !n.succeeded && n.name.startsWith('(<='))!
  const w = watchOf(pricey.run, pricey.graph, cmp.id)
  assert.equal(w.result, 'Failure')
  assert.deepEqual(w.vars.map(v => `${v.name} ${v.before} ${v.after}`), ['i car car', 'm 20 20', 'price 500 500'])
})

test('watch: variables Before / After, unbound before a fact binds them, rows checked by a failed fact', () => {
  const { run, graph } = plan(w => {
    w.add('have_money', int(20))
    w.add('item', sym('bread'), int(3))
  })
  const item = run.nodes.find(n => n.kind === 'fact' && n.name.startsWith('(item'))!
  const w = watchOf(run, graph, item.id)
  assert.equal(w.kind, 'fact')
  assert.equal(w.result, 'Success')
  assert.equal(w.source, 'shop.domain:5')
  const i = w.vars.find(v => v.name === 'i')!
  assert.equal(i.before, UNBOUND)
  assert.equal(i.after, 'bread')
  assert.ok(i.changed)
  const none = plan(w2 => w2.add('have_money', int(20)))
  const miss = none.run.nodes.find(n => n.kind === 'fact' && n.name.startsWith('(item'))!
  const mw = watchOf(none.run, none.graph, miss.id)
  assert.equal(mw.rowCount, 0)
  assert.deepEqual(mw.rows, [])
  const two = plan(w2 => {
    w2.add('have_money', int(1))
  })
  const has = two.run.nodes.find(n => n.kind === 'fact' && n.name.startsWith('(have_money'))!
  assert.equal(watchOf(two.run, two.graph, has.id).result, 'Success')
})

test('sameNode: two runs that decompose alike share node ids; another decomposition does not', () => {
  const a = plan(w => w.add('have_money', int(20)))
  const b = plan(w => w.add('have_money', int(20)))
  for (const n of a.run.nodes) assert.ok(sameNode(a.run, b.run, n.id))
  const c = plan(w => {
    w.add('have_money', int(20))
    w.add('item', sym('bread'), int(3))
  })
  const differs = a.run.nodes.filter(n => !sameNode(a.run, c.run, n.id))
  assert.ok(differs.length > 0)
  assert.ok(sameNode(a.run, c.run, 0), 'the plan node')
})
