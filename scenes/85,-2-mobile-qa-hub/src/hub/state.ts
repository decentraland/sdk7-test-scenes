import { Vector3 } from '@dcl/sdk/math'
import { movePlayerTo } from '~system/RestrictedActions'
import { subsceneEntries } from '../subscenes/scenes.gen'
import { HUB_CAMERA_TARGET, HUB_SPAWN, STAGE_SIZE, slotRect } from './layout'
import { buildHubProps, buildStageProps, buildWorld } from './props'
import { createTracker, type Tracker } from './tracking'
import type { SubsceneContext, SubsceneEntry } from './types'

export type HubSession = { mode: 'hub' } | { mode: 'subscene'; entry: SubsceneEntry; tracker: Tracker }

const worldTracker = createTracker('world')
let sessionTracker: Tracker | null = null
let state: HubSession = { mode: 'hub' }

export function entries(): SubsceneEntry[] {
  return subsceneEntries
}

export function currentSession(): HubSession {
  return state
}

export function activeEntry(): SubsceneEntry | null {
  return state.mode === 'subscene' ? state.entry : null
}

function teleport(origin: Vector3, cameraTarget: Vector3): void {
  movePlayerTo({
    newRelativePosition: { x: origin.x, y: origin.y, z: origin.z },
    cameraTarget: { x: cameraTarget.x, y: cameraTarget.y, z: cameraTarget.z }
  }).catch((error) => console.error('[qa-hub] movePlayerTo failed', error))
}

/** Boots the scene: static world plus the hub props and the spawn teleport. */
export function startHub(): void {
  if (worldTracker.entities().length === 0) buildWorld(worldTracker)
  backToHub()
}

/** Leaves the current subscene (if any) and shows the hub again. */
export function backToHub(): void {
  if (state.mode === 'subscene') {
    try {
      state.entry.module.unmount?.()
    } catch (error) {
      console.error(`[qa-hub] ${state.entry.slug} unmount() threw`, error)
    }
    state.tracker.clean()
    sessionTracker = null
    state = { mode: 'hub' }
  }

  const tracker = createTracker('hub')
  sessionTracker = tracker
  buildHubProps(tracker, subsceneEntries)
  teleport(HUB_SPAWN, HUB_CAMERA_TARGET)
  console.log('[qa-hub] hub ready')
}

/** Mounts one subscene, after wiping whatever the previous one left behind. */
export function openSubscene(slug: string): void {
  const entry = subsceneEntries.find((item) => item.slug === slug)
  if (entry === undefined) {
    console.error(`[qa-hub] unknown subscene "${slug}"`)
    return
  }
  if (state.mode === 'subscene' && state.entry.slug === slug) return

  // 1. leave the previous subscene: explicit cleanup + tracked entities/systems
  if (state.mode === 'subscene') {
    try {
      state.entry.module.unmount?.()
    } catch (error) {
      console.error(`[qa-hub] ${state.entry.slug} unmount() threw`, error)
    }
    state.tracker.clean()
  }
  sessionTracker?.clean()
  sessionTracker = null

  // 2. new stage
  const tracker = createTracker(entry.slug)
  sessionTracker = tracker
  state = { mode: 'subscene', entry, tracker }
  buildStageProps(tracker, entry)

  const rect = slotRect(entry.meta.slot)
  const origin = Vector3.create(rect.center.x, 0, rect.center.z)
  const ctx: SubsceneContext = {
    slug: entry.slug,
    issue: entry.meta.issue,
    origin,
    stageSize: STAGE_SIZE,
    addEntity: () => tracker.add(),
    track: (entity) => tracker.track(entity),
    addSystem: (system, priority, name) => tracker.addSystem(system, priority, name),
    log: (...args) => console.log(`[${entry.slug}]`, ...args)
  }

  try {
    entry.module.mount(ctx)
  } catch (error) {
    console.error(`[qa-hub] ${entry.slug} mount() threw`, error)
  }

  teleport(Vector3.create(origin.x, 0.2, origin.z - STAGE_SIZE / 2 + 2.5), Vector3.create(origin.x, 1.4, origin.z + 2))
  console.log(`[qa-hub] mounted ${entry.slug} (${entry.meta.issue}) on slot ${entry.meta.slot}`)
}
