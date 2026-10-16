import ReactEcs, { ReactEcsRenderer, UiEntity, Label, Button } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { Entity, engine, Material, Skybox, SkyboxTime, TextureWrapMode, ColorGradient } from '@dcl/sdk/ecs'

// Selected source for each slot. 'none' means the field is left unset on the component.
// 'video' (Sky/Reflection/Clouds) samples the scene's looping VideoPlayer entity live via
// Material.Texture.Video instead of a file texture.
type SkySelection = 'none' | 'a' | 'b' | 'video'
type ReflectionSelection = 'none' | 'a' | 'b' | 'invalid' | 'video'
type CloudsTextureSelection = 'none' | 'texture' | 'video'
type EnvironmentSelection = 'default' | 'mars' | 'clearNight' | 'storm' | 'dayRamp' | 'trueDarkness'
type TimeSelection = 'six' | 'twelve' | 'eighteen' | 'midnight' | 'live'
// 'default' leaves fog.density unset (SDK default 0.0005, exponential: 1/density ~= the distance
// at which ~63% of the view is fogged, so ~2 km by default).
type FogDensitySelection = 'default' | 'thick' | 'ultraThick' | 'clear'

let skySelection: SkySelection = 'none'
let reflectionSelection: ReflectionSelection = 'none'
let cloudsTextureSelection: CloudsTextureSelection = 'none'
let environmentSelection: EnvironmentSelection = 'default'
let timeSelection: TimeSelection = 'live'
let sunVisible = true
let fogDensitySelection: FogDensitySelection = 'default'

// Set once by initializeUI(videoPlayerEntity). Passed in rather than imported from './index' to
// avoid a circular module import between index.ts and ui.tsx.
let videoPlayerEntity: Entity

const skyTextureSrc: Record<Exclude<SkySelection, 'none' | 'video'>, string> = {
  a: 'images/sky-a.png',
  b: 'images/sky-b.png'
}

const reflectionTextureSrc: Record<Exclude<ReflectionSelection, 'none' | 'video'>, string> = {
  a: 'images/env-a.png',
  b: 'images/env-b.png',
  invalid: 'images/does-not-exist.png'
}

const cloudsTextureSrc = 'images/clouds-a.png'

// The PBSkybox groups (sun/skyColors/fog/clouds/stars) aren't exported as a standalone type
// from @dcl/ecs, only the `Skybox` component definition itself is. Derive the payload shape
// from its own `createOrReplace` signature instead of redefining it here.
type SkyboxValue = NonNullable<Parameters<typeof Skybox.createOrReplace>[1]>
type EnvironmentPreset = Partial<Pick<SkyboxValue, 'sun' | 'skyColors' | 'fog' | 'clouds' | 'stars'>>

// One-key gradient: a constant color across the whole day.
function constant(color: Color4): ColorGradient {
  return { keys: [{ time: 0, color }] }
}

// Multi-key gradient from (normalizedTimeOfDay, color) pairs.
function ramp(...keys: [number, Color4][]): ColorGradient {
  return { keys: keys.map(([time, color]) => ({ time, color })) }
}

// Environment presets. 'default' means no groups are sent (procedural sky stays at its
// time-of-day defaults). All non-default presets are inert while a `skyboxTexture` is
// selected, except `sun`/`fog` (and the ambient light `skyColors` derives), which keep
// applying even with a sky texture set.
const presets: Record<Exclude<EnvironmentSelection, 'default'>, EnvironmentPreset> = {
  mars: {
    skyColors: {
      zenith: constant(Color4.create(0.55, 0.25, 0.12)),
      horizon: constant(Color4.create(0.95, 0.55, 0.3)),
      nadir: constant(Color4.create(0.35, 0.15, 0.08))
    },
    sun: { color: constant(Color4.create(1.0, 0.65, 0.4)) },
    fog: { color: constant(Color4.create(0.85, 0.5, 0.3)) },
    clouds: { opacity: 0.3, color: constant(Color4.create(0.9, 0.6, 0.4)) }
  },
  clearNight: {
    clouds: { opacity: 0 },
    stars: { brightness: 12 },
    sun: { color: constant(Color4.create(0.6, 0.7, 1.0)) }
  },
  storm: {
    skyColors: {
      zenith: constant(Color4.create(0.15, 0.15, 0.17)),
      horizon: constant(Color4.create(0.28, 0.28, 0.31)),
      nadir: constant(Color4.create(0.1, 0.1, 0.12))
    },
    clouds: { opacity: 1, speed: 0.1, color: constant(Color4.create(0.2, 0.2, 0.22)) },
    fog: { color: constant(Color4.create(0.4, 0.42, 0.45)), density: 0.01 },
    sun: { color: constant(Color4.create(0.35, 0.35, 0.4)) }
  },
  dayRamp: {
    // Horizon and fog trace the same 5-key gradient so the horizon band and the fog agree.
    skyColors: {
      horizon: ramp(
        [0, Color4.create(0.05, 0.05, 0.25)],
        [0.25, Color4.create(0.95, 0.55, 0.45)],
        [0.5, Color4.create(0.75, 0.9, 0.95)],
        [0.75, Color4.create(0.95, 0.4, 0.25)],
        [1, Color4.create(0.05, 0.05, 0.25)]
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
    }
  },
  // Everything the sky contributes goes black: no sun/moon/flare, black directional light, black sky
  // colors (so the derived ambient is black too), black fog, no clouds, no stars. Only the scene's
  // own LightSource illuminates anything.
  trueDarkness: {
    sun: { color: constant(Color4.Black()), visible: false },
    skyColors: {
      zenith: constant(Color4.Black()),
      horizon: constant(Color4.Black()),
      nadir: constant(Color4.Black())
    },
    fog: { color: constant(Color4.Black()) },
    clouds: { opacity: 0 },
    stars: { brightness: 0 }
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

// Composes the currently selected sky/reflection/clouds sources and environment preset into a
// single Skybox.createOrReplace call (only the selected fields are set), or removes the
// component entirely when sky, reflection, clouds texture AND environment are all at their
// neutral value, so the scene falls back to defaults.
function applySkybox() {
  if (
    skySelection === 'none' &&
    reflectionSelection === 'none' &&
    cloudsTextureSelection === 'none' &&
    environmentSelection === 'default' &&
    sunVisible &&
    fogDensitySelection === 'default'
  ) {
    Skybox.deleteFrom(engine.RootEntity)
    console.log('Skybox removed: back to default procedural sky, reflections and environment')
    return
  }

  const skyboxTexture =
    skySelection === 'none'
      ? undefined
      : skySelection === 'video'
        ? Material.Texture.Video({ videoPlayerEntity })
        : Material.Texture.Common({ src: skyTextureSrc[skySelection], wrapMode: TextureWrapMode.TWM_REPEAT })

  const reflectionMap =
    reflectionSelection === 'none'
      ? undefined
      : reflectionSelection === 'video'
        ? Material.Texture.Video({ videoPlayerEntity })
        : Material.Texture.Common({ src: reflectionTextureSrc[reflectionSelection], wrapMode: TextureWrapMode.TWM_REPEAT })

  const cloudsTexture =
    cloudsTextureSelection === 'none'
      ? undefined
      : cloudsTextureSelection === 'video'
        ? Material.Texture.Video({ videoPlayerEntity })
        : Material.Texture.Common({ src: cloudsTextureSrc })

  const environment: EnvironmentPreset = environmentSelection === 'default' ? {} : presets[environmentSelection]

  // sun.visible hides the sun and moon discs and the lens flare (also over a sky texture); the light is unaffected.
  // It merges with the preset's sun color so both can be set independently.
  const sun = sunVisible ? environment.sun : { ...environment.sun, visible: false }

  // Merge the clouds texture into whatever clouds properties the preset already set
  // (opacity/speed/color), rather than replacing the group outright.
  const clouds = environment.clouds || cloudsTexture !== undefined ? { ...environment.clouds, texture: cloudsTexture } : undefined

  // Merge the fog density override into whatever fog.color the preset already set, rather than
  // replacing the group outright (same pattern as clouds above).
  const fogDensity = fogDensitySelection === 'default' ? undefined : fogDensityValue[fogDensitySelection]
  const fog = environment.fog || fogDensity !== undefined ? { ...environment.fog, density: fogDensity } : undefined

  Skybox.createOrReplace(engine.RootEntity, {
    skyboxTexture,
    reflectionMap,
    ...environment,
    sun,
    clouds,
    fog
  })

  console.log(
    `Skybox updated: sky=${skySelection}, reflection=${reflectionSelection}, clouds=${cloudsTextureSelection}, environment=${environmentSelection}, sun=${sunVisible ? 'visible' : 'hidden'}, fog=${fogDensitySelection}` +
      (reflectionSelection === 'invalid' ? ' (intentionally invalid src, exercising the failure path)' : '')
  )
}

function setSky(selection: SkySelection) {
  skySelection = selection
  applySkybox()
}

function setReflection(selection: ReflectionSelection) {
  reflectionSelection = selection
  applySkybox()
}

function setCloudsTexture(selection: CloudsTextureSelection) {
  cloudsTextureSelection = selection
  applySkybox()
}

function setEnvironment(selection: EnvironmentSelection) {
  environmentSelection = selection
  applySkybox()
}

function setSunVisible(visible: boolean) {
  sunVisible = visible
  applySkybox()
}

function setFogDensity(selection: FogDensitySelection) {
  fogDensitySelection = selection
  applySkybox()
}

// SkyboxTime is a separate component from Skybox: it drives the time-of-day clock that the
// procedural sky/lighting (and any environment gradient set above) is evaluated against.
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
  const skyLabel =
    skySelection === 'none' ? 'None (procedural)' : skySelection === 'video' ? 'Video' : `Sky ${skySelection.toUpperCase()}`
  const reflectionLabel =
    reflectionSelection === 'none'
      ? skySelection === 'none'
        ? 'None (default)'
        : 'None (derived from sky)'
      : reflectionSelection === 'invalid'
        ? 'Invalid src'
        : reflectionSelection === 'video'
          ? 'Video'
          : `Reflection ${reflectionSelection.toUpperCase()}`
  const cloudsLabel =
    cloudsTextureSelection === 'none'
      ? 'None (procedural)'
      : cloudsTextureSelection === 'video'
        ? 'Video'
        : 'Texture'
  return `Sky: ${skyLabel}  |  Reflection: ${reflectionLabel}\nEnvironment: ${environmentLabels[environmentSelection]}  |  Sun: ${sunVisible ? 'Visible' : 'Hidden'}  |  Time: ${timeLabels[timeSelection]}\nClouds texture: ${cloudsLabel}  |  Fog: ${fogDensityLabels[fogDensitySelection]}`
}

function selectButtonVariant(active: boolean): 'primary' | 'secondary' {
  return active ? 'primary' : 'secondary'
}

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
      value="Reflection Map & Skybox"
      fontSize={18}
      color={Color4.White()}
      uiTransform={{ width: '100%', height: 30, margin: { bottom: 10 } }}
    />

    <Label
      value="Sky"
      fontSize={14}
      color={Color4.fromHexString('#AAAAAA')}
      uiTransform={{ width: '100%', height: 20, margin: { bottom: 5 } }}
    />
    <UiEntity uiTransform={{ width: '100%', height: 40, flexDirection: 'row', justifyContent: 'space-between', margin: { bottom: 15 } }}>
      <Button
        value="A"
        variant={selectButtonVariant(skySelection === 'a')}
        fontSize={12}
        uiTransform={{ width: '22%', height: '100%' }}
        onMouseDown={() => setSky('a')}
      />
      <Button
        value="B"
        variant={selectButtonVariant(skySelection === 'b')}
        fontSize={12}
        uiTransform={{ width: '22%', height: '100%' }}
        onMouseDown={() => setSky('b')}
      />
      <Button
        value="Video"
        variant={selectButtonVariant(skySelection === 'video')}
        fontSize={12}
        uiTransform={{ width: '22%', height: '100%' }}
        onMouseDown={() => setSky('video')}
      />
      <Button
        value="None"
        variant={selectButtonVariant(skySelection === 'none')}
        fontSize={12}
        uiTransform={{ width: '22%', height: '100%' }}
        onMouseDown={() => setSky('none')}
      />
    </UiEntity>

    <Label
      value="Reflection"
      fontSize={14}
      color={Color4.fromHexString('#AAAAAA')}
      uiTransform={{ width: '100%', height: 20, margin: { bottom: 5 } }}
    />
    <UiEntity uiTransform={{ width: '100%', height: 40, flexDirection: 'row', justifyContent: 'space-between', margin: { bottom: 10 } }}>
      <Button
        value="A"
        variant={selectButtonVariant(reflectionSelection === 'a')}
        fontSize={12}
        uiTransform={{ width: '22%', height: '100%' }}
        onMouseDown={() => setReflection('a')}
      />
      <Button
        value="B"
        variant={selectButtonVariant(reflectionSelection === 'b')}
        fontSize={12}
        uiTransform={{ width: '22%', height: '100%' }}
        onMouseDown={() => setReflection('b')}
      />
      <Button
        value="Video"
        variant={selectButtonVariant(reflectionSelection === 'video')}
        fontSize={12}
        uiTransform={{ width: '22%', height: '100%' }}
        onMouseDown={() => setReflection('video')}
      />
      <Button
        value="None"
        variant={selectButtonVariant(reflectionSelection === 'none')}
        fontSize={12}
        uiTransform={{ width: '22%', height: '100%' }}
        onMouseDown={() => setReflection('none')}
      />
    </UiEntity>

    <Button
      value="Invalid src"
      variant={selectButtonVariant(reflectionSelection === 'invalid')}
      fontSize={12}
      uiTransform={{ width: '100%', height: 36, margin: { bottom: 15 } }}
      onMouseDown={() => setReflection('invalid')}
    />

    <Label
      value="Clouds texture"
      fontSize={14}
      color={Color4.fromHexString('#AAAAAA')}
      uiTransform={{ width: '100%', height: 20, margin: { bottom: 5 } }}
    />
    <UiEntity uiTransform={{ width: '100%', height: 40, flexDirection: 'row', justifyContent: 'space-between', margin: { bottom: 15 } }}>
      <Button
        value="None"
        variant={selectButtonVariant(cloudsTextureSelection === 'none')}
        fontSize={12}
        uiTransform={{ width: '30%', height: '100%' }}
        onMouseDown={() => setCloudsTexture('none')}
      />
      <Button
        value="Texture"
        variant={selectButtonVariant(cloudsTextureSelection === 'texture')}
        fontSize={12}
        uiTransform={{ width: '30%', height: '100%' }}
        onMouseDown={() => setCloudsTexture('texture')}
      />
      <Button
        value="Video"
        variant={selectButtonVariant(cloudsTextureSelection === 'video')}
        fontSize={12}
        uiTransform={{ width: '30%', height: '100%' }}
        onMouseDown={() => setCloudsTexture('video')}
      />
    </UiEntity>

    <Label
      value="Environment"
      fontSize={14}
      color={Color4.fromHexString('#AAAAAA')}
      uiTransform={{ width: '100%', height: 20, margin: { bottom: 5 } }}
    />
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

    <Label
      value="Sun & moon"
      fontSize={14}
      color={Color4.fromHexString('#AAAAAA')}
      uiTransform={{ width: '100%', height: 20, margin: { bottom: 5 } }}
    />
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

    {/* fog.density is an exponential falloff per meter (SDK default 0.0005, ~2 km until ~63%
        fogged); it merges with whatever fog.color the active Environment preset sets. Whether
        fog renders at all remains a player quality setting, so with fog disabled in Settings
        these buttons have no visible effect. */}
    <Label
      value="Fog density"
      fontSize={14}
      color={Color4.fromHexString('#AAAAAA')}
      uiTransform={{ width: '100%', height: 20, margin: { bottom: 5 } }}
    />
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

    <Label
      value="Time"
      fontSize={14}
      color={Color4.fromHexString('#AAAAAA')}
      uiTransform={{ width: '100%', height: 20, margin: { bottom: 5 } }}
    />
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

// `entity` is the scene's looping VideoPlayer entity (created in index.ts); it's passed in
// rather than imported, to avoid a circular module import between index.ts and ui.tsx.
export function initializeUI(entity: Entity) {
  videoPlayerEntity = entity
  ReactEcsRenderer.setUiRenderer(Panel)
}
