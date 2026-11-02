import type { Entity, SystemFn } from '@dcl/sdk/ecs'
import type { Vector3 } from '@dcl/sdk/math'

/** Status shown next to a subscene in the hub list. */
export type SubsceneStatus = 'pending' | 'in-review' | 'done'

/**
 * Metadata of a subscene. It lives in `src/subscenes/<slug>/subscene.json`
 * (data only, so `scripts/gen-subscenes.mjs` can read it without executing
 * scene code). `slot` and `page` are added by the generator.
 */
export type SubsceneMeta = {
  /** Human readable name, shown in the hub list. */
  title: string
  /** `#3062` (a leading `#` is optional in the JSON, it is normalized). */
  issue: string
  /** `#3096` when the subscene covers a PR on top of the issue. */
  pr?: string
  /** Who registered it, e.g. `sprint28-nametag-2811`. */
  owner: string
  /** Defaults to `pending`. */
  status: SubsceneStatus
  /** Optional one line note shown under the title inside the active subscene. */
  note?: string
  /** Stage slot 0..STAGE_COUNT-1. Optional: the generator assigns the first free one. */
  slot: number
  /** Page the slot belongs to (only relevant for > STAGE_COUNT subscenes). */
  page: number
}

/** Everything a subscene gets when it is mounted. */
export type SubsceneContext = {
  /** Folder name, e.g. `skybox-control-3096`. */
  slug: string
  issue: string
  /** Center of the assigned stage: build around this point, never at the world origin. */
  origin: Vector3
  /** Side of the square stage in meters (16). */
  stageSize: number
  /** Tracked entity: removed automatically when the subscene is unmounted. */
  addEntity: () => Entity
  /** Tracked entity: keep the entity you already created (e.g. one returned by a util). */
  track: (entity: Entity) => void
  /** Tracked system: removed automatically when the subscene is unmounted. */
  addSystem: (system: SystemFn, priority?: number, name?: string) => void
  /** Same as console.log but tagged with the subscene slug. */
  log: (...args: unknown[]) => void
}

/** The code side of a subscene: `src/subscenes/<slug>/index.ts`. */
export type SubsceneModule = {
  mount: (ctx: SubsceneContext) => void
  /** Optional: extra cleanup. The hub also removes everything tracked by `ctx`. */
  unmount?: () => void
}

/** A subscene as seen by the hub. */
export type SubsceneEntry = {
  slug: string
  meta: SubsceneMeta
  module: SubsceneModule
}
