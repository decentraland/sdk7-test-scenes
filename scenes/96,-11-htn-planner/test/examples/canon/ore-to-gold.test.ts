// Ore to gold (src/examples/canon/crafting/ore_to_gold.domain): bevy_htn's miner. The story earns three gold from
// nothing, and the unguarded source shape (no `has_metal` guard on the sell method) shows why each branch states its
// reason under committing branch choice. (Every scenario and story: canon.test.ts.)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as nodePath from 'node:path'
import { decompose, formatTask, WorldState } from '../../../src/htn-planner'
import { addFacts, count, executed } from '../../../src/examples/canon/paper'
import { compileDomainSource } from '../../../tools/htn/compiler'
import { ROOT, station, storyRun } from './helpers'

const FILE = 'src/examples/canon/crafting/ore_to_gold.domain'

test('ore to gold: the story ends with the goal reached, three trips through the whole chain', () => {
  const run = storyRun('ore_to_gold/earn-three-gold-from-nothing')
  assert.equal(count(run.stage.agents[0].world, 'gold'), 3)
  const steps = executed(run.trace)
  assert.equal(steps.length, 24)
  assert.equal(steps.filter(s => s === '!sell_metal').length, 3)
})

test('ore to gold: the source’s unguarded sell method needs branch backtracking; the guard works in every mode', () => {
  // bevy_htn leaves "Convert metal to gold" without a precondition and relies on falling through when its child
  // fails. Without the guard, a miner with ore but no metal picks the sell method first: with branch backtracking
  // off it commits and there is no plan; with it on (the default mode ALL) the failed child falls through to smelting.
  const source = fs.readFileSync(nodePath.join(ROOT, FILE), 'utf8').replace(/\(sell_metal\s+\(and\s+\(has_metal\)\s+\)/, '(sell_metal ()')
  const unguarded = compileDomainSource(FILE, source.replace(/\(at_merchant\s+\(and/, '(at_merchant (and (has_metal)').replace(/\(walk_to_merchant\s+\(\)/, '(walk_to_merchant (and (has_metal))'))
  assert.ok(unguarded.ok)
  const world = new WorldState()
  addFacts(world, 'gold 0\nhas_ore\nlocation outside')
  const plan = (mode?: { factsAndAxioms: boolean; branches: boolean }) => {
    const r = decompose(unguarded.ir, world, 'earn_gold', [], { mode })
    return { status: r.status, plan: r.plan.map(p => formatTask(p.name, p.args)) }
  }
  assert.equal(plan({ factsAndAxioms: true, branches: false }).status, 'no_plan', 'committed to selling, nothing to sell')
  assert.deepEqual(plan({ factsAndAxioms: true, branches: true }).plan, ['!go_to smelter', '&ore_to_metal', '&earn_gold'], 'branch backtracking falls through')
  // The shipped domain plans the smelting in every mode.
  const r = decompose(station('ore_to_gold').domain, world, 'earn_gold', [], { mode: { factsAndAxioms: false, branches: false } })
  assert.deepEqual(r.plan.map(p => formatTask(p.name, p.args)), ['!go_to smelter', '&ore_to_metal', '&earn_gold'])
})
