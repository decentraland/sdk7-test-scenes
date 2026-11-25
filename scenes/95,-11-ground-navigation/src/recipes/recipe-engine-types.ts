import type { Point, Surface } from '../arena'
import { NAVIGATION_BAKE } from '../navigation'
import type { TraversalShape } from '../traversal/types'

export const FLOOR_Y = 0.2
export const UPPER_Y = 3.2
export const WALK = 1
export const STAFF = 2
export const PUBLIC = 4
export const SPILL_AREA = 3
export const ENGINE_BAKE = {
  ...NAVIGATION_BAKE, cellSize: 0.1, cellHeight: 0.05, radius: 0.2, climb: 0.1,
  minRegionSize: 1, mergeRegionSize: 1, maxEdgeLength: 128, maxSimplificationError: 0.2
}
export const TILE_EDGE = 2
export const SNAP: Point = [0.35, 0.3, 0.35]

export type Policy = { flags?: number; spillCost?: number }
export type Projected = { ref: number; point: Point }
export type Corridor = { readonly refs: readonly number[]; from: Projected; to: Projected }
export type StraightMode = 'plain' | 'areas' | 'all'
export type Straight = { points: Point[]; success: boolean; end: boolean; limited: boolean }
export type Link = { from: Point; to: Point; flags: number; key: number }
export type NativeBuild = {
  surfaces: readonly Surface[]
  tiled?: boolean
  minRegionSize?: number
  links?: readonly Link[]
}
export type Polygon = { ref: number; vertices: Point[]; flags: number }
export type WallSegment = { ref: number | null; a: Point; b: Point }

export type RecipeCrowd = {
  add(point: Point, policy?: Policy): number
  setPolicy(agent: number, policy: Policy): void
  goal(agent: number, point: Point): boolean
  velocity(agent: number, velocity: Point): boolean
  reset(agent: number): void
  position(agent: number): Point
  step(dt: number): void
  dispose(): void
}

export type EngineMesh = {
  project(point: Point, policy?: Policy): Projected | undefined
  corridor(from: Point, to: Point, policy?: Policy): Corridor | undefined
  straight(corridor: Corridor, mode: StraightMode, limit?: number): Straight
  random(point: Projected, radius: number, count: number, seed: number): Point[]
  polygons(): Polygon[]
  queryBox(center: Point, extents: Point, limit?: number): { refs: number[]; limited: boolean }
  setArea(ref: number, area: number): void
  setFlags(ref: number, flags: number): void
  linkKey(ref: number): number | undefined
  replaceLink?(link: Link, nextKey: number, staleRef: number): boolean
  prune(seeds: readonly number[]): void
  walls?(ref: number, policy: Policy, includePortals: boolean): WallSegment[]
  crowd(maxAgents: number): RecipeCrowd
  dispose(): void
}
export type EngineFactory = (options: NativeBuild) => EngineMesh

export type CaseResult = {
  passed: boolean
  detail: string
  metrics: Record<string, number>
  shapes: readonly TraversalShape[]
  path?: readonly Point[]
  crowdTrace?: readonly (readonly Point[])[]
}
export type EngineDefinition = {
  caseId: string
  label: string
  variants: readonly { id: string; label: string }[]
  run(makeMesh: EngineFactory, variant: string): CaseResult
}
