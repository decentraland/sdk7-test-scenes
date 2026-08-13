import { engine, UiCanvasInformation } from '@dcl/sdk/ecs'
import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'

/**
 * Example of the three `screenInset` modes of setUiRenderer()/addUiRenderer().
 *
 * Each renderer draws a colored frame around the whole area it is positioned
 * in, plus a label with the live values reported by UiCanvasInformation:
 *
 * - 'none' (red): the whole screen, 0,0 at its top-left corner. Default mode.
 * - 'device' (green): the device safe area (excludes notch, status bar, ...),
 *   from UiCanvasInformation.screenInsetArea.
 * - 'interactable' (blue): the area free of the Explorer's native HUD,
 *   from UiCanvasInformation.interactableArea.
 *
 * The inset is honored per renderer, so the three coexist with different
 * values. On desktop the device insets are typically 0, making the red and
 * green frames overlap; the labels are staggered around the vertical center
 * of their area so all three stay readable in that case.
 */
export function setupUi() {
    ReactEcsRenderer.setUiRenderer(NoneAreaUi, { screenInset: 'none' })
    ReactEcsRenderer.addUiRenderer(engine.addEntity(), DeviceAreaUi, { screenInset: 'device' })
    ReactEcsRenderer.addUiRenderer(engine.addEntity(), InteractableAreaUi, { screenInset: 'interactable' })
}

const NONE_COLOR = Color4.create(0.9, 0.2, 0.2, 1)
const DEVICE_COLOR = Color4.create(0.2, 0.7, 0.3, 1)
const INTERACTABLE_COLOR = Color4.create(0.25, 0.45, 0.95, 1)

const NoneAreaUi = () => (
    <AreaOverlay color={NONE_COLOR} labelOffset={-400} title="screenInset: 'none'" info={`screen: ${formatCanvasSize()}`} />
)

const DeviceAreaUi = () => (
    <AreaOverlay
        color={DEVICE_COLOR}
        labelOffset={0}
        title="screenInset: 'device'"
        info={`screenInsetArea: ${formatArea('screenInsetArea')}`}
    />
)

const InteractableAreaUi = () => (
    <AreaOverlay
        color={INTERACTABLE_COLOR}
        labelOffset={400}
        title="screenInset: 'interactable'"
        info={`interactableArea: ${formatArea('interactableArea')}`}
    />
)

/**
 * Frame spanning the whole area the renderer is positioned in (for 'device' /
 * 'interactable' that is the wrapper the SDK creates around the renderer; for
 * 'none' it is the whole canvas), plus a label at the vertical center of its
 * left edge. `labelOffset` staggers the labels so they don't overlap when two
 * areas coincide.
 */
const AreaOverlay = (props: { color: Color4; title: string; info: string; labelOffset: number }) => (
    <UiEntity
        uiTransform={{
            positionType: 'absolute',
            position: { top: 0, left: 0 },
            width: '100%',
            height: '100%',
            borderWidth: 4,
            borderColor: props.color,
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'flex-start'
        }}
    >
        <UiEntity
            uiTransform={{
                width: 620,
                height: 115,
                margin: { left: 12, top: props.labelOffset },
                alignItems: 'center',
                justifyContent: 'center'
            }}
            uiBackground={{ color: withAlpha(props.color, 0.85) }}
            uiText={{ value: `${props.title}  |  ${props.info}`, fontSize: 32, color: Color4.White() }}
        />
    </UiEntity>
)

function withAlpha(color: Color4, alpha: number): Color4 {
    return Color4.create(color.r, color.g, color.b, alpha)
}

function formatCanvasSize(): string {
    const canvasInfo = UiCanvasInformation.getOrNull(engine.RootEntity)
    if (!canvasInfo) return 'no data yet'
    return `${canvasInfo.width}x${canvasInfo.height} (dpr ${canvasInfo.devicePixelRatio})`
}

function formatArea(field: 'screenInsetArea' | 'interactableArea'): string {
    const area = UiCanvasInformation.getOrNull(engine.RootEntity)?.[field]
    if (!area) return 'no data yet'
    return `top ${area.top}, left ${area.left}, right ${area.right}, bottom ${area.bottom}`
}
