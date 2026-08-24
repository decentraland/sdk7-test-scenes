import { engine } from '@dcl/sdk/ecs'
import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { getPlatform } from '@dcl/sdk/platform'
import { ServerRoster } from '../shared/schemas'
import { getToast, isServerAlive } from './state'
import { RosterRow, getClientWarnings, getPurgeTotal, playerEntityRoster } from './repro-delete'

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
function serverRoster(): { numbers: number[]; versions: number[]; addresses: string[]; warnings: string[] } {
  for (const [, r] of engine.getEntitiesWith(ServerRoster)) {
    return { numbers: [...r.numbers], versions: [...r.versions], addresses: [...r.addresses], warnings: [...r.warnings] }
  }
  return { numbers: [], versions: [], addresses: [], warnings: [] }
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
        value={`#${r.number} v${r.version}  ${shorten(r.address)}${r.isMe ? '  (me)' : ''}`}
        fontSize={16}
        color={r.isMe ? ME_COLOR : Color4.White()}
      />
      <Label value={`(${r.x.toFixed(1)}, ${r.z.toFixed(1)})`} fontSize={14} color={DIM} />
    </UiEntity>
  )
}

function serverRow(key: string, num: number, version: number, address: string) {
  return (
    <UiEntity
      key={`s${key}`}
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
      <Label value={`#${num} v${version}  ${shorten(address)}`} fontSize={16} color={Color4.White()} />
    </UiEntity>
  )
}

// A swap-warning line (server or client detector).
function warningRow(key: string, text: string) {
  return (
    <UiEntity
      key={key}
      uiTransform={{ width: '100%', height: 34, margin: { bottom: 4 }, padding: { left: 12, right: 12 }, alignItems: 'center' }}
      uiBackground={{ color: Color4.create(1, 0.6, 0.1, 0.18) }}
    >
      <Label value={`⚠ ${text}`} fontSize={14} color={Color4.fromHexString('#ffcf6bff')} />
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
  const clientWarnings = getClientWarnings()
  const warnColor = (n: number) => (n > 0 ? Color4.fromHexString('#ffcf6bff') : OK)

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
        <Label value="⚠ AVATAR PURGE + SWAP WATCH" fontSize={26} color={ACCENT} uiTransform={{ height: 38 }} />
        <Label
          value="rows are  #number vversion  — a reused slot should bump the version"
          fontSize={14}
          color={DIM}
          uiTransform={{ height: 22, margin: { bottom: 8 } }}
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

        {/* SERVER view — the server's own engine copy (published), version-aware. */}
        {sectionHeader(`SERVER view (server's own copy) — ${server.numbers.length}`, OK)}
        <Label
          value="the authoritative roster the server maps to wallets — watch version on reuse"
          fontSize={13}
          color={DIM}
          uiTransform={{ height: 20, margin: { bottom: 4 } }}
        />
        {server.numbers.length === 0 ? (
          <Label value="(server reports no players)" fontSize={15} color={DIM} uiTransform={{ height: 34 }} />
        ) : (
          server.numbers.map((num, i) =>
            serverRow(`${num}-${server.versions[i]}-${i}`, num, server.versions[i] ?? 0, server.addresses[i] ?? '???')
          )
        )}

        {/* SWAP WARNINGS — identity anomalies detected over join/leave churn. */}
        {sectionHeader(
          `SWAP WARNINGS — server ${server.warnings.length}, client ${clientWarnings.length}`,
          warnColor(server.warnings.length + clientWarnings.length)
        )}
        {server.warnings.length + clientWarnings.length === 0 ? (
          <Label
            value="none — ids stable & every verified sender has an entity (churn players to test)"
            fontSize={13}
            color={DIM}
            uiTransform={{ height: 28 }}
          />
        ) : (
          [
            ...server.warnings.map((w, i) => warningRow(`sw${i}`, `server: ${w}`)),
            ...clientWarnings.map((w, i) => warningRow(`cw${i}`, `client: ${w}`))
          ]
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
