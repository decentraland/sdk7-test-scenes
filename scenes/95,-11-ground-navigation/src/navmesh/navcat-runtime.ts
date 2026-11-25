import type { NavMesh } from 'navcat'
import { createNavcatNavigatorFromMesh } from '../navigation'
import type { Navigator, OpenNavigation } from './types'

export const openNavigation: OpenNavigation = async (data) => {
  if (data?.format !== 1 || data.backend !== 'navcat') throw new Error('Expected a navcat mesh with format 1.')
  const mesh = data.mesh as Partial<NavMesh> | undefined
  if (!mesh || !Array.isArray(mesh.nodes) || !mesh.nodes.length || !Array.isArray(mesh.links) ||
      !Array.isArray(mesh.origin) || mesh.origin.length !== 3 || !mesh.origin.every(Number.isFinite) ||
      !mesh.tiles || !mesh.tilePositionToTileId || !mesh.tileColumnToTileIds || !mesh.offMeshConnections ||
      typeof mesh.tileWidth !== 'number' || !Number.isFinite(mesh.tileWidth) || mesh.tileWidth <= 0 ||
      typeof mesh.tileHeight !== 'number' || !Number.isFinite(mesh.tileHeight) || mesh.tileHeight <= 0) {
    throw new Error('Invalid navcat mesh.')
  }
  let navigator: Navigator | undefined = createNavcatNavigatorFromMesh(mesh as NavMesh)
  return {
    route(start, goal) {
      if (!navigator) throw new Error('Navigation has been disposed.')
      return navigator.route(start, goal)
    },
    dispose() { navigator = undefined },
  }
}
