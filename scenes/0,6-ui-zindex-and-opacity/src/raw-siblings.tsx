import {
  BackgroundTextureMode,
  Entity,
  PBUiTransform,
  TextAlignMode,
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
import ReactEcs, { ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'

/**
 * Siblings created through the raw UiTransform component with no `rightOf`.
 *
 * react-ecs always chains siblings through `rightOf`, so a parent normally has exactly one
 * child with `rightOf: 0`. Raw ECS scenes are free to leave the field at its default for every
 * child, which gives the parent several such "heads". The three rectangles on the left of the
 * screen are created that way, in the order 1st, 2nd, 3rd, under a raw container.
 *
 * Expected with the fix: siblings without `rightOf` keep creation order (the 3rd covers the 2nd
 * covers the 1st) and every zIndex button reorders its own rectangle. "remove 1st" deletes the
 * 1st rectangle; its zIndex button keeps working while it is gone (drawn gray), and "re-add 1st"
 * creates it again as the newest child with that zIndex: at zIndex 0 it comes back on top by
 * creation order, at a negative zIndex it comes back behind the others.
 *
 * Before the fix: the Explorer kept only one `rightOf: 0` child when rebuilding the sibling
 * chain and lost the others, so their order was never applied: only one of the three zIndex
 * buttons had any effect, and the re-added rectangle could land anywhere.
 */
export function setupRawSiblings() {
  station = createStation()
  for (let i = 0; i < RECTANGLES.length; i++) createRectangle(i)
  ReactEcsRenderer.addUiRenderer(engine.addEntity(), ControlsUi, { screenInset: 'device' })
}

const ZINDEX_VALUES = [-2, -1, 0, 1, 2]
const ZINDEX_ZERO = 2

type Rectangle = {
  name: string
  color: Color4
  entity: Entity | null
  zIndexIndex: number
}

const RECTANGLES: Rectangle[] = [
  { name: '1st', color: Color4.create(0.95, 0.75, 0.1, 1), entity: null, zIndexIndex: ZINDEX_ZERO },
  { name: '2nd', color: Color4.create(0.85, 0.2, 0.6, 1), entity: null, zIndexIndex: ZINDEX_ZERO },
  { name: '3rd', color: Color4.create(0.15, 0.65, 0.9, 1), entity: null, zIndexIndex: ZINDEX_ZERO }
]

const zIndexOf = (rectangle: Rectangle) => ZINDEX_VALUES[rectangle.zIndexIndex]

let station: Entity

// Rectangles are 300 wide and shifted 110 right / 45 down from the previous one, so they overlap
// while every bottom-left corner, where the label sits, stays uncovered.
const STATION_LEFT = 40
const STATION_WIDTH = 520
const STATION_HEIGHT = 220
const RECT_WIDTH = 300
const RECT_HEIGHT = 130
const RECT_STEP_X = 110
const RECT_STEP_Y = 45

// A raw UiTransform has no partial form: every field is required by PBUiTransform, so the whole
// component is spelled out at its proto default and overridden per element. `rightOf` stays 0.
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

function createStation(): Entity {
  const entity = engine.addEntity()

  UiTransform.create(entity, {
    ...BASE_TRANSFORM,
    positionType: YGPositionType.YGPT_ABSOLUTE,
    width: STATION_WIDTH,
    widthUnit: YGUnit.YGU_POINT,
    height: STATION_HEIGHT,
    heightUnit: YGUnit.YGU_POINT,
    positionLeft: STATION_LEFT,
    positionLeftUnit: YGUnit.YGU_POINT,
    positionTop: 50,
    positionTopUnit: YGUnit.YGU_PERCENT,
    marginTop: -STATION_HEIGHT,
    marginTopUnit: YGUnit.YGU_POINT
  })

  return entity
}

function createRectangle(index: number) {
  const rectangle = RECTANGLES[index]
  const entity = engine.addEntity()

  UiTransform.create(entity, {
    ...BASE_TRANSFORM,
    parent: station,
    positionType: YGPositionType.YGPT_ABSOLUTE,
    width: RECT_WIDTH,
    widthUnit: YGUnit.YGU_POINT,
    height: RECT_HEIGHT,
    heightUnit: YGUnit.YGU_POINT,
    positionLeft: index * RECT_STEP_X,
    positionLeftUnit: YGUnit.YGU_POINT,
    positionTop: index * RECT_STEP_Y,
    positionTopUnit: YGUnit.YGU_POINT,
    paddingLeft: 8,
    paddingLeftUnit: YGUnit.YGU_POINT,
    paddingBottom: 6,
    paddingBottomUnit: YGUnit.YGU_POINT,
    zIndex: zIndexOf(rectangle)
  })

  UiBackground.create(entity, {
    color: rectangle.color,
    textureMode: BackgroundTextureMode.STRETCH,
    uvs: []
  })

  UiText.create(entity, {
    value: labelOf(rectangle),
    fontSize: 18,
    color: Color4.White(),
    textAlign: TextAlignMode.TAM_BOTTOM_LEFT
  })

  rectangle.entity = entity
}

const labelOf = (rectangle: Rectangle) => `${rectangle.name} raw sibling, no rightOf, zIndex ${zIndexOf(rectangle)}`

/** Cycles the rectangle's zIndex; a removed rectangle only records it, for its next creation. */
function cycleZIndex(rectangle: Rectangle) {
  rectangle.zIndexIndex = (rectangle.zIndexIndex + 1) % ZINDEX_VALUES.length

  if (rectangle.entity === null) return

  UiTransform.getMutable(rectangle.entity).zIndex = zIndexOf(rectangle)
  UiText.getMutable(rectangle.entity).value = labelOf(rectangle)
}

/** Deletes the 1st rectangle, or creates it again as the newest child with its current zIndex. */
function toggleFirstRectangle() {
  const first = RECTANGLES[0]

  if (first.entity !== null) {
    engine.removeEntity(first.entity)
    first.entity = null
    return
  }

  createRectangle(0)
}

const CONTROLS_TOP_OFFSET = 30

const ControlsUi = () => (
  <UiEntity
    uiTransform={{
      width: STATION_WIDTH,
      height: 140,
      positionType: 'absolute',
      position: { top: '50%', left: STATION_LEFT },
      margin: { top: CONTROLS_TOP_OFFSET },
      flexDirection: 'column',
      alignItems: 'center'
    }}
  >
    <UiEntity
      uiTransform={{ width: STATION_WIDTH, height: 46, padding: { left: 12, right: 12, top: 8, bottom: 8 } }}
      uiBackground={{ color: Color4.White() }}
      uiText={{
        value: 'Raw siblings without rightOf: creation order, and every zIndex button must work.',
        fontSize: 17,
        color: Color4.Black(),
        textAlign: 'middle-center'
      }}
    />
    <UiEntity uiTransform={{ width: STATION_WIDTH, height: 36, margin: { top: 10 }, justifyContent: 'space-between' }}>
      {RECTANGLES.map((rectangle) => (
        <UiEntity
          key={rectangle.name}
          uiTransform={{ width: 160, height: 36 }}
          uiBackground={{ color: rectangle.entity === null ? Color4.Gray() : rectangle.color }}
          uiText={{
            value: `${rectangle.name} zIndex: ${zIndexOf(rectangle)}`,
            fontSize: 17,
            color: Color4.White(),
            textAlign: 'middle-center'
          }}
          onMouseDown={() => cycleZIndex(rectangle)}
        />
      ))}
    </UiEntity>
    <UiEntity
      uiTransform={{ width: 240, height: 36, margin: { top: 10 } }}
      uiBackground={{ color: Color4.create(0.3, 0.3, 0.3, 1) }}
      uiText={{
        value: RECTANGLES[0].entity === null ? 're-add 1st rectangle' : 'remove 1st rectangle',
        fontSize: 17,
        color: Color4.White(),
        textAlign: 'middle-center'
      }}
      onMouseDown={toggleFirstRectangle}
    />
  </UiEntity>
)
