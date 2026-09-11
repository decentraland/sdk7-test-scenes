import { engine, Entity } from '@dcl/sdk/ecs'
import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { ReactEcsRenderer, UiEntity, UiRendererOptions } from '@dcl/sdk/react-ecs'

/**
 * Stacking order *between* UI renderers (decentraland/sdk#1196).
 *
 * The three rectangles at the top of the screen each come from their own
 * `addUiRenderer()` call, registered A, then B, then C. Every renderer gets a
 * `zIndex` through its renderer options, and the buttons below cycle that value
 * by re-registering the renderer with the same entity.
 *
 * Expected with the fix: the rectangle whose renderer has the highest zIndex is
 * in front regardless of registration order, so initially A (20) covers B (10)
 * covers C (0). Renderers left at zIndex 0 keep the default order — the order
 * they first rendered in, the main UI at the back — which is also how they
 * stacked before the fix.
 *
 * Before the fix: the option does not exist and the SDK writes no order between
 * the renderers' roots, so the Explorer stacks them in the order they were added
 * — C is always in front and the buttons change nothing.
 */
export function setupRendererStacking() {
  for (const panel of PANELS) registerPanel(panel)
  // Registered last: on top of the panels by registration order alone.
  ReactEcsRenderer.addUiRenderer(engine.addEntity(), ControlsUi)
}

const ZINDEX_VALUES = [-20, -10, 0, 10, 20]

type Panel = {
  entity: Entity
  name: string
  registered: string
  color: Color4
  offset: number
  zIndexIndex: number
}

const PANELS: Panel[] = [
  {
    entity: engine.addEntity(),
    name: 'A',
    registered: '1st',
    color: Color4.create(1, 0.55, 0, 1),
    offset: 0,
    zIndexIndex: 4
  },
  {
    entity: engine.addEntity(),
    name: 'B',
    registered: '2nd',
    color: Color4.create(0.6, 0.2, 0.85, 1),
    offset: 1,
    zIndexIndex: 3
  },
  {
    entity: engine.addEntity(),
    name: 'C',
    registered: '3rd',
    color: Color4.create(0, 0.6, 0.6, 1),
    offset: 2,
    zIndexIndex: 2
  }
]

const zIndexOf = (panel: Panel) => ZINDEX_VALUES[panel.zIndexIndex]

/**
 * (Re)registers the panel's renderer with its current zIndex. Re-registering an
 * entity replaces its renderer in place, keeping its position in the
 * registration order.
 */
function registerPanel(panel: Panel) {
  ReactEcsRenderer.addUiRenderer(panel.entity, () => <PanelUi panel={panel} />, rendererOptions(zIndexOf(panel)))
}

/**
 * The `zIndex` renderer option only exists in SDKs with the stacking fix. The
 * cast keeps the scene building against older ones, which ignore the field, so
 * both can be compared side by side.
 */
function rendererOptions(zIndex: number): UiRendererOptions {
  return { screenInset: 'device', zIndex } as UiRendererOptions
}

function cyclePanelZIndex(panel: Panel) {
  panel.zIndexIndex = (panel.zIndexIndex + 1) % ZINDEX_VALUES.length
  registerPanel(panel)
}

// Panels are 480 wide and 240 apart, so each one overlaps half of its neighbors
// while its centered label stays uncovered.
const PANEL_WIDTH = 480
const PANEL_STEP = 240
const PANEL_TOP = 40

const PanelUi = (props: { panel: Panel }) => (
  <UiEntity
    uiTransform={{
      width: PANEL_WIDTH,
      height: 150,
      positionType: 'absolute',
      position: { top: PANEL_TOP + props.panel.offset * 25, left: '50%' },
      margin: { left: -PANEL_WIDTH - PANEL_STEP / 2 + props.panel.offset * PANEL_STEP },
      alignItems: 'center',
      justifyContent: 'center'
    }}
    uiBackground={{ color: props.panel.color }}
    uiText={{
      value: `renderer ${props.panel.name} · registered ${props.panel.registered} · zIndex: ${zIndexOf(props.panel)}`,
      fontSize: 22,
      color: Color4.White(),
      textAlign: 'middle-center'
    }}
  />
)

const ControlsUi = () => (
  <UiEntity
    uiTransform={{
      width: 760,
      height: 92,
      positionType: 'absolute',
      position: { top: PANEL_TOP + 210, left: '50%' },
      margin: { left: -380 },
      flexDirection: 'column',
      alignItems: 'center'
    }}
  >
    <UiEntity
      uiTransform={{ width: 760, height: 46, padding: { left: 12, right: 12, top: 8, bottom: 8 } }}
      uiBackground={{ color: Color4.White() }}
      uiText={{
        value: 'Each rectangle is its own addUiRenderer(). The highest renderer zIndex should be in front.',
        fontSize: 19,
        color: Color4.Black(),
        textAlign: 'middle-center'
      }}
    />
    <UiEntity uiTransform={{ width: 760, height: 36, margin: { top: 10 }, justifyContent: 'space-between' }}>
      {PANELS.map((panel) => (
        <UiEntity
          key={panel.name}
          uiTransform={{ width: 240, height: 36 }}
          uiBackground={{ color: panel.color }}
          uiText={{
            value: `${panel.name} zIndex: ${zIndexOf(panel)}`,
            fontSize: 17,
            color: Color4.White(),
            textAlign: 'middle-center'
          }}
          onMouseDown={() => cyclePanelZIndex(panel)}
        />
      ))}
    </UiEntity>
  </UiEntity>
)
