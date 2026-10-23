// Upstream use case: irreversible actions only after a plan is chosen, never in conditions (docs/USE_CASES.md:5-6,
// :104-106). Callterms run during decomposition, for candidates and branches the planner abandons too, and
// backtracking does not undo their effects (DOMAIN_LANGUAGE.md:185-188, :291-294; AXIOM_OVERLOADS.md:35-38). So:
// never delete facts mid-decomposition (DOMAIN_LANGUAGE.md:185). Domain: src/examples/usecases/reinforcements.domain.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bool, formatTask, int, sym, type Atom } from '../../src/htn-planner/htn/atom'
import { decompose, PlanRunner, type CallTerm } from '../../src/htn-planner/htn/planner'
import { WorldState } from '../../src/htn-planner/htn/world-state'
import type { ActionFactory, GuardEvent } from '../../src/htn-planner/npc/actions'
import { GuardAgent } from '../../src/htn-planner/npc/agent'
import { CLEAR_LINE_OF_SIGHT } from '../../src/htn-planner/npc/perception'
import { v3 } from '../../src/htn-planner/npc/vec'
import { reinforcementsDomain as domain } from '../../src/examples/usecases/reinforcements.htn'
import { compileDomainSource } from '../../tools/htn/compiler'

const name = (a: Atom) => String(a.v)

/** Spawn points a, b, c in that order; only c is clear. */
function spawnWorld(): WorldState {
  const w = new WorldState()
  for (const p of ['a', 'b', 'c']) w.add('spawn_point', sym(p))
  w.add('clear', sym('c'))
  return w
}

function plan(world: WorldState, method: string, callterms: Record<string, CallTerm> = {}) {
  const r = decompose(domain, world, method, [], { callterms })
  return { status: r.status, plan: r.plan.map(s => formatTask(s.name, s.args)) }
}

function spawner(spawned: string[]): Record<string, CallTerm> {
  return { spawn: args => (spawned.push(name(args[0])), bool(true)) }
}

test('irreversible: a spawn in a condition runs for every candidate the planner tries, also the rejected ones', () => {
  const spawned: string[] = []
  const r = plan(spawnWorld(), 'reinforce_in_condition', spawner(spawned))
  assert.deepEqual(r.plan, ['!announce c'])
  // a and b were tried and rejected (not clear), but they spawned; nothing undoes it.
  assert.deepEqual(spawned, ['a', 'b', 'c'])
})

test('irreversible: a spawn in a selected branch whose tasks fail stays, although the next branch wins', () => {
  const world = spawnWorld()
  world.add('route_blocked')
  const spawned: string[] = []
  const r = plan(world, 'reinforce_in_branch', spawner(spawned))
  assert.deepEqual(r.plan, ['!hold_position'])
  assert.deepEqual(spawned, ['c'], 'the abandoned branch spawned at c')
})

test('irreversible: a callterm runs again on every planner call; planning twice spawns twice', () => {
  const spawned: string[] = []
  const world = spawnWorld()
  plan(world, 'reinforce_in_condition', spawner(spawned))
  plan(world, 'reinforce_in_condition', spawner(spawned))
  assert.deepEqual(spawned, ['a', 'b', 'c', 'a', 'b', 'c'])
})

test('irreversible: the right way, a !spawn primitive, is rolled back with a failed branch and run once by the host', () => {
  // The route is open: the plan spawns at c; the host runs the step once, after the plan is chosen.
  const world = spawnWorld()
  const runner = new PlanRunner(domain, world)
  assert.equal(runner.plan('reinforce'), 'succeeded')
  const spawned: string[] = []
  const executed: string[] = []
  while (runner.resolve() === 'ready') {
    const step = runner.current()!
    executed.push(formatTask(step.name, step.args))
    if (step.name === '!spawn') spawned.push(name(step.args[0]))
    runner.complete()
  }
  assert.deepEqual(executed, ['!spawn c', '!march c'])
  assert.deepEqual(spawned, ['c'])

  // The route is blocked: !spawn was tentatively in the plan, the branch failed and took it out. Nothing spawned.
  world.add('route_blocked')
  assert.deepEqual(plan(world, 'reinforce').plan, ['!hold_position'])
})

/** Reserves a, b, c in that order; only b is ready. */
function reserveWorld(): WorldState {
  const w = new WorldState()
  for (const s of ['a', 'b', 'c']) w.add('reserve', sym(s))
  w.add('ready', sym('b'))
  return w
}

test('irreversible: deleting the enumerated fact mid-decomposition skips a candidate and the deletion stays', () => {
  const world = reserveWorld()
  const taken: string[] = []
  const callterms: Record<string, CallTerm> = {
    take_reserve: args => {
      const squad = name(args[0])
      taken.push(squad)
      world.removeWhere('reserve', 1, row => name(row[0]) === squad)
      return bool(true)
    }
  }
  const r = plan(world, 'deploy_taking_reserve', callterms)
  // b is ready, but deleting a shifted the rows under the enumeration: b was never tried (upstream too, see below).
  assert.deepEqual(taken, ['a', 'c'])
  assert.deepEqual(r.plan, ['!no_reserve'])
  // The branch that deleted them was abandoned; a and c are gone anyway.
  assert.deepEqual(world.rows('reserve', 1).map(row => name(row[0])), ['b'])
  // Without the deletion the same world state plans b.
  assert.deepEqual(plan(reserveWorld(), 'deploy_taking_reserve', { take_reserve: () => bool(true) }).plan, ['!deploy b'])
})

test('irreversible: a row added to the enumerated fact mid-decomposition is reached by the same query', () => {
  // Upstream retries a fact by scanning the live table again for its next solution
  // (HTNConditionContinuation.inl:192-213, HTNCCodeGenerator.cpp:874-937), so it reaches the added row as well.
  // Same for the deletion above: the retry takes the next solution of the shrunken table and skips one. The result
  // depends on row order: do not do it.
  const world = new WorldState()
  world.add('reserve', sym('a'))
  world.add('ready', sym('x'))
  const called: string[] = []
  const callterms: Record<string, CallTerm> = {
    call_in_reserve: args => {
      called.push(name(args[0]))
      if (called.length === 1) world.add('reserve', sym('x'))
      return bool(true)
    }
  }
  assert.deepEqual(plan(world, 'deploy_calling_in', callterms).plan, ['!deploy x'])
  assert.deepEqual(called, ['a', 'x'])
})

test('irreversible: deleting a non-matching row before the cursor skips no candidate (D12)', () => {
  // Upstream's retry asks for the next matching row of the table as it is now (the scan above): its n-th retry takes
  // the n-th matching row (target_solution, HTNCCodeGenerator.cpp:874-937). After x is gone it still reaches b.
  const world = new WorldState()
  world.add('posted', sym('x'), sym('far'))
  world.add('posted', sym('a'), sym('near'))
  world.add('posted', sym('b'), sym('near'))
  world.add('ready', sym('b'))
  let recalls = 0
  const callterms: Record<string, CallTerm> = {
    recall_far_posts: () => {
      recalls++
      world.removeWhere('posted', 2, row => name(row[1]) === 'far')
      return bool(true)
    }
  }
  assert.deepEqual(plan(world, 'deploy_recalling_far_posts', callterms).plan, ['!deploy b'])
  assert.equal(recalls, 2, 'a, then b')
  // A row of another fact changing does not move the enumeration either.
  const other = new WorldState()
  for (const s of ['a', 'b', 'c']) other.add('reserve', sym(s))
  other.add('ready', sym('c'))
  const seen: string[] = []
  const noisy: Record<string, CallTerm> = {
    take_reserve: args => (seen.push(name(args[0])), other.add('noise', sym('n')), bool(true))
  }
  assert.deepEqual(plan(other, 'deploy_taking_reserve', noisy).plan, ['!deploy c'])
  assert.deepEqual(seen, ['a', 'b', 'c'])
})

test('facts: a retry takes the n-th matching row of the live table, with the bindings it started with (D12)', () => {
  // (k ?x a) matches rows 1, 3, 4. Trying 3 deletes (k 2 b), a row it does not match, before the cursor: the
  // retry rescans and takes match number 2, row 4, as upstream (ours used to resume at a row index and miss it).
  // Trying 4 then deletes (k 1 a), a match before the cursor: the 3rd match of [3, 4] does not exist.
  const world = new WorldState()
  for (const [v, tag] of [[1, 'a'], [2, 'b'], [3, 'a'], [4, 'a']] as const) world.add('k', int(v), sym(tag))
  const tried: number[] = []
  const callterms: Record<string, CallTerm> = {
    probe: args => {
      const v = args[0].v as number
      tried.push(v)
      if (v === 3) world.removeWhere('k', 2, row => row[0].v === 2)
      if (v === 4) world.removeWhere('k', 2, row => row[0].v === 1)
      return bool(false)
    }
  }
  const text = `(:domain D top_level_domain
    (:method (m) top_level_method (b (and (k ?x a) (call probe ?x)) ((!ok ?x))) (f () ((!none)))))`
  const r = compileDomainSource('D.domain', text)
  assert.ok(r.ok)
  assert.deepEqual(decompose(r.ir, world, 'm', [], { callterms }).plan.map(s => formatTask(s.name, s.args)), ['!none'])
  assert.deepEqual(tried, [1, 3, 4])
})

test('irreversible: a host that plans candidates runs callterms for plans it drops (GuardAgent, USE_CASES 2)', () => {
  let planned = 0
  let key = 'calm'
  const events: GuardEvent[] = []
  const wait: ActionFactory = () => ({ start: () => 'running', update: () => 'running', cancel: () => {} })
  const agent = new GuardAgent({
    id: 'g',
    planner: world => new PlanRunner(domain, world, { callterms: { note_planning: () => (planned++, bool(true)) } }),
    lineOfSight: CLEAR_LINE_OF_SIGHT,
    start: { position: v3(0, 0, 0), yaw: 0 },
    actions: { '!wait': wait },
    syncFacts: () => key,
    onEvent: e => events.push(e)
  })
  agent.tick(0.1, [])
  key = 'changed' // a new key: the agent plans a candidate while !wait runs (after the 0.25 s throttle)
  for (let i = 0; i < 5; i++) agent.tick(0.1, [])
  const replans = events.filter((e): e is Extract<GuardEvent, { type: 'replan' }> => e.type === 'replan')
  assert.equal(replans.length, 2)
  assert.equal(replans[1].kept, true, 'the candidate repeats the running plan and is dropped')
  assert.equal(planned, 2, 'the dropped candidate ran the callterm too')
  assert.equal(agent.metrics.plansMade, 2)
})
