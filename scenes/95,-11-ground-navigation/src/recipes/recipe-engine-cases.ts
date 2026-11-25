import { engineCrowdDefinitions } from './recipe-engine-crowd'
import { engineQueryDefinitions } from './recipe-engine-query'
import { engineTopologyDefinitions } from './recipe-engine-topology'

export const engineRecipeDefinitions = [
  ...engineQueryDefinitions, ...engineTopologyDefinitions, ...engineCrowdDefinitions
]
