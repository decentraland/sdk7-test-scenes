// The viewer's domain map: the domain as an AND/OR task decomposition graph (Bercher et al. 2017). A compound task
// is an OR node (pick one branch), a branch an AND node with its precondition chips (do its subtasks in order),
// primitives are leaves, recursion a back-edge, axioms and callterms side nodes on dashed edges. Around one task
// (its callers above, the tasks it calls closed) or the whole domain; a run's overlay marks the chosen path and the
// last branch that failed.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bool, int, sym } from '../../src/htn-planner/htn/atom'
import { branchChips, domainMap, mapOverlay } from '../../tools/viewer/model/domain-map'
import type { DomainMap } from '../../tools/viewer/model/domain-map'
import { planned } from './helpers'

const DOMAIN = `(:domain Map top_level_domain
  (:axiom (near ?inp_a) (and (pos ?inp_a ?p) (call close ?p)))
  (:method (run) top_level_method
    (fight (and (enemy ?e) (#near ?e)) ((!announce) (attack ?e)))
    (walk () ((patrol 3))))
  (:method (attack ?inp_e)
    (melee (and (weapon melee)) ((!swing ?inp_e)))
    (punch () ((!punch ?inp_e))))
  (:method (patrol ?inp_n)
    (step (and (> ?inp_n 0)) ((!step) (patrol (- ?inp_n 1))))
    (done () ((!rest)))))`

const FACTS = [
  ['enemy', int(7)],
  ['pos', int(7), int(2)]
] as const

/** `close` holds for any position. */
const OPTIONS = { callterms: { close: () => bool(true) } }

const ids = (m: DomainMap, kind: string) =>
  m.nodes
    .filter(n => n.kind === kind)
    .map(n => n.label)
    .sort()

test('around one task: the task as an OR node, its branches as AND nodes in order with chips, subtasks in order', () => {
  const p = planned(DOMAIN, FACTS, 'run', OPTIONS)
  const run = p.graph.methods.find(m => m.name === 'run')!
  const m = domainMap(p.graph, { focus: run.id })
  const focus = m.nodes.find(n => n.focus)!
  assert.deepEqual([focus.kind, focus.label], ['or', 'run'])
  const branches = m.edges.filter(e => e.from === focus.id && e.kind === 'branch').sort((a, b) => a.order - b.order)
  assert.deepEqual(
    branches.map(e => m.nodes.find(n => n.id === e.to)!.label),
    ['fight', 'walk']
  )
  const fight = m.nodes.find(n => n.label === 'fight')!
  assert.equal(fight.kind, 'and')
  assert.deepEqual(fight.chips, ['enemy', '#near'])
  const subtasks = m.edges.filter(e => e.from === fight.id && e.kind === 'subtask').sort((a, b) => a.order - b.order)
  assert.deepEqual(
    subtasks.map(e => m.nodes.find(n => n.id === e.to)!.label),
    ['announce', 'attack(e)']
  )
  const attack = m.nodes.find(n => n.label === 'attack(e)')!
  assert.equal(attack.closed, true, 'a called task stays closed: click it to focus')
  assert.deepEqual(ids(m, 'axiom'), ['near(a)'])
  assert.deepEqual(ids(m, 'callterm'), ['close'])
  const uses = m.edges.filter(e => e.kind === 'uses').map(e => `${e.from}->${e.to}`)
  assert.ok(uses.includes(`${fight.id}->${m.nodes.find(n => n.kind === 'axiom')!.id}`), 'the branch uses the axiom')
  assert.ok(uses.includes(`${m.nodes.find(n => n.kind === 'axiom')!.id}->${m.nodes.find(n => n.kind === 'callterm')!.id}`), 'the axiom calls the callterm')
})

test('the callers of a task above it; recursion a back-edge into the task', () => {
  const p = planned(DOMAIN, FACTS, 'run', OPTIONS)
  const patrol = p.graph.methods.find(m => m.name === 'patrol')!
  const m = domainMap(p.graph, { focus: patrol.id })
  const focus = m.nodes.find(n => n.focus)!
  const into = m.edges.filter(e => e.to === focus.id)
  const callers = into.filter(e => e.kind === 'subtask').map(e => m.nodes.find(n => n.id === e.from)!.label)
  assert.deepEqual(callers, ['walk'])
  assert.equal(m.nodes.find(n => n.label === 'run')!.closed, true)
  const back = into.filter(e => e.kind === 'back').map(e => m.nodes.find(n => n.id === e.from)!.label)
  assert.deepEqual(back, ['step'], 'step calls patrol again')
})

test('the whole domain: every task open from the top-level ones, primitives once per use, recursion as a back-edge', () => {
  const p = planned(DOMAIN, FACTS, 'run', OPTIONS)
  const m = domainMap(p.graph, { focus: null })
  assert.deepEqual(ids(m, 'or'), ['attack(e)', 'patrol(n)', 'run'])
  assert.ok(m.nodes.filter(n => n.kind === 'or').every(n => !n.closed))
  assert.deepEqual(ids(m, 'and'), ['done', 'fight', 'melee', 'punch', 'step', 'walk'])
  assert.deepEqual(ids(m, 'prim'), ['announce', 'punch', 'rest', 'step', 'swing'])
  assert.equal(m.edges.filter(e => e.kind === 'back').length, 1)
  assert.equal(new Set(m.nodes.map(n => n.id)).size, m.nodes.length, 'ids are unique')
  for (const e of m.edges) assert.ok(m.nodes.some(n => n.id === e.from) && m.nodes.some(n => n.id === e.to), e.id)
  const capped = domainMap(p.graph, { focus: null, maxNodes: 6 })
  assert.ok(capped.hidden > 0)
  assert.ok(capped.nodes.some(n => n.closed))
})

test('overlay of a run: the chosen path, the branches that failed and the last one', () => {
  const p = planned(DOMAIN, FACTS, 'run', OPTIONS)
  const m = domainMap(p.graph, { focus: null })
  const o = mapOverlay(m, p.run)
  const label = (id: string) => m.nodes.find(n => n.id === id)!.label
  assert.deepEqual([...o.chosen].map(label).sort(), ['announce', 'attack(e)', 'fight', 'punch', 'punch', 'run'].sort())
  assert.deepEqual([...o.failed].map(label), ['melee'])
  assert.equal(label(o.last!), 'melee')
  const fight = m.nodes.find(n => n.label === 'fight')!
  assert.ok(m.edges.some(e => e.from === fight.id && o.chosenEdges.has(e.id)))
  assert.deepEqual(mapOverlay(m, null).chosen.size, 0)
})

test('an unknown focus, an empty graph: no throw', () => {
  const p = planned(DOMAIN, FACTS, 'run', OPTIONS)
  assert.ok(domainMap(p.graph, { focus: 999 }).nodes.length > 0, 'falls back to the whole domain')
  const empty = domainMap({ ...p.graph, methods: [], branches: [], tasks: [], axioms: [], conds: [], topLevel: [], facts: [], callterms: [] }, { focus: null })
  assert.deepEqual(empty.nodes, [])
  void sym
})

test('chips: a fact with the values it is written with, a comparison as written, ¬ and # marked', () => {
  const p = planned(DOMAIN, FACTS, 'run', OPTIONS)
  const chips = (name: string) => branchChips(p.graph, p.graph.branches.find(b => b.name === name)!.id)
  assert.deepEqual(chips('melee'), ['weapon(melee)'])
  assert.deepEqual(chips('step'), ['n > 0'])
  assert.deepEqual(chips('fight'), ['enemy', '#near'])
  assert.deepEqual(chips('punch'), [])
})
