// Noise as a game event. SDK AudioSource tells nobody that it played, so anything a guard should be
// able to hear is raised explicitly as a NoiseEvent on a NoiseBus: the player's own footsteps and
// landings (PlayerNoiseTracker, below) and any game system through emitNoise (noise-scene.ts).
// Ambient scene sounds (wind, presence steps, cowbell ambience) are NOT noises; do not emit them.
// Pure: no SDK imports, runs in Node tests.
import { copy, Vec3 } from './vec'

/**
 * Kinds in use. Free-form strings are allowed; these have default loudness and hearing weights.
 *   steps  footsteps (walk: barely, jog: audible)       run    running footsteps
 *   land   landing after a jump or fall                 impact something hit or dropped (branch, thrown object)
 *   bell   a bell or cowbell rung by the player         voice  a shout
 *   test   debug button
 */
export type NoiseKind = 'steps' | 'run' | 'land' | 'impact' | 'bell' | 'voice' | 'test' | (string & {})

/** Default loudness by kind: the radius (m) within which a guard can hear it at all. */
export const NOISE_LOUDNESS: Readonly<Record<string, number>> = {
  steps: 7,
  run: 12,
  land: 8,
  impact: 10,
  bell: 25,
  voice: 15,
  test: 10
}
export const DEFAULT_NOISE_LOUDNESS = 8

export interface NoiseEvent {
  readonly seq: number // increasing id on its bus
  readonly kind: NoiseKind
  readonly position: Vec3
  readonly loudness: number // m: audible radius; perceived level falls linearly to 0 at this distance
  readonly time: number // bus clock, s
  readonly source: string // who made it ('player', a guard id, 'debug', a game system name); a guard ignores its own
}

export interface NoiseInput {
  kind: NoiseKind
  position: Vec3
  loudness?: number // default NOISE_LOUDNESS[kind]
  source?: string // default 'scene'
}

/**
 * Recent noises, read by listeners through a cursor (`since(seq)`), so one noise reaches every
 * listener once regardless of how many there are. Keeps the last `capacity` events.
 */
export class NoiseBus {
  now = 0
  private events: NoiseEvent[] = []
  private seq = 0

  constructor(private readonly capacity = 64) {}

  emit(input: NoiseInput): NoiseEvent {
    const loudness = input.loudness ?? NOISE_LOUDNESS[input.kind] ?? DEFAULT_NOISE_LOUDNESS
    const event: NoiseEvent = {
      seq: ++this.seq,
      kind: input.kind,
      position: copy(input.position),
      loudness: Math.max(0, loudness),
      time: this.now,
      source: input.source ?? 'scene'
    }
    this.events.push(event)
    if (this.events.length > this.capacity) this.events.splice(0, this.events.length - this.capacity)
    return event
  }

  /** Events after `seq`, oldest first. */
  since(seq: number): NoiseEvent[] {
    const out: NoiseEvent[] = []
    for (const e of this.events) if (e.seq > seq) out.push(e)
    return out
  }

  /** Cursor for a new listener: it will only read noises emitted from now on. */
  get lastSeq(): number {
    return this.seq
  }

  advance(dt: number): void {
    this.now += dt
  }

  clear(): void {
    this.events = []
  }
}

// ---- player noise from the Transform -----------------------------------------------------------

export interface PlayerNoiseConfig {
  smoothing: number // 1/s, horizontal speed smoothing
  stillSpeed: number // m/s, below: standing, no steps
  jogSpeed: number // m/s, at or above: jogging (player locomotion: walk 2, jog 8, run 10)
  runSpeed: number // m/s, at or above: running
  walkLoudness: number // m, Ctrl-walk: nearly silent (0 = silent, no event)
  jogLoudness: number // m
  runLoudness: number // m
  stepInterval: number // s between footstep noises while moving (one noise stands for a few steps)
  firstStepDelay: number // s after starting to move before the first footstep noise
  teleportDistance: number // m in one frame: a teleport, resets tracking, no noise
  landing: boolean // detect landings from vertical motion
  fallSpeed: number // m/s downward that counts as falling
  minFallTime: number // s of falling before a landing counts (filters jitter, small steps)
  landStopSpeed: number // m/s: falling ended when the downward speed drops below this
  landLoudness: number // m at fallSpeed impact
  landLoudnessPerSpeed: number // extra m per m/s of impact speed above fallSpeed
  maxLandLoudness: number // m
}

export const DEFAULT_PLAYER_NOISE: PlayerNoiseConfig = {
  smoothing: 8,
  stillSpeed: 0.3,
  jogSpeed: 3,
  runSpeed: 9,
  walkLoudness: 1,
  jogLoudness: NOISE_LOUDNESS.steps,
  runLoudness: NOISE_LOUDNESS.run,
  stepInterval: 0.5,
  firstStepDelay: 0.3, // also lets the smoothed speed reach the real gait (a run is ~9.4 m/s by then)
  teleportDistance: 4,
  landing: true,
  fallSpeed: 3,
  minFallTime: 0.12,
  landStopSpeed: 0.5,
  landLoudness: NOISE_LOUDNESS.land,
  landLoudnessPerSpeed: 1.5,
  maxLandLoudness: 14
}

export type Gait = 'still' | 'walk' | 'jog' | 'run'

/**
 * Turns samples of one player's position into footstep and landing noises (positions at the feet).
 * Footsteps: one noise per `stepInterval` while moving, kind and loudness by gait from the smoothed
 * horizontal speed (the loudest gait since the previous noise counts). Landings: a fall of at least
 * `minFallTime` at more than `fallSpeed` m/s that stops. Both heuristics read only the Transform:
 * the avatar's own step sounds and jump input are not observable as events by the scene.
 */
export class PlayerNoiseTracker {
  speed = 0
  gait: Gait = 'still'
  private last: Vec3 | null = null
  private stepTimer = 0
  private loudestGait: Gait = 'still'
  private fallTime = 0
  private maxFall = 0

  constructor(public cfg: PlayerNoiseConfig = DEFAULT_PLAYER_NOISE, readonly source = 'player') {
    this.reset()
  }

  reset(): void {
    this.last = null
    this.stepTimer = this.cfg.stepInterval - this.cfg.firstStepDelay
    this.speed = 0
    this.gait = 'still'
    this.loudestGait = 'still'
    this.fallTime = 0
    this.maxFall = 0
  }

  /** Feed one frame; returns the noises to emit (usually none). */
  update(dt: number, position: Vec3): NoiseInput[] {
    const cfg = this.cfg
    const prev = this.last
    this.last = copy(position)
    if (!prev || dt <= 0) return []
    const dx = position.x - prev.x
    const dy = position.y - prev.y
    const dz = position.z - prev.z
    const horizontal = Math.sqrt(dx * dx + dz * dz)
    if (horizontal > cfg.teleportDistance || Math.abs(dy) > cfg.teleportDistance) {
      this.reset()
      this.last = copy(position)
      return []
    }
    const out: NoiseInput[] = []
    this.speed += (horizontal / dt - this.speed) * Math.min(1, dt * cfg.smoothing)
    this.gait = this.classify(this.speed)

    if (this.gait === 'still') {
      this.stepTimer = cfg.stepInterval - cfg.firstStepDelay
      this.loudestGait = 'still'
    } else {
      if (GAIT_RANK[this.gait] > GAIT_RANK[this.loudestGait]) this.loudestGait = this.gait
      this.stepTimer += dt
      if (this.stepTimer >= cfg.stepInterval - 1e-6) {
        this.stepTimer -= cfg.stepInterval
        const step = this.stepNoise(this.loudestGait, position)
        if (step) out.push(step)
        this.loudestGait = this.gait
      }
    }

    if (cfg.landing) {
      const vy = dy / dt
      if (vy < -cfg.fallSpeed) {
        this.fallTime += dt
        this.maxFall = Math.max(this.maxFall, -vy)
      } else if (vy > -cfg.landStopSpeed) {
        if (this.fallTime >= cfg.minFallTime - 1e-6) {
          const loudness = Math.min(
            cfg.maxLandLoudness,
            cfg.landLoudness + Math.max(0, this.maxFall - cfg.fallSpeed) * cfg.landLoudnessPerSpeed
          )
          out.push({ kind: 'land', position: copy(position), loudness, source: this.source })
        }
        this.fallTime = 0
        this.maxFall = 0
      }
    }
    return out
  }

  classify(speed: number): Gait {
    const cfg = this.cfg
    if (speed < cfg.stillSpeed) return 'still'
    if (speed < cfg.jogSpeed) return 'walk'
    if (speed < cfg.runSpeed) return 'jog'
    return 'run'
  }

  private stepNoise(gait: Gait, position: Vec3): NoiseInput | null {
    const cfg = this.cfg
    const loudness = gait === 'run' ? cfg.runLoudness : gait === 'jog' ? cfg.jogLoudness : cfg.walkLoudness
    if (loudness <= 0) return null
    return { kind: gait === 'run' ? 'run' : 'steps', position: copy(position), loudness, source: this.source }
  }
}

const GAIT_RANK: Record<Gait, number> = { still: 0, walk: 1, jog: 2, run: 3 }
