// The Playgrounds button on the right of the screen: it opens a list with a button per playground. A click spawns
// that playground in front of you, or restarts it if it is the spawned one; Remove takes it away.
import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { despawn, Playground, spawn, spawned } from './spawner'

const WIDTH = 210
const ROW = 34
const PANEL = Color4.create(0.08, 0.09, 0.12, 0.85)
const IDLE = Color4.create(0.08, 0.2, 0.5, 1)
const ACTIVE = Color4.create(0.08, 0.4, 0.15, 1)
const GREY = Color4.create(0.18, 0.18, 0.22, 1)
const HINT = Color4.create(0.8, 0.8, 0.8, 1)

let open = false

function item(label: string, color: Color4, onClick: () => void) {
  return (
    <UiEntity
      key={label}
      uiTransform={{ width: WIDTH, height: ROW, margin: { top: 4 }, borderRadius: 6, justifyContent: 'center', alignItems: 'center' }}
      uiBackground={{ color }}
      uiText={{ value: label, fontSize: 15, color: Color4.White() }}
      onMouseDown={onClick}
    />
  )
}

function menu(playgrounds: readonly Playground[]) {
  const current = spawned()?.playground.id
  return (
    <UiEntity uiTransform={{ width: '100%', height: '100%' }}>
      <UiEntity
        uiTransform={{ positionType: 'absolute', position: { top: 200, right: 16 }, flexDirection: 'column', padding: 6, borderRadius: 8 }}
        uiBackground={{ color: open ? PANEL : Color4.Clear() }}
      >
        {item(open ? 'Playgrounds  ×' : 'Playgrounds', GREY, () => (open = !open))}
        {open && (
          <UiEntity
            uiTransform={{ width: WIDTH, height: 40, margin: { top: 4 } }}
            uiText={{ value: 'Appears in front of you;\nclick again to restart it.', fontSize: 12, color: HINT, textAlign: 'middle-left' }}
          />
        )}
        {open && playgrounds.map(p => item(p.id === current ? `${p.label}  (restart)` : p.label, p.id === current ? ACTIVE : IDLE, () => spawn(p)))}
        {open && current && item('Remove', GREY, despawn)}
      </UiEntity>
      {/* The first request of a digit can miss the text atlas; ask for them once up front. */}
      <UiEntity uiTransform={{ width: 1, height: 1, positionType: 'absolute' }} uiText={{ value: '0123456789', fontSize: 15, color: Color4.Clear() }} />
    </UiEntity>
  )
}

export function setupPlaygroundMenu(playgrounds: readonly Playground[]) {
  ReactEcsRenderer.setUiRenderer(() => menu(playgrounds))
}
