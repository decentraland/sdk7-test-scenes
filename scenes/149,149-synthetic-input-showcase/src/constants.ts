import { Vector3 } from '@dcl/sdk/math'

/**
 * This scene's base parcel is 149,149. Decentraland world-space coordinates (the coordinate
 * system the MCP synthetic-input tools use for player/camera position and world x/y/z aim
 * points) are parcel-index * 16 + the scene-local offset. Every entity in this scene is
 * authored at scene-local coordinates (0..32 on both axes, since this is a 2x2 scene); use
 * `toWorld()` to convert a local position to the world position an MCP tool call expects.
 */
export const WORLD_OFFSET = Vector3.create(149 * 16, 0, 149 * 16) // (2384, 0, 2384)

export function toWorld(local: Vector3): Vector3 {
  return Vector3.create(local.x + WORLD_OFFSET.x, local.y + WORLD_OFFSET.y, local.z + WORLD_OFFSET.z)
}

export function fmtWorld(local: Vector3): string {
  const w = toWorld(local)
  return `(${w.x.toFixed(2)}, ${w.y.toFixed(2)}, ${w.z.toFixed(2)})`
}

// ---------------------------------------------------------------------------------------
// Global / hub
// ---------------------------------------------------------------------------------------
export const SPAWN_CENTER = Vector3.create(4, 0, 1.5)
export const SPAWN_CAMERA_TARGET = Vector3.create(4, 1, 10)
export const HUB_STAND = Vector3.create(16, 0, 16)
export const RESET_BUTTON = Vector3.create(19, 1, 16)

// ---------------------------------------------------------------------------------------
// S1 -- Locomotion lane (west corridor, x centerline 4, width x:2..6)
// ---------------------------------------------------------------------------------------
export const S1_SIGN = Vector3.create(4, 3, 1)
export const S1_MARKERS = [
  { meters: 0, pos: Vector3.create(4, 0.05, 1) },
  { meters: 4, pos: Vector3.create(4, 0.05, 5) },
  { meters: 8, pos: Vector3.create(4, 0.05, 9) },
  { meters: 12, pos: Vector3.create(4, 0.05, 13) },
  { meters: 16, pos: Vector3.create(4, 0.05, 17) }
]
export const S1_WALL = Vector3.create(4, 1.5, 18.5)
// At the far end of the lane, facing back down it: the readout used to sit at z=1, directly above the spawn
// point — i.e. behind the camera for anyone looking north down the lane, which is every viewpoint the station
// is exercised from. Here it is in frame for the whole walk and next to the wall the walk collides with.
export const S1_READOUT = Vector3.create(4, 3.6, 17.5)

// ---------------------------------------------------------------------------------------
// S2 -- Jump / vertical (same west corridor, continues north)
// ---------------------------------------------------------------------------------------
export const S2_SIGN = Vector3.create(4, 3, 20)
export const S2_READOUT = Vector3.create(4, 3.6, 20)
export const S2_PLATFORM = Vector3.create(4, 0.6, 25) // box, scale (4,1.2,4) -> top surface y=1.2
export const S2_PLATFORM_SCALE = Vector3.create(4, 1.2, 4)
export const S2_PLATE = Vector3.create(4, 1.25, 25) // trigger + visual plate on top of the platform
export const S2_GROUND_JUMP_MARK = Vector3.create(4, 0.05, 29)

// ---------------------------------------------------------------------------------------
// S3 -- Freeze zone / InputModifier (lane x centerline 11, width x:9..13)
// ---------------------------------------------------------------------------------------
export const S3_SIGN = Vector3.create(11, 3, 17)
export const S3_ZONE_A = Vector3.create(11, 0.05, 20) // full freeze
export const S3_ZONE_A_SCALE = Vector3.create(4, 0.1, 4)
// Run-only disabled. A 4m-deep zone is unmeasurable: a run burst crosses it in ~0.25s, entirely inside the
// acceleration ramp, so an in-zone burst and a control burst outside read the same. The zone is a 9m corridor
// (local z 23..32) so a ~1s run burst stays inside long enough to reach its steady speed.
export const S3_ZONE_B = Vector3.create(11, 0.05, 27.5)
export const S3_ZONE_B_SCALE = Vector3.create(4, 0.1, 9)
export const S3_ZONE_B_ENTRY_MARK = Vector3.create(11, 0.05, 23.5) // stand here, then run north
export const S3_READOUT = Vector3.create(11, 3, 23)

// ---------------------------------------------------------------------------------------
// S4 -- Click targets (SE quadrant). The occlusion column (x=17) is kept clear of every
// other S4 entity between z=2 and z=10 so the occluder is the ONLY thing blocking that
// sightline -- front-row buttons live on their own columns (x=18, 20.5, 23, 25.5, 28).
// ---------------------------------------------------------------------------------------
export const S4_SIGN = Vector3.create(24, 3, 1)
export const S4_BTN_DOWNUP = Vector3.create(18, 1, 3)
export const S4_BTN_CHARGE = Vector3.create(20.5, 1, 3)
export const S4_BTN_SHORT = Vector3.create(23, 1, 3) // maxDistance: 3
export const S4_BTN_LONG = Vector3.create(25.5, 1, 3) // maxDistance: 16
export const S4_FAR_MARK = Vector3.create(24.25, 0, 15) // ~12m from both short/long targets
export const S4_BTN_SECONDARY = Vector3.create(28, 1, 3)

export const S4_BLOCKED_MARK = Vector3.create(17, 0, 2)
export const S4_OCCLUDER = Vector3.create(17, 1, 6) // sits between S4_BLOCKED_MARK and S4_BTN_OCCLUDED
export const S4_BTN_OCCLUDED = Vector3.create(17, 1, 10)
export const S4_CLEAR_MARK = Vector3.create(20.5, 0, 10) // side approach, out of the occluder's line

export const S4_OFFSET_PIVOT = Vector3.create(26, 1, 13) // no collider -- the "naive" aim point
export const S4_OFFSET_LOCAL = Vector3.create(1.2, 0.3, -0.6) // child collider offset from the pivot
export const S4_BIG_TARGET = Vector3.create(30, 1.5, 13)
export const S4_BIG_STAND_MARK = Vector3.create(30, 0, 9)

export const S4_READOUT = Vector3.create(24, 3.6, 15.5)

// ---------------------------------------------------------------------------------------
// S5 -- Hover (NE quadrant, south strip)
// ---------------------------------------------------------------------------------------
export const S5_SIGN = Vector3.create(24, 3, 17)
export const S5_HOVER_A = Vector3.create(20, 1, 19) // short hover text
export const S5_HOVER_B = Vector3.create(24, 1, 19) // long hover text
export const S5_HOVER_C = Vector3.create(28, 1, 19) // maxDistance: 2 (distance-gated)
export const S5_HOVER_C_NEAR_MARK = Vector3.create(28, 0, 17.5)
export const S5_HOVER_C_FAR_MARK = Vector3.create(28, 0, 24)
export const S5_READOUT = Vector3.create(24, 3.6, 21)

// ---------------------------------------------------------------------------------------
// S6 -- Global input board (NE quadrant, north strip)
// ---------------------------------------------------------------------------------------
export const S6_SIGN = Vector3.create(24, 3, 25)
export const S6_BOARD = Vector3.create(24, 3.4, 27)
export const S6_SUPPRESSION_TARGET = Vector3.create(20, 1, 29)

// ---------------------------------------------------------------------------------------
// S7 -- Camera look (hub, elevated markers -- no colliders, safe to overlap other stations)
// ---------------------------------------------------------------------------------------
export const S7_STAND = Vector3.create(16, 0, 16)
export const S7_READOUT = Vector3.create(16, 3.6, 16.01)
export const S7_MARKER_LEFT = Vector3.create(4, 6, 16)
export const S7_MARKER_RIGHT = Vector3.create(28, 6, 16)
export const S7_MARKER_UP = Vector3.create(16, 20, 16)
export const S7_MARKER_DOWN = Vector3.create(16, 0.3, 4)
export const S7_ANGLE_TOLERANCE_DEG = 8

// ---------------------------------------------------------------------------------------
// S8 -- Scene UI toggle (hub)
// ---------------------------------------------------------------------------------------
export const S8_TOGGLE_BUTTON = Vector3.create(13, 1, 16)

// ---------------------------------------------------------------------------------------
// S9 -- UI text entry (<Input />). The world button toggles a second React panel, anchored
// to the LEFT of the screen so it never overlaps S8's centered panel -- two panels open at
// once must not occlude each other, or `ui_click`'s occlusion pre-check reports a cover that
// is really just the other station.
// ---------------------------------------------------------------------------------------
export const S9_TOGGLE_BUTTON = Vector3.create(10, 1, 16)
export const S9_SIGN = Vector3.create(10, 4.6, 16) // above S8's sign line -- both are wide billboards on the same hub row

// ---------------------------------------------------------------------------------------
// S10 -- Paint surface (SW-central free block, x 8..16, z 4..12). Two canvases side by side:
// the STAMP canvas is driven by discrete clicks (one dot per `click_entity`/`click_at`), the
// STROKE canvas by a held pointer dragged across it (`ui_drag` starting over the canvas).
// The DECOY strip under the stroke canvas is a collidable, NON-paintable surface: a drag that
// runs off the bottom of the canvas onto it must stop leaving dots.
// ---------------------------------------------------------------------------------------
export const S10_SIGN = Vector3.create(12, 6.6, 9)
export const S10_READOUT = Vector3.create(12, 5, 9)
export const S10_STAND = Vector3.create(12, 0, 5.5)
export const S10_STAMP_CANVAS = Vector3.create(10, 2.1, 9)
export const S10_STAMP_CANVAS_SCALE = Vector3.create(3.6, 2.6, 0.2)
export const S10_STROKE_CANVAS = Vector3.create(14, 2.2, 9)
export const S10_STROKE_CANVAS_SCALE = Vector3.create(3.6, 2.4, 0.2)
export const S10_DECOY = Vector3.create(14, 0.6, 9) // directly below the stroke canvas, y 0.2..1.0
export const S10_DECOY_SCALE = Vector3.create(3.6, 0.8, 0.2)
export const S10_CLEAR_BUTTON = Vector3.create(8, 1, 6)

/**
 * A DCL sphere primitive is 804 triangles (24x16 UV sphere, `SphereFactory` in the client), and a
 * 2x2 scene's whole triangle budget is 40,000. The rest of this scene spends ~2,000, so the paint
 * pool is capped at 40 dots -- enough for a legible stroke, and it recycles oldest-first rather
 * than growing without bound.
 */
export const S10_DOT_POOL_MAX = 40
export const S10_DOT_SCALE = 0.14

export const SIGN_COLOR = { r: 1, g: 1, b: 1, a: 1 }
