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

/** Hearing queries use a separate LOS namespace from the same agent's sight queries. */
export function hearingObserverId(observerId: string): string { return observerId + '#ear' }

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
  /** Async LOS policy: bounded queries, oldest dropped on overflow; default 32. Positive integer. */
  maxPending?: number
  /** Listener-clock seconds to await an answer before dropping the event; default 1. Finite and positive. */
  pendingLifetime?: number
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
  defaultAlertGain: 1,
  maxPending: 32,
  pendingLifetime: 1
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
  /** Async only: listener time at the original sample, not at late completion. */
  observedAt?: number
  /** Async tie-breaker for events first observed on the same listener tick. */
  observedOrder?: number
}

export interface HearingResult {
  heard: HeardNoise[] // completed this update, in first-observation order within this batch
  loudest: HeardNoise | null // highest perceived level this update
  latest: HeardNoise | null // last originally observed among this update's completed events
  alert: number
  level: AlertLevel
}

/** Perceived level (0..1) of a noise of radius `loudness` at `dist`, or 0 when out of earshot. */
export function perceivedLevel(dist: number, loudness: number): number {
  if (loudness <= 0 || dist > loudness) return 0
  return Math.max(1e-3, 1 - dist / loudness) // at the very edge it is still heard, barely
}

interface PendingNoise {
  event: NoiseEvent
  sample: NoiseEvent
  observer: string
  target: string
  los: LineOfSight
  distance: number
  muffle: number
  since: number
  order: number
}

let nextQuery = 0 // Unique even when two Hearing instances share an LOS and observer namespace.

export class Hearing {
  alert = 0

  private pending: PendingNoise[] = []
  private nextObservation = 0
  // Weak keys retain no processed events; async replay must not allocate/deliver the same object twice.
  private readonly processed = new WeakMap<NoiseEvent, Set<string>>()

  constructor(public cfg: HearingConfig = DEFAULT_HEARING) { this.limits() }

  private limits(): { count: number; lifetime: number } {
    const count = this.cfg.maxPending ?? 32, lifetime = this.cfg.pendingLifetime ?? 1
    if (!Number.isSafeInteger(count) || count <= 0) throw new RangeError('Hearing maxPending must be a positive safe integer')
    if (!Number.isFinite(lifetime) || lifetime <= 0) throw new RangeError('Hearing pendingLifetime must be finite and positive')
    return { count, lifetime }
  }

  private drop(query: PendingNoise): void {
    this.pending = this.pending.filter(p => p !== query)
    let observers = this.processed.get(query.event)
    if (!observers) { observers = new Set(); this.processed.set(query.event, observers) }
    observers.add(query.observer)
    query.los.releaseTarget?.(hearingObserverId(query.observer), query.target)
  }

  private expire(now: number): void {
    if (this.pending.length === 0) return
    const { count, lifetime } = this.limits()
    for (const query of [...this.pending]) if (now - query.since >= lifetime) this.drop(query)
    while (this.pending.length > count) this.drop(this.pending[0])
  }

  /** Cancel pending events only; reload keeps already delivered alert/noise memory. */
  releasePending(): void { for (const query of [...this.pending]) this.drop(query) }

  private heard(noise: NoiseEvent, dist: number, muffled: boolean, muffle = this.cfg.wallMuffle, observedAt?: number, observedOrder?: number): HeardNoise | null {
    const perceived = perceivedLevel(dist, noise.loudness * (muffled ? muffle : 1))
    if (perceived <= 0) return null
    const result: HeardNoise = { kind: noise.kind, position: noise.position, loudness: noise.loudness, perceived, distance: dist, muffled, source: noise.source }
    if (observedAt !== undefined) { result.observedAt = observedAt; result.observedOrder = observedOrder }
    return result
  }

  get level(): AlertLevel {
    if (this.alert >= this.cfg.alarmedAt - 1e-9) return 'alarmed'
    return this.alert > 1e-6 ? 'wary' : 'calm'
  }

  /** Sync LOS answers immediately. Async LOS: retain this event object and poll hear(), or call update()
   * on later ticks (even with no new noises). A completed/dropped async event is delivered at most once. */
  hear(observerId: string, feet: Vec3, noise: NoiseEvent, los: LineOfSight, now: number): HeardNoise | null {
    this.expire(now)
    const pending = this.pending.find(p => p.event === noise && p.observer === observerId)
    if (pending) {
      if (pending.los !== los) { this.drop(pending); return null }
      const result = los.result?.(hearingObserverId(observerId), now, pending.target)
      if (result === undefined) return null
      this.drop(pending)
      return this.heard(pending.sample, pending.distance, !result, pending.muffle, pending.since, pending.order)
    }
    if (noise.source === observerId || (los.result && this.processed.get(noise)?.has(observerId))) return null
    const cfg = this.cfg
    const dist = distance(feet, noise.position)
    if (dist > noise.loudness) return null
    if (cfg.wallMuffle >= 1) return this.heard(noise, dist, false)
    const ear = { x: feet.x, y: feet.y + cfg.earHeight, z: feet.z }
    const at = { x: noise.position.x, y: noise.position.y + cfg.noiseHeight, z: noise.position.z }
    if (!los.result) return this.heard(noise, dist, !los.check(hearingObserverId(observerId), ear, at, now))
    const { count } = this.limits()
    while (this.pending.length >= count) this.drop(this.pending[0])
    const order = ++this.nextObservation
    const query: PendingNoise = { event: noise, sample: { ...noise, position: { ...noise.position } },
      observer: observerId, target: 'noise-' + ++nextQuery, los, distance: dist, muffle: cfg.wallMuffle, since: now, order }
    this.pending.push(query)
    los.check(hearingObserverId(observerId), ear, at, now, query.target)
    const result = los.result(hearingObserverId(observerId), now, query.target)
    if (result === undefined) return null
    this.drop(query)
    return this.heard(query.sample, dist, !result, query.muffle, now, query.order)
  }

  update(dt: number, now: number, observerId: string, feet: Vec3, noises: readonly NoiseEvent[], los: LineOfSight): HearingResult {
    const cfg = this.cfg
    this.expire(now)
    if (this.pending.length > 0) for (const query of [...this.pending]) if (query.observer === observerId && query.los !== los) this.drop(query)
    const candidates = los.result && (this.pending.length > 0 || noises.length > 0)
      ? new Set([...this.pending.filter(p => p.observer === observerId).map(p => p.event), ...noises])
      : noises
    this.alert = Math.max(0, this.alert - dt * cfg.alertDecayPerSecond)
    const heard: HeardNoise[] = []
    let loudest: HeardNoise | null = null
    for (const noise of candidates) {
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
    this.releasePending()
    this.alert = 0
  }
}
