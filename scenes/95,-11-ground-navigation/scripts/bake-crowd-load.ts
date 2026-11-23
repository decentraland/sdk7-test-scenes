import { exportNavMesh, init } from 'recast-navigation'
import { bakeNavcatMesh } from '../src/navigation'
import { bakeDetourMesh } from '../test/detour'
import { crowdLoadSurfaces } from '../tools/sdk-detour-probe/crowd-load'
import type { CrowdLoadData } from '../tools/sdk-detour-probe/crowd-load-backends'

export async function bakeCrowdLoad(): Promise<CrowdLoadData> {
  await init()
  const open = crowdLoadSurfaces(true)
  const closed = crowdLoadSurfaces(false)
  function detourBytes(surfaces: ReturnType<typeof crowdLoadSurfaces>) {
    const mesh = bakeDetourMesh(surfaces)
    try {
      return Array.from(exportNavMesh(mesh))
    } finally {
      mesh.destroy()
    }
  }
  return {
    navcat: { open: bakeNavcatMesh(open), closed: bakeNavcatMesh(closed) },
    detour: { open: detourBytes(open), closed: detourBytes(closed) }
  }
}
