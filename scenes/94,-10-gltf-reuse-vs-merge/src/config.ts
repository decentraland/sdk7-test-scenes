import { Color4, Vector3 } from '@dcl/sdk/math'

/**
 * Asset paths.
 *
 * `LAMPOST_SRC` is the only file you have to provide. The other three are
 * generated from it by `tools/make_variants.py` (see the scene README).
 */
export const LAMPOST_SRC = 'models/LampostSmall.glb'
export const PACKED_SRC = 'models/LampostRow_Separate.glb'
export const MERGED_SRC = 'models/LampostRow_Merged.glb'

/** 14 byte-different near-identical copies of `LAMPOST_SRC`. */
export function dupeSrc(copyIndex: number): string {
	const n = `${copyIndex + 1}`.padStart(2, '0')
	return `models/dupes/LampostSmall_${n}.glb`
}

/** How many copies each of the 14-copy stations spawns. */
export const COPIES = 14

/** How many copies the burst station spawns in a single frame. */
export const BURST_COPIES = 50

/**
 * Each station owns a 5m-wide strip so you can frame exactly one of them in
 * the Frame Debugger / on screen.
 */
export const STRIP_WIDTH = 5
export const STRIP_X0 = 1

/**
 * Grid used by the 14-copy stations: 2 columns x 7 rows, relative to the
 * strip origin. `tools/make_variants.py` bakes these same offsets into the
 * PACKED and MERGED models so all four stations look alike.
 */
export const COLUMN_OFFSETS = [1.2, 3.6]
export const ROW_OFFSETS = [6, 9.5, 13, 16.5, 20, 23.5, 27]

/**
 * PACKED / MERGED are single entities whose contents are already laid out in
 * the model, so they sit at the strip origin. Tweak these two if the exporter
 * you used mirrors or rotates the row relative to the SHARED strip — it is
 * cosmetic and changes none of the counts being measured.
 */
export const BAKED_ROW_OFFSET = Vector3.create(0, 0, 0)
export const BAKED_ROW_ROTATION_Y = 0

/** Position of copy `i` inside the strip of station `stationIndex`. */
export function slotPosition(stationIndex: number, i: number): Vector3 {
	const column = COLUMN_OFFSETS[i % COLUMN_OFFSETS.length]
	const row = ROW_OFFSETS[Math.floor(i / COLUMN_OFFSETS.length) % ROW_OFFSETS.length]
	return Vector3.create(stripOriginX(stationIndex) + column, 0, row)
}

/** Denser 5x10 grid, only used by the burst station. */
export function burstSlotPosition(stationIndex: number, i: number): Vector3 {
	const column = 0.5 + (i % 5)
	const row = 6 + Math.floor(i / 5) * 2.2
	return Vector3.create(stripOriginX(stationIndex) + column, 0, row)
}

export function stripOriginX(stationIndex: number): number {
	return STRIP_X0 + stationIndex * STRIP_WIDTH
}

export const PEDESTAL_Z = 3
export const UTILITY_Z = 0.8

export const COLORS = {
	baseline: Color4.create(0.6, 0.6, 0.6, 1),
	shared: Color4.create(0.15, 0.7, 0.4, 1),
	dupes: Color4.create(0.85, 0.25, 0.2, 1),
	packed: Color4.create(0.95, 0.6, 0.1, 1),
	merged: Color4.create(0.2, 0.45, 0.9, 1),
	burst: Color4.create(0.6, 0.3, 0.8, 1),
	utility: Color4.create(0.95, 0.95, 0.95, 1),
}
