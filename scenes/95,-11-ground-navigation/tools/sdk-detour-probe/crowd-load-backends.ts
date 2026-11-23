import type { NavMesh } from 'navcat'
import { importNavMesh } from 'recast-navigation'
import { createNavcatCrowd, type CrowdSettings } from '../../src/crowd'
import { createNavcatNavigatorFromMesh } from '../../src/navigation'
import { createDetourCrowdFromMesh, createDetourNavigatorFromMesh } from '../../test/detour'

export type CrowdLoadData = {
  navcat: { open: NavMesh; closed: NavMesh }
  detour: { open: number[]; closed: number[] }
}

export function createCrowdLoadBackends(data: CrowdLoadData) {
  const bytes = { open: new Uint8Array(data.detour.open), closed: new Uint8Array(data.detour.closed) }
  const closedRouter = createDetourNavigatorFromMesh(importNavMesh(bytes.closed).navMesh)
  return {
    backends: [
      {
        id: 'navcat',
        closedRouter: createNavcatNavigatorFromMesh(data.navcat.closed),
        create: (doorOpen: boolean, settings: CrowdSettings) =>
          createNavcatCrowd(doorOpen ? data.navcat.open : data.navcat.closed, settings)
      },
      {
        id: 'detour', closedRouter,
        create: (doorOpen: boolean, settings: CrowdSettings) =>
          createDetourCrowdFromMesh(importNavMesh(doorOpen ? bytes.open : bytes.closed).navMesh, settings)
      }
    ],
    dispose: () => closedRouter.dispose()
  }
}
