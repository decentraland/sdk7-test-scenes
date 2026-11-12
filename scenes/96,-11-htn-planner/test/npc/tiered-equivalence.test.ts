// The live stalker and guard domains (src/examples: belief upkeep in a `reasoning` method, tiers under `behave`)
// against the frozen before shape they were restructured from (test/fixtures/reference/stalker_flat.domain,
// guard_flat.domain: the "reference" here), decision by decision. The reference spends whole plans on bookkeeping branches; here a reference "decision" is
// settled first: its bookkeeping-only plans are applied and it plans again, and the instant bookkeeping steps a
// behaviour starts with (chase_ignoring_noise's !forget_noise) count as applied. The restructured one runs its
// reasoning to a fixpoint, then plans behave. The two must give the same behaviour plan; the upkeep it applies must
// include everything the reference applied (it may apply more: a rule the reference reaches only once its higher
// branches stop winning, e.g. dropping the focus mid-chase). The cases of test/npc/stalker-hearing.test.ts and of
// test/npc/scenario.test.ts's domain tests are rerun here on both, then sweeps over many worlds. The second half of
// the proof, a random visitor on both: node scripts/htn-variant-diff.mjs (variant 'flat').
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatTask } from '../../src/htn-planner/htn/atom'
import type { DomainIR } from '../../src/htn-planner/htn/ir'
import { decompose, decomposeDeferred, PlanStep } from '../../src/htn-planner/htn/planner'
import { GuardBlackboard } from '../../src/htn-planner/npc/blackboard'
import { stalkerFacts } from '../../src/examples/stalker/stalker-actions'
import { stalkerDomain } from '../../src/examples/stalker/stalker.htn'
import { guardDomain } from '../../src/examples/guard/guard.htn'
import { stalkerFlatDomain } from '../fixtures/reference/stalker_flat.htn'
import { guardFlatDomain } from '../fixtures/reference/guard_flat.htn'
import { sym } from '../../src/htn-planner/htn/atom'
import { v3 } from '../../src/htn-planner/npc/vec'
import { applyUpkeep as apply, fmt, UPKEEP } from './decide'

interface Decision {
  applied: string[]
  plan: string[]
}

/** The reference: bookkeeping-only plans applied and planned again; leading upkeep steps of the plan applied. */
function settleReference(domain: DomainIR, b: GuardBlackboard): Decision {
  const applied: string[] = []
  for (let i = 0; i < 8; i++) {
    const r = decompose(domain, b.world, 'behave', [])
    assert.equal(r.status, 'succeeded')
    let k = 0
    while (k < r.plan.length && r.plan[k].kind === 'primitive' && UPKEEP.has(r.plan[k].name)) {
      apply(b, r.plan[k])
      applied.push(formatTask(r.plan[k].name, r.plan[k].args))
      k++
    }
    if (k < r.plan.length || r.plan.length === 0) return { applied, plan: fmt(r.plan.slice(k)) }
  }
  assert.fail('the reference never settled')
}

/** The restructured one: reasoning to a fixpoint, then behave. */
function settleTiered(domain: DomainIR, b: GuardBlackboard): Decision {
  const applied: string[] = []
  for (let i = 0; i < 8; i++) {
    const r = decompose(domain, b.world, 'reasoning', [])
    if (r.status !== 'succeeded' || r.plan.length === 0) break
    for (const s of r.plan) {
      apply(b, s)
      applied.push(formatTask(s.name, s.args))
    }
    if (i === 7) assert.fail('reasoning never settled')
  }
  const r = decompose(domain, b.world, 'behave', [])
  assert.equal(r.status, 'succeeded')
  return { applied, plan: fmt(r.plan) }
}

/** Both domains on two copies of the same world; the restructured decision, after checking it is equivalent. */
function compare(reference: DomainIR, tiered: DomainIR, setup: (b: GuardBlackboard) => void, time = 10): Decision & { extra: string[] } {
  const make = () => {
    const b = new GuardBlackboard()
    b.setTime(time)
    b.setSelfPosition(v3(0, 0, 0))
    b.setVisible([])
    setup(b)
    return b
  }
  const ref = settleReference(reference, make())
  const tie = settleTiered(tiered, make())
  assert.deepEqual(tie.plan, ref.plan, `the same behaviour plan (reference applied ${ref.applied.join(', ') || 'nothing'}, upkeep ${tie.applied.join(', ') || 'nothing'})`)
  for (const a of ref.applied) assert.ok(tie.applied.includes(a), `upkeep includes the reference's ${a}`)
  return { ...tie, extra: tie.applied.filter(a => !ref.applied.includes(a)) }
}

// ---- stalker: the cases of test/npc/stalker-hearing.test.ts -------------------------------------------------

const stalker = (setup: (b: GuardBlackboard) => void, time?: number) => compare(stalkerFlatDomain, stalkerDomain, setup, time)
const seen = (b: GuardBlackboard, p = v3(0, 0, 12)) => b.setVisible([{ id: 'player', position: p, distance: 12 }])
const heard = (b: GuardBlackboard, time = 9, position = v3(8, 0, 0)) => {
  b.hear({ kind: 'impact', position, time, loudness: 0.5 })
  b.setAlert('alarmed')
}
const heardStep = (b: GuardBlackboard, time = 9, position = v3(8, 0, 0), loudness = 0.3) => {
  b.hear({ kind: 'steps', position, time, loudness })
  b.setAlert('wary')
}
const playerKinds = (b: GuardBlackboard) => stalkerFacts.setPlayerNoiseKinds(b.world, ['steps', 'run', 'land'])
const START = ['!hear (8.0 0.0 0.0) 9.0', '!stand 0.5', '!face (8.0 0.0 0.0)', '!stand 1.2', '!watch']
const GO_LOOK = ['!watch', '!face (8.0 0.0 0.0)', '!move_to (8.0 0.0 0.0) walk', '!look_around 4.0', '!forget_noise 9.0', '!unfocus']

test('tiered stalker: a new noise → the start; focused on it → walk there; a second stone its own start; focus without a noise dropped by upkeep', () => {
  assert.deepEqual(stalker(b => heard(b)).plan, START)
  assert.deepEqual(stalker(b => (heard(b), stalkerFacts.setFocus(b.world, 9))).plan, GO_LOOK)
  assert.equal(stalker(b => (stalkerFacts.setFocus(b.world, 9), heard(b, 11))).plan[0], '!hear (8.0 0.0 0.0) 11.0')
  const dropped = stalker(b => stalkerFacts.setFocus(b.world, 9))
  assert.deepEqual(dropped.applied, ['!unfocus'], 'the reference plans [!unfocus] here; upkeep does it')
  assert.deepEqual(dropped.plan, ['!stand 1.0'])
})

test('tiered stalker: on its route before watching, an unnoticed target in sight, a noise pulls it off; then the route again', () => {
  const route = (b: GuardBlackboard) => {
    b.setRoute([v3(0, 0, 4), v3(0, 0, 16)])
    stalkerFacts.setWatchPoint(b.world, 0)
    seen(b)
  }
  assert.deepEqual(stalker(b => (route(b), heard(b))).plan, START)
  assert.deepEqual(stalker(route).plan, ['!move_to (0.0 0.0 4.0) walk', '&after_waypoint 0'])
})

test('tiered stalker: seeing the target it hunts, a noise is dropped by upkeep and the chase goes on', () => {
  const d = stalker(b => (stalkerFacts.setNoticed(b.world, 'player'), seen(b), heard(b)))
  assert.deepEqual(d.applied, ['!forget_noise 9.0'])
  assert.deepEqual(d.plan, ['!chase player', '!catch player', '!stand 2.0'])
})

test('tiered stalker: watching and seeing an unnoticed target, it notices it, not the noise', () => {
  assert.equal(stalker(b => (stalkerFacts.setWatching(b.world), seen(b), heard(b))).plan[0], '!notice player')
})

test('tiered stalker: a noise heard before it lost sight is stale (upkeep); one heard after it wins over the search', () => {
  const before = stalker(b => {
    stalkerFacts.setNoticed(b.world, 'player')
    b.remember({ id: 'player', position: v3(5, 0, 6), time: 9.5 })
    heard(b, 9)
  })
  assert.deepEqual(before.applied, ['!forget_noise 9.0'])
  assert.equal(before.plan[0], '!move_to (5.0 0.0 6.0) hurry')
  const after = (b: GuardBlackboard) => {
    stalkerFacts.setNoticed(b.world, 'player')
    b.remember({ id: 'player', position: v3(5, 0, 6), time: 8 })
  }
  assert.deepEqual(stalker(b => (after(b), heard(b, 9))).plan, START)
  assert.equal(stalker(after).plan[0], '!move_to (5.0 0.0 6.0) hurry', 'then the search of the last seen spot')
})

test('tiered stalker: an old noise is forgotten by upkeep; after giving up it ignores noises', () => {
  const stale = stalker(b => heard(b, 9), 40)
  assert.deepEqual(stale.applied, ['!forget_noise 9.0'])
  assert.deepEqual(stale.plan, ['!stand 1.0'])
  const leaving = stalker(b => (stalkerFacts.setGaveUp(b.world, 'player', v3(30, 0, 30)), heard(b)))
  assert.deepEqual(leaving.plan, ['!move_to (30.0 0.0 30.0) walk', '!despawn'])
})

test("tiered stalker: the player's footstep → the same start; the next one while investigating re-targets without a start", () => {
  assert.deepEqual(stalker(b => (playerKinds(b), heardStep(b))).plan, START)
  const retarget = stalker(b => {
    playerKinds(b)
    stalkerFacts.setFocus(b.world, 9)
    heardStep(b, 9.5, v3(8, 0, 2))
  })
  assert.deepEqual(retarget.plan, ['!refocus 9.5', '!watch', '!face (8.0 0.0 2.0)', '!move_to (8.0 0.0 2.0) walk', '!look_around 4.0', '!forget_noise 9.5', '!unfocus'])
  assert.equal(stalker(b => (playerKinds(b), stalkerFacts.setFocus(b.world, 9), heard(b, 10))).plan[0], '!hear (8.0 0.0 0.0) 10.0')
})

test('tiered stalker: a loud noise close by → spin round at once; hunting a lost target, footsteps → hurry after them', () => {
  assert.deepEqual(stalker(b => (playerKinds(b), heardStep(b, 9, v3(-3, 0, 0), 0.7))).plan, ['!hear (-3.0 0.0 0.0) 9.0', '!face (-3.0 0.0 0.0) quick', '!watch'])
  const hunting = stalker(b => {
    playerKinds(b)
    stalkerFacts.setNoticed(b.world, 'player')
    b.remember({ id: 'player', position: v3(5, 0, 6), time: 8 })
    heardStep(b, 9, v3(8, 0, 0))
  })
  assert.deepEqual(hunting.plan, ['!refocus 9.0', '!face (8.0 0.0 0.0) quick', '!move_to (8.0 0.0 0.0) hurry', '!look_around 4.0', '!forget_noise 9.0', '!unfocus'])
})

test("tiered stalker: on the crossing before it watches, the player's noise is dropped by upkeep; once it watches, it hears it", () => {
  const crossing = (b: GuardBlackboard) => {
    playerKinds(b)
    b.setRoute([v3(0, 0, 4), v3(0, 0, 16)])
    stalkerFacts.setWatchPoint(b.world, 0)
    heardStep(b, 9, v3(8, 0, 0), 0.8)
  }
  const d = stalker(crossing)
  assert.deepEqual(d.applied, ['!forget_noise 9.0'])
  assert.deepEqual(d.plan, ['!move_to (0.0 0.0 4.0) walk', '&after_waypoint 0'])
  assert.equal(stalker(b => (crossing(b), stalkerFacts.setWatching(b.world))).plan[0], '!hear (8.0 0.0 0.0) 9.0')
})

test('tiered stalker: the deferred after_waypoint expands as the reference one (the round, the peer at the crossing)', () => {
  const b = new GuardBlackboard()
  b.setTime(1)
  b.setVisible([])
  const mid = v3(0, 0, 0)
  b.setRoute([mid, v3(6, 0, 0), mid, v3(-6, 0, 0)])
  stalkerFacts.setWatching(b.world)
  stalkerFacts.setPatrol(b.world, [3, 3, 3, 3], [v3(0, 0, -12), null, v3(0, 0, -12), null])
  for (let i = 0; i < 4; i++) {
    b.setWaypoint(i)
    const expand = (d: DomainIR) => {
      const plan = decompose(d, b.world, 'behave', []).plan
      return fmt(decomposeDeferred(d, b.world, plan[1] as Extract<PlanStep, { kind: 'deferred' }>).plan)
    }
    assert.deepEqual(expand(stalkerDomain), expand(stalkerFlatDomain), `waypoint ${i}`)
  }
})

// ---- guard: the domain cases of test/npc/scenario.test.ts -------------------------------------------------

const guard = (setup: (b: GuardBlackboard) => void, time?: number) => compare(guardFlatDomain, guardDomain, setup, time)
const guardHeard = (b: GuardBlackboard, level: 'wary' | 'alarmed', loudness: number, time = 9) => {
  b.hear({ kind: 'run', position: v3(5, 0, -6), time, loudness })
  b.setAlert(level)
}

test('tiered guard: patrol, chase, a fresh memory investigated, a stale one forgotten by upkeep, idle without a route', () => {
  assert.deepEqual(guard(b => b.setRoute([v3(1, 0, 2), v3(4, 0, 2)])).plan, ['!move_to (1.0 0.0 2.0) walk', '!wait 1.0', '&advance_patrol'])
  assert.deepEqual(guard(b => b.setVisible([{ id: 'player', position: v3(0, 0, 5), distance: 5 }])).plan, ['!chase player', '!catch player', '!wait 1.5'])
  const memory = (b: GuardBlackboard) => (b.setRoute([v3(1, 0, 2)]), b.remember({ id: 'player', position: v3(5, 0, 6), time: 9 }))
  assert.deepEqual(guard(memory).plan, ['!move_to (5.0 0.0 6.0) hurry', '!look_around 3.0', '!forget player'])
  const stale = guard(memory, 29.5)
  assert.deepEqual(stale.applied, ['!forget player'])
  assert.deepEqual(stale.plan, ['!move_to (1.0 0.0 2.0) walk', '!wait 1.0', '&advance_patrol'])
  assert.deepEqual(guard(() => {}).plan, ['!wait 1.0'])
})

test('tiered guard: faint → listen; alarming → hurry or run there; seeing beats hearing; alarming beats a memory, faint does not', () => {
  const route = (b: GuardBlackboard) => b.setRoute([v3(1, 0, 2)])
  assert.deepEqual(guard(b => (route(b), guardHeard(b, 'wary', 0.2))).plan, ['!turn_to (5.0 0.0 -6.0)', '!listen 2.0', '!forget_noise 9.0'])
  assert.deepEqual(guard(b => (route(b), guardHeard(b, 'alarmed', 0.6))).plan, [
    '!turn_to (5.0 0.0 -6.0)', '!listen 0.6', '!move_to (5.0 0.0 -6.0) hurry', '!look_around 3.0', '!forget_noise 9.0'
  ])
  assert.equal(guard(b => (route(b), guardHeard(b, 'alarmed', 0.8))).plan[2], '!move_to (5.0 0.0 -6.0) run')
  assert.equal(guard(b => (route(b), guardHeard(b, 'alarmed', 0.9), b.setVisible([{ id: 'player', position: v3(4, 0, 4), distance: 5 }]))).plan[0], '!chase player')
  const memory = (b: GuardBlackboard) => (route(b), b.remember({ id: 'player', position: v3(8, 0, 8), time: 9 }))
  assert.equal(guard(b => (memory(b), guardHeard(b, 'alarmed', 0.6))).plan[0], '!turn_to (5.0 0.0 -6.0)')
  assert.equal(guard(b => (memory(b), guardHeard(b, 'wary', 0.2))).plan[0], '!move_to (8.0 0.0 8.0) hurry')
  const stale = guard(b => (route(b), guardHeard(b, 'alarmed', 0.9, 9)), 21.5)
  assert.deepEqual(stale.applied, ['!forget_noise 9.0'])
})

// ---- sweeps: every combination of a set of facts --------------------------------------------------------------

/** Every combination of the options, one value per dimension. */
function* product<T extends Record<string, readonly unknown[]>>(dims: T): Generator<{ [K in keyof T]: T[K][number] }> {
  const keys = Object.keys(dims) as (keyof T)[]
  const idx = keys.map(() => 0)
  for (;;) {
    yield Object.fromEntries(keys.map((k, i) => [k, dims[k][idx[i]]])) as { [K in keyof T]: T[K][number] }
    let i = 0
    while (i < keys.length && ++idx[i] === dims[keys[i]].length) idx[i++] = 0
    if (i === keys.length) return
  }
}

type TargetState = 'none' | 'far' | 'close' | 'front' | 'lost_old' | 'lost_new'

function placeTarget(b: GuardBlackboard, id: string, state: TargetState, noticed: boolean, sheltered: boolean, visible: { id: string; position: ReturnType<typeof v3>; distance: number }[]): void {
  const w = b.world
  if (noticed) stalkerFacts.setNoticed(w, id)
  if (state === 'lost_old' || state === 'lost_new') {
    b.remember({ id, position: v3(5, 0, id === 'player' ? 6 : -6), time: state === 'lost_old' ? 20 : 38 })
    if (sheltered) w.add('target_sheltered', sym(id))
    return
  }
  if (state === 'none') return
  visible.push({ id, position: v3(0, 0, id === 'player' ? 12 : -12), distance: 12 })
  if (state === 'close' || state === 'front') w.add('target_close', sym(id))
  if (state === 'front') w.add('target_in_front', sym(id))
}

const NOISES = ['none', 'impact_quiet', 'impact_loud', 'steps', 'steps_loud', 'stale', 'before_sighting'] as const

function hearNoise(b: GuardBlackboard, noise: (typeof NOISES)[number]): number | null {
  if (noise === 'none') return null
  const time = noise === 'stale' ? 5 : noise === 'before_sighting' ? 15 : 35
  const kind = noise.startsWith('steps') ? 'steps' : 'impact'
  const loudness = noise === 'impact_loud' || noise === 'steps_loud' ? 0.7 : 0.3
  b.hear({ kind, position: v3(8, 0, 0), time, loudness })
  return time
}

function sweepStalker(dims: Record<string, readonly unknown[]>, twoTargets: boolean): { worlds: number; extra: Map<string, number> } {
  const extra = new Map<string, number>()
  let worlds = 0
  for (const c of product(dims)) {
    const setup = (b: GuardBlackboard) => {
      const w = b.world
      playerKinds(b)
      const visible: { id: string; position: ReturnType<typeof v3>; distance: number }[] = []
      placeTarget(b, 'player', c.player as TargetState, c.noticed as boolean, c.sheltered as boolean, visible)
      if (twoTargets) placeTarget(b, 'tester', c.tester as TargetState, c.testerNoticed as boolean, false, visible)
      b.setVisible(visible)
      const heardAt = hearNoise(b, c.noise as (typeof NOISES)[number])
      if (c.focus === 'same' && heardAt !== null) stalkerFacts.setFocus(w, heardAt)
      if (c.focus === 'other') stalkerFacts.setFocus(w, 1)
      if (c.watching) stalkerFacts.setWatching(w)
      if (c.watchPoint) stalkerFacts.setWatchPoint(w, 0)
      if (c.caught) stalkerFacts.setCaught(w, 'player')
      if (c.gaveUp) stalkerFacts.setGaveUp(w, 'player', v3(30, 0, 30))
      if (c.route === 'walking') b.setRoute([v3(0, 0, 4), v3(0, 0, 16)])
      if (c.route === 'walked') {
        b.setRoute([v3(0, 0, 4), v3(0, 0, 16)])
        b.setWaypoint(2)
      }
    }
    worlds++
    let d: ReturnType<typeof stalker>
    try {
      d = stalker(setup, 40)
    } catch (e) {
      throw new Error(`world ${JSON.stringify(c)}: ${(e as Error).message}`)
    }
    for (const a of d.extra) {
      const rule = a.split(' ')[0]
      extra.set(rule, (extra.get(rule) ?? 0) + 1)
    }
  }
  return { worlds, extra }
}

test('tiered stalker sweep, one target: the same behaviour plan in every world; extra upkeep only where a higher reference branch wins', () => {
  const { worlds, extra } = sweepStalker(
    {
      player: ['none', 'far', 'close', 'front', 'lost_old', 'lost_new'],
      noticed: [false, true],
      sheltered: [false, true],
      noise: NOISES,
      focus: ['none', 'same', 'other'],
      watching: [false, true],
      watchPoint: [false, true],
      caught: [false, true],
      gaveUp: [false, true],
      route: ['standing', 'walking', 'walked']
    },
    false
  )
  assert.equal(worlds, 6 * 2 * 2 * 7 * 3 * 2 * 2 * 2 * 2 * 3)
  // Upkeep the reference does not do (yet) in that world: it plans a higher branch (finish, chase, notice) first.
  assert.deepEqual([...extra.keys()].sort(), ['!forget', '!forget_noise', '!unfocus'])
})

test('tiered stalker sweep, two targets: the same behaviour plan in every world', () => {
  const { worlds } = sweepStalker(
    {
      player: ['none', 'far', 'close', 'lost_old', 'lost_new'],
      noticed: [false, true],
      sheltered: [false, true],
      tester: ['none', 'far', 'close', 'lost_new'],
      testerNoticed: [false, true],
      noise: ['none', 'impact_quiet', 'steps', 'before_sighting'],
      focus: ['none', 'same'],
      watching: [false, true],
      watchPoint: [false],
      caught: [false],
      gaveUp: [false],
      route: ['standing', 'walking']
    },
    true
  )
  assert.equal(worlds, 5 * 2 * 2 * 4 * 2 * 4 * 2 * 2 * 2)
})

test('tiered guard sweep: the same behaviour plan in every world', () => {
  let worlds = 0
  for (const c of product({
    target: ['none', 'visible', 'lost_fresh', 'lost_stale'],
    noise: ['none', 'faint', 'loud', 'very_loud', 'stale'],
    alert: ['calm', 'wary', 'alarmed'],
    route: [false, true]
  } as const)) {
    worlds++
    guard(b => {
      if (c.target === 'visible') b.setVisible([{ id: 'player', position: v3(0, 0, 5), distance: 5 }])
      if (c.target === 'lost_fresh') b.remember({ id: 'player', position: v3(5, 0, 6), time: 25 })
      if (c.target === 'lost_stale') b.remember({ id: 'player', position: v3(5, 0, 6), time: 5 })
      if (c.noise !== 'none') b.hear({ kind: 'run', position: v3(5, 0, -6), time: c.noise === 'stale' ? 10 : 28, loudness: c.noise === 'faint' ? 0.2 : c.noise === 'loud' ? 0.6 : 0.8 })
      b.setAlert(c.alert)
      if (c.route) b.setRoute([v3(1, 0, 2), v3(4, 0, 2)])
    }, 30)
  }
  assert.equal(worlds, 4 * 5 * 3 * 2)
})

test('tiered stalker: unnoticed far target intentionally requires branch backtracking to reach patrol', () => {
  const b = new GuardBlackboard()
  b.setTime(10)
  b.setSelfPosition(v3(0, 0, 0))
  b.setRoute([v3(0, 0, 4), v3(0, 0, 16)])
  stalkerFacts.setWatchPoint(b.world, 0)
  seen(b)
  for (const branches of [true, false]) {
    const r = decompose(stalkerDomain, b.world, 'behave', [],
      { mode: { factsAndAxioms: true, branches } })
    assert.equal(r.status, branches ? 'succeeded' : 'no_plan')
    assert.deepEqual(fmt(r.plan), branches ? ['!move_to (0.0 0.0 4.0) walk', '&after_waypoint 0'] : [])
  }
})
