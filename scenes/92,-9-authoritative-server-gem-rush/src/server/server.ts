import { AvatarBase, Entity, PlayerIdentityData, Transform, engine } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { syncEntity } from '@dcl/sdk/network'
import { COLLECT_RADIUS, HEARTBEAT_MS } from '../shared/config'
import { room } from '../shared/messages'
import { HallOfFame, LastRound, RoundPhase, RoundScores, RoundState, ServerHeartbeat } from '../shared/schemas'
import { getPlayerStats, loadHallOfFame } from './persistence'
import { acceptCollect, getGem, getPhase, initRounds, roundSystem } from './rounds'

let heartbeatEntity: Entity

export async function startServer(): Promise<void> {
  console.log('[SERVER] Gem Rush server starting…')

  // THE single scene-wide Storage read of a server session. Everything the game
  // does afterwards runs on memory + synced components until the next round end.
  const hallOfFame = await loadHallOfFame()

  // Create + sync the server-owned state entity. ONLY the server calls
  // syncEntity() in an authoritative scene; clients receive the sync. All four
  // state components share one entity but are split atomically by change rate.
  const stateEntity = engine.addEntity()
  RoundState.create(stateEntity)
  RoundScores.create(stateEntity)
  LastRound.create(stateEntity)
  HallOfFame.create(stateEntity)
  syncEntity(stateEntity, [
    RoundState.componentId,
    RoundScores.componentId,
    LastRound.componentId,
    HallOfFame.componentId
  ])

  heartbeatEntity = engine.addEntity()
  // Pulse the first heartbeat immediately so the first client to connect after a
  // cold start detects liveness without waiting a full interval.
  ServerHeartbeat.create(heartbeatEntity, { beatAt: Date.now() })
  syncEntity(heartbeatEntity, [ServerHeartbeat.componentId])

  initRounds(stateEntity, hallOfFame.totalRounds)
  registerMessageHandlers()
  engine.addSystem(roundSystem)
  engine.addSystem(heartbeatSystem)

  console.log(
    `[SERVER] Ready. Hall of fame: ${hallOfFame.entries.length} entry(ies), ${hallOfFame.totalRounds} round(s) played.`
  )
}

function registerMessageHandlers(): void {
  room.onMessage('collectGem', (data, context) => {
    if (!context) return
    const address = context.from.toLowerCase()

    if (getPhase() !== RoundPhase.Active) {
      room.send('collectRejected', { gemId: data.gemId, reason: 'No active round right now.' }, { to: [context.from] })
      return
    }

    // Double-click race between two players: the first accepted collect removes
    // the gem, so the second lookup simply misses.
    const gem = getGem(data.gemId)
    if (!gem) {
      room.send('collectRejected', { gemId: data.gemId, reason: 'Too late — gem already taken!' }, { to: [context.from] })
      return
    }

    // --- Anti-cheat: verify the player is genuinely near the gem. ---
    // We trust ONLY server-verified positions read from PlayerIdentityData +
    // Transform, never anything the client reported. The gem position comes from
    // the server's own memory (liveGems), not from any synced component.
    let playerName = shortAddress(address)
    let withinRange = false

    for (const [playerEntity, identity] of engine.getEntitiesWith(PlayerIdentityData)) {
      if (identity.address.toLowerCase() !== address) continue

      const transform = Transform.getOrNull(playerEntity)
      if (transform) {
        withinRange = Vector3.distance(transform.position, gem.position) <= COLLECT_RADIUS
      }

      const avatar = AvatarBase.getOrNull(playerEntity)
      if (avatar && avatar.name) playerName = avatar.name
      break
    }

    if (!withinRange) {
      room.send('collectRejected', { gemId: data.gemId, reason: 'Get closer to the gem!' }, { to: [context.from] })
      return
    }

    // --- Accept: the SERVER counts the score; memory + syncEntity only. ---
    const roundTotal = acceptCollect(address, playerName, data.gemId)
    room.send('gemCollected', { gemId: data.gemId, value: gem.value, roundTotal }, { to: [context.from] })
  })

  // A client asks for its persisted lifetime stats. Loaded from Storage.player at
  // most once per player per server session (cached in persistence.ts after).
  room.onMessage('getMyStats', (_data, context) => {
    if (!context) return
    const from = context.from
    void getPlayerStats(from).then((stats) => {
      room.send(
        'myStats',
        {
          gamesPlayed: stats.gamesPlayed,
          gemsCollected: stats.gemsCollected,
          wins: stats.wins,
          bestRound: stats.bestRound
        },
        { to: [from] }
      )
    })
  })
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
