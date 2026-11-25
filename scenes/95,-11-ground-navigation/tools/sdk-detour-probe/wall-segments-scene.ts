import { init } from 'recast-navigation'
import { engineTopologyDefinitions } from '../../src/recipes/recipe-engine-topology'
import { buildEngineNavcat } from '../../src/recipes/recipe-engine-navcat'
import { detourAnyAngleCosts } from '../catalog/detour-any-angle'
import { buildEngineDetour } from '../catalog/recipe-engine-detour'
import { supportsDetourWallSegments } from './detour-wall-segments'

export async function runWallSegmentsProbe(factory: NonNullable<Parameters<typeof init>[0]>) {
  const log = (data: Record<string, unknown>) => console.log('[detour-wall-segments] ' + JSON.stringify(data))
  try {
    await init(factory)
    if (!supportsDetourWallSegments()) throw new Error('The supplied Detour WASM has no wall-segment binding.')
    const recipe = engineTopologyDefinitions.find(({ caseId }) => caseId === 'RECIPE-PORTAL-WALL')
    if (!recipe) throw new Error('The portal-or-wall recipe is missing.')
    for (const { id } of recipe.variants) {
      for (const [backend, build] of [['navcat', buildEngineNavcat], ['detour', buildEngineDetour]] as const) {
        const start = Date.now()
        const result = recipe.run(build, id)
        log({ backend, variant: id, verdict: result.passed ? 'pass' : 'fail', metrics: result.metrics,
          elapsedWallMs: Date.now() - start, clock: 'Date.now', detail: result.detail })
      }
    }
    const sliced = detourAnyAngleCosts()
    console.log('[detour-sliced-search] ' + JSON.stringify({
      case: 'E14 Цена области при any-angle', backend: 'detour', verdict: sliced.status, detail: sliced.detail
    }))
  } catch (error) {
    log({ verdict: 'error', detail: String(error) })
  }
}
