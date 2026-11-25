import { readFileSync } from 'node:fs'
import { readMirroredRamp } from '../../scripts/recipe-creator-geometry-model'
import {
  markerCases, mirroredRampCheck, MIRRORED_MODEL, parcelCheck, type GeometryNavigatorFactory
} from '../../src/recipes/recipe-creator-geometry'
import { makeNavcatRecipeNavigator, recipeBake } from '../../src/recipes/recipe-runtime-support'
import { bakeDetourMesh, createDetourNavigatorFromMesh } from '../../test/detour'
import { check, type CatalogCase } from './types'

const definitions = [
  { id: 'RECIPE-MIRRORED-GLB', run: (makeNavigator: GeometryNavigatorFactory) =>
    mirroredRampCheck(readMirroredRamp(readFileSync(new URL('../../' + MIRRORED_MODEL, import.meta.url))), makeNavigator) },
  { id: 'RECIPE-NAMED-MARKERS', run: markerCases },
  { id: 'RECIPE-L-PARCELS', run: parcelCheck }
]

export const creatorGeometryCases: CatalogCase[] = definitions.map(({ id, run }) => ({
  id,
  layer: 'integration',
  run(backend) {
    const metrics = { recipeBakeMs: 0, recipeQueryMs: 0, recipeBakeCount: 0, recipeQueryCount: 0 }
    const makeNavigator: GeometryNavigatorFactory = (surfaces) => {
      const bakeStart = performance.now()
      const nav = backend === 'navcat' ? makeNavcatRecipeNavigator(surfaces)
        : createDetourNavigatorFromMesh(bakeDetourMesh(surfaces, recipeBake()))
      metrics.recipeBakeMs += performance.now() - bakeStart
      metrics.recipeBakeCount++
      return {
        ...nav,
        route(start, goal) {
          const queryStart = performance.now()
          try {
            return nav.route(start, goal)
          } finally {
            metrics.recipeQueryMs += performance.now() - queryStart
            metrics.recipeQueryCount++
          }
        }
      }
    }
    const result = run(makeNavigator)
    return { ...check(result.passed, result.detail + ' ' + JSON.stringify(result.metrics)), metrics: { ...result.metrics, ...metrics } }
  }
}))
