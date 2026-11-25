import { init } from 'recast-navigation'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { OPPOSING_GROUPS, SCENARIOS, getSurfaces, type Point, type Scenario } from '../src/arena'
import { NAVIGATION_BAKE } from '../src/navigation'
import { bakeDetourMesh } from '../test/detour'

export const REPLAN_START: Point = [12.5, 1.2, 5.4]
export const REPLAN_GOAL: Point = [8, 3, 11.5]
export const COMPARISON_SCENARIOS: readonly Scenario[] = [
  ...SCENARIOS,
  { id: 'gate-closes-mid-route', start: REPLAN_START, goal: REPLAN_GOAL, doorOpen: false, expected: 'complete', via: 'west' },
  { id: 'invalid-floor-height', start: [8, 0, 11], goal: [8, 1.5, 11], doorOpen: true, expected: 'unreachable' }
]

function exportMesh(doorOpen: boolean) {
  const mesh = bakeDetourMesh(getSurfaces(doorOpen))
  try {
    const vertices: Point[] = []
    const polygons: number[][] = []
    const vertexByKey = new Map<string, number>()
    for (let i = 0; i < mesh.getMaxTiles(); i++) {
      const tile = mesh.getTile(i)
      const header = tile.header()
      if (!header) continue
      const indices: number[] = []
      for (let j = 0; j < header.vertCount(); j++) {
        const point: Point = [tile.verts(j * 3), tile.verts(j * 3 + 1), -tile.verts(j * 3 + 2)]
        const key = point.join(',')
        let index = vertexByKey.get(key)
        if (index === undefined) {
          index = vertices.length
          vertices.push(point)
          vertexByKey.set(key, index)
        }
        indices.push(index)
      }
      for (let j = 0; j < header.polyCount(); j++) {
        const poly = tile.polys(j)
        if (poly.getType() !== 0) continue
        const indicesInTile = Array.from({ length: poly.vertCount() }, (_, k) => indices[poly.verts(k)])
        // Reflect Z back into SDK coordinates and reverse the winding.
        polygons.push(indicesInTile.reverse())
      }
    }
    return { vertices, polygons }
  } finally {
    mesh.destroy()
  }
}

export async function writeFixtures(directory: string) {
  await init()
  await mkdir(directory, { recursive: true })
  const path = join(directory, 'fixtures.json')
  const fixture = {
    ...NAVIGATION_BAKE,
    open: exportMesh(true),
    closed: exportMesh(false),
    scenarios: COMPARISON_SCENARIOS,
    crowd: OPPOSING_GROUPS
  }
  await writeFile(path, JSON.stringify(fixture, null, 2))
  return path
}
