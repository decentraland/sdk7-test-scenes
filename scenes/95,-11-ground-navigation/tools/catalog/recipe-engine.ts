import { engineRecipeDefinitions } from '../../src/recipes/recipe-engine-cases'
import { buildEngineNavcat } from '../../src/recipes/recipe-engine-navcat'
import type { EngineFactory } from '../../src/recipes/recipe-engine-types'
import { type CatalogCase, check, unsupported } from './types'
import { buildEngineDetour } from './recipe-engine-detour'
import { supportsDetourWallSegments } from '../sdk-detour-probe/detour-wall-segments'

export const engineRecipeCases: CatalogCase[] = engineRecipeDefinitions.map(({ caseId, variants, run }) => ({
  id: caseId,
  layer: 'integration',
  run(backend) {
    if (backend === 'detour' && caseId === 'RECIPE-PORTAL-WALL' && !supportsDetourWallSegments()) {
      return unsupported('The bundled Detour WASM lacks getPolyWallSegments. Use --detour-wasm= with a module built with the binding.')
    }
    const build = backend === 'navcat' ? buildEngineNavcat : buildEngineDetour
    const clock = () => performance.now()
    const totals = { recipeBakeMs: 0, recipeBakeCount: 0, recipeQueryMs: 0, recipeQueryCount: 0 }
    function timedQuery<Args extends unknown[], Result>(query: (...args: Args) => Result) {
      return (...args: Args) => {
        const start = clock()
        try { return query(...args) }
        finally {
          totals.recipeQueryMs += clock() - start
          totals.recipeQueryCount++
        }
      }
    }
    const timedBuild: EngineFactory = (options) => {
      const start = clock()
      const mesh = build(options)
      totals.recipeBakeMs += clock() - start
      totals.recipeBakeCount++
      return {
        ...mesh,
        project: timedQuery(mesh.project),
        corridor: timedQuery(mesh.corridor),
        straight: timedQuery(mesh.straight),
        random: timedQuery(mesh.random),
        queryBox: timedQuery(mesh.queryBox),
        walls: mesh.walls && timedQuery(mesh.walls)
      }
    }
    const metrics: Record<string, number> = {}
    const outcomes = variants.map(({ id }) => {
      const result = run(timedBuild, id)
      for (const [metric, value] of Object.entries(result.metrics)) metrics[id + '.' + metric] = value
      return { id, passed: result.passed, detail: result.detail }
    })
    return {
      ...check(outcomes.every(({ passed }) => passed), JSON.stringify(outcomes)),
      metrics: { ...metrics, ...totals }
    }
  }
}))
