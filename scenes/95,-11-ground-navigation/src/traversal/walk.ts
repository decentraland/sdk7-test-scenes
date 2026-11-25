import type { Point } from '../arena'
import type { TraversalShape, TraversalRouter } from './types'

export function walkPoints(
  router: TraversalRouter | undefined,
  phase: string,
  from: Point,
  to: Point,
  shapes: readonly TraversalShape[],
  radius: number,
  height: number
): readonly Point[] | undefined {
  return router ? router({ phase, from, to, shapes, radius, height }) : [to]
}
