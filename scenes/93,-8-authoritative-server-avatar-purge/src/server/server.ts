import { Entity, PlayerIdentityData, Transform, engine } from '@dcl/sdk/ecs'
import { syncEntity } from '@dcl/sdk/network'
import { HEARTBEAT_MS } from '../shared/config'
import { room } from '../shared/messages'
import { createAvatarPurger } from '../shared/purge'
import { ServerHeartbeat, ServerRoster } from '../shared/schemas'

// ---------------------------------------------------------------------------
// Minimal authoritative (headless) server.
//
// This scene has NO gameplay — it exists only to reproduce the inbound
// DELETE_ENTITY avatar-purge bug (see src/client/repro-delete.ts). The server:
//
//  • runs so the host streams remote avatars into every instance's ECS,
//  • pulses a heartbeat so the client UI can show it is alive, and
//  • publishes its OWN getEntitiesWith(PlayerIdentityData, Transform) roster so
//    the client can compare it against its local view.
//
// The exploit injects a DELETE_ENTITY into the CLIENT's engine only — it never
// reaches the server (and even the normal outbound path is blocked by the SDK's
// syncFilter for reserved ids). So this server roster stays intact while the
// client's own roster loses the victim: proof the purge is client-local and the
// authoritative state is untouched. All leaderboard / scoring / anti-cheat /
// Storage / admin logic from the original showcase scene has been removed.
// ---------------------------------------------------------------------------

const RESERVED_MAX = 512
const ROSTER_PUBLISH_MS = 1000

let heartbeatEntity: Entity
let rosterEntity: Entity

export async function startServer(): Promise<void> {
  console.log('[SERVER] Avatar-purge repro server starting…')

  heartbeatEntity = engine.addEntity()
  // Pulse immediately so the first client to connect detects liveness without
  // waiting a full interval. ONLY the server calls syncEntity() in an
  // authoritative scene; clients receive the sync.
  ServerHeartbeat.create(heartbeatEntity, { beatAt: Date.now() })
  syncEntity(heartbeatEntity, [ServerHeartbeat.componentId])

  rosterEntity = engine.addEntity()
  ServerRoster.create(rosterEntity, { ids: [], addresses: [], updatedAt: Date.now() })
  syncEntity(rosterEntity, [ServerRoster.componentId])

  engine.addSystem(heartbeatSystem)
  engine.addSystem(rosterSystem)

  // The exploit, server-side. A client asks (purgeOnServer); the server injects a
  // DELETE_ENTITY for every OTHER avatar into its OWN engine. That purges the
  // server's local copy AND — because receiveMessages re-broadcasts it and
  // rendererTransport forwards it (no componentId to filter on) — offers the
  // reserved-range delete to the headless host via crdtSendToRenderer. hammurabi
  // denies it there; bevy applies it. Watch a THIRD observer client + server logs
  // to tell the two apart (the server's own roster drops either way, because the
  // local purge is below the guard).
  const purger = createAvatarPurger('server')
  room.onMessage('purgeOnServer', (_data, context) => {
    const requester = context?.from ?? ''
    const targets = purger.purge(requester) // spare the requester's own avatar
    console.log(
      `[SERVER] purgeOnServer from ${requester || '?'} → injected DELETE_ENTITY for ${targets.length} player(s):`,
      targets.map((e) => `#${e as number}`).join(' ') || '(none)'
    )
  })

  console.log('[SERVER] Ready.')
}

let heartbeatAcc = 0
function heartbeatSystem(dt: number): void {
  heartbeatAcc += dt
  if (heartbeatAcc < HEARTBEAT_MS / 1000) return
  heartbeatAcc = 0
  ServerHeartbeat.getMutable(heartbeatEntity).beatAt = Date.now()
}

// Publish the server's authoritative player roster, throttled and change-gated so
// the synced component only updates when the set of players actually changes.
let rosterAcc = 0
let lastRosterKey = ''
function rosterSystem(dt: number): void {
  rosterAcc += dt
  if (rosterAcc < ROSTER_PUBLISH_MS / 1000) return
  rosterAcc = 0

  const ids: number[] = []
  const addresses: string[] = []
  for (const [entity, identity] of engine.getEntitiesWith(PlayerIdentityData, Transform)) {
    if ((entity as number) >= RESERVED_MAX) continue // players live in the reserved range
    ids.push(entity as number)
    addresses.push(identity.address)
  }

  const key = ids.join(',') + '|' + addresses.join(',')
  if (key === lastRosterKey) return
  lastRosterKey = key

  const roster = ServerRoster.getMutable(rosterEntity)
  roster.ids = ids
  roster.addresses = addresses
  roster.updatedAt = Date.now()
  console.log(`[SERVER] roster now ${ids.length} player(s):`, ids.map((id, i) => `#${id}[${addresses[i]}]`).join(' '))
}
