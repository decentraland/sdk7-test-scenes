// The Domain tab's graph (src/debugger/domain-focus.ts): a focus view around one method, the full domain capped,
// precondition chips, and a run's overlay (chosen path, failed branches).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decompose, domainGraph, int, PlanTraceRecorder, sym, WorldState } from '../../src/htn-planner'
import { compileDomainSource } from '../../tools/htn/compiler'
import { complexScenarioDomain } from '../../src/examples/upstream/generated/complex_scenario.htn'
import { branchChips, branchNode, callers, focusModel, fullModel, methodNode, parseNode, runOverlay } from '../../src/debugger/domain-focus'
import { rowStatus } from '../../src/debugger/tree-rows'

const DOMAIN = `
(:domain errands top_level_domain
    (:method (behave) top_level_method
        (shop
            (and (money ?m) (> ?m 10) (not (closed shop)))
            ((go_to shop) (!buy bread)))
        (rest () ((!sleep))))
    (:method (go_to ?inp_place)
        (walk (and (path ?inp_place)) ((!walk ?inp_place)))
        (wait () ((!wait) (go_to ?inp_place)))))
`

function compiled() {
  const r = compileDomainSource('errands.domain', DOMAIN)
  assert.ok(r.ok && r.ir, JSON.stringify(r.diagnostics))
  return r.ir!
}

test('chips: facts by name, ¬ for not, comparisons as written', () => {
  const g = domainGraph(compiled())
  const shop = g.branches.find(b => b.name === 'shop')!
  assert.deepEqual(branchChips(g, shop.id), ['money', '(> ?m 10)', '¬closed'])
  assert.deepEqual(branchChips(g, g.branches.find(b => b.name === 'rest')!.id), [])
})

test('focus: the method, its branches and tasks, called methods closed, the branches that call it', () => {
  const g = domainGraph(compiled())
  const goTo = g.methods.find(m => m.name === 'go_to')!.id
  const behave = g.methods.find(m => m.name === 'behave')!.id
  assert.deepEqual(callers(g, goTo).map(b => g.branches[b].name), ['shop', 'wait'])
  const f = focusModel(g, goTo)
  assert.deepEqual(f.expanded, [goTo])
  assert.deepEqual(f.closed, [behave])
  assert.equal(f.model.root, methodNode(behave), 'drawn from its caller down')
  const labels = f.model.nodes.map(n => `${n.kind}:${n.label}`)
  assert.deepEqual(labels, ['task:behave', 'branch:shop', 'task:go_to', 'branch:walk', 'primitive:!walk', 'branch:wait', 'primitive:!wait'])
  const wait = branchNode(g.branches.find(b => b.name === 'wait')!.id)
  assert.ok(f.model.edges.some(e => e.from === wait && e.to === methodNode(goTo)), 'the recursion edge')
  assert.deepEqual(parseNode(methodNode(goTo)), { kind: 'method', id: goTo })
  const top = focusModel(g, behave)
  assert.deepEqual(top.closed, [goTo])
  assert.equal(top.hidden, 0)
})

test('full: every method from the top level; a cap leaves the rest closed', () => {
  const g = domainGraph(complexScenarioDomain)
  const all = fullModel(g, 10000)
  assert.equal(all.closed.length, 0)
  assert.equal(all.hidden, 0)
  const capped = fullModel(g, 20)
  assert.ok(capped.hidden > 0)
  assert.ok(capped.model.nodes.length < all.model.nodes.length)
})

test('overlay: the committed methods and branches, the branches that failed, the last one apart', () => {
  const domain = compiled()
  const world = new WorldState()
  world.add('money', int(20))
  world.add('path', sym('shop'))
  const rec = new PlanTraceRecorder(domain)
  decompose(domain, world, 'behave', [], { trace: rec })
  const g = rec.graph
  const id = (name: string) => branchNode(g.branches.find(b => b.name === name)!.id)
  const o = runOverlay(rec.lastPlan)
  assert.deepEqual([...o.chosen].sort(), [methodNode(0), methodNode(1), id('shop'), id('walk')].sort())
  assert.equal(o.failed.size, 0)
  assert.equal(o.last, null)

  world.add('closed', sym('shop'))
  decompose(domain, world, 'behave', [], { trace: rec })
  const shut = runOverlay(rec.lastPlan)
  assert.deepEqual([...shut.chosen].sort(), [methodNode(0), id('rest')].sort())
  assert.deepEqual([...shut.failed], [id('shop')])
  assert.equal(shut.last, id('shop'))
  assert.equal(runOverlay(null).chosen.size, 0)
})

test('a branch whose condition held but whose tasks failed is abandoned (orange), not failed', () => {
  const domain = compiled()
  const world = new WorldState()
  world.add('money', int(20))
  world.add('path', sym('market')) // go_to shop: walk finds no path, wait recurses, the depth runs out
  const rec = new PlanTraceRecorder(domain)
  decompose(domain, world, 'behave', [], { trace: rec, maxDepth: 12 })
  const run = rec.lastPlan!
  const shop = run.nodes.find(n => n.kind === 'branch' && rec.graph.branches[n.ref].name === 'shop')!
  assert.equal(run.status, 'depth_exceeded')
  assert.equal(rowStatus(run, { node: shop.id, ok: false }), 'abandoned')
})
