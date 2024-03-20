import ReactEcs, {
  Dropdown,
  Input,
  Label,
  UiEntity,
  type JSX
} from '@dcl/sdk/react-ecs'
import { sceneSystems } from '../../utils/system'
import { UiBox } from '../../utils/ui/box'

import {
  Font,
  Material,
  MeshRenderer,
  TextAlignMode,
  TextShape,
  Transform,
  type PBTextShape
} from '@dcl/sdk/ecs'
import { Color3, Color4, Vector3 } from '@dcl/sdk/math'
import { GODOT_ALL_COLORS, GODOT_ALL_COLORS_KEYS } from '../../utils/color'
import { sceneEntities } from '../../utils/entity'

type State = {
  textShape: PBTextShape
  dirty: boolean

  textColorIndex: number
  outlineColorIndex: number
}

const state: State = {
  textShape: {
    text: 'text',
    font: Font.F_SANS_SERIF,
    fontSize: 10,
    fontAutoSize: false,
    textAlign: TextAlignMode.TAM_MIDDLE_CENTER,
    width: 4,
    height: 4,
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    lineSpacing: 0,
    lineCount: 0,
    textWrapping: false,
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    outlineWidth: 0,
    shadowColor: Color3.White(),
    outlineColor: Color3.White(),
    textColor: Color4.White()
  },
  dirty: true,
  outlineColorIndex: GODOT_ALL_COLORS_KEYS.indexOf('WHITE'),
  textColorIndex: GODOT_ALL_COLORS_KEYS.indexOf('WHITE')
}

export function main(): void {
  const textShapeEntity = sceneEntities.addEntity()
  const plane = sceneEntities.addEntity()
  MeshRenderer.setPlane(plane)

  Material.setPbrMaterial(plane, {
    albedoColor: Color4.Black(),
    metallic: 1,
    roughness: 1
  })

  sceneSystems.addSystemWithInverval(
    (_dt) => {
      const width = state.textShape.width ?? 4
      const height = state.textShape.height ?? 4
      TextShape.createOrReplace(textShapeEntity, { ...state.textShape })

      const position = Vector3.create(8, 1 + height / 2, 8)
      Transform.createOrReplace(textShapeEntity, {
        position: Vector3.add(position, Vector3.create(0, 0, -0.05))
      })
      Transform.createOrReplace(plane, {
        position,
        scale: Vector3.create(width, height, 1)
      })
    },
    0.1,
    'text-shape-api-system'
  )
}

export function MainSceneUi(): JSX.Element {
  return (
    <UiBox width={400} height={300} uiTransform={{ padding: 10 }}>
      <UiEntity
        uiTransform={{
          alignItems: 'stretch'
        }}
      >
        <Label value="Text" />
        <Input
          uiTransform={{ width: '80%', margin: 10, height: 20 }}
          uiBackground={{ color: Color4.White() }}
          color={Color4.Black()}
          onChange={(newValue) => {
            state.textShape.text = newValue
          }}
        />
      </UiEntity>

      <UiEntity>
        <Label value="Font" />
        <Input
          uiTransform={{ margin: 10, height: 20 }}
          uiBackground={{ color: Color4.White() }}
          color={Color4.Black()}
          onChange={(newValue) => {
            state.textShape.fontSize = Number(newValue)
          }}
          value={`${state.textShape.fontSize}`}
        />
        <Dropdown
          uiTransform={{ margin: 10, height: 20 }}
          uiBackground={{ color: Color4.White() }}
          onChange={(newValue) => {
            state.textShape.font = newValue
          }}
          options={['F_SANS_SERIF', 'F_SERIF', 'F_MONOSPACE']}
          selectedIndex={state.textShape.font ?? 0}
        />
      </UiEntity>
      <UiEntity>
        <Label value="Align" />
        <Dropdown
          uiTransform={{ margin: 10, height: 20 }}
          uiBackground={{ color: Color4.White() }}
          onChange={(newValue) => {
            state.textShape.textAlign = newValue
          }}
          options={[
            'TAM_TOP_LEFT',
            'TAM_TOP_CENTER',
            'TAM_TOP_RIGHT',
            'TAM_MIDDLE_LEFT',
            'TAM_MIDDLE_CENTER',
            'TAM_MIDDLE_RIGHT',
            'TAM_BOTTOM_LEFT',
            'TAM_BOTTOM_CENTER',
            'TAM_BOTTOM_RIGHT'
          ]}
          selectedIndex={state.textShape.textAlign ?? 0}
        />
      </UiEntity>
      <UiEntity>
        <Label value="Size" />
        <Input
          uiTransform={{ margin: 10, height: 20 }}
          uiBackground={{ color: Color4.White() }}
          color={Color4.Black()}
          onChange={(newValue) => {
            state.textShape.width = Number(newValue)
          }}
          value={`${state.textShape.width}`}
        />
        <Input
          uiTransform={{ margin: 10, height: 20 }}
          uiBackground={{ color: Color4.White() }}
          color={Color4.Black()}
          onChange={(newValue) => {
            state.textShape.height = Number(newValue)
          }}
          value={`${state.textShape.height}`}
        />
      </UiEntity>
      <UiEntity>
        <Label
          value="Padding (top,left,bottom,right)"
          uiTransform={{ minWidth: 160 }}
        />
        <Input
          uiTransform={{ margin: 10, height: 20 }}
          uiBackground={{ color: Color4.White() }}
          color={Color4.Black()}
          onChange={(newValue) => {
            state.textShape.paddingTop = Number(newValue)
          }}
          value={`${state.textShape.paddingTop}`}
        />
        <Input
          uiTransform={{ margin: 10, height: 20 }}
          uiBackground={{ color: Color4.White() }}
          color={Color4.Black()}
          onChange={(newValue) => {
            state.textShape.paddingLeft = Number(newValue)
          }}
          value={`${state.textShape.paddingLeft}`}
        />
        <Input
          uiTransform={{ margin: 10, height: 20 }}
          uiBackground={{ color: Color4.White() }}
          color={Color4.Black()}
          onChange={(newValue) => {
            state.textShape.paddingBottom = Number(newValue)
          }}
          value={`${state.textShape.paddingBottom}`}
        />
        <Input
          uiTransform={{ margin: 10, height: 20 }}
          uiBackground={{ color: Color4.White() }}
          color={Color4.Black()}
          onChange={(newValue) => {
            state.textShape.paddingRight = Number(newValue)
          }}
          value={`${state.textShape.paddingRight}`}
        />
      </UiEntity>
      <UiEntity>
        <Label value="Text Color" />
        <Dropdown
          uiTransform={{ margin: 10, height: 20 }}
          uiBackground={{ color: Color4.White() }}
          color={Color4.Black()}
          onChange={(newValue) => {
            state.textColorIndex = Number(newValue)
            state.textShape.textColor =
              GODOT_ALL_COLORS[GODOT_ALL_COLORS_KEYS[state.textColorIndex]]
            console.log({
              colorIndex: state.textColorIndex,
              color: state.textShape.textColor
            })
          }}
          options={GODOT_ALL_COLORS_KEYS}
          selectedIndex={state.textColorIndex}
        />
        <Label value="Wrapping" />
        <Dropdown
          uiTransform={{ margin: 10, height: 20 }}
          uiBackground={{ color: Color4.White() }}
          color={Color4.Black()}
          onChange={(newValue) => {
            state.textShape.textWrapping = Number(newValue) === 1
          }}
          options={['NO', 'YES']}
          selectedIndex={state.textShape.textWrapping === true ? 1 : 0}
        />
      </UiEntity>

      <UiEntity>
        <Label value="Outline Width" />
        <Input
          uiTransform={{ margin: 10, height: 20 }}
          uiBackground={{ color: Color4.White() }}
          color={Color4.Black()}
          onChange={(newValue) => {
            state.textShape.outlineWidth = Number(newValue)
          }}
          value={`${state.textShape.paddingRight}`}
        />
        <Label value="Outline Color" />
        <Dropdown
          uiTransform={{ margin: 10, height: 20 }}
          uiBackground={{ color: Color4.White() }}
          color={Color4.Black()}
          onChange={(newValue) => {
            state.outlineColorIndex = Number(newValue)
            state.textShape.outlineColor =
              GODOT_ALL_COLORS[GODOT_ALL_COLORS_KEYS[state.outlineColorIndex]]
            console.log({
              colorIndex: state.outlineColorIndex,
              color: state.textShape.outlineColor
            })
          }}
          options={GODOT_ALL_COLORS_KEYS}
          selectedIndex={state.outlineColorIndex}
        />
      </UiEntity>
    </UiBox>
  )
}
