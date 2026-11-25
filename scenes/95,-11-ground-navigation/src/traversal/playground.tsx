import { engine } from '@dcl/sdk/ecs'
import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import type { LiveRecipe, LiveRecipeAction, LiveRecipeResult } from '../recipes/types'
import { traversalCaseIds } from './catalog-coverage'
import { createTraversalSimulation, TRAVERSAL_STEP } from './simulation'
import type { TraversalScenario, TraversalVariant } from './types'
import { createTraversalVisuals } from './visuals'

const WIDTH = 224
const PANEL = Color4.fromHexString('#131d2bef')
const DEFAULT = Color4.fromHexString('#30445bff')
const SELECTED = Color4.fromHexString('#236354ff')
const TEXT = Color4.fromHexString('#e9f4ffff')
const MUTED = Color4.fromHexString('#b0c3d5ff')
const FAILED = Color4.fromHexString('#ffab87ff')

type Selection = {
  scenario: TraversalScenario
  variant: TraversalVariant
  simulation: ReturnType<typeof createTraversalSimulation>
}

type RecipeSelection = {
  recipe: LiveRecipe
  dispose?: () => void
  result?: LiveRecipeResult
  action?: LiveRecipeAction
}

type RecipeGroup = {
  id: string
  label: string
  simulations?: readonly TraversalScenario[]
  live?: readonly LiveRecipe[]
}

function item(key: string, label: string, onClick: () => void, selected = false) {
  return (
    <UiEntity
      key={key}
      uiTransform={{
        width: WIDTH, height: 27, margin: { top: 3 }, borderRadius: 4,
        justifyContent: 'center', alignItems: 'center'
      }}
      uiBackground={{ color: selected ? SELECTED : DEFAULT }}
      uiText={{ value: label, fontSize: 13, color: TEXT }}
      onMouseDown={onClick}
    />
  )
}

export function mountTraversalPlayground(
  scenarios: readonly TraversalScenario[],
  mountComparison: () => () => void,
  recipeGroups: readonly RecipeGroup[] = [],
  playbackRate = 1,
  multiplayerTest?: LiveRecipe
) {
  const visuals = createTraversalVisuals()
  let unmountComparison: (() => void) | undefined = mountComparison()
  let open = false
  let showRecipes = false
  let recipeGroup: RecipeGroup | undefined
  let selection: Selection | undefined
  let liveSelection: RecipeSelection | undefined
  let playing = false
  let seconds = 0
  let setupWallMs = 0
  let computeWallMs = 0

  function spawn(scenario: TraversalScenario, variant: TraversalVariant) {
    const startedAt = Date.now()
    const simulation = createTraversalSimulation(scenario.create(variant.id))
    setupWallMs = Date.now() - startedAt
    unmountComparison?.()
    unmountComparison = undefined
    visuals.dispose()
    selection = { scenario, variant, simulation }
    playing = false
    seconds = 0
    computeWallMs = 0
    visuals.draw(simulation.frame())
  }

  function disposeLiveRecipe() {
    const live = liveSelection
    liveSelection = undefined
    live?.dispose?.()
  }

  function disposeSimulation() {
    selection = undefined
    playing = false
    visuals.dispose()
  }

  function spawnLive(recipe: LiveRecipe) {
    unmountComparison?.()
    unmountComparison = undefined
    disposeLiveRecipe()
    const active: RecipeSelection = { recipe }
    liveSelection = active
    const startedAt = Date.now()
    active.dispose = recipe.mount((result) => {
      if (liveSelection !== active) return
      active.result = result
      console.log('[ground-recipe] ' + JSON.stringify({
        id: recipe.id, ...result, elapsedWallMs: Date.now() - startedAt, clock: 'Date.now'
      }))
    }, (action) => {
      if (liveSelection === active) active.action = action
    })
  }

  function restoreComparison() {
    if (unmountComparison) return
    disposeLiveRecipe()
    selection = undefined
    playing = false
    visuals.dispose()
    unmountComparison = mountComparison()
    open = false
    showRecipes = false
    recipeGroup = undefined
  }

  engine.addSystem((dt) => {
    if (!selection || !playing) return
    const { scenario, variant, simulation } = selection
    seconds = Math.min(seconds + dt * playbackRate, TRAVERSAL_STEP * 8)
    if (seconds < TRAVERSAL_STEP) return
    const startedAt = Date.now()
    let frame = simulation.frame()
    while (seconds >= TRAVERSAL_STEP && frame.verdict === 'running') {
      seconds -= TRAVERSAL_STEP
      frame = simulation.tick()
    }
    computeWallMs += Date.now() - startedAt
    visuals.draw(frame)
    if (frame.verdict !== 'running') {
      playing = false
      console.log('[ground-traversal] ' + JSON.stringify({
        scenario: scenario.id, variant: variant.id,
        cases: showRecipes ? scenario.cases : traversalCaseIds(scenario.id, variant.id), ticks: simulation.ticks(),
        verdict: frame.verdict, phase: frame.phase, detail: frame.detail, setupWallMs, computeWallMs, clock: 'Date.now'
      }))
    }
  })

  ReactEcsRenderer.setUiRenderer(() => {
    const current = selection
    const frame = current?.simulation.frame()
    const running = frame?.verdict === 'running'
    const browsing = open && !current && !liveSelection
    const visibleScenarios = showRecipes ? recipeGroup?.simulations ?? [] : scenarios
    return (
      <UiEntity uiTransform={{ width: '100%', height: '100%' }}>
        <UiEntity
          uiTransform={{
            positionType: 'absolute', position: { top: 184, right: 14 },
            flexDirection: 'column', padding: 6, borderRadius: 6
          }}
          uiBackground={{ color: open ? PANEL : Color4.Clear() }}
        >
          {item('menu', open ? 'Traversal tests  ×' : 'Traversal tests', () => { open = !open })}
          {browsing && recipeGroups.length > 0 && item(
            'mode',
            showRecipes ? recipeGroup ? 'All recipe groups' : 'Traversal tests' : 'Creator recipes',
            () => {
              if (recipeGroup) recipeGroup = undefined
              else showRecipes = !showRecipes
            }
          )}
          {browsing && showRecipes && !recipeGroup && recipeGroups.map((group) =>
            item(group.id, group.label, () => { recipeGroup = group })
          )}
          {browsing && !showRecipes && multiplayerTest &&
            item(multiplayerTest.id, multiplayerTest.label, () => spawnLive(multiplayerTest))}
          {browsing && visibleScenarios.map((scenario) =>
            item(scenario.id, scenario.label, () => spawn(scenario, scenario.variants[0]))
          )}
          {browsing && recipeGroup?.live?.map((recipe) =>
            item(recipe.id, recipe.label, () => spawnLive(recipe))
          )}
          {open && liveSelection && (
            <UiEntity uiTransform={{ flexDirection: 'column' }}>
              <UiEntity uiTransform={{ width: WIDTH, height: 26 }} uiText={{ value: liveSelection.recipe.label, fontSize: 15, color: TEXT }} />
              <UiEntity
                uiTransform={{ width: WIDTH, height: 70, margin: { top: 4 } }}
                uiText={{
                  value: liveSelection.result ? liveSelection.result.status.toUpperCase() + '\n' + liveSelection.result.detail : 'Running SDK7 check…',
                  fontSize: 12, textWrap: 'wrap', textAlign: 'middle-left',
                  color: liveSelection.result?.status === 'fail' ? FAILED : MUTED
                }}
              />
              {!liveSelection.result && liveSelection.action &&
                item('live-action', liveSelection.action.label, liveSelection.action.run)}
              {item('retry-live', 'Restart', () => { if (liveSelection) spawnLive(liveSelection.recipe) })}
              {item('other-live', 'Choose another test', disposeLiveRecipe)}
            </UiEntity>
          )}
          {open && current && frame && (
            <UiEntity uiTransform={{ flexDirection: 'column' }}>
              <UiEntity
                uiTransform={{ width: WIDTH, height: 26 }}
                uiText={{ value: current.scenario.label, fontSize: 15, color: TEXT }}
              />
              {current.scenario.variants.map((variant) => item(
                variant.id, variant.label, () => spawn(current.scenario, variant), variant.id === current.variant.id
              ))}
              <UiEntity
                uiTransform={{ width: WIDTH, height: 70, margin: { top: 4 } }}
                uiText={{
                  value: (running ? ((playing ? '' : 'Ready / paused · ') + frame.phase) : frame.verdict.toUpperCase()) +
                    '\n' + frame.detail,
                  fontSize: 12, textWrap: 'wrap', textAlign: 'middle-left',
                  color: frame.verdict === 'fail' ? FAILED : MUTED
                }}
              />
              {running && item('run', playing ? 'Pause' : 'Run', () => { playing = !playing }, playing)}
              {item('reset', 'Reset', () => spawn(current.scenario, current.variant))}
              {item('other', 'Choose another test', disposeSimulation)}
              {item('comparison', 'Back to comparison', restoreComparison)}
            </UiEntity>
          )}
          {open && !current && !unmountComparison && item('comparison', 'Back to comparison', restoreComparison)}
        </UiEntity>
      </UiEntity>
    )
  })

  return {
    recipeRuns: recipeGroups.flatMap((group) => [
      ...(group.simulations ?? []).map((scenario) => ({
        caseId: scenario.cases[0], group, scenario, label: scenario.label, live: undefined
      })),
      ...(group.live ?? []).map((live) => ({
        caseId: live.id, group, scenario: undefined, label: live.label, live
      }))
    ]),
    runRecipe(run: { group: RecipeGroup; scenario?: TraversalScenario; live?: LiveRecipe }) {
      open = showRecipes = true
      recipeGroup = run.group
      disposeSimulation()
      disposeLiveRecipe()
      if (run.live) spawnLive(run.live)
      else if (run.scenario) {
        spawn(run.scenario, run.scenario.variants[0])
        playing = true
      }
    },
    recipeResult() {
      if (liveSelection?.result) {
        return { verdict: liveSelection.result.status, detail: liveSelection.result.detail }
      }
      const frame = selection?.simulation.frame()
      return frame && { verdict: frame.verdict, detail: frame.detail }
    }
  }
}
