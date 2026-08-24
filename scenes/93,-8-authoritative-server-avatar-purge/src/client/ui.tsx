import { engine } from '@dcl/sdk/ecs'
import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { getPlatform } from '@dcl/sdk/platform'
import { ServerRoster } from '../shared/schemas'
import { getToast, isServerAlive } from './state'
import { RosterRow, getPurgeTotal, playerEntityRoster } from './repro-delete'

const platform = getPlatform()
const isMobile = platform === 'mobile'

export function setupUi(): void {
  ReactEcsRenderer.setUiRenderer(uiComponent, {
    virtualWidth: isMobile ? 1600 : 1920,
    virtualHeight: isMobile ? 720 : 1080
  })
}

const PANEL_BG = Color4.create(0.16, 0.04, 0.05, 0.9)
const ROW_BG = Color4.create(1, 1, 1, 0.06)
const ME_BG = Color4.create(0.3, 0.7, 1, 0.14)
const ACCENT = Color4.fromHexString('#ff5a5aff')
const OK = Color4.fromHexString('#63c295ff')
const ME_COLOR = Color4.fromHexString('#6fd0ffff')
const DIM = Color4.create(1, 1, 1, 0.6)

function shorten(address: string): string {
  if (!address || address.length < 12) return address || '???'
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

// The SERVER's authoritative roster, read from the synced ServerRoster component.
function serverRoster(): { ids: number[]; addresses: string[] } {
  for (const [, r] of engine.getEntitiesWith(ServerRoster)) {
    return { ids: [...r.ids], addresses: [...r.addresses] }
  }
  return { ids: [], addresses: [] }
}

function clientRow(r: RosterRow) {
  return (
    <UiEntity
      key={`c${r.id}`}
      uiTransform={{
        width: '100%',
        height: 40,
        margin: { bottom: 5 },
        padding: { left: 12, right: 12 },
        justifyContent: 'space-between',
        alignItems: 'center'
      }}
      uiBackground={{ color: r.isMe ? ME_BG : ROW_BG }}
    >
      <Label
        value={`#${r.id}  ${shorten(r.address)}${r.isMe ? '  (me)' : ''}`}
        fontSize={17}
        color={r.isMe ? ME_COLOR : Color4.White()}
      />
      <Label value={`(${r.x.toFixed(1)}, ${r.z.toFixed(1)})`} fontSize={15} color={DIM} />
    </UiEntity>
  )
}

function serverRow(id: number, address: string) {
  return (
    <UiEntity
      key={`s${id}`}
      uiTransform={{
        width: '100%',
        height: 40,
        margin: { bottom: 5 },
        padding: { left: 12, right: 12 },
        justifyContent: 'space-between',
        alignItems: 'center'
      }}
      uiBackground={{ color: ROW_BG }}
    >
      <Label value={`#${id}  ${shorten(address)}`} fontSize={17} color={Color4.White()} />
    </UiEntity>
  )
}

function sectionHeader(text: string, color: Color4) {
  return (
    <Label value={text} fontSize={16} color={color} uiTransform={{ height: 26, margin: { top: 4, bottom: 4 } }} />
  )
}

const uiComponent = () => {
  const client = playerEntityRoster()
  const server = serverRoster()
  const others = client.filter((r) => !r.isMe).length
  const alive = isServerAlive()
  const toast = getToast()

  return (
    // Full-screen container: right-anchored and vertically centred.
    <UiEntity
      uiTransform={{
        width: '100%',
        height: '100%',
        positionType: 'absolute',
        position: { top: 0, right: 0 },
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center'
      }}
    >
      <UiEntity
        uiTransform={{ width: 500, height: 'auto', margin: { right: 24 }, flexDirection: 'column', padding: 21 }}
        uiBackground={{ color: PANEL_BG }}
      >
        {/* Header */}
        <Label value="⚠ AVATAR PURGE" fontSize={28} color={ACCENT} uiTransform={{ height: 40 }} />
        <Label
          value="DELETE_ENTITY exploit — click the RED orb"
          fontSize={15}
          color={DIM}
          uiTransform={{ height: 24, margin: { bottom: 8 } }}
        />
        <Label
          value={alive ? '● authoritative server online' : '○ server waking up…'}
          fontSize={16}
          color={alive ? OK : Color4.fromHexString('#ff9d3aff')}
          uiTransform={{ height: 26, margin: { bottom: 8 } }}
        />

        {/* CLIENT view — this browser's own engine. The discriminator: on an
            OBSERVER client it only drops if the host propagated the server's
            delete (bevy), not if the guard denied it (hammurabi). */}
        {sectionHeader(`CLIENT view (this browser) — ${client.length}`, ACCENT)}
        <Label
          value="local getEntitiesWith(...) — on an observer, drops only if the host applied it"
          fontSize={13}
          color={DIM}
          uiTransform={{ height: 20, margin: { bottom: 4 } }}
        />
        {client.length === 0 ? (
          <Label value="(none yet — waiting for avatars)" fontSize={15} color={DIM} uiTransform={{ height: 34 }} />
        ) : (
          client.map((r) => clientRow(r))
        )}

        {/* SERVER view — the server's own engine copy (published). Drops on a
            server purge on BOTH packages (the local purge is below the guard),
            so this shows the server ran it, NOT whether the guard held. */}
        {sectionHeader(`SERVER view (server's own copy) — ${server.ids.length}`, OK)}
        <Label
          value="drops on a server purge either way — below the guard, not the discriminator"
          fontSize={13}
          color={DIM}
          uiTransform={{ height: 20, margin: { bottom: 4 } }}
        />
        {server.ids.length === 0 ? (
          <Label value="(server reports no players)" fontSize={15} color={DIM} uiTransform={{ height: 34 }} />
        ) : (
          server.ids.map((id, i) => serverRow(id, server.addresses[i] ?? '???'))
        )}

        {/* Summary */}
        <UiEntity
          uiTransform={{
            width: '100%',
            height: 42,
            margin: { top: 10 },
            padding: { left: 12, right: 12 },
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
          uiBackground={{ color: Color4.create(1, 0.35, 0.35, 0.16) }}
        >
          <Label value={`purge targets (client): ${others}`} fontSize={16} color={Color4.White()} />
          <Label value={`purged: ${getPurgeTotal()}`} fontSize={16} color={ACCENT} />
        </UiEntity>

        {/* Transient toast */}
        {toast !== '' && (
          <Label
            value={toast}
            fontSize={16}
            color={Color4.fromHexString('#ff9d3aff')}
            uiTransform={{ height: 32, margin: { top: 10 } }}
          />
        )}
      </UiEntity>
    </UiEntity>
  )
}
