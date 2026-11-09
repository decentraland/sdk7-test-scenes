// The simulation's random numbers: one seeded generator a host owns and hands down (a level's `rng`), never
// Math.random, so a run is the same on every machine and every time for the same seed (headless tests, `htn:level`).
// Upstream's demo does the same with std::mt19937 and a fixed seed (DemoWanderer.cpp:85-93, DemoGridTerrain.cpp:144).
// mulberry32: 32-bit state, fast, good enough for gameplay variety (not for anything secret). Pure, no SDK.

/** The seed a level starts with (the scene's, and `htn:level` without --seed). */
export const DEFAULT_SEED = 1

/** FNV-1a over the text: a fork's salt as a 32-bit number. */
function hash32(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export class Rng {
  /** The seed it started from, as a 32-bit unsigned number. */
  readonly seed: number
  private state: number

  constructor(seed: number = DEFAULT_SEED) {
    this.seed = Math.trunc(seed) >>> 0
    this.state = this.seed
  }

  /** A number in [0, 1). */
  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /** A whole number in [0, n); 0 for n <= 0. */
  int(n: number): number {
    return n > 0 ? Math.floor(this.next() * n) : 0
  }

  /** A number in [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.next()
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick: no items')
    return items[this.int(items.length)]
  }

  /**
   * An own stream for `label` (an NPC, a spawner): the same for the same seed and label, whatever this one has drawn
   * so far, so adding a draw in one place does not shift the numbers of another.
   */
  fork(label: string): Rng {
    return new Rng(hash32(`${this.seed}:${label}`))
  }
}
