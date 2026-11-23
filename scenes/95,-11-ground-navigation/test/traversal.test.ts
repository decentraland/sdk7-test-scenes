import { describe, expect, it } from 'vitest'
import { TRAVERSAL_SCENARIOS } from '../src/traversal/registry'
import { createTraversalSimulation } from '../src/traversal/simulation'

it('registers each traversal fixture and its variants under stable, unique IDs', () => {
  const ids = TRAVERSAL_SCENARIOS.map((scenario) => scenario.id)
  expect(ids).toHaveLength(6)
  expect(new Set(ids).size).toBe(ids.length)
  for (const scenario of TRAVERSAL_SCENARIOS) {
    const variants = scenario.variants.map((variant) => variant.id)
    expect(variants.length).toBeGreaterThan(1)
    expect(new Set(variants).size).toBe(variants.length)
    expect(scenario.cases.length).toBeGreaterThan(0)
  }
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
