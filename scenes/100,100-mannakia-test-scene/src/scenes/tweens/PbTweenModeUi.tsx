import { type Rotate, type PBTween, type Scale, type Move } from '@dcl/sdk/ecs'
import { Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import ReactEcs, {
  Dropdown,
  Label,
  UiEntity,
  type JSX,
  Input
} from '@dcl/sdk/react-ecs'
import { WhiteAlphaBackgroundColor } from './utils'

const TweenMode = ['move', 'rotate', 'scale']

type PbTweenUiModeProps = {
  mode: PBTween['mode']
  onChange: (mode: PBTween['mode']) => void
}

export function Vector3Ui(props: {
  value: Vector3
  onChange: (value: Vector3) => void
}): JSX.Element {
  const { value, onChange } = props
  return (
    <UiEntity>
      <Label value="X" />
      <Input
        uiTransform={{ margin: 10, height: 20, width: 50 }}
        uiBackground={{ color: Color4.White() }}
        color={Color4.Black()}
        onChange={(newValue) => {
          onChange(Vector3.create(Number(newValue), value.y, value.z))
        }}
        value={`${value.x}`}
      />
      <Label value="Y" />
      <Input
        uiTransform={{ margin: 10, height: 20, width: 50 }}
        uiBackground={{ color: Color4.White() }}
        color={Color4.Black()}
        onChange={(newValue) => {
          onChange(Vector3.create(value.x, Number(newValue), value.z))
        }}
        value={`${value.y}`}
      />
      <Label value="Z" />
      <Input
        uiTransform={{ margin: 10, height: 20, width: 50 }}
        uiBackground={{ color: Color4.White() }}
        color={Color4.Black()}
        onChange={(newValue) => {
          onChange(Vector3.create(value.x, value.y, Number(newValue)))
        }}
        value={`${value.z}`}
      />
    </UiEntity>
  )
}

export function QuaternionUi(props: {
  value: Quaternion
  onChange: (value: Quaternion) => void
}): JSX.Element {
  return (
    <UiEntity>
      <Label value="X" uiTransform={{ width: 'auto' }} />
      <Input
        uiTransform={{ margin: 10, height: 20, width: 50 }}
        uiBackground={{ color: Color4.White() }}
        color={Color4.Black()}
        onChange={(newValue) => {
          props.onChange(
            Quaternion.create(
              Number(newValue),
              props.value.y,
              props.value.z,
              props.value.w
            )
          )
        }}
        value={`${props.value.x}`}
      />
      <Label value="Y" />
      <Input
        uiTransform={{ margin: 10, height: 20, width: 50 }}
        uiBackground={{ color: Color4.White() }}
        color={Color4.Black()}
        onChange={(newValue) => {
          props.onChange(
            Quaternion.create(
              props.value.x,
              Number(newValue),
              props.value.z,
              props.value.w
            )
          )
        }}
        value={`${props.value.y}`}
      />
      <Label value="Z" uiTransform={{ width: 'auto' }} />
      <Input
        uiTransform={{ margin: 10, height: 20, width: 50 }}
        uiBackground={{ color: Color4.White() }}
        color={Color4.Black()}
        onChange={(newValue) => {
          props.onChange(
            Quaternion.create(
              props.value.x,
              props.value.y,
              Number(newValue),
              props.value.w
            )
          )
        }}
        value={`${props.value.z}`}
      />
      <Label value="W" uiTransform={{ width: 'auto' }} />
      <Input
        uiTransform={{ margin: 10, height: 20, width: 50 }}
        uiBackground={{ color: Color4.White() }}
        color={Color4.Black()}
        onChange={(newValue) => {
          props.onChange(
            Quaternion.create(
              props.value.x,
              props.value.y,
              props.value.z,
              Number(newValue)
            )
          )
        }}
        value={`${props.value.w}`}
      />
    </UiEntity>
  )
}

type TweenModeExtra = {
  $case?: 'move' | 'rotate' | 'scale'
  rotate?: Rotate
  scale?: Scale
  move?: Move
}

function ModeMoveUi(props: {
  mode: Move
  onChange: (mode: Move) => void
}): JSX.Element {
  const { mode, onChange } = props
  return (
    <UiEntity
      uiBackground={{ color: WhiteAlphaBackgroundColor }}
      uiTransform={{ flexDirection: 'column' }}
    >
      <UiEntity>
        <Label value="Start" uiTransform={{ height: 16, width: 'auto' }} />
        <Vector3Ui
          value={mode.start ?? Vector3.Zero()}
          onChange={(newValue) => {
            mode.start = newValue
            onChange(mode)
          }}
        />
      </UiEntity>

      <UiEntity>
        <Label value="End" uiTransform={{ height: 16, width: 'auto' }} />
        <Vector3Ui
          value={mode.end ?? Vector3.One()}
          onChange={(newValue) => {
            mode.end = newValue
            onChange(mode)
          }}
        />
      </UiEntity>
      <UiEntity>
        <Label
          value="FaceDirection"
          uiTransform={{ height: 16, width: 'auto' }}
        />
        <Dropdown
          uiTransform={{ margin: 10, height: 20 }}
          uiBackground={{ color: Color4.White() }}
          color={Color4.Black()}
          onChange={(newValue) => {
            mode.faceDirection = newValue === 1
            onChange(mode)
          }}
          options={['NO', 'YES']}
          selectedIndex={mode.faceDirection === true ? 1 : 0}
        />
      </UiEntity>
    </UiEntity>
  )
}

function ModeScaleUi(props: {
  mode: Scale
  onChange: (mode: Scale) => void
}): JSX.Element {
  const { mode, onChange } = props
  return (
    <UiEntity
      uiBackground={{ color: WhiteAlphaBackgroundColor }}
      uiTransform={{ flexDirection: 'column' }}
    >
      <UiEntity>
        <Label value="Start" uiTransform={{ height: 16, width: 'auto' }} />
        <Vector3Ui
          value={mode.start ?? Vector3.Zero()}
          onChange={(newValue) => {
            mode.start = newValue
            onChange(mode)
          }}
        />
      </UiEntity>

      <UiEntity>
        <Label value="End" uiTransform={{ height: 16, width: 'auto' }} />
        <Vector3Ui
          value={mode.end ?? Vector3.One()}
          onChange={(newValue) => {
            mode.end = newValue
            onChange(mode)
          }}
        />
      </UiEntity>
    </UiEntity>
  )
}

function ModeRotateUi(props: {
  mode: Rotate
  onChange: (mode: Rotate) => void
}): JSX.Element {
  const { mode, onChange } = props
  return (
    <UiEntity
      uiBackground={{ color: WhiteAlphaBackgroundColor }}
      uiTransform={{ flexDirection: 'column' }}
    >
      <UiEntity>
        <Label value="Start" uiTransform={{ height: 16, width: 'auto' }} />
        <QuaternionUi
          value={mode.start ?? Quaternion.Identity()}
          onChange={(newValue) => {
            mode.start = newValue
            onChange(mode)
          }}
        />
      </UiEntity>

      <UiEntity>
        <Label value="End" uiTransform={{ height: 16, width: 'auto' }} />
        <QuaternionUi
          value={mode.end ?? Quaternion.Identity()}
          onChange={(newValue) => {
            mode.end = newValue
            onChange(mode)
          }}
        />
      </UiEntity>
    </UiEntity>
  )
}
export function PbTweenUiMode(props: PbTweenUiModeProps): JSX.Element {
  const { mode, onChange } = props
  const modeCopy: TweenModeExtra = { ...mode } as any
  const currentModeId = mode !== undefined ? mode.$case : 'move'

  return (
    <UiEntity
      uiTransform={{ flexDirection: 'column' }}
      uiBackground={{ color: WhiteAlphaBackgroundColor }}
    >
      <UiEntity>
        <Label value="Mode" uiTransform={{ height: 16, width: 'auto' }} />
        <Dropdown
          uiTransform={{ margin: 10, height: 20, width: '80%' }}
          uiBackground={{ color: Color4.White() }}
          color={Color4.Black()}
          onChange={(newValue) => {
            modeCopy.$case = TweenMode[newValue] as any
            const newMode = modeCopy.$case ?? 'move'
            if (modeCopy[newMode] === undefined) {
              if (newMode === 'move')
                modeCopy.move = {
                  start: Vector3.Zero(),
                  end: Vector3.One(),
                  faceDirection: false
                }
              if (newMode === 'scale')
                modeCopy.scale = { start: Vector3.Zero(), end: Vector3.One() }
              if (newMode === 'rotate')
                modeCopy.rotate = {
                  start: Quaternion.Identity(),
                  end: Quaternion.fromEulerDegrees(0, 90, 0)
                }
            }
            onChange(modeCopy as any)
          }}
          options={TweenMode}
          selectedIndex={TweenMode.indexOf(currentModeId)}
        />
      </UiEntity>
      <UiEntity>
        {currentModeId === 'move' && (
          <ModeMoveUi
            mode={
              modeCopy.move ?? {
                start: Vector3.Zero(),
                end: Vector3.One(),
                faceDirection: false
              }
            }
            onChange={(mode) => {
              modeCopy.move = mode
              modeCopy.$case = 'move'
              onChange(modeCopy as any)
            }}
          />
        )}
        {currentModeId === 'scale' && (
          <ModeScaleUi
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            mode={modeCopy.scale!}
            onChange={(mode) => {
              modeCopy.scale = mode
              modeCopy.$case = 'scale'
              onChange(modeCopy as any)
            }}
          />
        )}
        {currentModeId === 'rotate' && (
          <ModeRotateUi
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            mode={modeCopy.rotate!}
            onChange={(mode) => {
              modeCopy.move = mode
              modeCopy.$case = 'rotate'
              onChange(modeCopy as any)
            }}
          />
        )}
      </UiEntity>
    </UiEntity>
  )
}
