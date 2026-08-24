import { Entity, PlayerIdentityData, Transform, engine } from '@dcl/sdk/ecs'
import { syncEntity } from '@dcl/sdk/network'
import { HEARTBEAT_MS } from '../shared/config'
import { room } from '../shared/messages'
import { createAvatarPurger } from '../shared/purge'
import { ServerHeartbeat, ServerRoster } from '../shared/schemas'
import { createSwapDetector, entityNumber, entityVersion, isAvatarNumber } from '../shared/swaps'

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

const ROSTER_PUBLISH_MS = 1000
const VERIFIED_ACTIVE_MS = 6000 // a ping is "recent" for this long (≈3 ping intervals)
const VERIFIED_GRACE_MS = 5000 // give a fresh sender's avatar time to stream in before flagging

let heartbeatEntity: Entity
let rosterEntity: Entity

// Comms-verified senders (from ping's context.from), the ground-truth channel that
// is INDEPENDENT of the avatar CRDT. Plain object (no Map iteration) keyed by
// lower-cased address → first/last time we saw a verified message from them.
const verifiedSeen: Record<string, { firstAt: number; lastAt: number }> = {}

export async function startServer(): Promise<void> {
  console.log('[SERVER] Avatar-purge repro server starting…')

  heartbeatEntity = engine.addEntity()
  // Pulse immediately so the first client to connect detects liveness without
  // waiting a full interval. ONLY the server calls syncEntity() in an
  // authoritative scene; clients receive the sync.
  ServerHeartbeat.create(heartbeatEntity, { beatAt: Date.now() })
  syncEntity(heartbeatEntity, [ServerHeartbeat.componentId])

  rosterEntity = engine.addEntity()
  ServerRoster.create(rosterEntity, { ids: [], numbers: [], versions: [], addresses: [], warnings: [], updatedAt: Date.now() })
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

  // Record every comms-verified ping. context.from is signed by the sender and does
  // NOT come from the avatar CRDT, so it is the one independent proof "this wallet is
  // really connected" that the roster can be checked against.
  room.onMessage('ping', (_data, context) => {
    const from = context?.from?.toLowerCase()
    if (!from) return
    const now = Date.now()
    const seen = verifiedSeen[from]
    if (seen) seen.lastAt = now
    else verifiedSeen[from] = { firstAt: now, lastAt: now }
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

// Publish the server's authoritative player roster (version-aware) and run the
// swap detector over it. Throttled, and change-gated on both the roster and the
// warnings so the synced component only updates when something actually changes.
const swaps = createSwapDetector()
let rosterAcc = 0
let lastKey = ''
function rosterSystem(dt: number): void {
  rosterAcc += dt
  if (rosterAcc < ROSTER_PUBLISH_MS / 1000) return
  rosterAcc = 0

  const ids: number[] = []
  const numbers: number[] = []
  const versions: number[] = []
  const addresses: string[] = []
  for (const [entity, identity] of engine.getEntitiesWith(PlayerIdentityData, Transform)) {
    const id = entity as number
    // Filter by NUMBER, not the packed id: a version-bumped avatar (e.g. (32, v1))
    // packs above 512 but is still a reserved player slot.
    if (!isAvatarNumber(id)) continue
    ids.push(id)
    numbers.push(entityNumber(id))
    versions.push(entityVersion(id))
    addresses.push(identity.address)
  }

  // Feed the detector every tick (persistent history), even when the published
  // roster is unchanged, so a reuse across a leave/rejoin gap is still caught.
  swaps.scan(ids.map((id, i) => ({ id, address: addresses[i] })))

  // Ground-truth cross-check: recent verified senders (established past the grace
  // window) that have NO avatar entity in the roster — provably connected, but the
  // server can't see them. This is the swap the roster alone can't reveal.
  const now = Date.now()
  const verifiedActive: string[] = []
  for (const addr of Object.keys(verifiedSeen)) {
    const seen = verifiedSeen[addr]
    if (now - seen.lastAt <= VERIFIED_ACTIVE_MS && now - seen.firstAt >= VERIFIED_GRACE_MS) {
      verifiedActive.push(addr)
    }
  }
  swaps.checkGroundTruth(addresses.map((a) => a.toLowerCase()), verifiedActive)

  const key = ids.join(',') + '|' + addresses.join(',') + '|' + swaps.warnings.join('|')
  if (key === lastKey) return
  lastKey = key

  const roster = ServerRoster.getMutable(rosterEntity)
  roster.ids = ids
  roster.numbers = numbers
  roster.versions = versions
  roster.addresses = addresses
  roster.warnings = [...swaps.warnings]
  roster.updatedAt = Date.now()
  console.log(
    `[SERVER] roster now ${ids.length} player(s):`,
    ids.map((id, i) => `#${numbers[i]}v${versions[i]}[${addresses[i]}]`).join(' ') || '(none)'
  )
  if (swaps.warnings.length) console.log('[SERVER] swap warnings:', swaps.warnings.join(' | '))
}
