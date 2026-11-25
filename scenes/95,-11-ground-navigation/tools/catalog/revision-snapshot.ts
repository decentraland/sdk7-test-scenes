import { addTile, buildTile, getTileAt, removeTile, type NavMesh as NavcatMesh } from 'navcat'
import { exportNavMesh, importNavMesh, Raw, statusSucceed, UnsignedCharArray, type NavMesh as DetourMesh } from 'recast-navigation'
import type { Surface } from '../../src/arena'
import { createNavcatNavigatorFromMesh } from '../../src/navigation'
import { createDetourNavigatorFromMesh } from '../../test/detour'
import type { TraversalBackend } from '../sdk-detour-probe/traversal-routing'
import { detourTiles, navcatTiles } from './native-tiles'
import type { TilePatch } from './revision-tile-worker'

const radius = 0.18

function navcatSnapshot(mesh: NavcatMesh) {
  return {
    backend: 'navcat' as const, mesh, navigator: createNavcatNavigatorFromMesh(mesh),
    dispose() {}
  }
}

function detourSnapshot(mesh: DetourMesh, buffers: UnsignedCharArray[] = []) {
  const navigator = createDetourNavigatorFromMesh(mesh)
  return {
    backend: 'detour' as const, mesh, navigator,
    dispose() {
      navigator.dispose()
      buffers.forEach((buffer) => buffer.destroy())
    }
  }
}

type Snapshot = ReturnType<typeof navcatSnapshot> | ReturnType<typeof detourSnapshot>

export function initialSnapshot(backend: TraversalBackend, faces: readonly Surface[]) {
  return backend === 'navcat' ? navcatSnapshot(navcatTiles(faces, radius)) : detourSnapshot(detourTiles(faces, radius))
}

export function patchedSnapshot(base: Snapshot, patches: readonly TilePatch[]): Snapshot {
  if (base.backend === 'navcat') {
    const mesh = JSON.parse(JSON.stringify(base.mesh)) as NavcatMesh
    for (const patch of patches) {
      if (patch.backend !== 'navcat') throw new Error('Mismatched navcat revision patch.')
      const [x, y] = patch.coordinates
      if (getTileAt(mesh, x, y, 0) && !removeTile(mesh, x, y, 0)) throw new Error('Could not remove navcat tile.')
      if (patch.tile) addTile(mesh, buildTile(patch.tile))
    }
    return navcatSnapshot(mesh)
  }
  const mesh = importNavMesh(exportNavMesh(base.mesh)).navMesh
  const buffers: UnsignedCharArray[] = []
  try {
    for (const patch of patches) {
      if (patch.backend !== 'detour') throw new Error('Mismatched Detour revision patch.')
      const [x, y] = patch.coordinates
      const old = mesh.getTileRefAt(x, y, 0)
      if (old) Raw.destroy(mesh.removeTile(old).raw)
      if (!patch.bytes) continue
      const buffer = new UnsignedCharArray()
      buffers.push(buffer)
      buffer.copy(patch.bytes)
      if (!statusSucceed(mesh.addTile(buffer, 0, 0).status)) throw new Error('Could not install Detour tile ' + x + ',' + y)
    }
    return detourSnapshot(mesh, buffers)
  } catch (error) {
    mesh.destroy()
    buffers.forEach((buffer) => buffer.destroy())
    throw error
  }
}
