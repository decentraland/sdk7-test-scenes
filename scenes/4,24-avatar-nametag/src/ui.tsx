import { AvatarModifierArea, AvatarModifierType, AvatarNametag, engine, Entity } from '@dcl/sdk/ecs'
import type { PBAvatarNametag } from '@dcl/sdk/ecs'
import ReactEcs, { Button, Input, Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { Vector3 } from '@dcl/sdk/math'
import type { Color3 } from '@dcl/sdk/math'
import { isUseColorsOn, setPlayerManualOverride, toggleUseColors } from './modules/multiplayerRoster'

// -----------------------------------------------------------------------------
// Mutable module-level state. ReactEcsRenderer re-renders every frame, so plain
// mutable variables are enough — no useState needed.
// -----------------------------------------------------------------------------

// Console prefix for this panel's own diagnostics (separate from the MP_LOG_PREFIX multiplayer
// roster logs in modules/multiplayerRoster.ts).
const UI_LOG_PREFIX = '[AvatarNametagTest]'

// Wraps a button/input callback so a thrown exception is logged instead of propagating out of
// the renderer's event dispatch. One bad handler must not be able to wedge every other button on
// the panel for the rest of the session.
function safeHandler(actionName: string, fn: () => void): () => void {
  return () => {
    try {
      fn()
    } catch (e) {
      console.log(`${UI_LOG_PREFIX} handler "${actionName}" threw: ${e}`)
    }
  }
}

// Same as safeHandler, for single-argument callbacks (Input's onChange/onSubmit pass the typed
// string through) -- the argument must not be swallowed by the wrapper.
function safeArgHandler(actionName: string, fn: (value: string) => void): (value: string) => void {
  return (value: string) => {
    try {
      fn(value)
    } catch (e) {
      console.log(`${UI_LOG_PREFIX} handler "${actionName}" threw: ${e}`)
    }
  }
}

type ColorChoice = { mode: 'native' } | { mode: 'custom'; name: string; color: Color3 }

const NATIVE_CHOICE: ColorChoice = { mode: 'native' }

type TargetKey = 'player' | 'npcJohn' | 'npcSign'

interface TargetState {
  entity: Entity
  displayName: string
  label: string
  draftLabel: string
  labelColorChoice: ColorChoice
  backgroundColorChoice: ColorChoice
  borderColorChoice: ColorChoice
  componentRemoved: boolean
}

// Populated by setupUi() once npc1/npc2/hideNametagsAreaEntity exist. Previously this module
// imported those three entities directly from index.ts at the top level, which made index.ts and
// ui.tsx a circular import pair: index.ts's "import { setupUi } from './ui'" ran (and therefore
// fully evaluated this whole file, including this record literal) before index.ts had reached its
// own "export const npc1 = engine.addEntity()" line further down. That left npc1/npc2 undefined
// here at module-load time, so the NPC John / NPC Sign panel targets silently pointed at
// `entity: undefined` and threw the moment anything tried to apply a nametag to them. Passing the
// entities in as setupUi() arguments (called from index.ts's main(), after the entities exist)
// avoids the cycle entirely.
let targetStates: Record<TargetKey, TargetState> | null = null

function currentTarget(): TargetState {
  if (targetStates === null) {
    throw new Error(`${UI_LOG_PREFIX} currentTarget() called before setupUi() finished initializing`)
  }
  return targetStates[selectedTargetKey]
}

let selectedTargetKey: TargetKey = 'player'

function selectTarget(key: TargetKey) {
  selectedTargetKey = key
}

// Same entity, same reasoning as targetStates above: received via setupUi() instead of imported
// from index.ts, to avoid the circular-import ordering bug.
let hideNametagsAreaEntityRef: Entity | null = null

// Whole-scene AvatarModifierArea toggle. Default OFF — the AvatarModifierArea component is not
// present on hideNametagsAreaEntity until this button is pressed once.
let hideNametagsAreaOn = false

// `name` is the button caption, `label` is what actually gets sent — they differ only where the
// label itself would render as an unreadable caption (the whitespace-only preset).
const LABEL_PRESETS: { name: string; label: string }[] = [
  { name: 'Junior Janitor', label: 'Junior Janitor' },
  { name: '⭐ CLUB OWNER ⭐', label: '⭐ CLUB OWNER ⭐' },
  { name: 'Rank 42', label: 'Rank 42' },
  {
    name: 'This Is A Deliberately Long Nametag Label Used To Exercise The Ellipsis Truncation',
    label: 'This Is A Deliberately Long Nametag Label Used To Exercise The Ellipsis Truncation'
  },
  // Ten spaces: a text-less plate widened by whitespace alone (the pure color-coding case).
  { name: '10 spaces (width only)', label: '          ' }
]

const LABEL_COLOR_PRESETS: { name: string; color: Color3 }[] = [
  { name: 'White', color: { r: 1, g: 1, b: 1 } },
  { name: 'Red', color: { r: 1, g: 0.2, b: 0.2 } },
  { name: 'Green', color: { r: 0.2, g: 1, b: 0.2 } },
  { name: 'Blue', color: { r: 0.3, g: 0.5, b: 1 } },
  { name: 'Yellow', color: { r: 1, g: 0.9, b: 0.1 } },
  // Byte-identical to the background 'Royal' preset: label_color == background_color makes the
  // text invisible while the plate stays sized to it (the hidden-word trick from the proto docs).
  { name: 'Royal', color: { r: 0.2, g: 0.4, b: 0.95 } }
]

const BACKGROUND_COLOR_PRESETS: { name: string; color: Color3 }[] = [
  { name: 'White', color: { r: 0.95, g: 0.95, b: 0.95 } },
  { name: 'Royal', color: { r: 0.2, g: 0.4, b: 0.95 } },
  { name: 'Violet', color: { r: 0.65, g: 0.3, b: 0.95 } },
  { name: 'Crimson', color: { r: 0.9, g: 0.15, b: 0.25 } },
  { name: 'Lime', color: { r: 0.35, g: 0.85, b: 0.3 } }
]

const BORDER_COLOR_PRESETS: { name: string; color: Color3 }[] = [
  { name: 'White', color: { r: 0.95, g: 0.95, b: 0.95 } },
  { name: 'Gold', color: { r: 1, g: 0.84, b: 0 } },
  { name: 'Cyan', color: { r: 0.2, g: 0.9, b: 0.95 } },
  { name: 'Magenta', color: { r: 0.95, g: 0.2, b: 0.8 } }
]

// -----------------------------------------------------------------------------
// Mutations — every control funnels through applyNametag() so the payload sent
// to the renderer always reflects the full current state (createOrReplace is a
// full replace, not a patch).
// -----------------------------------------------------------------------------

function applyNametag() {
  const target = currentTarget()
  const payload: PBAvatarNametag = { label: target.label }
  if (target.labelColorChoice.mode === 'custom') {
    payload.labelColor = target.labelColorChoice.color
  }
  if (target.backgroundColorChoice.mode === 'custom') {
    payload.backgroundColor = target.backgroundColorChoice.color
  }
  if (target.borderColorChoice.mode === 'custom') {
    payload.borderColor = target.borderColorChoice.color
  }
  AvatarNametag.createOrReplace(target.entity, payload)
  target.componentRemoved = false

  // The panel just took manual control of the local player -- tell the auto-tag system
  // (modules/multiplayerRoster.ts) to leave this entity alone until "Clear (empty label)" is
  // pressed, so the two don't fight over the same component every ~1s.
  if (selectedTargetKey === 'player') {
    setPlayerManualOverride(true)
    console.log(`${UI_LOG_PREFIX} manual override SET for local player (panel apply)`)
  }
}

function setLabel(text: string) {
  const target = currentTarget()
  target.label = text
  target.draftLabel = text
  applyNametag()
}

function clearLabel() {
  setLabel('')
  // Hand control of the local player back to the auto-tag system.
  if (selectedTargetKey === 'player') {
    setPlayerManualOverride(false)
    console.log(`${UI_LOG_PREFIX} manual override CLEARED for local player ('Clear' pressed)`)
  }
}

function setLabelColor(choice: ColorChoice) {
  currentTarget().labelColorChoice = choice
  applyNametag()
}

function setBackgroundColor(choice: ColorChoice) {
  currentTarget().backgroundColorChoice = choice
  applyNametag()
}

function setBorderColor(choice: ColorChoice) {
  currentTarget().borderColorChoice = choice
  applyNametag()
}

function removeComponent() {
  const target = currentTarget()
  AvatarNametag.deleteFrom(target.entity)
  target.componentRemoved = true
}

// Covers the whole scene (player spawn + both NPCs) with an AMT_HIDE_NAMETAGS
// AvatarModifierArea. Independent of the target selector above — it always applies to every
// avatar inside its bounds, not just the currently selected target.
function toggleHideNametagsArea() {
  if (hideNametagsAreaEntityRef === null) {
    return
  }
  hideNametagsAreaOn = !hideNametagsAreaOn
  if (hideNametagsAreaOn) {
    AvatarModifierArea.createOrReplace(hideNametagsAreaEntityRef, {
      area: Vector3.create(16, 8, 16),
      excludeIds: [],
      modifiers: [AvatarModifierType.AMT_HIDE_NAMETAGS]
    })
  } else {
    AvatarModifierArea.deleteFrom(hideNametagsAreaEntityRef)
  }
}

// -----------------------------------------------------------------------------
// Display helpers
// -----------------------------------------------------------------------------

function formatColorChoice(choice: ColorChoice): string {
  if (choice.mode === 'native') {
    return 'native (renderer default)'
  }
  const c = choice.color
  return `${choice.name} (${c.r.toFixed(2)}, ${c.g.toFixed(2)}, ${c.b.toFixed(2)})`
}

function statusText(): string {
  const target = currentTarget()
  const labelDisplay = target.label.length === 0 ? '<empty - bare plate>' : target.label
  const componentState = target.componentRemoved ? 'REMOVED (deleteFrom called)' : 'present'
  return (
    `target: ${target.displayName}\n` +
    `label: "${labelDisplay}"\n` +
    `labelColor: ${formatColorChoice(target.labelColorChoice)}\n` +
    `backgroundColor: ${formatColorChoice(target.backgroundColorChoice)}\n` +
    `borderColor: ${formatColorChoice(target.borderColorChoice)}\n` +
    `component: ${componentState}`
  )
}

function swatchColor4(color: Color3) {
  return { r: color.r, g: color.g, b: color.b, a: 1 }
}

// A swatch button paints the preset colour as its own background, so its caption has to flip to
// black on the light ones (White/Yellow/Lime) to stay legible. Rec. 601 luma, threshold picked by
// eye against the preset lists above.
function readableTextColor(color: Color3) {
  const luma = 0.299 * color.r + 0.587 * color.g + 0.114 * color.b
  return luma > 0.6 ? { r: 0.05, g: 0.05, b: 0.05, a: 1 } : { r: 1, g: 1, b: 1, a: 1 }
}

function choiceName(choice: ColorChoice): string {
  return choice.mode === 'native' ? 'native' : choice.name
}

// -----------------------------------------------------------------------------
// Layout / typography. The panel is split across the four screen corners so each
// group can use a font size that is actually readable at 1920x1080 virtual size;
// a single column could not. Tweak CORNER_INSET / the per-panel width+height if a
// panel ever collides with the explorer's own HUD.
// -----------------------------------------------------------------------------

const CORNER_INSET = 20

const FONT_HEADER = 28
const FONT_SECTION = 20
const FONT_BODY = 19
const FONT_BUTTON = 17
const FONT_HINT = 15

const PANEL_BG = { color: { r: 0.03, g: 0.03, b: 0.05, a: 0.88 } }
const HEADER_COLOR = { r: 1, g: 0.82, b: 0.3, a: 1 }
const TEXT_COLOR = { r: 1, g: 1, b: 1, a: 1 }
const MUTED_COLOR = { r: 0.8, g: 0.8, b: 0.82, a: 1 }
const ON_COLOR = { color: { r: 0.1, g: 0.5, b: 0.1, a: 1 } }
const DANGER_COLOR = { color: { r: 0.65, g: 0.12, b: 0.12, a: 1 } }

function panelHeader(text: string) {
  return (
    <Label
      value={text}
      fontSize={FONT_HEADER}
      color={HEADER_COLOR}
      textAlign="middle-left"
      uiTransform={{ width: '100%', height: 36 }}
    />
  )
}

function sectionLabel(text: string) {
  return (
    <Label
      value={text}
      fontSize={FONT_SECTION}
      color={TEXT_COLOR}
      textAlign="middle-left"
      uiTransform={{ width: '100%', height: 26, margin: { top: 6 } }}
    />
  )
}

// One row of colour swatches: a "native" reset followed by the preset colours. The currently
// applied choice is marked with a leading tick, since a swatch cannot show a selection border
// (SDK7 UiTransform has no border support).
function swatchRow(
  keyPrefix: string,
  presets: { name: string; color: Color3 }[],
  applied: ColorChoice,
  onPick: (choice: ColorChoice) => void
) {
  const appliedName = choiceName(applied)
  return (
    <UiEntity uiTransform={{ width: '100%', height: 48, flexDirection: 'row', flexWrap: 'wrap' }}>
      <Button
        key={`${keyPrefix}-native`}
        value={appliedName === 'native' ? '✔ native' : 'native'}
        variant="secondary"
        fontSize={FONT_BUTTON}
        onMouseDown={safeHandler(`${keyPrefix}:native`, () => onPick(NATIVE_CHOICE))}
        uiTransform={{ width: 100, height: 40, margin: { right: 6, bottom: 6 } }}
      />
      {presets.map((preset) => (
        <Button
          key={`${keyPrefix}-${preset.name}`}
          value={appliedName === preset.name ? `✔ ${preset.name}` : preset.name}
          fontSize={FONT_BUTTON}
          color={readableTextColor(preset.color)}
          onMouseDown={safeHandler(`${keyPrefix}:${preset.name}`, () =>
            onPick({ mode: 'custom', name: preset.name, color: preset.color })
          )}
          uiTransform={{ width: 100, height: 40, margin: { right: 6, bottom: 6 } }}
          uiBackground={{ color: swatchColor4(preset.color) }}
        />
      ))}
    </UiEntity>
  )
}

// -----------------------------------------------------------------------------
// UI
// -----------------------------------------------------------------------------

// Called once from index.ts's main(), after npc1/npc2/hideNametagsAreaEntity have been created --
// see the comment on `targetStates` above for why these come in as parameters instead of being
// imported from index.ts.
export function setupUi(npc1: Entity, npc2: Entity, hideNametagsAreaEntity: Entity) {
  hideNametagsAreaEntityRef = hideNametagsAreaEntity

  // Initial label/color/removed values here must be kept in sync with the AvatarNametag.create(...)
  // calls in index.ts so the panel's displayed state matches what is actually on the component when
  // the scene loads. Note: the local player's entry is overwritten by the auto-tag system
  // (modules/multiplayerRoster.ts) within ~1s of scene start, unless this panel is used first.
  targetStates = {
    player: {
      entity: engine.PlayerEntity,
      displayName: 'Player',
      label: 'MainPlayer Test Nametag',
      draftLabel: 'MainPlayer Test Nametag',
      labelColorChoice: NATIVE_CHOICE,
      backgroundColorChoice: NATIVE_CHOICE,
      borderColorChoice: NATIVE_CHOICE,
      componentRemoved: false
    },
    npcJohn: {
      entity: npc1,
      displayName: 'NPC John',
      label: 'Boss',
      draftLabel: 'Boss',
      labelColorChoice: NATIVE_CHOICE,
      backgroundColorChoice: NATIVE_CHOICE,
      borderColorChoice: NATIVE_CHOICE,
      componentRemoved: false
    },
    npcSign: {
      entity: npc2,
      displayName: 'NPC Sign',
      label: 'Sign Only',
      draftLabel: 'Sign Only',
      labelColorChoice: NATIVE_CHOICE,
      backgroundColorChoice: NATIVE_CHOICE,
      borderColorChoice: NATIVE_CHOICE,
      componentRemoved: false
    }
  }

  ReactEcsRenderer.setUiRenderer(uiMenu, { virtualWidth: 1920, virtualHeight: 1080 })
}

// Top-left: what everything else acts on, plus the live component readout.
const targetPanel = () => (
  <UiEntity
    uiTransform={{
      positionType: 'absolute',
      position: { left: CORNER_INSET, top: CORNER_INSET },
      width: 660,
      height: 350,
      flexDirection: 'column',
      padding: 16
    }}
    uiBackground={PANEL_BG}
  >
    {panelHeader('1 · TARGET')}
    {sectionLabel('Applies to')}
    <UiEntity uiTransform={{ width: '100%', height: 48, flexDirection: 'row' }}>
      <Button
        value="Player"
        variant={selectedTargetKey === 'player' ? 'primary' : 'secondary'}
        fontSize={FONT_BODY}
        onMouseDown={safeHandler('selectTarget:player', () => selectTarget('player'))}
        uiTransform={{ width: 200, height: 42, margin: { right: 8 } }}
      />
      <Button
        value="NPC John"
        variant={selectedTargetKey === 'npcJohn' ? 'primary' : 'secondary'}
        fontSize={FONT_BODY}
        onMouseDown={safeHandler('selectTarget:npcJohn', () => selectTarget('npcJohn'))}
        uiTransform={{ width: 200, height: 42, margin: { right: 8 } }}
      />
      <Button
        value="NPC Sign"
        variant={selectedTargetKey === 'npcSign' ? 'primary' : 'secondary'}
        fontSize={FONT_BODY}
        onMouseDown={safeHandler('selectTarget:npcSign', () => selectTarget('npcSign'))}
        uiTransform={{ width: 200, height: 42 }}
      />
    </UiEntity>
    {sectionLabel('Current component state')}
    <Label
      value={statusText()}
      fontSize={FONT_BODY}
      textWrap="wrap"
      textAlign="top-left"
      color={MUTED_COLOR}
      uiTransform={{ width: '100%', height: 160, margin: { top: 2 } }}
    />
  </UiEntity>
)

// Top-right: the label string itself — freeform input and the canned presets.
const labelTextPanel = () => (
  <UiEntity
    uiTransform={{
      positionType: 'absolute',
      position: { right: CORNER_INSET, top: CORNER_INSET },
      width: 660,
      height: 340,
      flexDirection: 'column',
      padding: 16
    }}
    uiBackground={PANEL_BG}
  >
    {panelHeader('2 · LABEL TEXT')}
    {sectionLabel('Custom')}
    <UiEntity uiTransform={{ width: '100%', height: 52, flexDirection: 'row', margin: { top: 2 } }}>
      <Input
        value={currentTarget().draftLabel}
        placeholder="type a label..."
        onChange={safeArgHandler('draftLabel:onChange', (value) => {
          currentTarget().draftLabel = value
        })}
        onSubmit={safeArgHandler('label:onSubmit', (value) => setLabel(value))}
        uiTransform={{ width: 430, height: 44, margin: { right: 8 } }}
        fontSize={FONT_BODY}
      />
      <Button
        value="Apply"
        variant="primary"
        fontSize={FONT_BODY}
        onMouseDown={safeHandler('applyText', () => setLabel(currentTarget().draftLabel))}
        uiTransform={{ width: 170, height: 44 }}
      />
    </UiEntity>
    {sectionLabel('Presets')}
    <UiEntity uiTransform={{ width: '100%', height: 150, flexDirection: 'row', flexWrap: 'wrap' }}>
      {LABEL_PRESETS.map((preset) => (
        <Button
          key={preset.name}
          value={preset.name.length > 24 ? preset.name.slice(0, 21) + '...' : preset.name}
          variant="secondary"
          fontSize={FONT_BUTTON}
          onMouseDown={safeHandler(`labelPreset:${preset.name}`, () => setLabel(preset.label))}
          uiTransform={{ width: 305, height: 40, margin: { right: 8, bottom: 8 } }}
        />
      ))}
      <Button
        value="Clear (empty label)"
        variant="secondary"
        fontSize={FONT_BUTTON}
        onMouseDown={safeHandler('clearLabel', () => clearLabel())}
        uiTransform={{ width: 305, height: 40, margin: { right: 8, bottom: 8 } }}
        uiBackground={DANGER_COLOR}
      />
    </UiEntity>
  </UiEntity>
)

// Bottom-left: the three Color3 fields of the component, one swatch row each.
const colorsPanel = () => (
  <UiEntity
    uiTransform={{
      positionType: 'absolute',
      position: { left: CORNER_INSET, bottom: CORNER_INSET },
      width: 700,
      height: 320,
      flexDirection: 'column',
      padding: 16
    }}
    uiBackground={PANEL_BG}
  >
    {panelHeader('3 · COLORS')}
    {sectionLabel('Label color')}
    {swatchRow('labelColor', LABEL_COLOR_PRESETS, currentTarget().labelColorChoice, setLabelColor)}
    {sectionLabel('Background color')}
    {swatchRow('backgroundColor', BACKGROUND_COLOR_PRESETS, currentTarget().backgroundColorChoice, setBackgroundColor)}
    {sectionLabel('Border color')}
    {swatchRow('borderColor', BORDER_COLOR_PRESETS, currentTarget().borderColorChoice, setBorderColor)}
  </UiEntity>
)

// Bottom-right: everything that is not per-target — the scene-wide AvatarModifierArea test, the
// multiplayer auto-tag toggle, and the component teardown button.
const scenePanel = () => (
  <UiEntity
    uiTransform={{
      positionType: 'absolute',
      position: { right: CORNER_INSET, bottom: CORNER_INSET },
      width: 660,
      height: 380,
      flexDirection: 'column',
      padding: 16
    }}
    uiBackground={PANEL_BG}
  >
    {panelHeader('4 · SCENE & MULTIPLAYER')}

    {/* AvatarModifierArea (AMT_HIDE_NAMETAGS) test: applies to every avatar in the scene, not
        just the currently selected target. Expected with the plate present: the native nametag
        hides and the plate slides down into its slot. A second, always-on walk-in zone at
        (13,2,13) area 4x6x4 (marked by an orange ground box) exercises the same modifier via
        natural enter/leave instead of this button. */}
    {sectionLabel('Scene-wide AvatarModifierArea')}
    <Button
      value={`Hide Nametags Area: ${hideNametagsAreaOn ? 'ON' : 'OFF'}`}
      variant={hideNametagsAreaOn ? 'primary' : 'secondary'}
      fontSize={FONT_BODY}
      onMouseDown={safeHandler('toggleHideNametagsArea', () => toggleHideNametagsArea())}
      uiTransform={{ width: 380, height: 42, margin: { top: 2 } }}
      uiBackground={hideNametagsAreaOn ? ON_COLOR : undefined}
    />
    <Label
      value="Walk-in zone (always on): (13,2,13), area 4x6x4 — orange ground marker"
      fontSize={FONT_HINT}
      textWrap="wrap"
      textAlign="top-left"
      color={MUTED_COLOR}
      uiTransform={{ width: '100%', height: 40, margin: { top: 4 } }}
    />

    {/* Multiplayer verification: every connected player (local + remote) is auto-tagged from the
        roster in modules/multiplayerRoster.ts by a background system -- no button press needed,
        and late joiners are picked up on the next ~1s pass. This toggle only flips whether that
        system applies labelColor/backgroundColor or omits them (native renderer defaults). The
        local player is skipped by the auto system while manually controlled from the panel above
        -- press "Clear (empty label)" (with target = Player) to hand control back. */}
    {sectionLabel('Multiplayer auto-tags (all players)')}
    <Button
      value={`Colors: ${isUseColorsOn() ? 'AUTO (roster)' : 'DEFAULT (native)'}`}
      variant={isUseColorsOn() ? 'primary' : 'secondary'}
      fontSize={FONT_BODY}
      onMouseDown={safeHandler('toggleUseColors', () => toggleUseColors())}
      uiTransform={{ width: 380, height: 42, margin: { top: 2 } }}
      uiBackground={isUseColorsOn() ? ON_COLOR : undefined}
    />

    {sectionLabel('Component lifecycle')}
    <Button
      value="deleteFrom (remove component)"
      variant="primary"
      fontSize={FONT_BODY}
      onMouseDown={safeHandler('removeComponent', () => removeComponent())}
      uiTransform={{ width: 380, height: 42, margin: { top: 2 } }}
      uiBackground={DANGER_COLOR}
    />
  </UiEntity>
)

export const uiMenu = () => (
  <UiEntity
    uiTransform={{
      positionType: 'absolute',
      position: { left: 0, top: 0 },
      width: '100%',
      height: '100%'
    }}
  >
    {targetPanel()}
    {labelTextPanel()}
    {colorsPanel()}
    {scenePanel()}
  </UiEntity>
)
