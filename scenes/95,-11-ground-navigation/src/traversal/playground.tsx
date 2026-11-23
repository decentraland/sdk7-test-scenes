import { engine } from '@dcl/sdk/ecs'
import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
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

export function mountTraversalPlayground(scenarios: readonly TraversalScenario[], mountComparison: () => () => void) {
  const visuals = createTraversalVisuals()
  let unmountComparison: (() => void) | undefined = mountComparison()
  let open = false
  let selection: Selection | undefined
  let playing = false
  let seconds = 0

  function spawn(scenario: TraversalScenario, variant: TraversalVariant) {
    const simulation = createTraversalSimulation(scenario.create(variant.id))
    unmountComparison?.()
    unmountComparison = undefined
    visuals.dispose()
    selection = { scenario, variant, simulation }
    playing = false
    seconds = 0
    visuals.draw(simulation.frame())
  }

  function restoreComparison() {
    if (unmountComparison) return
    selection = undefined
    playing = false
    visuals.dispose()
    unmountComparison = mountComparison()
    open = false
  }

  engine.addSystem((dt) => {
    if (!selection || !playing) return
    const { scenario, variant, simulation } = selection
    seconds = Math.min(seconds + dt, TRAVERSAL_STEP * 8)
    if (seconds < TRAVERSAL_STEP) return
    let frame = simulation.frame()
    while (seconds >= TRAVERSAL_STEP && frame.verdict === 'running') {
      seconds -= TRAVERSAL_STEP
      frame = simulation.tick()
    }
    visuals.draw(frame)
    if (frame.verdict !== 'running') {
      playing = false
      console.log('[ground-traversal] ' + JSON.stringify({
        scenario: scenario.id, variant: variant.id, cases: scenario.cases, ticks: simulation.ticks(),
        verdict: frame.verdict, phase: frame.phase, detail: frame.detail
      }))
    }
  })

  ReactEcsRenderer.setUiRenderer(() => {
    const current = selection
    const frame = current?.simulation.frame()
    const running = frame?.verdict === 'running'
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
          {open && !current && scenarios.map((scenario) =>
            item(scenario.id, scenario.label, () => spawn(scenario, scenario.variants[0]))
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
              {item('other', 'Choose another test', () => {
                selection = undefined
                playing = false
                visuals.dispose()
              })}
              {item('comparison', 'Back to comparison', restoreComparison)}
            </UiEntity>
          )}
          {open && !current && !unmountComparison && item('comparison', 'Back to comparison', restoreComparison)}
        </UiEntity>
      </UiEntity>
    )
  })
}
