import { Detour, NavMeshQuery, Raw, statusDetail } from 'recast-navigation'
import { withinSnap } from '../../src/navigation'
import { recipeRuntimeDefinitions } from '../../src/recipes/recipe-runtime'
import { makeNavcatRecipeNavigator, recipeBake, type RecipeNavigatorFactory } from '../../src/recipes/recipe-runtime-support'
import { createTraversalSimulation } from '../../src/traversal/simulation'
import { bakeDetourMesh, createDetourNavigatorFromMesh } from '../../test/detour'
import { detourPoint } from './native-tiles'
import { check, type CatalogCase } from './types'

const makeDetourRecipeNavigator: RecipeNavigatorFactory = (surfaces, height) => {
  const mesh = bakeDetourMesh(surfaces, recipeBake(height))
  const navigator = createDetourNavigatorFromMesh(mesh)
  const query = new NavMeshQuery(mesh)
  const halfExtents = { x: 0.35, y: 0.3, z: 0.35 }
  function project(point: Parameters<typeof detourPoint>[0]) {
    const result = query.findNearestPoly(detourPoint(point), { halfExtents })
    const { x, y, z } = result.nearestPoint
    return result.success && result.nearestRef && withinSnap([x, y, -z], point) ? result : undefined
  }
  return {
    ...navigator,
    shortcut(from, to) {
      const start = project(from)
      const goal = project(to)
      if (!start || !goal) return { horizontalClear: false, reachedPolygon: false, visited: 0 }
      const hit = query.raycast(start.nearestRef, start.nearestPoint, goal.nearestPoint)
      // The 0.44.0 raycast wrapper supplies no visited-polygon buffer. Check the
      // reachable surface with a second, bounded local query before accepting a shortcut.
      const surface = query.moveAlongSurface(start.nearestRef, start.nearestPoint, goal.nearestPoint)
      return {
        horizontalClear: hit.success && hit.t >= 1,
        reachedPolygon: surface.success && !statusDetail(surface.status, Detour.DT_BUFFER_TOO_SMALL) &&
          surface.visited[surface.visited.length - 1] === goal.nearestRef &&
          Math.hypot(surface.resultPosition.x - goal.nearestPoint.x, surface.resultPosition.z - goal.nearestPoint.z) < 0.01,
        visited: surface.visited.length
      }
    },
    dispose() {
      Raw.destroy(query.defaultFilter.raw)
      query.destroy()
      navigator.dispose()
    }
  }
}

export const recipeRuntimeCases: CatalogCase[] = recipeRuntimeDefinitions.map(({ caseId, variants, run }) => ({
  id: caseId,
  layer: 'integration',
  run(backend) {
    const makeNavigator = backend === 'navcat' ? makeNavcatRecipeNavigator : makeDetourRecipeNavigator
    const metrics: Record<string, number> = {}
    const results = variants.map(({ id }) => {
      let bakeMs = 0
      let queryMs = 0
      const fixture = run(id, (surfaces, height) => {
        const start = performance.now()
        const navigator = makeNavigator(surfaces, height)
        bakeMs += performance.now() - start
        return {
          ...navigator,
          route(from, to) {
            const started = performance.now()
            try {
              return navigator.route(from, to)
            } finally {
              queryMs += performance.now() - started
            }
          },
          shortcut(from, to) {
            const started = performance.now()
            try {
              return navigator.shortcut(from, to)
            } finally {
              queryMs += performance.now() - started
            }
          }
        }
      })
      const simulation = createTraversalSimulation(fixture)
      let frame = simulation.frame()
      while (frame.verdict === 'running') frame = simulation.tick()
      for (const [metric, value] of Object.entries({ ...fixture.metrics, bakeMs, queryMs, ticks: simulation.ticks() })) {
        metrics[id + '.' + metric] = value
      }
      return { variant: id, verdict: frame.verdict, detail: frame.detail }
    })
    return { ...check(results.every(({ verdict }) => verdict === 'pass'), JSON.stringify(results)), metrics }
  }
}))
