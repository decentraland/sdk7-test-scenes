// Scene noise: the shared NoiseBus every GuardSquad and Stalker listens to, the public `emitNoise` API
// for game systems, and the system that turns the local player's movement into footstep/landing noises.
// The player system runs only while some squad or Stalker holds it (retainPlayerNoise), so the scene
// pays nothing while no listener is active. The bus ages on the scene's simulation clock (clock-scene.ts): paused, its
// time stands and the player's footsteps are dropped. No `~system/*` imports: runs headless in tests.
//
// Game systems raise a noise without touching npc internals:
//   import { emitNoise } from '../npc/noise-scene'
//   emitNoise({ kind: 'impact', position: branchPosition, source: 'branch' }) // loudness: NOISE_LOUDNESS
import { engine, Transform } from '@dcl/sdk/ecs'
import { sceneClock } from './clock-scene'
import { DEFAULT_PLAYER_NOISE, NoiseBus, NoiseEvent, NoiseInput, PlayerNoiseTracker } from './noise'

/** The local player's footstep/landing detector; tune through `playerNoise.cfg`. */
export const playerNoise = new PlayerNoiseTracker({ ...DEFAULT_PLAYER_NOISE })

/** The scene's noise bus. Guards read it; anything may emit on it. */
export const noiseBus = new NoiseBus()

/** Raise a noise guards can hear. `loudness` = audible radius in m (default by kind, NOISE_LOUDNESS). */
export function emitNoise(noise: NoiseInput): NoiseEvent {
  return noiseBus.emit(noise)
}

let holders = 0

// The player walks in real time: the tracker reads the engine's dt (its gait from real speed); the bus ages its
// noises in simulated time, and while the simulation is paused the player's noises are dropped (nobody listens).
function playerNoiseSystem(engineDt: number): void {
  const simDt = sceneClock().dt
  noiseBus.advance(simDt)
  const t = Transform.getOrNull(engine.PlayerEntity)
  if (!t || engineDt <= 0) return
  const noises = playerNoise.update(engineDt, t.position)
  if (simDt > 0) for (const noise of noises) noiseBus.emit(noise)
}

/** Start the player noise system (refcounted). Returns the release function. */
export function retainPlayerNoise(): () => void {
  if (holders++ === 0) {
    sceneClock()
    playerNoise.reset()
    engine.addSystem(playerNoiseSystem)
  }
  let released = false
  return () => {
    if (released) return
    released = true
    if (--holders === 0) engine.removeSystem(playerNoiseSystem)
  }
}
