import { Color4 } from '@dcl/sdk/math'
import ReactEcs, {
  type JSX,
  UiEntity,
  type EntityPropTypes,
  type UiTransformProps,
  type PositionUnit
} from '@dcl/sdk/react-ecs'

type UiBoxProps = EntityPropTypes & {
  width: PositionUnit | 'auto'
  height: PositionUnit | 'auto'
  color?: Color4
  fixedPosition?: boolean
}

export function UiBox(props: UiBoxProps): JSX.Element {
  const {
    width,
    height,
    uiBackground,
    uiTransform,
    color,
    fixedPosition,
    ...otherProps
  } = props
  const fixedPositionObject: Partial<UiTransformProps> =
    props.fixedPosition ?? true
      ? { positionType: 'absolute', position: { bottom: '5%', right: '5%' } }
      : {}
  return (
    <UiEntity
      uiTransform={{
        height: '100%',
        width: '100%'
      }}
    >
      <UiEntity
        uiBackground={{ color: props.color ?? Color4.Blue(), ...uiBackground }}
        uiTransform={{
          width,
          height,
          flexDirection: 'column',
          ...fixedPositionObject,
          ...uiTransform
        }}
        {...otherProps}
      ></UiEntity>
    </UiEntity>
  )
}
