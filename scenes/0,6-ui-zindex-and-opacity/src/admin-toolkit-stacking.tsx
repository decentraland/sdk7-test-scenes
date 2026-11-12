import { engine } from '@dcl/sdk/ecs'
import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { ReactEcsRenderer, UiEntity, UiRendererOptions } from '@dcl/sdk/react-ecs'

/**
 * Renderer stacking with the Admin Tools smart item in the scene
 * (decentraland/creator-hub#1612).
 *
 * This scene includes the Admin Tools smart item (`assets/scene/main.composite`),
 * so `@dcl/asset-packs` boots its admin toolkit UI, whose toggle button sits at
 * the top-right of the screen. The amber rectangle behind that button is its own
 * `addUiRenderer()` with renderer zIndex 500.
 *
 * Expected with the fix: the toolkit renders through the scene's own
 * `ReactEcsRenderer` as an additional renderer at zIndex 1000, so its button
 * stays above the amber rectangle, and every other renderer zIndex on this
 * screen keeps working — the A/B/C panels above still obey their buttons.
 *
 * Before the fix: asset-packs created a second react-ecs UI system on the same
 * engine. Each system chains its roots with `rightOf`, starting at `rightOf: 0`,
 * so the canvas root got two "first" children. The Explorer follows a single
 * chain per parent, and whichever chain lost that race — the scene's — was never
 * assigned an order, so every renderer zIndex on this screen was ignored: the
 * A/B/C panels stacked C over B over A regardless of their buttons, and the
 * toolkit button landed wherever insertion order put it.
 */
export function setupAdminToolkitStacking() {
  ReactEcsRenderer.addUiRenderer(engine.addEntity(), BackdropUi, rendererOptions(BACKDROP_ZINDEX))
}

const BACKDROP_ZINDEX = 500

/**
 * The `zIndex` renderer option only exists in SDKs with the stacking fix. The
 * cast keeps the scene building against older ones, which ignore the field.
 */
function rendererOptions(zIndex: number): UiRendererOptions {
  return { screenInset: 'device', zIndex } as UiRendererOptions
}

// The toolkit's toggle button is 42px at top 120 / right 14 inside the device
// inset, so this covers it with room to spare.
const BackdropUi = () => (
  <UiEntity
    uiTransform={{
      width: 360,
      height: 110,
      positionType: 'absolute',
      position: { top: 96, right: 0 },
      padding: { left: 12, right: 68, top: 8, bottom: 8 },
      alignItems: 'center',
      justifyContent: 'center'
    }}
    uiBackground={{ color: Color4.create(0.85, 0.45, 0, 1) }}
    uiText={{
      value: `renderer zIndex: ${BACKDROP_ZINDEX} · the Admin Tools button must stay on top of this`,
      fontSize: 17,
      color: Color4.White(),
      textAlign: 'middle-center'
    }}
  />
)
