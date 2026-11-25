import { bakeNavcatMesh, createNavcatNavigatorFromMesh } from '../navigation'
import type { TraversalScenario, TraversalVariant } from '../traversal/types'
import { longFrameRun, robotTurnRun } from './recipe-gameplay-motion'
import { conveyorRun, coverRun, interceptRun } from './recipe-gameplay-routes'
import type { GameplayNavigatorFactory } from './recipe-gameplay-support'
import { recipeBake, type RecipeRun } from './recipe-runtime-support'

export const makeNavcatGameplayNavigator: GameplayNavigatorFactory = (surfaces) =>
  createNavcatNavigatorFromMesh(bakeNavcatMesh(surfaces, recipeBake()))

type GameplayRecipe = {
  id: string
  caseId: string
  label: string
  layer: 'controller' | 'integration'
  variants: readonly TraversalVariant[]
  run(variant: string, makeNavigator: GameplayNavigatorFactory): RecipeRun
}

export const gameplayRecipeDefinitions: readonly GameplayRecipe[] = [
  {
    id: 'recipe-long-frame', caseId: 'RECIPE-LONG-FRAME', label: 'Two turns in one long frame', layer: 'controller',
    run: longFrameRun,
    variants: [{ id: 'substeps', label: 'Preserve both turns' }, { id: 'chord', label: 'Cut the corner (control)' }]
  },
  {
    id: 'recipe-intercept', caseId: 'RECIPE-INTERCEPT', label: 'Intercept a patrol upstairs', layer: 'integration',
    run: interceptRun,
    variants: [{ id: 'predictive', label: 'Predict the meeting' }, { id: 'reactive', label: 'Chase the last position' },
      { id: 'stationary', label: 'Target stays below' }]
  },
  {
    id: 'recipe-concealed', caseId: 'RECIPE-CONCEALED', label: 'Find a route with cover', layer: 'integration',
    run: coverRun,
    variants: [{ id: 'hidden', label: 'Keep the NPC hidden' }, { id: 'unobserved', label: 'No observer' },
      { id: 'no-cover', label: 'No wall to hide behind' }]
  },
  {
    id: 'recipe-conveyor', caseId: 'RECIPE-CONVEYOR', label: 'Reversible conveyor', layer: 'integration',
    run: conveyorRun,
    variants: [{ id: 'forward', label: 'Belt moves east' }, { id: 'reversed', label: 'Reverse to west' },
      { id: 'stopped', label: 'Belt stops' }, { id: 'no-bypass', label: 'Against belt, no bypass' }]
  },
  {
    id: 'recipe-robot-turn', caseId: 'RECIPE-ROBOT-TURN', label: 'Turn a long robot at a station', layer: 'integration',
    run: robotTurnRun,
    variants: [{ id: 'wide', label: 'Choose the wide bay' }, { id: 'narrow-only', label: 'Narrow bay only' },
      { id: 'circle', label: 'Round footprint control' }]
  }
]

export const gameplayRecipeScenarios: readonly TraversalScenario[] = gameplayRecipeDefinitions.map((recipe) => ({
  id: recipe.id, label: recipe.label, cases: [recipe.caseId], variants: recipe.variants,
  create: (variantId) => recipe.run(variantId, makeNavcatGameplayNavigator)
}))
