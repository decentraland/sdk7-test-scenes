// The simulation clock: one dt per frame for every system that ticks planners, agents and levels, so pausing,
// stepping and slowing the simulation is one switch instead of a patch per host (upstream HTNDemo's NPC Simulation
// panel: Pause / Resume and a time scale, HTNNPCSimulationPanel.cpp:73-86, :242-267).
// - Running: the engine's dt, clamped to `maxFrame` (a frame hitch is not a teleport), times `scale`.
// - Paused: 0; hosts do not run at all (`each` calls nothing), so nothing senses, plans or moves.
// - Step: pauses and lets exactly one frame of `stepSeconds` through, whatever the scale.
// A host runs a long frame (a scale above 1) in equal pieces of at most its own step (`each`, `splitSteps`), so
// time scale 4 is four ordinary steps, not one big one. Planning time stays wall-clock (PlanningMetrics); only the
// simulated seconds (agent time, timers, movement) follow this clock. Pure: the scene's instance and the system that
// advances it are in clock-scene.ts.

/** The scales the debugger offers; setScale clamps to their range. */
export const TIME_SCALES = [0.1, 0.25, 0.5, 1, 2, 4] as const

/** The most pieces `splitSteps` cuts a frame into: a long stall does not run the hosts a hundred times. */
export const MAX_SUBSTEPS = 16

export interface SimClockOptions {
  /** s, the longest engine frame taken as it is (default 0.1, the hosts' old hitch clamp). */
  maxFrame?: number
  /** s, one frame of a step (default 1/30). */
  stepSeconds?: number
}

/** `dt` in equal pieces of at most `maxStep` (at most MAX_SUBSTEPS pieces); [] for no time. */
export function splitSteps(dt: number, maxStep: number): number[] {
  if (!(dt > 0)) return []
  const n = Math.min(MAX_SUBSTEPS, Math.max(1, Math.ceil(dt / maxStep - 1e-9)))
  return new Array<number>(n).fill(dt / n)
}

export class SimClock {
  readonly maxFrame: number
  readonly stepSeconds: number
  paused = false
  scale = 1
  /** Simulated seconds so far. */
  time = 0
  /** Frames that moved the simulation (a paused frame does not count). */
  frames = 0
  /** This frame's simulated seconds (set by `advance`). */
  dt = 0
  private pendingSteps = 0

  constructor(opts: SimClockOptions = {}) {
    this.maxFrame = opts.maxFrame ?? 0.1
    this.stepSeconds = opts.stepSeconds ?? 1 / 30
  }

  /** Once per engine frame, before anything reads `dt`: this frame's simulated seconds. */
  advance(engineDt: number): number {
    let dt: number
    if (this.pendingSteps > 0) {
      this.pendingSteps--
      dt = this.stepSeconds
    } else if (this.paused) dt = 0
    else dt = Math.min(Math.max(0, engineDt), this.maxFrame) * this.scale
    this.dt = dt
    if (dt > 0) {
      this.time += dt
      this.frames++
    }
    return dt
  }

  /** Run `host` over this frame's dt in pieces of at most `maxStep`; nothing while paused. */
  each(maxStep: number, host: (dt: number) => void): void {
    for (const dt of splitSteps(this.dt, maxStep)) host(dt)
  }

  pause(): void {
    this.paused = true
  }

  resume(): void {
    this.paused = false
    this.pendingSteps = 0
  }

  toggle(): void {
    if (this.paused) this.resume()
    else this.pause()
  }

  /** Pause, and let `n` frames of `stepSeconds` through (one per engine frame). */
  step(n = 1): void {
    this.paused = true
    this.pendingSteps += n
  }

  setScale(scale: number): void {
    this.scale = Math.min(TIME_SCALES[TIME_SCALES.length - 1], Math.max(TIME_SCALES[0], scale))
  }

  /** "sim 12.3 s · ×0.25 · paused" */
  label(): string {
    return `sim ${this.time.toFixed(1)} s · ×${this.scale}${this.paused ? ' · paused' : ''}`
  }
}
