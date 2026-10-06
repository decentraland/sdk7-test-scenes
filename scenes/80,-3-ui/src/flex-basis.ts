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

// Regression coverage for unity-explorer#10207: Unity never wrote StyleKeyword.Null for
// flex-basis when the SDK stopped sending it, so a VisualElement kept whatever flex-basis it was
// last given, and a pooled one handed it to the next entity.
//
// This is built on the raw UiTransform component rather than react-ecs on purpose. The JSX layer
// cannot express this test at all: parseUiTransform only runs parseSize over width/height/min/max,
// so a `flexBasis` prop travels to the client with flexBasisUnit left at YGU_UNDEFINED and every
// client ignores it. Setting the unit by hand is the only way to exercise the component.
//
// The box lives in a row container, so flex-basis drives its width. An 80px reference outline sits
// directly underneath: in the "no flexBasis" phase the box's right edge must land on the outline's
// right edge.

const TOGGLE_SECONDS = 2
const BOX_SIZE = 80
const GROWN_BASIS = 300

const PANEL_BG = Color4.fromHexString('#2a2a2a')
const OUTLINE = Color4.White()
const PERSISTENT_BOX = Color4.fromHexString('#00b7ff')
const POOLED_BOX = Color4.fromHexString('#ff7a00')

// PBUiTransform has no partial form and parseUiTransform is not exported, so every required field
// is spelled out once here and overridden per element.
const BASE: PBUiTransform = {
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
    widthUnit: YGUnit.YGU_AUTO,
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

function transform(entity: Entity, overrides: Partial<PBUiTransform>) {
    UiTransform.createOrReplace(entity, { ...BASE, ...overrides })
}

function background(entity: Entity, color: Color4) {
    UiBackground.create(entity, { color, textureMode: BackgroundTextureMode.STRETCH, uvs: [] })
}

interface Panel {
    boxRow: Entity
    label: Entity
}

function createPanel(side: 'left' | 'right'): Panel {
    const panel = engine.addEntity()
    transform(panel, {
        positionType: YGPositionType.YGPT_ABSOLUTE,
        flexDirection: YGFlexDirection.YGFD_ROW,
        widthUnit: YGUnit.YGU_POINT,
        width: 740,
        heightUnit: YGUnit.YGU_POINT,
        height: 176,
        positionBottomUnit: YGUnit.YGU_PERCENT,
        positionBottom: 2,
        ...(side === 'left'
            ? { positionLeftUnit: YGUnit.YGU_PERCENT, positionLeft: 13 }
            : { positionRightUnit: YGUnit.YGU_PERCENT, positionRight: 2 }),
        paddingLeftUnit: YGUnit.YGU_POINT,
        paddingLeft: 12,
        paddingTopUnit: YGUnit.YGU_POINT,
        paddingTop: 12,
        paddingRightUnit: YGUnit.YGU_POINT,
        paddingRight: 12,
        paddingBottomUnit: YGUnit.YGU_POINT,
        paddingBottom: 12
    })
    background(panel, PANEL_BG)

    const label = engine.addEntity()
    transform(label, {
        parent: panel,
        widthUnit: YGUnit.YGU_POINT,
        width: 380,
        heightUnit: YGUnit.YGU_POINT,
        height: 152
    })

    // The box column is 320 wide because the box grows to 300 and must not be clipped.
    const column = engine.addEntity()
    transform(column, {
        parent: panel,
        flexDirection: YGFlexDirection.YGFD_COLUMN,
        widthUnit: YGUnit.YGU_POINT,
        width: 320,
        heightUnit: YGUnit.YGU_POINT,
        height: 152,
        marginLeftUnit: YGUnit.YGU_POINT,
        marginLeft: 12
    })

    // flex-basis drives the main axis, so the box has to sit in a row for it to control width.
    const boxRow = engine.addEntity()
    transform(boxRow, {
        parent: column,
        widthUnit: YGUnit.YGU_PERCENT,
        width: 100,
        heightUnit: YGUnit.YGU_POINT,
        height: BOX_SIZE
    })

    const outlineRow = engine.addEntity()
    transform(outlineRow, {
        parent: column,
        widthUnit: YGUnit.YGU_PERCENT,
        width: 100,
        heightUnit: YGUnit.YGU_POINT,
        height: 30
    })

    const outline = engine.addEntity()
    transform(outline, {
        parent: outlineRow,
        widthUnit: YGUnit.YGU_POINT,
        width: BOX_SIZE,
        heightUnit: YGUnit.YGU_POINT,
        height: 26,
        borderLeftWidthUnit: YGUnit.YGU_POINT,
        borderLeftWidth: 2,
        borderTopWidthUnit: YGUnit.YGU_POINT,
        borderTopWidth: 2,
        borderRightWidthUnit: YGUnit.YGU_POINT,
        borderRightWidth: 2,
        borderBottomWidthUnit: YGUnit.YGU_POINT,
        borderBottomWidth: 2,
        borderTopColor: OUTLINE,
        borderBottomColor: OUTLINE,
        borderLeftColor: OUTLINE,
        borderRightColor: OUTLINE
    })

    return { boxRow, label }
}

function createBox(parent: Entity, color: Color4, withBasis: boolean): Entity {
    const box = engine.addEntity()
    transform(box, {
        parent,
        widthUnit: YGUnit.YGU_POINT,
        width: BOX_SIZE,
        heightUnit: YGUnit.YGU_POINT,
        height: BOX_SIZE,
        ...(withBasis ? { flexBasisUnit: YGUnit.YGU_POINT, flexBasis: GROWN_BASIS } : {})
    })
    background(box, color)
    return box
}

function setLabel(entity: Entity, value: string) {
    UiText.createOrReplace(entity, { value, fontSize: 15, color: Color4.White(), textAlign: TextAlignMode.TAM_TOP_LEFT })
}

let persistent: Panel
let pooled: Panel
let persistentBox: Entity
let pooledBox: Entity
let elapsed = 0
let grown = true

export function setupFlexBasisTest() {
    persistent = createPanel('left')
    pooled = createPanel('right')
    persistentBox = createBox(persistent.boxRow, PERSISTENT_BOX, grown)
    pooledBox = createBox(pooled.boxRow, POOLED_BOX, grown)
    refresh()
}

export function flexBasisToggleSystem(dt: number) {
    elapsed += dt
    if (elapsed < TOGGLE_SECONDS) return

    elapsed = 0
    grown = !grown

    // Same entity, patched in place: the scene simply stops sending flexBasis.
    const boxTransform = UiTransform.getMutable(persistentBox)
    boxTransform.flexBasisUnit = grown ? YGUnit.YGU_POINT : YGUnit.YGU_UNDEFINED
    boxTransform.flexBasis = grown ? GROWN_BASIS : 0

    // Fresh entity every toggle, so the client hands the new one a recycled visual element.
    engine.removeEntity(pooledBox)
    pooledBox = createBox(pooled.boxRow, POOLED_BOX, grown)

    refresh()
}

function refresh() {
    setLabel(
        persistent.label,
        'flex-basis -- same entity, patched in place\n' +
        `sending: ${grown ? 'flexBasis = 300' : 'no flexBasis (width 80)'}\n` +
        'Broken: the box stays wide forever.\n' +
        'Fixed: it snaps back onto the outline.'
    )
    setLabel(
        pooled.label,
        'flex-basis -- fresh entity every toggle\n' +
        `mounting: ${grown ? 'a new box WITH flexBasis = 300' : 'a new box without flexBasis'}\n` +
        'Broken: the new box still renders 300 wide,\n' +
        'inherited from the pooled element.\n' +
        'Fixed: it matches the outline.'
    )
}
