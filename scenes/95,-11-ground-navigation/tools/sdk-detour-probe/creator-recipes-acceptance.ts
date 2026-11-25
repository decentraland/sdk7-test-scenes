import { EngineInfo, engine } from '@dcl/sdk/ecs'
import { mountNavigationLab } from '../../src/index'
import recipes from '../catalog/creator-recipes.json'

export function runCreatorRecipesAcceptance(onlyCase?: string) {
  const lab = mountNavigationLab(8)
  const expected = recipes.filter(({ sdk7 }) => sdk7.startsWith('Creator recipes')).map(({ caseId }) => caseId)
  const hits = new Set(lab.recipeRuns.map(({ caseId }) => caseId))
  const log = (event: Record<string, unknown>) => console.log('[creator-recipe-acceptance] ' + JSON.stringify(event))
  if (hits.size !== expected.length || lab.recipeRuns.length !== expected.length ||
      expected.some((caseId) => !hits.has(caseId))) {
    log({ stage: 'failed', detail: 'The menu recipe list differs from the index.', expected, actual: [...hits] })
    return
  }
  // Keep the physical fullscreen interaction last, after the unattended checks.
  const runs = onlyCase === undefined
    ? lab.recipeRuns.filter(({ caseId }) => caseId !== 'RECIPE-SCENE-RESUME')
      .concat(lab.recipeRuns.filter(({ caseId }) => caseId === 'RECIPE-SCENE-RESUME'))
    : lab.recipeRuns.filter(({ caseId }) => caseId === onlyCase)
  if (!runs.length) {
    log({ stage: 'failed', detail: 'Unknown Explorer recipe.', onlyCase })
    return
  }
  let index = 0
  let passed = 0
  let active = false
  let elapsed = 0
  let visibleSeconds = 0
  log({ stage: 'start', count: runs.length })
  engine.addSystem(function checkCreatorRecipes(dt) {
    if (index === runs.length) {
      engine.removeSystem(checkCreatorRecipes)
      log({ stage: 'done', passed, count: runs.length })
      return
    }
    const run = runs[index]
    const isResume = run.caseId === 'RECIPE-SCENE-RESUME'
    if (!active) {
      // The loading screen also reports sceneHidden. Arm a focused resume check
      // only after the initial world is visible.
      if (isResume && onlyCase) {
        const hidden = EngineInfo.getOrNull(engine.RootEntity)?.sceneHidden
        visibleSeconds = hidden === false ? visibleSeconds + dt : 0
        if (visibleSeconds < 2) return
      }
      active = true
      elapsed = 0
      log({ stage: 'selected', id: run.caseId, label: run.label, variant: run.scenario?.variants[0]?.id })
      try {
        lab.runRecipe(run)
      } catch (error) {
        log({ stage: 'result', id: run.caseId, label: run.label, verdict: 'fail', detail: String(error) })
        index++
        active = false
      }
      return
    }
    elapsed += dt
    const result = lab.recipeResult()
    if (!result || result.verdict === 'running') {
      if (elapsed < (isResume ? 200 : 80)) return
      log({ stage: 'result', id: run.caseId, label: run.label, verdict: 'fail', detail: 'Timed out in Explorer.' })
    } else {
      if (result.verdict === 'pass') passed++
      log({ stage: 'result', id: run.caseId, label: run.label, ...result })
    }
    index++
    active = false
  })
}
