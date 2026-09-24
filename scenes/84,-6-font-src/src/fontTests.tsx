import {
  engine, Entity, Transform, TextShape, UiText, UiInput, UiDropdown, UiInputResult, UiDropdownResult,
  UiTransform, UiBackground, Font, TextAlignMode, YGUnit, YGPositionType,
  Billboard, MeshRenderer, Material
} from '@dcl/sdk/ecs'
import { movePlayerTo } from '~system/RestrictedActions'
import { Vector3, Color4 } from '@dcl/sdk/math'
import ReactEcs, { ReactEcsRenderer, UiEntity, Button, Label } from '@dcl/sdk/react-ecs'

const sample = 'Hamburgefonts 0123 !?'
const modes = [
  { label: 'Azeret Mono', src: 'assets/fonts/AzeretMono-Medium.ttf', expected: 'Custom monospaced face on all four components.' },
  { label: 'Bungee Shade TTF', src: 'assets/fonts/BungeeShade-Regular.ttf', expected: 'Decorative outlined Latin letters with a dimensional shadow.' },
  { label: 'OTF (rejected)', src: 'assets/fonts/Bungee-Shade.otf', expected: 'Rejected format: built-in sans-serif on all four components. Only TTF is supported.' },
  { label: 'Built-in', src: undefined, expected: 'All samples match the built-in sans-serif control.' },
  { label: 'Missing file', src: 'assets/fonts/missing.ttf', expected: 'Built-in sans-serif; no disappearing text or broken input.' },
  { label: 'Invalid file', src: 'assets/fonts/invalid.ttf', expected: 'Built-in sans-serif; a font warning is expected.' },
  { label: 'Empty source', src: '', expected: 'Same as an unset source: built-in sans-serif.' },
  { label: 'External URL', src: 'https://raw.githubusercontent.com/google/fonts/main/ofl/bungeeshade/BungeeShade-Regular.ttf', expected: 'Rejected: built-in sans-serif, no external font download.' },
  { label: 'Lora family (4 faces)', src: 'Lora', expected: 'True regular, bold, italic and bold italic faces from Fontsource.' },
  { label: 'Family name', src: 'Bungee Shade', expected: 'Fontsource: decorative Bungee Shade face, loaded by family name.' }
]
let mode = 0
let sourceLabel = modes[0].label
let mounted = true
let generation = 0
let fixtures: Entity[] = []
let worldText: Entity
let label: Entity
let input: Entity
let dropdown: Entity
let active = [true, true, true, true]
let steps: Step[] = []
let stepIndex = 0
let remaining = 0
let scenarioTitle = 'Choose a scenario'
let instruction = 'Results are visual checks, not automatic PASS/FAIL.'
let slowSlot = 0
let delayedLoadsEnabled = false
let border: Entity | undefined

type Step = { seconds: number; text: string; action?: () => void }
const componentNames = ['TextShape', 'UiText', 'UiInput', 'UiDropdown']
const slowFileCount = 12
const logSession = Date.now().toString(36)
let logSequence = 0
let runId = 0
let runStartedAt = Date.now()
let sceneSeconds = 0
let lastInputResult: string | undefined
let lastDropdownResult: string | undefined

function logTest(event: string, detail: Record<string, unknown> = {}, error = false) {
  const state = worldText === undefined ? undefined : {
    generation,
    consumers: [
      { kind: 'TextShape', entity: worldText, model: TextShape.getOrNull(worldText) },
      { kind: 'UiText', entity: label, model: UiText.getOrNull(label) },
      { kind: 'UiInput', entity: input, model: UiInput.getOrNull(input) },
      { kind: 'UiDropdown', entity: dropdown, model: UiDropdown.getOrNull(dropdown) }
    ].map(({ kind, entity, model }) => ({ kind, entity, attached: model !== null, fontSrc: model?.fontSrc ?? null })),
    textPosition: Transform.getOrNull(worldText)?.position,
    slowUrlsRemaining: slowFileCount - slowSlot
  }
  const message = '[font-test] ' + JSON.stringify({
    session: logSession, seq: ++logSequence, run: runId, scenario: scenarioTitle,
    event, wallTime: new Date().toISOString(), elapsedMs: Date.now() - runStartedAt,
    sceneSeconds: Math.round(sceneSeconds * 1000) / 1000,
    step: steps.length ? stepIndex + 1 : null, totalSteps: steps.length,
    ...detail, state
  })
  if (error) console.error(message)
  else console.log(message)
}

function stopScenario(reason: string) {
  if (steps.length) logTest('scenario-stopped', { reason, remainingSeconds: remaining })
  steps = []
}

function observeUiResults() {
  const inputResult = active[2] ? UiInputResult.getOrNull(input) : null
  const dropdownResult = active[3] ? UiDropdownResult.getOrNull(dropdown) : null
  const nextInput = inputResult ? JSON.stringify(inputResult) : undefined
  const nextDropdown = dropdownResult ? JSON.stringify(dropdownResult) : undefined
  if (nextInput !== lastInputResult && inputResult) logTest('input-result-observed', { result: inputResult })
  if (nextDropdown !== lastDropdownResult && dropdownResult) logTest('dropdown-result-observed', { result: dropdownResult })
  lastInputResult = nextInput
  lastDropdownResult = nextDropdown
}

function setSource(src: string | undefined) {
  const selectedMode = modes.findIndex(item => item.src === src)
  if (selectedMode >= 0) mode = selectedMode
  sourceLabel = selectedMode >= 0 ? modes[selectedMode].label : 'Delayed Bungee Shade'
  if (active[0]) TextShape.getMutable(worldText).fontSrc = src
  if (active[1]) UiText.getMutable(label).fontSrc = src
  if (active[2]) UiInput.getMutable(input).fontSrc = src
  if (active[3]) UiDropdown.getMutable(dropdown).fontSrc = src
  logTest('source-requested', { source: src ?? null, label: sourceLabel })
}

function removeOne(index: number) {
  if (!active[index]) return
  if (index === 0) TextShape.deleteFrom(worldText)
  if (index === 1) UiText.deleteFrom(label)
  if (index === 2) UiInput.deleteFrom(input)
  if (index === 3) UiDropdown.deleteFrom(dropdown)
  active[index] = false
  mounted = active.some(Boolean)
  logTest('component-removed', { component: componentNames[index] })
}

function resetScenario() {
  stopScenario('reset or new scenario')
  if (border !== undefined) engine.removeEntity(border)
  border = undefined
  mode = 0
  Transform.getMutable(worldText).position = Vector3.create(52, 3, 58)
  attachComponents()
  scenarioTitle = 'Manual controls'
  instruction = 'Scenario stopped. All four samples restored; input and selection reset.'
  logTest('fixtures-reset', { expected: instruction })
}

function begin(title: string, sequence: Step[]) {
  resetScenario()
  scenarioTitle = title
  runId++
  runStartedAt = Date.now()
  steps = sequence
  stepIndex = 0
  logTest('scenario-started', { expected: 'Execute steps; visual verification required, no automatic PASS.' })
  enterStep()
}

function enterStep() {
  if (stepIndex >= steps.length) {
    logTest('scenario-completed', { completedSteps: steps.length, expected: instruction, verdict: 'not-automatically-verified' })
    steps = []
    instruction = 'Finished (verify visually). ' + instruction
    return
  }
  const step = steps[stepIndex]
  remaining = step.seconds
  instruction = step.text
  logTest('step-started', { durationSeconds: step.seconds, expected: step.text })
  try {
    step.action?.()
    logTest('step-applied', { expected: step.text })
  } catch (error) {
    logTest('step-failed', { error: String(error), stack: error instanceof Error ? error.stack : undefined }, true)
    stopScenario('step exception')
    instruction = 'Scenario stopped due to an error. See [font-test] logs.'
  }
}

function freshSlowFile(): string | undefined {
  if (slowSlot >= slowFileCount) {
    instruction = '12 cold URLs used. Restart/reload the scene in Explorer to clear its font cache before repeating.'
    logTest('scenario-blocked', { reason: instruction })
    return undefined
  }
  slowSlot++
  return 'assets/fonts/slow/BungeeShade-' + slowSlot.toString().padStart(2, '0') + '.ttf'
}

function runShared() {
  begin('Shared font / one owner at a time', [
    { seconds: 6, text: 'All four show Bungee Shade. Open the dropdown and type in the input.', action: () => setSource(modes[1].src) },
    ...componentNames.map((name, index) => ({
      seconds: 4, text: 'Removed ' + name + '. Remaining samples must keep Bungee Shade.', action: () => removeOne(index)
    })),
    { seconds: 4, text: 'All consumers removed. Nothing should still render except controls.' },
    { seconds: 6, text: 'All recreated with Bungee Shade. Input/selection reset is expected here.', action: () => { mode = 1; attachComponents() } }
  ])
}

function runStyles() {
  begin('Lora / real style variants', [
    { seconds: 15, text: 'Loading Lora: compare regular, bold, italic and both in UiText and 3D. Inspect input/dropdown too.', action: () => setSource('Lora') },
    { seconds: 5, text: 'Built-in control for comparison.', action: () => setSource(undefined) },
    { seconds: 10, text: 'Lora again from cache. All style runs must return.', action: () => setSource('Lora') }
  ])
}

function runFallbacks() {
  const cases = modes.filter(m => ['OTF (rejected)', 'Missing file', 'Invalid file', 'Empty source', 'External URL'].includes(m.label))
  begin('Fallbacks / recovery', cases.flatMap(item => [
    { seconds: 3, text: 'Valid Bungee Shade before the next invalid source.', action: () => setSource(modes[1].src) },
    { seconds: 4, text: item.label + ': built-in on all four; input/dropdown remain usable.', action: () => setSource(item.src) }
  ]).concat([{ seconds: 5, text: 'Recovery: all four must show Bungee Shade again.', action: () => setSource(modes[1].src) }]))
}

function runChurn() {
  begin('20 recreate cycles', [
    { seconds: 3, text: 'Watch the four samples. Use the Unity Profiler for resource counts.', action: () => { mode = 1; setSource(modes[1].src) } },
    ...Array.from({ length: 20 }, (_, index) => ({ seconds: 0.7, text: 'Recreate cycle ' + (index + 1) + '/20. No stuck or duplicate samples.', action: recreate })),
    { seconds: 6, text: 'Final state: exactly one of each sample, all Bungee Shade. Inspect input/dropdown.' }
  ])
}

function runDelayed(remove: boolean) {
  if (!delayedLoadsEnabled) {
    instruction = 'Local only: cases 5 and 6 require the delayed preview server. See README. Unavailable on zone.'
    logTest('scenario-blocked', { reason: instruction })
    return
  }
  const src = freshSlowFile()
  if (!src) return
  begin(remove ? 'Cancel by removing consumers' : 'Last source wins', [
    { seconds: 2, text: 'Requesting delayed Bungee Shade (8s). Requires start:fonts; server must log DELAY.', action: () => setSource(src) },
    { seconds: 2, text: remove ? 'All components removed while font is loading.' : 'Switch to Azeret before Bungee can arrive.', action: () => {
      if (remove) for (let i = 0; i < 4; i++) removeOne(i)
      else setSource(modes[0].src)
    } },
    { seconds: 8, text: 'Expected final state: Azeret on all four. The late Bungee result must never overwrite it.', action: () => { if (remove) attachComponents() } },
    { seconds: 4, text: 'Inspect input/dropdown. No delayed Bungee switch, exceptions or missing text.' }
  ])
}

function runBoundary() {
  begin('TextShape / scene boundary x=64', [
    { seconds: 8, text: 'Near east boundary: cyan line is x=63.9. Accept the move prompt if shown. Text starts fully inside.', action: () => {
      border = engine.addEntity()
      Transform.create(border, { position: Vector3.create(63.9, 2, 58), scale: Vector3.create(0.08, 4, 10) })
      MeshRenderer.setBox(border)
      Material.setPbrMaterial(border, { albedoColor: Color4.create(0, 1, 1, 1) })
      Transform.getMutable(worldText).position = Vector3.create(56, 3, 58)
      TextShape.getMutable(worldText).text = 'MMMMMMMM'
      const movementRun = runId
      logTest('player-move-requested', { target: { x: 56, y: 0, z: 50 } })
      movePlayerTo({ newRelativePosition: Vector3.create(56, 0, 50), cameraTarget: Vector3.create(62, 3, 58) })
        .then(result => logTest('player-move-response', { initiatingRun: movementRun, result }))
        .catch(error => {
          logTest('player-move-failed', { initiatingRun: movementRun, error: String(error) }, true)
          if (runId === movementRun) instruction = 'Move failed: walk to east edge manually. ' + String(error)
        })
    } },
    { seconds: 5, text: 'Near edge at x=62. Switch only font; visibility must settle to match the new bounds.', action: () => { Transform.getMutable(worldText).position.x = 62; setSource(modes[1].src) } },
    { seconds: 5, text: 'Same position, Azeret. Look for stale clipping or stuck visibility.', action: () => setSource(modes[0].src) },
    { seconds: 5, text: 'Center outside at x=68: 3D sample should be hidden. UI remains visible.', action: () => { Transform.getMutable(worldText).position.x = 68 } },
    { seconds: 6, text: 'Back inside at x=56 with Bungee: 3D sample must reappear.', action: () => { Transform.getMutable(worldText).position.x = 56; setSource(modes[1].src) } }
  ])
}

function uiBox(top: number, height: number): Entity {
  const entity = engine.addEntity()
  fixtures.push(entity)
  Object.assign(UiTransform.create(entity), {
    positionType: YGPositionType.YGPT_ABSOLUTE,
    positionLeft: 100, positionLeftUnit: YGUnit.YGU_POINT,
    positionTop: top, positionTopUnit: YGUnit.YGU_POINT,
    width: 540, widthUnit: YGUnit.YGU_POINT,
    height, heightUnit: YGUnit.YGU_POINT
  })
  UiBackground.create(entity, { textureMode: 0, uvs: [], color: Color4.create(0.06, 0.07, 0.1, 0.95) })
  return entity
}

function worldLabel(text: string, y: number, size: number): Entity {
  const entity = engine.addEntity()
  fixtures.push(entity)
  Transform.create(entity, { position: Vector3.create(52, y, 58) })
  Billboard.create(entity)
  TextShape.create(entity, { text, fontSize: size, textColor: Color4.White(), font: Font.F_SANS_SERIF })
  return entity
}

function attachComponents() {
  sourceLabel = modes[mode].label
  TextShape.createOrReplace(worldText, {
    text: sample + '\n<b>Bold</b> / <i>Italic</i> / <b><i>Both</i></b>\nПривет мир — café',
    font: Font.F_SANS_SERIF, fontSize: 3, fontSrc: modes[mode].src,
    textColor: Color4.White(), width: 12, height: 3
  })
  UiText.createOrReplace(label, {
    value: 'UiText: ' + sample + '\n<b>Bold</b> / <i>Italic</i> / <b><i>Both</i></b>\nПривет мир — café',
    font: Font.F_SANS_SERIF, fontSize: 22, fontSrc: modes[mode].src,
    color: Color4.White(), textAlign: TextAlignMode.TAM_MIDDLE_LEFT
  })
  UiInput.createOrReplace(input, {
    placeholder: 'UiInput: type here / введи текст', value: '', disabled: false,
    font: Font.F_SANS_SERIF, fontSize: 22, fontSrc: modes[mode].src,
    color: Color4.White(), placeholderColor: Color4.create(0.65, 0.75, 0.9, 1)
  })
  UiDropdown.createOrReplace(dropdown, {
    options: ['UiDropdown: Hamburgefonts 0123', 'Second option: café', 'Третий вариант'],
    selectedIndex: 0, disabled: false, acceptEmpty: false, font: Font.F_SANS_SERIF, fontSize: 22,
    fontSrc: modes[mode].src, color: Color4.White()
  })
  active = [true, true, true, true]
  mounted = true
  logTest('components-attached', { inputAndSelectionReset: true })
}

function createFixtures() {
  worldLabel('FONT SRC / 3D TextShape', 5.5, 3)
  worldLabel('CONTROL: ' + sample, 4.6, 2)
  worldText = worldLabel('', 3, 3)
  const control = uiBox(80, 60)
  UiText.create(control, {
    value: 'BUILT-IN CONTROL\n' + sample,
    font: Font.F_SANS_SERIF, fontSize: 22,
    color: Color4.White(), textAlign: TextAlignMode.TAM_MIDDLE_LEFT
  })
  label = uiBox(148, 105)
  input = uiBox(263, 45)
  dropdown = uiBox(318, 45)
  generation++
  attachComponents()
  logTest('fixtures-created')
}

function selectMode(index: number) {
  stopScenario('manual source selection')
  mode = index
  setSource(modes[mode].src)
  logTest('manual-source-selected', { expected: modes[mode].expected })
}

function toggleComponents() {
  logTest('manual-components-toggle', { action: mounted ? 'remove' : 'attach' })
  if (!mounted) {
    attachComponents()
    return
  }
  for (let i = 0; i < 4; i++) removeOne(i)
}

function recreate() {
  logTest('fixtures-destroy-requested', { entities: fixtures.slice() })
  for (const entity of fixtures) engine.removeEntity(entity)
  fixtures = []
  createFixtures()
}

export function setupFontTests(options: { delayedLoads: boolean }) {
  delayedLoadsEnabled = options.delayedLoads
  logTest('scene-started', { message: 'JS intent/state only; native font loading and rendering require Explorer verification.' })
  engine.addSystem(dt => {
    sceneSeconds += dt
    observeUiResults()
    if (!steps.length) return
    remaining -= dt
    if (remaining <= 0) {
      logTest('step-ended', { expected: steps[stepIndex].text })
      stepIndex++
      enterStep()
    }
  })
  createFixtures()
  ReactEcsRenderer.setUiRenderer(() => (
    <UiEntity uiTransform={{ width: '100%', height: '100%', positionType: 'absolute' }}>
    <UiEntity uiTransform={{ positionType: 'absolute', position: { top: 380, left: 100 }, width: 540, flexDirection: 'column', padding: 10 }}
      uiBackground={{ color: Color4.create(0.06, 0.07, 0.1, 0.95) }}>
      <Label value={'font_src: ' + sourceLabel + ' | ' + (mounted ? 'attached' : 'removed') + ' | generation ' + generation}
        fontSize={18} textAlign='middle-left' uiTransform={{ height: 28 }} />
      <Label value={steps.length ? 'Follow the current scenario in the right panel.' : 'Use manual controls or start a scenario on the right.'} fontSize={14} textAlign='middle-left' uiTransform={{ height: 40 }} />
      <UiEntity uiTransform={{ flexDirection: 'row', flexWrap: 'wrap', width: '100%' }}>
        {modes.map((item, index) => <Button key={item.label} value={item.label} fontSize={15}
          uiTransform={{ width: 165, height: 36, margin: 2 }} onMouseDown={() => selectMode(index)} />)}
      </UiEntity>
      <UiEntity uiTransform={{ flexDirection: 'row' }}>
        <Button value={mounted ? 'Remove components' : 'Re-add components'} fontSize={15}
          uiTransform={{ width: 250, height: 36, margin: 2 }} onMouseDown={() => { stopScenario('manual component toggle'); toggleComponents() }} />
        <Button value='Recreate entities' fontSize={15}
          uiTransform={{ width: 250, height: 36, margin: 2 }} onMouseDown={() => { stopScenario('manual recreate'); recreate() }} />
      </UiEntity>
      <Label value={'Alt: unlock cursor. Compare UI and the 3D samples ahead.\nTry fast A/B switching, typing, opening the dropdown and re-entering the scene.'}
        fontSize={13} textAlign='middle-left' uiTransform={{ height: 42 }} />
    </UiEntity>
    <UiEntity uiTransform={{ positionType: 'absolute', position: { top: 80, right: 20 }, width: 440, flexDirection: 'column', padding: 12 }}
      uiBackground={{ color: Color4.create(0.04, 0.08, 0.12, 0.96) }}>
      <Label value={'SCENARIOS | ' + scenarioTitle} fontSize={17} textAlign='middle-left' uiTransform={{ height: 36 }} />
      <Label value={steps.length ? 'Step ' + (stepIndex + 1) + '/' + steps.length + ' | ' + Math.max(0, Math.ceil(remaining)) + 's' : 'Idle / finished'} fontSize={15} uiTransform={{ height: 24 }} />
      <Label value={instruction} fontSize={15} textAlign='middle-left' uiTransform={{ height: 92 }} />
      {[
        ['1. Lora: four styles', runStyles], ['2. Shared font: remove owners', runShared],
        ['3. Fallbacks + recovery', runFallbacks], ['4. Recreate x20', runChurn],
        [delayedLoadsEnabled ? '5. Delayed load: switch' : '5. Switch while loading (local only)', () => runDelayed(false)], [delayedLoadsEnabled ? '6. Delayed load: remove' : '6. Remove while loading (local only)', () => runDelayed(true)],
        ['7. Scene boundary', runBoundary], ['Stop / reset', resetScenario]
      ].map(([title, action]) => <Button key={title as string} value={title as string} fontSize={15}
        uiTransform={{ height: 34, margin: 2 }} onMouseDown={action as () => void} />)}
      <Label value={(delayedLoadsEnabled ? 'Local delay enabled. Fresh URLs left: ' + (slowFileCount - slowSlot) : 'Cases 5 and 6: local preview only; unavailable on zone.') + '\nVisual inspection required; memory/deferred deletion use Unity tests.'}
        fontSize={13} textAlign='middle-left' uiTransform={{ height: 60 }} />
    </UiEntity>
    </UiEntity>
  ))
}
