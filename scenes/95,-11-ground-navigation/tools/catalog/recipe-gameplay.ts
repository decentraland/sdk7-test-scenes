import { gameplayRecipeDefinitions, makeNavcatGameplayNavigator } from '../../src/recipes/recipe-gameplay'
import type { GameplayNavigatorFactory } from '../../src/recipes/recipe-gameplay-support'
import { recipeBake } from '../../src/recipes/recipe-runtime-support'
import { createTraversalSimulation } from '../../src/traversal/simulation'
import { bakeDetourMesh, createDetourNavigatorFromMesh } from '../../test/detour'
import { check, type CatalogCase } from './types'

const detour: GameplayNavigatorFactory = (surfaces) =>
  createDetourNavigatorFromMesh(bakeDetourMesh(surfaces, recipeBake()))

export const gameplayRecipeCases: CatalogCase[] = gameplayRecipeDefinitions.map(({ caseId, variants, run, layer }) => ({
  id: caseId,
  layer,
  run(backend) {
    const makeNavigator = backend === 'navcat' ? makeNavcatGameplayNavigator : detour
    const metrics: Record<string, number> = {}
    const results = variants.map(({ id }) => {
      let bakeMs = 0
      let queryMs = 0
      let bakes = 0
      let queries = 0
      const fixture = run(id, (surfaces) => {
        const started = performance.now()
        const navigator = makeNavigator(surfaces)
        bakeMs += performance.now() - started
        bakes++
        return {
          ...navigator,
          route(from, to) {
            const queryStarted = performance.now()
            try {
              return navigator.route(from, to)
            } finally {
              queryMs += performance.now() - queryStarted
              queries++
            }
          }
        }
      })
      const sim = createTraversalSimulation(fixture)
      let frame = sim.frame()
      while (frame.verdict === 'running') frame = sim.tick()
      const result = { ...fixture.metrics, ticks: sim.ticks(), ...(bakes ? { bakeMs, queryMs, bakes, queries } : {}) }
      for (const [name, value] of Object.entries(result)) metrics[id + '.' + name] = value
      return { variant: id, verdict: frame.verdict, detail: frame.detail }
    })
    return { ...check(results.every(({ verdict }) => verdict === 'pass'), JSON.stringify(results)), metrics }
  }
}))
