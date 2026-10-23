// Guard hearing: which noises a guard hears, how loud they reach it, and an alert meter that turns
// loud or repeated noises into alarm. Pure: no SDK imports.
//
// Heard: distance (feet to the noise) <= the noise's loudness radius, ×wallMuffle when an occluder
// (the pluggable LineOfSight, ear to noise) is in between. Perceived level = 1 - distance / radius
// (1 at the source, 0 at the edge). A guard never hears noises whose source is itself.
//
// Alert (0..1) is separate from the sight suspicion meter: a noise says "something is there", not
// "the player is there", so it must not make the guard chase blind. Each heard noise adds
// perceived × alertGain[kind]; one noise at or above `loudLevel` alarms at once and stays alarmed for
// `alarmHold` s (so a throttled replan still sees it); the meter decays.
// The domain reads it as a symbol (alert calm|wary|alarmed) like it reads detection as target_visible.
import type { LineOfSight } from './perception'
import type { NoiseEvent, NoiseKind } from './noise'
import { distance, Vec3 } from './vec'

export interface HearingConfig {
  earHeight: number // m above the feet, start of the muffling test
  noiseHeight: number // m above the noise position, end of the muffling test
  wallMuffle: number // audible radius multiplier through an occluder (1 = walls do not matter)
  loudLevel: number // perceived level at which a single noise alarms
  alarmedAt: number // alert at or above: 'alarmed'
  alarmHold: number // s a single loud noise keeps the alert alarmed (longer than the agent's replan throttle)
  alertDecayPerSecond: number
  alertGain: Readonly<Record<string, number>> // per kind; missing kinds use defaultAlertGain
  defaultAlertGain: number
}

export const DEFAULT_HEARING: HearingConfig = {
  earHeight: 1.6,
  noiseHeight: 0.3,
  wallMuffle: 0.5,
  loudLevel: 0.5,
  alarmedAt: 0.6,
  alarmHold: 1,
  alertDecayPerSecond: 0.08,
  // Footsteps come every half second, so each counts less than a one-off bang.
  alertGain: { steps: 0.5, run: 0.5, land: 1, impact: 1, bell: 0.7, voice: 1, test: 1 },
  defaultAlertGain: 1
}

export type AlertLevel = 'calm' | 'wary' | 'alarmed'

export interface HeardNoise {
  kind: NoiseKind
  position: Vec3
  loudness: number // m, emitted radius
  perceived: number // 0..1 at this guard
  distance: number
  muffled: boolean
  source: string
}

export interface HearingResult {
  heard: HeardNoise[] // heard this update, oldest first
  loudest: HeardNoise | null // highest perceived level this update
  latest: HeardNoise | null // last heard this update
  alert: number
  level: AlertLevel
}

/** Perceived level (0..1) of a noise of radius `loudness` at `dist`, or 0 when out of earshot. */
export function perceivedLevel(dist: number, loudness: number): number {
  if (loudness <= 0 || dist > loudness) return 0
  return Math.max(1e-3, 1 - dist / loudness) // at the very edge it is still heard, barely
}

export class Hearing {
  alert = 0

  constructor(public cfg: HearingConfig = DEFAULT_HEARING) {}

  get level(): AlertLevel {
    if (this.alert >= this.cfg.alarmedAt - 1e-9) return 'alarmed'
    return this.alert > 1e-6 ? 'wary' : 'calm'
  }

  /** Can this listener hear the noise, and how loud? Null when not heard. */
  hear(observerId: string, feet: Vec3, noise: NoiseEvent, los: LineOfSight, now: number): HeardNoise | null {
    if (noise.source === observerId) return null
    const cfg = this.cfg
    const dist = distance(feet, noise.position)
    if (dist > noise.loudness) return null
    let radius = noise.loudness
    let muffled = false
    if (cfg.wallMuffle < 1) {
      const ear = { x: feet.x, y: feet.y + cfg.earHeight, z: feet.z }
      const at = { x: noise.position.x, y: noise.position.y + cfg.noiseHeight, z: noise.position.z }
      // A separate observer key, so a raycast line of sight keeps the guard's sight ray apart.
      if (!los.check(observerId + '#ear', ear, at, now)) {
        muffled = true
        radius *= cfg.wallMuffle
      }
    }
    const perceived = perceivedLevel(dist, radius)
    if (perceived <= 0) return null
    return { kind: noise.kind, position: noise.position, loudness: noise.loudness, perceived, distance: dist, muffled, source: noise.source }
  }

  update(dt: number, now: number, observerId: string, feet: Vec3, noises: readonly NoiseEvent[], los: LineOfSight): HearingResult {
    const cfg = this.cfg
    this.alert = Math.max(0, this.alert - dt * cfg.alertDecayPerSecond)
    const heard: HeardNoise[] = []
    let loudest: HeardNoise | null = null
    for (const noise of noises) {
      const h = this.hear(observerId, feet, noise, los, now)
      if (!h) continue
      heard.push(h)
      if (!loudest || h.perceived > loudest.perceived) loudest = h
      const gain = cfg.alertGain[h.kind] ?? cfg.defaultAlertGain
      this.alert = Math.min(1, this.alert + h.perceived * gain)
      if (h.perceived >= cfg.loudLevel) this.alert = Math.min(1, Math.max(this.alert, cfg.alarmedAt + cfg.alarmHold * cfg.alertDecayPerSecond))
    }
    return { heard, loudest, latest: heard.length > 0 ? heard[heard.length - 1] : null, alert: this.alert, level: this.level }
  }

  reset(): void {
    this.alert = 0
  }
}
