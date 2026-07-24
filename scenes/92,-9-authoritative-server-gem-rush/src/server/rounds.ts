import { Entity, PlayerIdentityData, engine } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { syncEntity } from '@dcl/sdk/network'
import {
  GEM_COUNT,
  GEM_FIELD,
  LOBBY_SECONDS,
  MAX_SCOREBOARD,
  MIN_GEM_SPACING,
  NORMAL_VALUE,
  PODIUM_SECONDS,
  RARE_CHANCE,
  RARE_VALUE,
  ROUND_SECONDS
} from '../shared/config'
import { Gem, HallOfFame, LastRound, RoundPhase, RoundScores, RoundState } from '../shared/schemas'
import { commitRoundResults, getHallOfFame } from './persistence'

// ---------------------------------------------------------------------------
// The round state machine. ALL live game state lives here, in plain server
// memory, and reaches clients through synced components — Storage is never
// touched during play. The single persistence moment is the Active → Podium
// edge (enterPodium → commitRoundResults).
// ---------------------------------------------------------------------------

type LiveGem = { entity: Entity; position: Vector3; value: number }
type ScoreRecord = { name: string; score: number }

let phase: RoundPhase = RoundPhase.Lobby
let roundNumber = 0 // seeded from the persisted totalRounds on boot
let phaseRemaining = LOBBY_SECONDS // seconds left in the current phase

// gemId → live gem. Monotonic across rounds: a stale collectGem from a previous
// round can never match a freshly spawned gem.
const liveGems = new Map<number, LiveGem>()
let nextGemId = 1

// address (lower-case) → this round's record. Cleared every lobby.
const roundScores = new Map<string, ScoreRecord>()

let stateEntity: Entity
let committing = false // reentrancy guard around the async round-end commit

export function initRounds(entity: Entity, persistedTotalRounds: number): void {
  stateEntity = entity
  roundNumber = persistedTotalRounds
  phase = RoundPhase.Lobby
  phaseRemaining = LOBBY_SECONDS
  publishRoundState()
  publishScores()
  publishHallOfFame()
}

export function getPhase(): RoundPhase {
  return phase
}

export function getGem(gemId: number): LiveGem | undefined {
  return liveGems.get(gemId)
}

// A validated collect (server.ts already checked phase, existence and proximity).
// Removing the entity propagates the despawn to every client; the score change
// reaches them through the synced RoundScores component. No Storage here — ever.
export function acceptCollect(address: string, name: string, gemId: number): number {
  const gem = liveGems.get(gemId)
  if (!gem) return 0
  engine.removeEntity(gem.entity)
  liveGems.delete(gemId)

  const record = roundScores.get(address) ?? { name, score: 0 }
  record.name = name
  record.score += gem.value
  roundScores.set(address, record)

  publishScores()
  publishRoundState() // gemsRemaining changed
  return record.score
}

// --- The 1 Hz machine tick -------------------------------------------------------
// Synced writes are throttled by design: the machine (and thus RoundState) ticks
// once per second, never per frame.
let secondAcc = 0
export function roundSystem(dt: number): void {
  secondAcc += dt
  if (secondAcc < 1) return
  secondAcc -= 1

  switch (phase) {
    case RoundPhase.Lobby: {
      // Hold the countdown while the scene is empty — no players, no rounds.
      if (countPlayers() === 0) {
        phaseRemaining = LOBBY_SECONDS
        break
      }
      if (--phaseRemaining <= 0) enterActive()
      break
    }
    case RoundPhase.Active: {
      // The round ends on the timer or as soon as every gem is collected.
      if (--phaseRemaining <= 0 || liveGems.size === 0) void enterPodium()
      break
    }
    case RoundPhase.Podium: {
      if (--phaseRemaining <= 0 && !committing) enterLobby()
      break
    }
  }

  publishRoundState()
}

// --- Transitions -----------------------------------------------------------------

function enterLobby(): void {
  phase = RoundPhase.Lobby
  phaseRemaining = LOBBY_SECONDS
  roundScores.clear()
  publishScores() // broadcast the now-empty board
  console.log('[SERVER] Lobby — next round soon')
}

function enterActive(): void {
  phase = RoundPhase.Active
  phaseRemaining = ROUND_SECONDS
  roundNumber += 1
  spawnGems()
  console.log(`[SERVER] Round ${roundNumber} started — ${liveGems.size} gems spawned`)
}

// THE key moment of the whole scene: the only place in the game loop that
// persists anything. The phase is switched synchronously before the first await,
// and `committing` guards the async tail, so a slow Storage call can never
// double-fire the transition.
async function enterPodium(): Promise<void> {
  phase = RoundPhase.Podium
  phaseRemaining = PODIUM_SECONDS
  committing = true

  despawnAllGems()

  const results = [...roundScores.entries()].map(([address, r]) => ({ address, name: r.name, score: r.score }))
  const winner = results.reduce((a, b) => (b.score > a.score ? b : a), { address: '', name: '', score: 0 })

  const last = LastRound.getMutable(stateEntity)
  last.roundNumber = roundNumber
  last.winnerName = winner.name
  last.winnerScore = winner.score
  last.endedAt = Date.now()

  console.log(`[SERVER] Round ${roundNumber} ended — persisting results (${results.length} player(s))`)
  await commitRoundResults(roundNumber, results)
  publishHallOfFame()

  committing = false
}

// --- Gem lifecycle ---------------------------------------------------------------

function spawnGems(): void {
  const placed: Vector3[] = []
  for (let i = 0; i < GEM_COUNT; i++) {
    const position = randomFieldPosition(placed)
    placed.push(position)
    const value = Math.random() < RARE_CHANCE ? RARE_VALUE : NORMAL_VALUE

    // Dynamic entity: no entityEnumId — only the server ever calls syncEntity()
    // in an authoritative scene, so its networkId namespace is collision-free.
    // Note that ONLY Gem.componentId is synced: clients decorate these entities
    // with local Transform/MeshRenderer/Material, and none of that broadcasts.
    const entity = engine.addEntity()
    const gemId = nextGemId++
    Gem.create(entity, { gemId, value, position })
    syncEntity(entity, [Gem.componentId])
    liveGems.set(gemId, { entity, position, value })
  }
}

function despawnAllGems(): void {
  for (const gem of liveGems.values()) engine.removeEntity(gem.entity)
  liveGems.clear()
}

// Rejection-sample a position at least MIN_GEM_SPACING from the already placed
// gems; give up after a few tries and accept the overlap (a 16 m parcel is small).
function randomFieldPosition(placed: Vector3[]): Vector3 {
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = Vector3.create(
      GEM_FIELD.minX + Math.random() * (GEM_FIELD.maxX - GEM_FIELD.minX),
      GEM_FIELD.y,
      GEM_FIELD.minZ + Math.random() * (GEM_FIELD.maxZ - GEM_FIELD.minZ)
    )
    if (placed.every((p) => Vector3.distance(p, candidate) >= MIN_GEM_SPACING)) return candidate
  }
  return Vector3.create(
    GEM_FIELD.minX + Math.random() * (GEM_FIELD.maxX - GEM_FIELD.minX),
    GEM_FIELD.y,
    GEM_FIELD.minZ + Math.random() * (GEM_FIELD.maxZ - GEM_FIELD.minZ)
  )
}

// --- Publishing into synced components --------------------------------------------
// The validateBeforeChange guards reject these writes from anyone but the server,
// so clients can never forge them.

function publishRoundState(): void {
  const state = RoundState.getMutable(stateEntity)
  state.phase = phase
  state.roundNumber = roundNumber
  state.secondsLeft = Math.max(0, phaseRemaining)
  state.gemsRemaining = liveGems.size
}

function publishScores(): void {
  const ranked = [...roundScores.entries()]
    .sort(([, a], [, b]) => b.score - a.score)
    .slice(0, MAX_SCOREBOARD)

  const board = RoundScores.getMutable(stateEntity)
  board.addresses = ranked.map(([address]) => address)
  board.names = ranked.map(([, r]) => r.name)
  board.scores = ranked.map(([, r]) => r.score)
}

function publishHallOfFame(): void {
  const hof = getHallOfFame()
  const synced = HallOfFame.getMutable(stateEntity)
  synced.names = hof.entries.map((e) => e.name)
  synced.totalGems = hof.entries.map((e) => e.totalGems)
  synced.wins = hof.entries.map((e) => e.wins)
  synced.totalRounds = hof.totalRounds
  synced.updatedAt = Date.now()
}

function countPlayers(): number {
  let count = 0
  for (const [,] of engine.getEntitiesWith(PlayerIdentityData)) count++
  return count
}
