// Bridge troll v1-v6 (src/examples/canon/bridge_troll): the series' lessons hold: the deferred rearm is needed
// without effect simulation, modelling `tired` as a fact is what keeps the recovery when the host replans, and each
// step keeps the previous step's vocabulary. (Every scenario and story: canon.test.ts.)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as nodePath from 'node:path'
import { decompose, WorldState } from '../../../src/htn-planner'
import { addFacts, executed } from '../../../src/examples/canon/paper'
import { compileDomainSource } from '../../../tools/htn/compiler'
import { CANON, primitivesOf, ROOT, storyRun } from './helpers'

const DIR = 'src/examples/canon/bridge_troll'

test('troll v3: the source shape, a direct self-call after the uproot, never plans the fresh trunk', () => {
  // Without effect simulation `trunk_health` still reads 0 when the self-call is decomposed, so `rearm` is picked
  // again and again; the deferred `&attack_enemy` in v3_rearm.domain reads the world after !uproot_trunk ran.
  const path = `${DIR}/v3_rearm.domain`
  const source = fs.readFileSync(nodePath.join(ROOT, path), 'utf8').replace('(&attack_enemy ?inp_enemy)', '(attack_enemy ?inp_enemy)')
  const compiled = compileDomainSource(path, source)
  assert.ok(compiled.ok, 'the direct form compiles')
  const world = new WorldState()
  addFacts(world, 'enemy_visible knight\ntrunk_health 0\ntrunk_nearby old_oak')
  const r = decompose(compiled.ir, world, 'be_troll', [], { maxDepth: 64 })
  assert.equal(r.status, 'depth_exceeded', 'rearm is chosen again at every level until the depth limit')
  assert.deepEqual(r.plan, [])

  // The shipped form: one rearm, then the deferred attack slams with the new trunk (the station's story).
  assert.ok(storyRun('v3_rearm/the-trunk-breaks-and-the-troll-rearms').trace.includes('expand &attack_enemy knight: !navigate_to knight, !trunk_slam knight'))
})

test('troll v5: the same replan cuts the recovery in the bug version and keeps it once tired is a fact', () => {
  const bug = storyRun('v5_combo_bug/combo-skips-the-recovery').trace
  const fixed = storyRun('v5_tired/the-recovery-survives-the-replan').trace
  const after = (trace: string[]) => trace[trace.findIndex(l => l.startsWith('event:')) + 1]
  assert.equal(after(bug), 'switch: !navigate_to knight, !whirlwind knight, !recover')
  assert.equal(after(fixed), 'keep: !recover')
  // The bug: no recovery between the slam and the whirlwind; the fix recovers first.
  assert.deepEqual(executed(bug).slice(1, 4), ['!trunk_slam knight', '!navigate_to knight', '!whirlwind knight'])
  assert.deepEqual(executed(fixed).slice(1, 5), ['!trunk_slam knight', '!recover', '!navigate_to knight', '!whirlwind knight'])
})

test('troll: each step keeps the previous step’s vocabulary (a series, not seven unrelated domains)', () => {
  // Every primitive of step N is in step N+1, so the diff between two files is the lesson.
  const steps = CANON.stations.filter(s => s.example === 'bridge_troll')
  assert.deepEqual(
    steps.map(s => s.id),
    ['v1_priority', 'v2_attack_task', 'v3_rearm', 'v4_last_seen', 'v5_combo_bug', 'v5_tired', 'v6_partial_plans']
  )
  const prims = steps.map(s => new Set(primitivesOf(s.domain)))
  for (let i = 1; i < prims.length; i++) for (const p of prims[i - 1]) assert.ok(prims[i].has(p), `${steps[i].id} dropped ${p}`)
})
