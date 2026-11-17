import { Vector3 } from '@dcl/sdk/math'

// All positions are scene-relative metres: x grows east, z grows north, (0, 0) is the south-west corner of the
// base parcel 20,40.
export const BASE_PARCEL = { x: 20, y: 40 }
export const PARCEL_SIZE = 16

// Open track: parcels 20..27 x 40..47, no colliders. The spawn is its centre, 64 m from every edge.
export const TRACK_SIZE = 128
// Geometry course east of the track: parcels 28..29 x 40..47.
export const SIDE_MIN_X = TRACK_SIZE
export const SIDE_MAX_X = TRACK_SIZE + 2 * PARCEL_SIZE

// Must match the default spawn point in scene.json.
export const SPAWN = Vector3.create(64, 0, 64)

// The grid texture is one 10 m tile; the ground planes repeat it so a 10 m line runs through the spawn.
export const GRID_TILE = 10

// Every course feature starts 2 m east of the track edge and faces the track: the player walks east into stairs and
// slopes and walks west off the ledges, landing on the open track.
export const COURSE_FRONT_X = SIDE_MIN_X + 2

// Ledges: platforms 10 m deep (x 130..140) and 4 m wide with a vertical west face at x = 130. The named spawn point
// `ledge-<height>` in scene.json stands 1 m from that edge, facing west.
export const LEDGE_DEPTH = 10
export const LEDGE_WIDTH = 4
export const LEDGES = [
  { height: 0.5, zMin: 2 },
  { height: 1, zMin: 8 },
  { height: 2, zMin: 14 },
  { height: 3, zMin: 20 },
  { height: 4.7, zMin: 26 },
  { height: 10, zMin: 32 }
]

// Stairs: six steps with a 0.5 m tread rising east from x = 130, the top step 2 m deep; 3 m wide, 1 m apart.
export const STAIR_STEPS = 6
export const STAIR_TREAD = 0.5
export const STAIR_TOP_DEPTH = 2
export const STAIR_WIDTH = 3
export const STAIR_RISERS = [0.1, 0.2, 0.3, 0.35, 0.4, 0.5, 0.6]
export const STAIRS_Z_MIN = 40
export const STAIRS_PITCH = 4

// Slopes: ramps rising east to a shared plateau 3 m high at x 148..152; 2.4 m wide, 0.4 m apart. The bottom of a
// ramp is 3 / tan(angle) m west of the plateau.
export const SLOPE_RISE = 3
export const SLOPE_CREST_X = 148
export const PLATEAU_DEPTH = 4
export const SLOPE_WIDTH = 2.4
export const SLOPE_ANGLES = [10, 20, 30, 40, 45, 46, 47, 50, 60, 70, 80]
export const SLOPES_Z_MIN = 70
export const SLOPES_PITCH = 2.8

// Wall for collision tests: 24 m long along z, 3 m high, its west face 20 m east of the track edge.
export const WALL = { x: 150, zMin: 103, zMax: 127, height: 3, thickness: 0.5 }
