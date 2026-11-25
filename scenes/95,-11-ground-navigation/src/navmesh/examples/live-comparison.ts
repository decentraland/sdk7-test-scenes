import navcatMeshes from '../../generated/meshes'
import detourMeshes from '../../generated/detour-meshes'
import type { LiveRecipe } from '../../recipes/types'
import { openNavigation as openDetour } from '../detour-runtime'
import { openNavigation as openNavcat } from '../navcat-runtime'
import { mountTwoFloorExample } from './two-floors'

export const twoFloorTests: readonly LiveRecipe[] = [
  {
    id: 'two-floors-navcat',
    label: 'Two floors · navcat live',
    mount: (result) => mountTwoFloorExample(openNavcat, { format: 1, backend: 'navcat', mesh: navcatMeshes.open }, result, 64)
  },
  {
    id: 'two-floors-detour',
    label: 'Two floors · Detour live',
    mount: (result) => mountTwoFloorExample(openDetour, { format: 1, backend: 'detour', mesh: detourMeshes.open }, result, 64)
  }
]
