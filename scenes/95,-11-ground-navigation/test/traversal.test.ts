import { describe, expect, it } from 'vitest'
import { TRAVERSAL_CASE_REQUIREMENTS, traversalCaseIds } from '../src/traversal/catalog-coverage'
import { TRAVERSAL_SCENARIOS } from '../src/traversal/registry'
import { createTraversalSimulation } from '../src/traversal/simulation'

it('registers each traversal fixture and its variants under stable, unique IDs', () => {
  const ids = TRAVERSAL_SCENARIOS.map((scenario) => scenario.id)
  expect(new Set(ids).size).toBe(ids.length)
  for (const requirement of TRAVERSAL_CASE_REQUIREMENTS) {
    const scenario = TRAVERSAL_SCENARIOS.find(({ id }) => id === requirement.scenario)
    expect(scenario, requirement.id).toBeDefined()
    for (const variant of requirement.variants) {
      expect(scenario?.variants.some(({ id }) => id === variant), requirement.id + ' ' + variant).toBe(true)
    }
  }
  for (const scenario of TRAVERSAL_SCENARIOS) {
    const variants = scenario.variants.map((variant) => variant.id)
    expect(variants.length).toBeGreaterThan(0)
    expect(new Set(variants).size).toBe(variants.length)
    for (const variant of variants) {
      expect(traversalCaseIds(scenario.id, variant), scenario.id + ' ' + variant).not.toHaveLength(0)
    }
    expect(new Set(variants.flatMap((variant) => traversalCaseIds(scenario.id, variant)))).toEqual(new Set(scenario.cases))
  }
})

it('limits the beam timing requirement to the standing and moved-beam variants', () => {
  expect(traversalCaseIds('run-up-jump', 'ready')).not.toContain('GAME-T03')
  expect(traversalCaseIds('run-up-jump', 'clear-beam')).toContain('GAME-T03')
  expect(traversalCaseIds('run-up-jump', 'moving-beam')).toContain('GAME-T03')
})

for (const scenario of TRAVERSAL_SCENARIOS) {
  describe(scenario.label, () => {
    for (const variant of scenario.variants) {
      it(variant.label, () => {
        const simulation = createTraversalSimulation(scenario.create(variant.id))
        const initial = simulation.frame()
        expect(initial.verdict).toBe('running')
        expect(initial.bots.length).toBeGreaterThan(0)

        let final = initial
        while (final.verdict === 'running') {
          final = simulation.tick()
          for (const bot of final.bots) {
            expect(bot.feet.every(Number.isFinite), bot.id).toBe(true)
          }
        }
        expect(final.verdict, final.phase + ': ' + final.detail).toBe('pass')
        expect(simulation.tick()).toBe(final)
        expect(scenario.create(variant.id).frame()).toEqual(initial)
      })
    }
  })
}
