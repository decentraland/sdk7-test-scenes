// The watch's "why" lines (src/debugger/why-rows.ts) on a real run: a method row lists its branches, a branch row its
// failing terms with needed vs the world's rows, a failed fact its own reason; nothing for a primitive task.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decompose, int, PlanTraceRecorder, sym, WorldState } from '../../src/htn-planner'
import { compileDomainSource } from '../../tools/htn/compiler'
import { whyLines } from '../../src/debugger/why-rows'

const DOMAIN = `
(:domain shop top_level_domain
    (:method (behave) top_level_method
        (buy (and (item ?i ?price) (<= ?price 20)) ((!buy ?i)))
        (enter (and (door_open store)) ((!enter)))
        (wait () ((!wait)))
        (later () ((!never)))))
`

function setup() {
  const r = compileDomainSource('shop.domain', DOMAIN)
  assert.ok(r.ok && r.ir)
  const domain = r.ir!
  const world = new WorldState()
  world.add('item', sym('car'), int(500))
  world.add('door_open', sym('back'))
  const recorder = new PlanTraceRecorder(domain)
  decompose(domain, world, 'behave', [], { trace: recorder })
  const run = recorder.lastPlan!
  const plain = (id: number, max?: number) => whyLines(domain, run, id, rev => recorder.world(rev), max).map(l => l.replace(/<[^>]+>/g, ''))
  return { run, plain, domain }
}

test('a method row: every branch, with its first failing term, the chosen one, the ones behind it', () => {
  const { run, plain } = setup()
  const method = run.nodes.find(n => n.kind === 'method')!
  assert.deepEqual(plain(method.id), [
    '× behave.buy  (‹= ?price=500 20)  false',
    '× behave.enter  (door_open store)  no row matches (door_open store); 1 row of door_open/1, closest (door_open back): arg 1 is back, not store',
    '✓ behave.wait  chosen',
    '· behave.later  not reached: behave.wait succeeded first'
  ])
})

test('a branch row: its attempt and the failing terms; a failed fact: its reason; a primitive task: nothing', () => {
  const { run, plain, domain } = setup()
  const enter = run.nodes.find(n => n.kind === 'branch' && n.name.startsWith('(enter'))!
  assert.deepEqual(plain(enter.id), [
    '× condition failed in (behave): (door_open store) no row matches (door_open store); 1 row of door_open/1, closest (door_open back): arg 1 is back, not store',
    '   × (door_open store)  no row matches (door_open store); 1 row of door_open/1, closest (door_open back): arg 1 is back, not store'
  ])
  const fact = run.nodes.find(n => n.kind === 'fact' && n.name === '(door_open store)')!
  assert.equal(plain(fact.id).length, 1)
  const task = run.nodes.find(n => n.kind === 'task')!
  assert.deepEqual(plain(task.id), [])
  assert.deepEqual(whyLines(domain, run, 999), [])
  const method = run.nodes.find(n => n.kind === 'method')!
  const cut = plain(method.id, 2)
  assert.equal(cut.length, 2)
  assert.match(cut[1], /^… 3 more/)
})
