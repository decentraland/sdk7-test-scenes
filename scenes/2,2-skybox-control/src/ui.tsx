import ReactEcs, { ReactEcsRenderer, UiEntity, Label, Button } from '@dcl/sdk/react-ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'
import { ColorGradient, EnvironmentFog, engine, Skybox, SkyboxTime, Sun } from '@dcl/sdk/ecs'

// Selected source for each slot. 'none' means the field is left unset on the component.
type SkySelection = 'none' | 'a' | 'b'
type EnvironmentSelection = 'default' | 'mars' | 'clearNight' | 'storm' | 'dayRamp' | 'trueDarkness'
type TimeSelection = 'six' | 'twelve' | 'eighteen' | 'midnight' | 'live'
type SunIntensitySelection = 'default' | 'off' | 'half' | 'double'
type SunDirectionSelection = 'timeOfDay' | 'overhead' | 'lowEast' | 'lowWest'
// 'default' leaves fog.density unset (SDK default 0.0005, exponential: 1/density ~= the distance
// at which ~63% of the view is fogged, so ~2 km by default).
type FogDensitySelection = 'default' | 'thick' | 'ultraThick' | 'clear'

let skySelection: SkySelection = 'none'
let environmentSelection: EnvironmentSelection = 'default'
let timeSelection: TimeSelection = 'live'
let sunVisible = true
let sunIntensitySelection: SunIntensitySelection = 'default'
let sunDirectionSelection: SunDirectionSelection = 'timeOfDay'
let fogDensitySelection: FogDensitySelection = 'default'

// Force-removed flags: each lets a component be deleted independently of whatever its own field
// selections above would otherwise compute, so the "any of Skybox/Sun/EnvironmentFog present"
// activation rule and the reset-to-defaults behavior can be exercised one component at a time.
// Interacting with a component's own row(s) (or picking a new Environment preset) clears its flag.
let skyboxRemoved = false
let sunRemoved = false
let fogRemoved = false

const skyTextureSrc: Record<Exclude<SkySelection, 'none'>, string> = {
  a: 'images/sky-a.png',
  b: 'images/sky-b.png'
}

// The `Skybox`/`Sun`/`EnvironmentFog` payload shapes aren't exported as standalone types from
// @dcl/ecs, only the component definitions themselves are. Derive each payload type from its own
// `createOrReplace` signature instead of redefining it here (same pattern for all three).
type SkyboxValue = NonNullable<Parameters<typeof Skybox.createOrReplace>[1]>
type SunValue = NonNullable<Parameters<typeof Sun.createOrReplace>[1]>
type FogValue = NonNullable<Parameters<typeof EnvironmentFog.createOrReplace>[1]>

interface EnvironmentPreset {
  skybox?: Pick<SkyboxValue, 'skyColors' | 'clouds' | 'stars'>
  sun?: Pick<SunValue, 'color'>
  fog?: Pick<FogValue, 'color' | 'density'>
}

// One-key gradient: a constant color across the whole day.
function constant(color: Color4): ColorGradient {
  return { keys: [{ time: 0, color }] }
}

// Multi-key gradient from (normalizedTimeOfDay, color) pairs.
function ramp(...keys: [number, Color4][]): ColorGradient {
  return { keys: keys.map(([time, color]) => ({ time, color })) }
}

// Environment presets, split per component so Skybox/Sun/EnvironmentFog can still be removed
// independently (see skyboxRemoved/sunRemoved/fogRemoved) even while a preset is active.
// 'default' means no groups are sent on any of the three (everything stays at its time-of-day
// default). skyColors/clouds/stars are inert while a `skyboxTexture` is also selected; `sun`'s
// color and `fog` keep applying regardless.
const presets: Record<Exclude<EnvironmentSelection, 'default'>, EnvironmentPreset> = {
  mars: {
    skybox: {
      skyColors: {
        zenith: constant(Color4.create(0.55, 0.25, 0.12)),
        horizon: constant(Color4.create(0.95, 0.55, 0.3)),
        nadir: constant(Color4.create(0.35, 0.15, 0.08))
      },
      clouds: { opacity: 0.3, color: constant(Color4.create(0.9, 0.6, 0.4)) }
    },
    sun: { color: constant(Color4.create(1.0, 0.65, 0.4)) },
    fog: { color: constant(Color4.create(0.85, 0.5, 0.3)) }
  },
  clearNight: {
    skybox: {
      clouds: { opacity: 0 },
      stars: { brightness: 12 }
    },
    sun: { color: constant(Color4.create(0.6, 0.7, 1.0)) }
  },
  storm: {
    skybox: {
      skyColors: {
        zenith: constant(Color4.create(0.15, 0.15, 0.17)),
        horizon: constant(Color4.create(0.28, 0.28, 0.31)),
        nadir: constant(Color4.create(0.1, 0.1, 0.12))
      },
      clouds: { opacity: 1, speed: 0.1, color: constant(Color4.create(0.2, 0.2, 0.22)) }
    },
    sun: { color: constant(Color4.create(0.35, 0.35, 0.4)) },
    fog: { color: constant(Color4.create(0.4, 0.42, 0.45)), density: 0.01 }
  },
  dayRamp: {
    // Horizon and fog trace the same 5-key gradient so the horizon band and the fog agree.
    skybox: {
      skyColors: {
        horizon: ramp(
          [0, Color4.create(0.05, 0.05, 0.25)],
          [0.25, Color4.create(0.95, 0.55, 0.45)],
          [0.5, Color4.create(0.75, 0.9, 0.95)],
          [0.75, Color4.create(0.95, 0.4, 0.25)],
          [1, Color4.create(0.05, 0.05, 0.25)]
        )
      }
    },
    // Noon key is HDR (>1) on purpose, to exercise unclamped gradient values.
    sun: {
      color: ramp(
        [0, Color4.create(0.2, 0.25, 0.5)],
        [0.25, Color4.create(1.0, 0.6, 0.25)],
        [0.5, Color4.create(2.0, 1.9, 1.7)],
        [0.75, Color4.create(1.0, 0.5, 0.2)],
        [1, Color4.create(0.2, 0.25, 0.5)]
      )
    },
    fog: {
      color: ramp(
        [0, Color4.create(0.05, 0.05, 0.25)],
        [0.25, Color4.create(0.95, 0.55, 0.45)],
        [0.5, Color4.create(0.75, 0.9, 0.95)],
        [0.75, Color4.create(0.95, 0.4, 0.25)],
        [1, Color4.create(0.05, 0.05, 0.25)]
      )
    }
  },
  // Everything the sky contributes goes black: no sun/moon/flare light left, black sky colors (so
  // the derived ambient and the horizon rim are black too), black fog, no clouds, no stars. Only
  // the scene's own LightSource illuminates anything. Pair with Sun "Hidden" below to also remove
  // the sun/moon discs and lens flare (this preset only zeroes their light, it doesn't hide them).
  trueDarkness: {
    skybox: {
      skyColors: {
        zenith: constant(Color4.Black()),
        horizon: constant(Color4.Black()),
        nadir: constant(Color4.Black())
      },
      clouds: { opacity: 0 },
      stars: { brightness: 0 }
    },
    sun: { color: constant(Color4.Black()) },
    fog: { color: constant(Color4.Black()) }
  }
}

const timeFixedSeconds: Record<Exclude<TimeSelection, 'live'>, number> = {
  six: 6 * 3600,
  twelve: 12 * 3600,
  eighteen: 18 * 3600,
  midnight: 0
}

const environmentLabels: Record<EnvironmentSelection, string> = {
  default: 'Default',
  mars: 'Mars',
  clearNight: 'Clear night',
  storm: 'Storm',
  dayRamp: 'Day ramp',
  trueDarkness: 'True darkness'
}

const timeLabels: Record<TimeSelection, string> = {
  six: '06:00',
  twelve: '12:00',
  eighteen: '18:00',
  midnight: '00:00',
  live: 'Live'
}

const sunIntensityValue: Record<Exclude<SunIntensitySelection, 'default'>, number> = {
  off: 0,
  half: 0.5,
  double: 2
}

const sunIntensityLabels: Record<SunIntensitySelection, string> = {
  default: 'Default',
  off: '0 (off)',
  half: '0.5',
  double: '2'
}

// Direction the sunlight travels (see PBSun.direction doc): (0,-1,0) is straight down (sun
// overhead); the "low" presets point mostly sideways with a slight downward component so the
// light still reaches the ground. Setting a direction pins the sun there for the whole day
// (color/intensity still follow the time-of-day/gradient).
const sunDirectionValue: Record<Exclude<SunDirectionSelection, 'timeOfDay'>, Vector3> = {
  overhead: Vector3.create(0, -1, 0),
  lowEast: Vector3.create(-1, -0.3, 0),
  lowWest: Vector3.create(1, -0.3, 0)
}

const sunDirectionLabels: Record<SunDirectionSelection, string> = {
  timeOfDay: 'Time of day',
  overhead: 'Overhead',
  lowEast: 'Low east',
  lowWest: 'Low west'
}

const fogDensityValue: Record<Exclude<FogDensitySelection, 'default'>, number> = {
  thick: 0.02,
  ultraThick: 0.1,
  clear: 0
}

const fogDensityLabels: Record<FogDensitySelection, string> = {
  default: 'Default',
  thick: 'Thick (0.02)',
  ultraThick: 'Ultra-thick (0.1)',
  clear: 'Clear (0)'
}

function currentPreset(): EnvironmentPreset | undefined {
  return environmentSelection === 'default' ? undefined : presets[environmentSelection]
}

// Composes the Sky selection and the active Environment preset's skybox group into a single
// `Skybox.createOrReplace` call, or removes the component entirely when both are at their
// neutral value (or `skyboxRemoved` was forced), so the scene falls back to the default
// procedural sky and reflections.
function applySkybox() {
  if (skyboxRemoved) {
    Skybox.deleteFrom(engine.RootEntity)
    console.log('Skybox force-removed: back to default procedural sky')
    return
  }

  const skyboxTexture = skySelection === 'none' ? undefined : skyTextureSrc[skySelection]

  const preset = currentPreset()?.skybox

  if (skyboxTexture === undefined && preset === undefined) {
    Skybox.deleteFrom(engine.RootEntity)
    console.log('Skybox removed: back to default procedural sky')
    return
  }

  Skybox.createOrReplace(engine.RootEntity, { skyboxTexture, ...preset })
  console.log(`Skybox updated: sky=${skySelection}, environment=${environmentSelection}`)
}

// Composes the Sun visible/intensity/direction rows and the active Environment preset's sun
// color into a single `Sun.createOrReplace` call, or removes the component when every field is
// at its neutral/default value (or `sunRemoved` was forced).
function applySun() {
  if (sunRemoved) {
    Sun.deleteFrom(engine.RootEntity)
    console.log('Sun force-removed: back to the default directional light')
    return
  }

  const color = currentPreset()?.sun?.color
  const intensity = sunIntensitySelection === 'default' ? undefined : sunIntensityValue[sunIntensitySelection]
  const direction = sunDirectionSelection === 'timeOfDay' ? undefined : sunDirectionValue[sunDirectionSelection]

  if (color === undefined && sunVisible && intensity === undefined && direction === undefined) {
    Sun.deleteFrom(engine.RootEntity)
    console.log('Sun removed: back to the default directional light')
    return
  }

  const value: SunValue = {
    color,
    // visible defaults to true; only send it when hiding, so leaving everything else neutral
    // doesn't itself keep the component alive.
    visible: sunVisible ? undefined : false,
    intensity,
    direction
  }

  Sun.createOrReplace(engine.RootEntity, value)
  console.log(
    `Sun updated: environment=${environmentSelection}, visible=${sunVisible}, intensity=${sunIntensitySelection}, direction=${sunDirectionSelection}`
  )
}

// Composes the Fog density row and the active Environment preset's fog color/density into a
// single `EnvironmentFog.createOrReplace` call, or removes the component when both are at their
// neutral value (or `fogRemoved` was forced). The density row overrides the preset's own density
// when it isn't 'default'; otherwise the preset's density (if any) is kept.
function applyFog() {
  if (fogRemoved) {
    EnvironmentFog.deleteFrom(engine.RootEntity)
    console.log('EnvironmentFog force-removed: back to the default fog')
    return
  }

  const presetFog = currentPreset()?.fog
  const color = presetFog?.color
  const density = fogDensitySelection === 'default' ? presetFog?.density : fogDensityValue[fogDensitySelection]

  if (color === undefined && density === undefined) {
    EnvironmentFog.deleteFrom(engine.RootEntity)
    console.log('EnvironmentFog removed: back to the default fog')
    return
  }

  EnvironmentFog.createOrReplace(engine.RootEntity, { color, density })
  console.log(`EnvironmentFog updated: environment=${environmentSelection}, fogDensity=${fogDensitySelection}`)
}

function setSky(selection: SkySelection) {
  skySelection = selection
  skyboxRemoved = false
  applySkybox()
}

// The Environment preset drives a group on all three components at once, so picking a new one
// re-enables all three (clearing any force-removed flags) to make the preset's effect visible.
function setEnvironment(selection: EnvironmentSelection) {
  environmentSelection = selection
  skyboxRemoved = false
  sunRemoved = false
  fogRemoved = false
  applySkybox()
  applySun()
  applyFog()
}

function setSunVisible(visible: boolean) {
  sunVisible = visible
  sunRemoved = false
  applySun()
}

function setSunIntensity(selection: SunIntensitySelection) {
  sunIntensitySelection = selection
  sunRemoved = false
  applySun()
}

function setSunDirection(selection: SunDirectionSelection) {
  sunDirectionSelection = selection
  sunRemoved = false
  applySun()
}

function setFogDensity(selection: FogDensitySelection) {
  fogDensitySelection = selection
  fogRemoved = false
  applyFog()
}

function removeSkybox() {
  skyboxRemoved = true
  applySkybox()
}

function removeSun() {
  sunRemoved = true
  applySun()
}

function removeFog() {
  fogRemoved = true
  applyFog()
}

// SkyboxTime is a separate component from Skybox/Sun/EnvironmentFog: it drives the time-of-day
// clock that the procedural sky/lighting (and any gradient set above) is evaluated against.
// 'Live' removes the override so the day/night cycle resumes advancing on its own.
function setTime(selection: TimeSelection) {
  timeSelection = selection

  if (selection === 'live') {
    SkyboxTime.deleteFrom(engine.RootEntity)
    console.log('SkyboxTime removed: time of day is live again')
    return
  }

  SkyboxTime.createOrReplace(engine.RootEntity, { fixedTime: timeFixedSeconds[selection] })
  console.log(`SkyboxTime set: fixedTime=${timeFixedSeconds[selection]}s (${selection})`)
}

function statusText() {
  const skyLabel = skySelection === 'none' ? 'None (procedural)' : `Sky ${skySelection.toUpperCase()}`
  const skyboxLabel = skyboxRemoved ? 'Removed' : skyLabel
  const sunLabel = sunRemoved
    ? 'Removed'
    : `${sunVisible ? 'Visible' : 'Hidden'}, intensity ${sunIntensityLabels[sunIntensitySelection]}, dir ${sunDirectionLabels[sunDirectionSelection]}`
  const fogLabel = fogRemoved ? 'Removed' : fogDensityLabels[fogDensitySelection]
  return (
    `Skybox: ${skyboxLabel}\nSun: ${sunLabel}\nEnvironmentFog: ${fogLabel}\n` +
    `Environment preset: ${environmentLabels[environmentSelection]}  |  Time: ${timeLabels[timeSelection]}`
  )
}

function selectButtonVariant(active: boolean): 'primary' | 'secondary' {
  return active ? 'primary' : 'secondary'
}

const SectionLabel = (text: string) => (
  <Label
    value={text}
    fontSize={14}
    color={Color4.fromHexString('#AAAAAA')}
    uiTransform={{ width: '100%', height: 20, margin: { bottom: 5 } }}
  />
)

const Panel = () => (
  <UiEntity
    uiTransform={{
      width: 340,
      height: 'auto',
      positionType: 'absolute',
      position: { top: '6%', right: 20 },
      flexDirection: 'column',
      padding: 20
    }}
    uiBackground={{ color: Color4.fromHexString('#1A1A1AE6') }}
  >
    <Label
      value="Skybox Control"
      fontSize={18}
      color={Color4.White()}
      uiTransform={{ width: '100%', height: 30, margin: { bottom: 10 } }}
    />

    {SectionLabel('Sky (Skybox.skyboxTexture)')}
    <UiEntity uiTransform={{ width: '100%', height: 40, flexDirection: 'row', justifyContent: 'space-between', margin: { bottom: 5 } }}>
      <Button
        value="A"
        variant={selectButtonVariant(skySelection === 'a')}
        fontSize={12}
        uiTransform={{ width: '30%', height: '100%' }}
        onMouseDown={() => setSky('a')}
      />
      <Button
        value="B"
        variant={selectButtonVariant(skySelection === 'b')}
        fontSize={12}
        uiTransform={{ width: '30%', height: '100%' }}
        onMouseDown={() => setSky('b')}
      />
      <Button
        value="None"
        variant={selectButtonVariant(skySelection === 'none')}
        fontSize={12}
        uiTransform={{ width: '30%', height: '100%' }}
        onMouseDown={() => setSky('none')}
      />
    </UiEntity>
    <Button
      value="Remove Skybox"
      variant={selectButtonVariant(skyboxRemoved)}
      fontSize={11}
      uiTransform={{ width: '100%', height: 30, margin: { bottom: 15 } }}
      onMouseDown={removeSkybox}
    />

    {SectionLabel('Environment preset (skyColors/clouds/stars + sun.color + fog.color)')}
    <UiEntity uiTransform={{ width: '100%', height: 36, flexDirection: 'row', justifyContent: 'space-between', margin: { bottom: 8 } }}>
      <Button
        value="Default"
        variant={selectButtonVariant(environmentSelection === 'default')}
        fontSize={11}
        uiTransform={{ width: '32%', height: '100%' }}
        onMouseDown={() => setEnvironment('default')}
      />
      <Button
        value="Mars"
        variant={selectButtonVariant(environmentSelection === 'mars')}
        fontSize={11}
        uiTransform={{ width: '32%', height: '100%' }}
        onMouseDown={() => setEnvironment('mars')}
      />
      <Button
        value="Clear night"
        variant={selectButtonVariant(environmentSelection === 'clearNight')}
        fontSize={11}
        uiTransform={{ width: '32%', height: '100%' }}
        onMouseDown={() => setEnvironment('clearNight')}
      />
    </UiEntity>
    <UiEntity uiTransform={{ width: '100%', height: 36, flexDirection: 'row', justifyContent: 'space-between', margin: { bottom: 15 } }}>
      <Button
        value="Storm"
        variant={selectButtonVariant(environmentSelection === 'storm')}
        fontSize={11}
        uiTransform={{ width: '32%', height: '100%' }}
        onMouseDown={() => setEnvironment('storm')}
      />
      <Button
        value="Day ramp"
        variant={selectButtonVariant(environmentSelection === 'dayRamp')}
        fontSize={11}
        uiTransform={{ width: '32%', height: '100%' }}
        onMouseDown={() => setEnvironment('dayRamp')}
      />
      <Button
        value="True darkness"
        variant={selectButtonVariant(environmentSelection === 'trueDarkness')}
        fontSize={11}
        uiTransform={{ width: '32%', height: '100%' }}
        onMouseDown={() => setEnvironment('trueDarkness')}
      />
    </UiEntity>

    {SectionLabel('Sun & moon visibility')}
    <UiEntity uiTransform={{ width: '100%', height: 36, flexDirection: 'row', justifyContent: 'space-between', margin: { bottom: 8 } }}>
      <Button
        value="Visible"
        variant={selectButtonVariant(sunVisible)}
        fontSize={11}
        uiTransform={{ width: '48%', height: '100%' }}
        onMouseDown={() => setSunVisible(true)}
      />
      <Button
        value="Hidden"
        variant={selectButtonVariant(!sunVisible)}
        fontSize={11}
        uiTransform={{ width: '48%', height: '100%' }}
        onMouseDown={() => setSunVisible(false)}
      />
    </UiEntity>

    {SectionLabel('Sun intensity')}
    <UiEntity uiTransform={{ width: '100%', height: 36, flexDirection: 'row', justifyContent: 'space-between', margin: { bottom: 8 } }}>
      <Button
        value="Default"
        variant={selectButtonVariant(sunIntensitySelection === 'default')}
        fontSize={11}
        uiTransform={{ width: '22%', height: '100%' }}
        onMouseDown={() => setSunIntensity('default')}
      />
      <Button
        value="0 (off)"
        variant={selectButtonVariant(sunIntensitySelection === 'off')}
        fontSize={11}
        uiTransform={{ width: '22%', height: '100%' }}
        onMouseDown={() => setSunIntensity('off')}
      />
      <Button
        value="0.5"
        variant={selectButtonVariant(sunIntensitySelection === 'half')}
        fontSize={11}
        uiTransform={{ width: '22%', height: '100%' }}
        onMouseDown={() => setSunIntensity('half')}
      />
      <Button
        value="2"
        variant={selectButtonVariant(sunIntensitySelection === 'double')}
        fontSize={11}
        uiTransform={{ width: '22%', height: '100%' }}
        onMouseDown={() => setSunIntensity('double')}
      />
    </UiEntity>

    {SectionLabel('Sun direction')}
    <UiEntity uiTransform={{ width: '100%', height: 36, flexDirection: 'row', justifyContent: 'space-between', margin: { bottom: 8 } }}>
      <Button
        value="Time of day"
        variant={selectButtonVariant(sunDirectionSelection === 'timeOfDay')}
        fontSize={10}
        uiTransform={{ width: '23%', height: '100%' }}
        onMouseDown={() => setSunDirection('timeOfDay')}
      />
      <Button
        value="Overhead"
        variant={selectButtonVariant(sunDirectionSelection === 'overhead')}
        fontSize={10}
        uiTransform={{ width: '23%', height: '100%' }}
        onMouseDown={() => setSunDirection('overhead')}
      />
      <Button
        value="Low east"
        variant={selectButtonVariant(sunDirectionSelection === 'lowEast')}
        fontSize={10}
        uiTransform={{ width: '23%', height: '100%' }}
        onMouseDown={() => setSunDirection('lowEast')}
      />
      <Button
        value="Low west"
        variant={selectButtonVariant(sunDirectionSelection === 'lowWest')}
        fontSize={10}
        uiTransform={{ width: '23%', height: '100%' }}
        onMouseDown={() => setSunDirection('lowWest')}
      />
    </UiEntity>
    <Button
      value="Remove Sun"
      variant={selectButtonVariant(sunRemoved)}
      fontSize={11}
      uiTransform={{ width: '100%', height: 30, margin: { bottom: 15 } }}
      onMouseDown={removeSun}
    />

    {/* fog.density is an exponential falloff per meter (SDK default 0.0005, ~2 km until ~63%
        fogged); it merges with whatever fog.color the active Environment preset already sets.
        Whether fog renders at all remains a player quality setting, so with fog disabled in
        Settings these buttons have no visible effect. */}
    {SectionLabel('Fog density (EnvironmentFog.density)')}
    <UiEntity uiTransform={{ width: '100%', height: 36, flexDirection: 'row', justifyContent: 'space-between', margin: { bottom: 8 } }}>
      <Button
        value="Default"
        variant={selectButtonVariant(fogDensitySelection === 'default')}
        fontSize={11}
        uiTransform={{ width: '22%', height: '100%' }}
        onMouseDown={() => setFogDensity('default')}
      />
      <Button
        value="Thick (0.02)"
        variant={selectButtonVariant(fogDensitySelection === 'thick')}
        fontSize={11}
        uiTransform={{ width: '22%', height: '100%' }}
        onMouseDown={() => setFogDensity('thick')}
      />
      <Button
        value="Ultra-thick (0.1)"
        variant={selectButtonVariant(fogDensitySelection === 'ultraThick')}
        fontSize={11}
        uiTransform={{ width: '22%', height: '100%' }}
        onMouseDown={() => setFogDensity('ultraThick')}
      />
      <Button
        value="Clear (0)"
        variant={selectButtonVariant(fogDensitySelection === 'clear')}
        fontSize={11}
        uiTransform={{ width: '22%', height: '100%' }}
        onMouseDown={() => setFogDensity('clear')}
      />
    </UiEntity>
    <Button
      value="Remove EnvironmentFog"
      variant={selectButtonVariant(fogRemoved)}
      fontSize={11}
      uiTransform={{ width: '100%', height: 30, margin: { bottom: 15 } }}
      onMouseDown={removeFog}
    />

    {SectionLabel('Time (SkyboxTime)')}
    <UiEntity uiTransform={{ width: '100%', height: 36, flexDirection: 'row', justifyContent: 'space-between', margin: { bottom: 15 } }}>
      <Button
        value="06:00"
        variant={selectButtonVariant(timeSelection === 'six')}
        fontSize={11}
        uiTransform={{ width: '18%', height: '100%' }}
        onMouseDown={() => setTime('six')}
      />
      <Button
        value="12:00"
        variant={selectButtonVariant(timeSelection === 'twelve')}
        fontSize={11}
        uiTransform={{ width: '18%', height: '100%' }}
        onMouseDown={() => setTime('twelve')}
      />
      <Button
        value="18:00"
        variant={selectButtonVariant(timeSelection === 'eighteen')}
        fontSize={11}
        uiTransform={{ width: '18%', height: '100%' }}
        onMouseDown={() => setTime('eighteen')}
      />
      <Button
        value="00:00"
        variant={selectButtonVariant(timeSelection === 'midnight')}
        fontSize={11}
        uiTransform={{ width: '18%', height: '100%' }}
        onMouseDown={() => setTime('midnight')}
      />
      <Button
        value="Live"
        variant={selectButtonVariant(timeSelection === 'live')}
        fontSize={11}
        uiTransform={{ width: '18%', height: '100%' }}
        onMouseDown={() => setTime('live')}
      />
    </UiEntity>

    <Label
      value={statusText()}
      fontSize={13}
      color={Color4.fromHexString('#CCCCCC')}
      textWrap="wrap"
      uiTransform={{ width: '100%', height: 'auto' }}
    />
  </UiEntity>
)

export function initializeUI() {
  ReactEcsRenderer.setUiRenderer(Panel)
}
