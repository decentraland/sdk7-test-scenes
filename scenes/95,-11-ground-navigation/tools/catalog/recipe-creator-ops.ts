import { creatorOpsDefinitions } from '../../src/recipes/recipe-creator-ops'
import { navcatOpsBackend, type OpsBackend } from '../../src/recipes/recipe-creator-ops-tiles'
import { detourOpsBackend } from './recipe-creator-ops-detour'
import { check, type CatalogCase } from './types'

const navcatNode: OpsBackend = {
  ...navcatOpsBackend,
  now: () => performance.now(),
  memory: () => {
    const { heapUsed, rss } = process.memoryUsage()
    return { heapUsedBytes: heapUsed, rssBytes: rss }
  }
}

export const creatorOpsCases: CatalogCase[] = creatorOpsDefinitions.map(({ id, variants, run }) => ({
  id,
  layer: 'integration',
  run(backend) {
    const adapter = backend === 'navcat' ? navcatNode : detourOpsBackend
    const metrics: Record<string, number> = {}
    const results = variants.map((variant) => {
      const result = run(adapter, variant.id)
      for (const [key, value] of Object.entries(result.metrics)) metrics[variant.id + '.' + key] = value
      return { id: variant.id, passed: result.passed, detail: result.detail }
    })
    for (const key of ['recipeBakeMs', 'recipeBakeCount', 'recipeQueryMs', 'recipeQueryCount'] as const) {
      metrics[key] = variants.reduce((sum, { id: variantId }) => sum + (metrics[variantId + '.' + key] ?? 0), 0)
    }
    return {
      ...check(results.every(({ passed }) => passed), JSON.stringify(results)),
      metrics
    }
  }
}))
