import { importNavMesh, init } from 'recast-navigation'
import { createDetourNavigatorFromMesh } from './detour-query'
import type { OpenNavigation } from './types'

let initialization: Promise<void> | undefined

export function initializeDetour() {
  initialization ??= init().catch((error: unknown) => {
    initialization = undefined
    throw error
  })
  return initialization
}

export const openNavigation: OpenNavigation = async (data) => {
  if (data?.format !== 1 || data.backend !== 'detour') throw new Error('Expected a Detour mesh with format 1.')
  if (!Array.isArray(data.mesh) || !data.mesh.length ||
      !data.mesh.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)) {
    throw new Error('Invalid Detour mesh bytes.')
  }
  await initializeDetour()
  const { navMesh } = importNavMesh(Uint8Array.from(data.mesh))
  try {
    if (!navMesh.getMaxTiles()) throw new Error('Detour could not import the mesh.')
    return createDetourNavigatorFromMesh(navMesh)
  } catch (error) {
    navMesh.destroy()
    throw error
  }
}
