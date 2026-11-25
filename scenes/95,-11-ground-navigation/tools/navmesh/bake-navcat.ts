import { bakeNavcatMesh } from '../../src/navigation'
import type { NavigationBake } from '../../src/navmesh/geometry'
import type { PreparedMesh, Surface } from '../../src/navmesh/types'

export async function prepareMesh(surfaces: readonly Surface[], settings?: NavigationBake): Promise<PreparedMesh> {
  const mesh = bakeNavcatMesh(surfaces, settings)
  if (!mesh.nodes.length) throw new Error('No walkable polygons. Check clearance, winding and agent settings.')
  return { format: 1, backend: 'navcat', mesh }
}
