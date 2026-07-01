import { AvatarBase, Entity, PlayerIdentityData, Transform, engine } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { syncEntity } from '@dcl/sdk/network'
import { Storage } from '@dcl/sdk/server'
import { getSceneInformation } from '~system/Runtime'
import { CLAIM_RADIUS, HEARTBEAT_MS, MAX_ENTRIES, ORB_POSITION } from '../shared/config'
import { room } from '../shared/messages'
import { Leaderboard, ServerHeartbeat } from '../shared/schemas'

const STORAGE_KEY = 'leaderboard'
const PARCEL_SIZE = 16

type PlayerRecord = { name: string; score: number }

// address (lower-case) → record. The single source of truth, held in server memory
// and mirrored to Storage so it survives the server going to sleep / redeploys.
const scores = new Map<string, PlayerRecord>()

let stateEntity: Entity
let heartbeatEntity: Entity

// The server reports player Transform positions in WORLD (parcel-absolute) metres,
// but scene entities (and ORB_POSITION) are in scene-LOCAL metres. They only
// coincide when the base parcel is (0,0). We derive the base offset from scene
// metadata so proximity checks work at any parcel — see toSceneLocal().
let sceneWorldOffset = Vector3.create(0, 0, 0)

export async function startServer(): Promise<void> {
  console.log('[SERVER] Leaderboard server starting…')

  await resolveSceneWorldOffset()
  await loadFromStorage()

  // Create + sync the server-owned state entities. ONLY the server calls
  // syncEntity() in an authoritative scene; clients receive the sync.
  stateEntity = engine.addEntity()
  Leaderboard.create(stateEntity, { names: [], scores: [], updatedAt: Date.now() })
  syncEntity(stateEntity, [Leaderboard.componentId])

  heartbeatEntity = engine.addEntity()
  // Pulse the first heartbeat immediately so the first client to connect after a
  // cold start detects liveness without waiting a full interval.
  ServerHeartbeat.create(heartbeatEntity, { beatAt: Date.now() })
  syncEntity(heartbeatEntity, [ServerHeartbeat.componentId])

  // Push whatever we restored from Storage into the synced component.
  publishLeaderboard()

  registerMessageHandlers()
  engine.addSystem(heartbeatSystem)

  console.log(`[SERVER] Ready. Restored ${scores.size} player record(s) from Storage.`)
}

function registerMessageHandlers(): void {
  room.onMessage('claimPoint', (_data, context) => {
    if (!context) return
    const address = context.from.toLowerCase()

    // --- Anti-cheat: verify the player is genuinely near the orb. ---
    // We trust ONLY server-verified positions read from PlayerIdentityData +
    // Transform, never anything the client reported.
    let playerName = shortAddress(address)
    let withinRange = false

    for (const [playerEntity, identity] of engine.getEntitiesWith(PlayerIdentityData)) {
      if (identity.address.toLowerCase() !== address) continue

      const transform = Transform.getOrNull(playerEntity)
      if (transform) {
        // Convert the player's world-frame position into the scene-local frame
        // the orb lives in before measuring distance.
        const localPos = toSceneLocal(transform.position)
        withinRange = Vector3.distance(localPos, ORB_POSITION) <= CLAIM_RADIUS
      }

      const avatar = AvatarBase.getOrNull(playerEntity)
      if (avatar && avatar.name) playerName = avatar.name
      break
    }

    if (!withinRange) {
      room.send('claimRejected', { reason: 'Get closer to the orb to score!' }, { to: [context.from] })
      return
    }

    // --- Accept the claim: the SERVER increments the score, not the client. ---
    const record = scores.get(address) ?? { name: playerName, score: 0 }
    record.name = playerName
    record.score += 1
    scores.set(address, record)

    room.send('scoreUpdate', { total: record.score }, { to: [context.from] })

    void persistToStorage()
    publishLeaderboard()
  })
}

// Sort, trim to top-N, and write into the synced component. The validateBeforeChange
// guard rejects this write from anyone but the server, so clients can never forge it.
function publishLeaderboard(): void {
  const ranked = [...scores.values()].sort((a, b) => b.score - a.score).slice(0, MAX_ENTRIES)

  const board = Leaderboard.getMutable(stateEntity)
  board.names = ranked.map((r) => r.name)
  board.scores = ranked.map((r) => r.score)
  board.updatedAt = Date.now()
}

// --- Coordinate frame ----------------------------------------------------------

// Read the scene's base parcel from metadata and turn it into a world-space offset
// (base is (0,0) → offset zero, so this is a no-op for single-parcel-at-origin scenes).
async function resolveSceneWorldOffset(): Promise<void> {
  try {
    const info = await getSceneInformation({})
    const metadata = JSON.parse(info.metadataJson)
    const base: string = metadata?.scene?.base ?? '0,0'
    const [bx, bz] = base.split(',').map((n: string) => parseInt(n.trim(), 10))
    sceneWorldOffset = Vector3.create(bx * PARCEL_SIZE, 0, bz * PARCEL_SIZE)
    console.log(`[SERVER] scene base parcel ${base} → world offset (${sceneWorldOffset.x}, 0, ${sceneWorldOffset.z})`)
  } catch (e) {
    console.log('[SERVER] Could not resolve scene base parcel, assuming origin (0,0):', e)
  }
}

function toSceneLocal(worldPos: Vector3): Vector3 {
  return Vector3.subtract(worldPos, sceneWorldOffset)
}

// --- Persistence (server-only) -------------------------------------------------

async function loadFromStorage(): Promise<void> {
  try {
    const raw = await Storage.get<string>(STORAGE_KEY)
    if (!raw) return
    const entries: [string, PlayerRecord][] = JSON.parse(raw)
    for (const [address, record] of entries) scores.set(address, record)
  } catch (e) {
    console.log('[SERVER] Could not load leaderboard from Storage:', e)
  }
}

async function persistToStorage(): Promise<void> {
  try {
    await Storage.set(STORAGE_KEY, JSON.stringify([...scores.entries()]))
  } catch (e) {
    console.log('[SERVER] Could not persist leaderboard to Storage:', e)
  }
}

// --- Heartbeat -----------------------------------------------------------------

let heartbeatAcc = 0
function heartbeatSystem(dt: number): void {
  heartbeatAcc += dt
  if (heartbeatAcc < HEARTBEAT_MS / 1000) return
  heartbeatAcc = 0
  ServerHeartbeat.getMutable(heartbeatEntity).beatAt = Date.now()
}

function shortAddress(address: string): string {
  if (address.length < 10) return address
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}
