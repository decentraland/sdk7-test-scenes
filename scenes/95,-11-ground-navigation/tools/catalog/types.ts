import type { Point } from '../../src/arena'
import type { TraversalShape } from '../../src/traversal/types'
import type { TraversalBackend } from '../sdk-detour-probe/traversal-routing'

export type CatalogResult = {
  status: 'pass' | 'fail' | 'unsupported' | 'not-applicable' | 'missing' | 'error'
  detail: string
  metrics?: Readonly<Record<string, number>>
  performance?: {
    scope: 'full case' | 'required variants'
    samplesMs: readonly number[]
    sampleMetrics?: readonly Readonly<Record<string, number>>[]
  }
}

export type CatalogCase = {
  id: string
  layer: 'planner' | 'controller' | 'benchmark' | 'integration'
  coverage?: 'adapted'
  run(backend: TraversalBackend): CatalogResult | Promise<CatalogResult>
}

export function check(passed: boolean, detail: string): CatalogResult {
  return { status: passed ? 'pass' : 'fail', detail }
}

export function unsupported(detail: string): CatalogResult {
  return { status: 'unsupported', detail }
}

export function notApplicable(detail: string): CatalogResult {
  return { status: 'not-applicable', detail }
}

export function missing(detail: string): CatalogResult {
  return { status: 'missing', detail }
}

export function box(
  id: string, kind: TraversalShape['kind'],
  [minX, minY, minZ]: Point, [maxX, maxY, maxZ]: Point
): TraversalShape {
  return {
    id, kind,
    center: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2],
    size: [maxX - minX, maxY - minY, maxZ - minZ]
  }
}
