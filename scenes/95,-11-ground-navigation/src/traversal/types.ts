import type { Point } from '../arena'

export type TraversalShape = {
  id: string
  center: Point
  size: Point
  kind: 'surface' | 'obstacle' | 'target' | 'guide'
}

export type TraversalBot = {
  id: string
  feet: Point
  height?: number
  radius?: number
  headingDegrees?: number
}

export type TraversalFrame = {
  shapes: readonly TraversalShape[]
  bots: readonly TraversalBot[]
  phase: string
  verdict: 'running' | 'pass' | 'fail'
  detail: string
}

export type TraversalRun = {
  frame(): TraversalFrame
  step(dt: number): void
}

export type TraversalVariant = {
  id: string
  label: string
}

export type TraversalScenario = {
  id: string
  label: string
  cases: readonly string[]
  variants: readonly TraversalVariant[]
  create(variantId: string): TraversalRun
}
