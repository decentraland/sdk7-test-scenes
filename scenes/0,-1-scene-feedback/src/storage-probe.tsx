import { engine, Schemas } from '@dcl/sdk/ecs'
import { Color4 } from '@dcl/sdk/math'
import { isServer } from '@dcl/sdk/network'
import { AUTH_SERVER_PEER_ID } from '@dcl/sdk/network/message-bus-sync'
import ReactEcs, { Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'

// Diagnostic for lost CSV rows: the server repeats flush()'s read-append-write on its own key and counts
// what would lose rows. H1: another server instance writes too. H2: a read comes back shorter than the
// last write. H3: a read of a key that exists comes back null. Result shown to everyone, top right.
export const StorageProbe = engine.defineComponent('probe::StorageProbe', {
  instance: Schemas.String,
  rounds: Schemas.Int,
  otherInstances: Schemas.Int,
  shortReads: Schemas.Int,
  nullReads: Schemas.Int,
  staleReadBacks: Schemas.Int,
  errors: Schemas.Int,
  bytes: Schemas.Int,
  lastIssue: Schemas.String
})

export function setupStorageProbe(): void {
  if (isServer()) {
    StorageProbe.validateBeforeChange((value) => value.senderAddress.toLowerCase() === AUTH_SERVER_PEER_ID.toLowerCase())
    // first tick: syncEntity throws before that. Dynamic import keeps Storage out of the client.
    const start = () => {
      engine.removeSystem(start)
      void import('./storage-probe-server').then(({ startProbe }) => startProbe())
    }
    engine.addSystem(start)
    return
  }
  ReactEcsRenderer.addUiRenderer(engine.addEntity(), probeLabel)
}

function probeLabel() {
  let probe: ReturnType<typeof StorageProbe.get> | undefined
  for (const [, value] of engine.getEntitiesWith(StorageProbe)) probe = value
  if (!probe) return null
  const issues = probe.otherInstances + probe.shortReads + probe.nullReads + probe.staleReadBacks
  const text =
    `PROBE ${probe.instance} · ${probe.rounds} rounds · ${probe.bytes} B\n` +
    `H1 other instance ${probe.otherInstances} · H2 short ${probe.shortReads} / stale read-back ${probe.staleReadBacks}\n` +
    `H3 null ${probe.nullReads} · errors ${probe.errors}` +
    (probe.lastIssue ? `\n${probe.lastIssue}` : '')
  return (
    <UiEntity
      uiTransform={{ positionType: 'absolute', position: { top: 60, right: 24 }, padding: 8 }}
      uiBackground={{ color: Color4.create(0, 0, 0, 0.6) }}
    >
      <Label value={text} fontSize={14} color={issues > 0 ? Color4.Red() : Color4.Green()} textAlign="top-left" />
    </UiEntity>
  )
}
