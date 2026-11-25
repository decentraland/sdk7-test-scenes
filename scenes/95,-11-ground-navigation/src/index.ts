import { mountGroundLab } from './ground-lab'
import { twoFloorTests } from './navmesh/examples/live-comparison'
import { authoringLiveRecipes } from './recipes/recipe-authoring-scene'
import { creatorBehaviorLiveRecipes } from './recipes/recipe-creator-behavior-scene'
import { creatorGeometryRecipes } from './recipes/recipe-creator-geometry'
import { creatorGeometryLiveRecipes } from './recipes/recipe-creator-geometry-scene'
import { creatorOpsRecipes } from './recipes/recipe-creator-ops'
import { engineRecipeScenarios } from './recipes/recipe-engine'
import { gameplayRecipeScenarios } from './recipes/recipe-gameplay'
import { recipeRuntimeScenarios } from './recipes/recipe-runtime'
import { remoteLandingTest } from './recipes/remote-landing'
import { mountTraversalPlayground } from './traversal/playground'
import { TRAVERSAL_SCENARIOS } from './traversal/registry'

export function mountNavigationLab(playbackRate = 1) {
  return mountTraversalPlayground(TRAVERSAL_SCENARIOS, mountGroundLab, [
    {
      id: 'authoring', label: 'SDK7 authoring', simulations: creatorGeometryRecipes,
      live: [...authoringLiveRecipes, ...creatorGeometryLiveRecipes, ...creatorBehaviorLiveRecipes]
    },
    { id: 'gameplay', label: 'Gameplay', simulations: [...recipeRuntimeScenarios, ...gameplayRecipeScenarios] },
    { id: 'navigation-apis', label: 'Navigation APIs', simulations: engineRecipeScenarios },
    { id: 'runtime-operations', label: 'Runtime operations', simulations: creatorOpsRecipes }
  ], playbackRate, [remoteLandingTest, ...twoFloorTests])
}

export function main() {
  mountNavigationLab()
}
