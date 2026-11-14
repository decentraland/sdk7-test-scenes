import { Vector3 } from '@dcl/sdk/math'

// All positions are scene-relative metres: x grows east, z grows north, (0, 0) is the south-west corner of the
// base parcel 20,40.
export const BASE_PARCEL = { x: 20, y: 40 }
export const PARCEL_SIZE = 16

// Open track: parcels 20..27 x 40..47, no colliders. The spawn is its centre, 64 m from every edge.
export const TRACK_SIZE = 128
// Collision area east of the track: parcels 28..29 x 40..47.
export const SIDE_MIN_X = TRACK_SIZE
export const SIDE_MAX_X = TRACK_SIZE + 2 * PARCEL_SIZE

// Must match the default spawn point in scene.json.
export const SPAWN = Vector3.create(64, 0, 64)

// The grid texture is one 10 m tile; the ground planes repeat it so a 10 m line runs through the spawn.
export const GRID_TILE = 10
