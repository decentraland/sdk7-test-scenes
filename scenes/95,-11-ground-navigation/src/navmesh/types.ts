export type Point = readonly [number, number, number]

export type Surface = {
  vertices: readonly Point[]
  triangles: readonly number[]
}

export type Route = { status: 'complete' | 'unreachable'; points: Point[] }
export type Navigator = { route(start: Point, goal: Point): Route }
export type Navigation = Navigator & { dispose(): void }
export type Backend = 'navcat' | 'detour'
export type PreparedMesh = { format: 1; backend: Backend; mesh: unknown }
export type OpenNavigation = (data: PreparedMesh) => Promise<Navigation>
