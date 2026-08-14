// Raw-SDK UiText cases for the 'textWrap' default.
// react-ecs always sends 'textWrap' explicitly (getTextWrap falls back to TW_WRAP), so the
// absent-field path can only be reached through the raw UiText component, not through JSX.
import {
  BackgroundTextureMode,
  Entity,
  PBUiTransform,
  TextWrap,
  UiBackground,
  UiText,
  UiTransform,
  YGAlign,
  YGDisplay,
  YGFlexDirection,
  YGJustify,
  YGOverflow,
  YGPositionType,
  YGUnit,
  engine
} from '@dcl/sdk/ecs'
import { Color4 } from '@dcl/sdk/math'

const WRAP_TEXT = 'no textWrap field on the wire, so this text must wrap onto several lines'
const NO_WRAP_TEXT = 'textWrap sent as TW_NO_WRAP, so this text must stay on a single line'
const PANEL_WIDTH = 240
const PANEL_HEIGHT = 140

// A raw UiTransform has no partial form: every field below is required by PBUiTransform, so
// the whole component is spelled out at its proto default and overridden per panel. Note that
// each size and position is paired with a unit, and the renderer ignores any value whose unit
// is left at YGU_UNDEFINED.
const BASE_TRANSFORM: PBUiTransform = {
  parent: 0,
  rightOf: 0,
  positionType: YGPositionType.YGPT_RELATIVE,
  alignSelf: YGAlign.YGA_AUTO,
  flexDirection: YGFlexDirection.YGFD_ROW,
  justifyContent: YGJustify.YGJ_FLEX_START,
  overflow: YGOverflow.YGO_VISIBLE,
  display: YGDisplay.YGD_FLEX,
  flexBasisUnit: YGUnit.YGU_UNDEFINED,
  flexBasis: 0,
  flexGrow: 0,
  widthUnit: YGUnit.YGU_UNDEFINED,
  width: 0,
  heightUnit: YGUnit.YGU_UNDEFINED,
  height: 0,
  minWidthUnit: YGUnit.YGU_UNDEFINED,
  minWidth: 0,
  minHeightUnit: YGUnit.YGU_UNDEFINED,
  minHeight: 0,
  maxWidthUnit: YGUnit.YGU_UNDEFINED,
  maxWidth: 0,
  maxHeightUnit: YGUnit.YGU_UNDEFINED,
  maxHeight: 0,
  positionLeftUnit: YGUnit.YGU_UNDEFINED,
  positionLeft: 0,
  positionTopUnit: YGUnit.YGU_UNDEFINED,
  positionTop: 0,
  positionRightUnit: YGUnit.YGU_UNDEFINED,
  positionRight: 0,
  positionBottomUnit: YGUnit.YGU_UNDEFINED,
  positionBottom: 0,
  marginLeftUnit: YGUnit.YGU_UNDEFINED,
  marginLeft: 0,
  marginTopUnit: YGUnit.YGU_UNDEFINED,
  marginTop: 0,
  marginRightUnit: YGUnit.YGU_UNDEFINED,
  marginRight: 0,
  marginBottomUnit: YGUnit.YGU_UNDEFINED,
  marginBottom: 0,
  paddingLeftUnit: YGUnit.YGU_UNDEFINED,
  paddingLeft: 0,
  paddingTopUnit: YGUnit.YGU_UNDEFINED,
  paddingTop: 0,
  paddingRightUnit: YGUnit.YGU_UNDEFINED,
  paddingRight: 0,
  paddingBottomUnit: YGUnit.YGU_UNDEFINED,
  paddingBottom: 0
}

function createPanel(leftPercent: number, topPercent: number): Entity {
  const entity = engine.addEntity()

  UiTransform.create(entity, {
    ...BASE_TRANSFORM,
    width: PANEL_WIDTH,
    widthUnit: YGUnit.YGU_POINT,
    height: PANEL_HEIGHT,
    heightUnit: YGUnit.YGU_POINT,
    positionType: YGPositionType.YGPT_ABSOLUTE,
    positionLeft: leftPercent,
    positionLeftUnit: YGUnit.YGU_PERCENT,
    positionTop: topPercent,
    positionTopUnit: YGUnit.YGU_PERCENT
  })

  UiBackground.create(entity, {
    color: Color4.fromHexString('#4d544e'),
    textureMode: BackgroundTextureMode.STRETCH,
    uvs: []
  })

  return entity
}

export function setupRawTextWrapTest() {
  // 'textWrap' is deliberately omitted, so the field is absent from the wire and the
  // renderer has to fall back to the proto default TW_WRAP: this text must wrap.
  UiText.create(createPanel(3, 52), {
    value: WRAP_TEXT,
    fontSize: 18,
    color: Color4.White()
  })

  // Control with the same panel geometry, differing only in that 'textWrap' is sent: this text
  // must stay on a single line regardless of what the default is. It spills past the panel
  // edges because 'overflow' is left at its YGO_VISIBLE default, so nothing clips it.
  UiText.create(createPanel(3, 75), {
    value: NO_WRAP_TEXT,
    fontSize: 18,
    color: Color4.White(),
    textWrap: TextWrap.TW_NO_WRAP
  })
}
