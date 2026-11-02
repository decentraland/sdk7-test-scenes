import { Vector3 } from '@dcl/sdk/math'

/**
 * Layout of the scene.
 *
 * The scene is a 4x4 parcel square (64x64 meters) sliced into a 4x4 grid of
 * 16x16 meter stages, one per subscene. `slot` from `subscene.json` picks the
 * stage, so two subscenes that share a slot would land on the same coordinates
 * — the generator rejects that inside a page.
 *
 * Only ONE stage is ever populated: opening a subscene removes the hub props and
 * everything the previous subscene created, so nothing piles up and a test can
 * never bleed into another one. Slots exist so every subscene has a stable,
 * documented position (camera target, spawn, screenshots).
 */
export const SCENE_SIZE = 64
export const STAGE_SIZE = 16
export const GRID = SCENE_SIZE / STAGE_SIZE // 4 columns x 4 rows
export const STAGE_COUNT = GRID * GRID // 16 stages, i.e. 16 subscenes per page

/** Center of the hub dais: geometric center of the scene. */
export const HUB_ORIGIN = Vector3.create(SCENE_SIZE / 2, 0, SCENE_SIZE / 2)

/** Spawn point used when returning to the hub (matches scene.json spawnPoints). */
export const HUB_SPAWN = Vector3.create(SCENE_SIZE / 2, 0, SCENE_SIZE / 2 - 6)
export const HUB_CAMERA_TARGET = Vector3.create(SCENE_SIZE / 2, 1.6, SCENE_SIZE / 2 + 4)

export type SlotRect = {
  /** Stage index 0..STAGE_COUNT-1. */
  slot: number
  minX: number
  minZ: number
  maxX: number
  maxZ: number
  center: { x: number; y: number; z: number }
}

/** Bounds of a stage slot. Slot 0 is the south-west corner, slot 15 the north-east one. */
export function slotRect(slot: number): SlotRect {
  if (!Number.isInteger(slot) || slot < 0 || slot >= STAGE_COUNT) {
    throw new Error(`slot must be an integer in 0..${STAGE_COUNT - 1}, got ${slot}`)
  }
  const col = slot % GRID
  const row = Math.floor(slot / GRID)
  const minX = col * STAGE_SIZE
  const minZ = row * STAGE_SIZE
  return {
    slot,
    minX,
    minZ,
    maxX: minX + STAGE_SIZE,
    maxZ: minZ + STAGE_SIZE,
    center: { x: minX + STAGE_SIZE / 2, y: 0, z: minZ + STAGE_SIZE / 2 }
  }
}

/** Rects overlap (touching edges do not count). */
export function rectsOverlap(a: SlotRect, b: SlotRect): boolean {
  return a.minX < b.maxX && b.minX < a.maxX && a.minZ < b.maxZ && b.minZ < a.maxZ
}

/** Human readable slot label, e.g. `stage 6 · col 2 row 1`. */
export function slotLabel(slot: number): string {
  const col = (slot % GRID) + 1
  const row = Math.floor(slot / GRID) + 1
  return `stage ${slot} · col ${col} row ${row}`
}
