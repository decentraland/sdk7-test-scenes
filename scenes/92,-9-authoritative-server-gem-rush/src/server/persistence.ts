import { Storage } from '@dcl/sdk/server'
import { MAX_HALL_OF_FAME } from '../shared/config'

// ---------------------------------------------------------------------------
// THE ONLY file in this scene that touches Storage.
//
// This is the point of the whole test scene: the store service is a CHECKPOINT,
// not a per-event database. Every call below logs with a [STORAGE] prefix so a
// tester can literally count the calls in the server logs:
//
//   - 1 GET  per server boot          (loadHallOfFame)
//   - ≤1 GET per player per session   (getPlayerStats, cached in memory after)
//   - 1 SET  per round end            (commitRoundResults → hall of fame)
//   - N SETs per round end            (commitRoundResults → one per scoring player)
//   - 0 calls during active gameplay  (collects only touch memory + syncEntity)
// ---------------------------------------------------------------------------

const HOF_KEY = 'gemrush:hall-of-fame'
const PLAYER_STATS_KEY = 'gemrush:stats'

export type HallOfFameEntry = {
  address: string
  name: string
  totalGems: number
  wins: number
  bestRound: number
}

export type HallOfFameData = {
  v: 1
  totalRounds: number
  entries: HallOfFameEntry[]
}

export type PlayerStats = {
  v: 1
  gamesPlayed: number
  gemsCollected: number
  wins: number
  bestRound: number
}

export type RoundResult = { address: string; name: string; score: number }

function emptyHallOfFame(): HallOfFameData {
  return { v: 1, totalRounds: 0, entries: [] }
}

function emptyPlayerStats(): PlayerStats {
  return { v: 1, gamesPlayed: 0, gemsCollected: 0, wins: 0, bestRound: 0 }
}

// In-memory mirrors — the live source of truth while the server is awake.
// Storage only ever sees snapshots of these at the key moments.
let hallOfFame: HallOfFameData = emptyHallOfFame()
const statsCache = new Map<string, PlayerStats>() // address (lower-case) → stats

export function getHallOfFame(): HallOfFameData {
  return hallOfFame
}

// --- Boot: the single scene-wide GET --------------------------------------------

export async function loadHallOfFame(): Promise<HallOfFameData> {
  try {
    const raw = await Storage.get<string>(HOF_KEY)
    console.log(`[STORAGE] GET ${HOF_KEY} → ${raw ? `${raw.length} chars` : '(empty)'}`)
    if (!raw) return (hallOfFame = emptyHallOfFame())

    // Defensive parsing: stored data may predate the current schema. Coerce every
    // field and fall back to fresh defaults on anything unreadable.
    const parsed = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || !Array.isArray(parsed.entries)) {
      return (hallOfFame = emptyHallOfFame())
    }
    hallOfFame = {
      v: 1,
      totalRounds: Number(parsed.totalRounds) || 0,
      entries: parsed.entries
        .filter((e: any) => typeof e?.address === 'string')
        .map((e: any) => ({
          address: e.address.toLowerCase(),
          name: String(e.name ?? ''),
          totalGems: Number(e.totalGems) || 0,
          wins: Number(e.wins) || 0,
          bestRound: Number(e.bestRound) || 0
        }))
    }
    return hallOfFame
  } catch (e) {
    console.log('[STORAGE] hall of fame unreadable, starting fresh:', e)
    return (hallOfFame = emptyHallOfFame())
  }
}

// --- Per-player stats: lazy GET, cached for the rest of the server session ------

export async function getPlayerStats(address: string): Promise<PlayerStats> {
  const key = address.toLowerCase()
  const cached = statsCache.get(key)
  if (cached) return cached

  let stats = emptyPlayerStats()
  try {
    const raw = await Storage.player.get<string>(key, PLAYER_STATS_KEY)
    console.log(`[STORAGE] GET player ${short(key)} ${PLAYER_STATS_KEY} → ${raw ? `${raw.length} chars` : '(empty)'}`)
    if (raw) {
      const parsed = JSON.parse(raw)
      stats = {
        v: 1,
        gamesPlayed: Number(parsed?.gamesPlayed) || 0,
        gemsCollected: Number(parsed?.gemsCollected) || 0,
        wins: Number(parsed?.wins) || 0,
        bestRound: Number(parsed?.bestRound) || 0
      }
    }
  } catch (e) {
    console.log(`[STORAGE] stats for ${short(key)} unreadable, starting fresh:`, e)
  }
  statsCache.set(key, stats)
  return stats
}

// --- Round end: THE key moment — the only writes in the whole game loop ---------

export async function commitRoundResults(roundNumber: number, results: RoundResult[]): Promise<void> {
  if (results.length === 0) return // nobody scored → nothing worth persisting

  const winner = results.reduce((a, b) => (b.score > a.score ? b : a))

  // 1. Merge the round into the in-memory hall of fame first — memory stays
  //    correct even if a Storage write fails below (the next round-end simply
  //    retries with the already-merged data).
  hallOfFame.totalRounds = roundNumber
  for (const r of results) {
    const address = r.address.toLowerCase()
    let entry = hallOfFame.entries.find((e) => e.address === address)
    if (!entry) {
      entry = { address, name: r.name, totalGems: 0, wins: 0, bestRound: 0 }
      hallOfFame.entries.push(entry)
    }
    entry.name = r.name
    entry.totalGems += r.score
    if (r.score > entry.bestRound) entry.bestRound = r.score
    if (address === winner.address.toLowerCase()) entry.wins += 1
  }
  hallOfFame.entries.sort((a, b) => b.totalGems - a.totalGems)
  hallOfFame.entries = hallOfFame.entries.slice(0, MAX_HALL_OF_FAME)

  // 2. One scene-wide SET per round.
  try {
    await Storage.set(HOF_KEY, JSON.stringify(hallOfFame))
    console.log(`[STORAGE] SET ${HOF_KEY} (round ${roundNumber}, ${results.length} player(s))`)
  } catch (e) {
    console.log('[STORAGE] could not persist hall of fame (will retry next round):', e)
  }

  // 3. One player SET per scoring player. Each write is independently guarded —
  //    a failure never stalls the round loop; the memory cache stays authoritative.
  for (const r of results) {
    const address = r.address.toLowerCase()
    const stats = await getPlayerStats(address) // cache hit for anyone who played
    stats.gamesPlayed += 1
    stats.gemsCollected += r.score
    if (r.score > stats.bestRound) stats.bestRound = r.score
    if (address === winner.address.toLowerCase()) stats.wins += 1

    try {
      await Storage.player.set(address, PLAYER_STATS_KEY, JSON.stringify(stats))
      console.log(`[STORAGE] SET player ${short(address)} ${PLAYER_STATS_KEY}`)
    } catch (e) {
      console.log(`[STORAGE] could not persist stats for ${short(address)}:`, e)
    }
  }
}

function short(address: string): string {
  if (address.length < 10) return address
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}
