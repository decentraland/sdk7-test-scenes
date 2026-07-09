import { AvatarBase, Entity, PlayerIdentityData, Transform, engine } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { syncEntity } from '@dcl/sdk/network'
import { Storage } from '@dcl/sdk/server'
import { ADMINS, CLAIM_RADIUS, HEARTBEAT_MS, MAX_ENTRIES, ORB_POSITION } from '../shared/config'
import { room } from '../shared/messages'
import { Leaderboard, ServerHeartbeat } from '../shared/schemas'

const STORAGE_KEY = 'leaderboard'

type PlayerRecord = { name: string; score: number }

// address (lower-case) → record. The single source of truth, held in server memory
// and mirrored to Storage so it survives the server going to sleep / redeploys.
const scores = new Map<string, PlayerRecord>()

let stateEntity: Entity
let heartbeatEntity: Entity

export async function startServer(): Promise<void> {
  console.log('[SERVER] Leaderboard server starting…')

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
        // Transform.position is scene-local, the same frame ORB_POSITION lives in,
        // so we can measure distance directly.
        withinRange = Vector3.distance(transform.position, ORB_POSITION) <= CLAIM_RADIUS
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

  // --- Admin: wipe the leaderboard. -------------------------------------------
  // Server-verified authority, exactly like claimPoint: we trust ONLY context.from
  // and ignore anyone whose wallet is not in the ADMINS allow-list. This clears the
  // in-memory source of truth AND Storage, then broadcasts the now-empty board, so
  // the reset takes effect live without a server restart.
  room.onMessage('resetLeaderboard', (_data, context) => {
    if (!context) return
    const address = context.from.toLowerCase()
    if (!ADMINS.includes(address)) {
      console.log(`[SERVER] resetLeaderboard rejected — ${shortAddress(address)} is not an admin`)
      return
    }

    scores.clear()
    void Storage.delete(STORAGE_KEY)
    publishLeaderboard()
    console.log(`[SERVER] Leaderboard reset by admin ${shortAddress(address)}`)
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
