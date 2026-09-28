import ReactEcs, { ReactEcsRenderer, UiEntity, Label, Button } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { engine, Material, Skybox, TextureWrapMode } from '@dcl/sdk/ecs'

// Selected source for each slot. 'none' means the field is left unset on the component.
type SkySelection = 'none' | 'a' | 'b'
type ReflectionSelection = 'none' | 'a' | 'b' | 'invalid'

let skySelection: SkySelection = 'none'
let reflectionSelection: ReflectionSelection = 'none'

const skyTextureSrc: Record<Exclude<SkySelection, 'none'>, string> = {
  a: 'images/sky-a.png',
  b: 'images/sky-b.png'
}

const reflectionTextureSrc: Record<Exclude<ReflectionSelection, 'none'>, string> = {
  a: 'images/env-a.png',
  b: 'images/env-b.png',
  invalid: 'images/does-not-exist.png'
}

// Composes the currently selected sky/reflection sources into a single
// Skybox.createOrReplace call (only the selected fields are set), or removes the
// component entirely when both slots are 'none' so the scene falls back to defaults.
function applySkybox() {
  if (skySelection === 'none' && reflectionSelection === 'none') {
    Skybox.deleteFrom(engine.RootEntity)
    console.log('Skybox removed: back to default procedural sky and reflections')
    return
  }

  const skyboxTexture =
    skySelection === 'none'
      ? undefined
      : Material.Texture.Common({ src: skyTextureSrc[skySelection], wrapMode: TextureWrapMode.TWM_REPEAT })

  const reflectionMap =
    reflectionSelection === 'none'
      ? undefined
      : Material.Texture.Common({ src: reflectionTextureSrc[reflectionSelection], wrapMode: TextureWrapMode.TWM_REPEAT })

  Skybox.createOrReplace(engine.RootEntity, {
    skyboxTexture,
    reflectionMap
  })

  console.log(
    `Skybox updated: sky=${skySelection}, reflection=${reflectionSelection}` +
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

function statusText() {
  const skyLabel = skySelection === 'none' ? 'None (procedural)' : `Sky ${skySelection.toUpperCase()}`
  const reflectionLabel =
    reflectionSelection === 'none'
      ? skySelection === 'none'
        ? 'None (default)'
        : 'None (derived from sky)'
      : reflectionSelection === 'invalid'
        ? 'Invalid src'
        : `Reflection ${reflectionSelection.toUpperCase()}`
  return `Sky: ${skyLabel}  |  Reflection: ${reflectionLabel}`
}

function selectButtonVariant(active: boolean): 'primary' | 'secondary' {
  return active ? 'primary' : 'secondary'
}

const Panel = () => (
  <UiEntity
    uiTransform={{
      width: 320,
      height: 'auto',
      positionType: 'absolute',
      position: { top: '10%', right: 20 },
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
        uiTransform={{ width: '30%', height: '100%' }}
        onMouseDown={() => setReflection('a')}
      />
      <Button
        value="B"
        variant={selectButtonVariant(reflectionSelection === 'b')}
        fontSize={12}
        uiTransform={{ width: '30%', height: '100%' }}
        onMouseDown={() => setReflection('b')}
      />
      <Button
        value="None"
        variant={selectButtonVariant(reflectionSelection === 'none')}
        fontSize={12}
        uiTransform={{ width: '30%', height: '100%' }}
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
