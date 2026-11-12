// Domain variants of a level (src/playground/variants.ts): the same level with another shape of its NPCs' domain,
// chosen per run (LevelSim.variant, `npm run htn:level -- <level> --variant <name|all>`). The scene registers none;
// the one the tools register is 'flat', the frozen before shape of the stalker and the guard (test/fixtures/reference).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatLevelSet, parseLevelArgs, runLevel, runLevelSet } from '../../src/playground/headless'
import { DOMAIN_VARIANTS, variantSetup } from '../../src/playground/variants'
import { LEVELS } from '../../src/playgrounds'
import { StalkerLevel } from '../../src/playground/levels/stalker'
import { SightLevel } from '../../src/playground/levels/sight'
import { HelloLevel } from '../../src/playground/levels/hello'
import { stalkerDomain } from '../../src/examples/stalker/stalker.htn'
import { v3 } from '../../src/htn-planner'
import { FLAT_VARIANT } from '../fixtures/reference/variant'

test('the levels of the stalker and the guard run the live domains with their belief upkeep; level 11 its yard guards', () => {
  const names = new Map<number, string[]>()
  for (const p of LEVELS) {
    const level = p.make().init()
    names.set(level.info.number, level.crew.map(m => m.trace.domain.name))
    if ([5, 6, 7, 8, 9, 12].includes(level.info.number)) {
      for (const m of level.crew) assert.equal(m.chosenDepth, 2, `level ${level.info.number}: behaviour names one level down`)
    }
  }
  for (const n of [5, 6, 8, 9]) assert.ok(names.get(n)?.every(d => d === 'Guard'), `level ${n}: ${names.get(n)}`)
  for (const n of [7, 12]) assert.deepEqual(names.get(n), ['Stalker'], `level ${n}`)
  assert.deepEqual(names.get(11), ['YardGuard', 'YardGuard', 'YardGuard'])
  const stalker = new StalkerLevel().init()
  stalker.advanceTime(1)
  assert.ok(stalker.agent.metrics.reasoningMade > 0, 'the upkeep runs before every decision')
})

test('variants: flat replaces the stalker and guard domains, without upkeep, names at the root; another domain is left alone', () => {
  const live = { domain: stalkerDomain, start: { position: v3(0, 0, 0), yaw: 0 }, reasoning: 'reasoning', chosenDepth: 2 }
  const flat = variantSetup(live, FLAT_VARIANT)
  assert.equal(flat.domain.name, 'StalkerFlat')
  assert.equal(flat.reasoning, undefined)
  assert.equal(flat.chosenDepth, undefined)
  assert.equal(variantSetup(live, null), live)
  assert.deepEqual(DOMAIN_VARIANTS.map(v => v.name), [FLAT_VARIANT])
  assert.deepEqual(new StalkerLevel().init().variants().map(v => v.name), [FLAT_VARIANT])
  assert.deepEqual(new HelloLevel().init().variants(), [])
})

test('variants: a level on the variant plans with it, and its board names the root branch', () => {
  const level = new StalkerLevel()
  level.variant = FLAT_VARIANT
  level.init()
  assert.equal(level.agent.runner.domain?.name, 'StalkerFlat')
  level.advanceTime(1)
  assert.equal(level.chosen, 'walk_route', 'the root branch of the flat domain, the behaviour branch of the live one')
  assert.equal(level.agent.metrics.reasoningMade, 0)
  level.reset()
  assert.equal(level.variant, FLAT_VARIANT, 'reset keeps it')
})

test('variants: --variant on the command line; a run says which; a set runs the level and each variant side by side', () => {
  const args = parseLevelArgs(['7', '--variant', FLAT_VARIANT])
  assert.ok(!('error' in args) && args.variant === FLAT_VARIANT)
  assert.ok('error' in parseLevelArgs(['7', '--variant']))
  const r = runLevel(new SightLevel(), { seconds: 5, variant: FLAT_VARIANT })
  assert.equal(r.variant, FLAT_VARIANT)
  const set = runLevelSet(() => new SightLevel(), { seeds: [1], ablations: [null], domainVariants: [null, FLAT_VARIANT], seconds: 5 })
  assert.deepEqual(set.variants.map(v => v.variant ?? 'default'), ['default', FLAT_VARIANT])
  assert.match(formatLevelSet(set), /metric +default +flat/)
})
