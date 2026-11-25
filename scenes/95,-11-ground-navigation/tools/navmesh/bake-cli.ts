import { readFile, writeFile } from 'node:fs/promises'
import { NAVIGATION_BAKE } from '../../src/navmesh/geometry'
import type { NavigationBake } from '../../src/navmesh/geometry'
import type { PreparedMesh, Surface } from '../../src/navmesh/types'

export async function bakeCli(
  prepareMesh: (surfaces: readonly Surface[], settings: NavigationBake) => Promise<PreparedMesh>,
) {
  const [input, output] = process.argv.slice(2)
  if (!input || !output || !output.endsWith('.ts')) {
    throw new Error('Usage: node bake.mjs <surfaces.json> <mesh.ts>')
  }
  const { surfaces, settings = {} } = JSON.parse(await readFile(input, 'utf8')) as {
    surfaces: Surface[]
    settings?: Partial<NavigationBake>
  }
  if (!Array.isArray(surfaces) || !surfaces.length || surfaces.some((surface) =>
    !Array.isArray(surface?.vertices) || !Array.isArray(surface?.triangles) ||
    surface.vertices.length < 3 || !surface.triangles.length || surface.triangles.length % 3 !== 0 ||
    surface.vertices.some((point) => !Array.isArray(point) || point.length !== 3 || !point.every(Number.isFinite)) ||
    surface.triangles.some((index) => !Number.isInteger(index) || index < 0 || index >= surface.vertices.length)
  )) throw new Error('Provide nonempty surfaces with XYZ vertices and triangle index triples.')
  if (!settings || Array.isArray(settings) || typeof settings !== 'object' ||
      Object.entries(settings).some(([key, value]) =>
        !Object.prototype.hasOwnProperty.call(NAVIGATION_BAKE, key) || !Number.isFinite(value) || value < 0)) {
    throw new Error('Unknown bake setting or invalid numeric value.')
  }
  const bake = { ...NAVIGATION_BAKE, ...settings }
  if (bake.cellSize <= 0 || bake.cellHeight <= 0 || bake.height <= 0 ||
      !Number.isInteger(bake.maxVerticesPerPoly) || bake.maxVerticesPerPoly < 3 ||
      bake.maxVerticesPerPoly > 6 || bake.slope > 90) {
    throw new Error('Invalid cell size, agent height, polygon vertex limit or slope.')
  }
  const prepared = await prepareMesh(surfaces, bake)
  await writeFile(output, 'export default ' + JSON.stringify(prepared) + ' as const\n')
}
