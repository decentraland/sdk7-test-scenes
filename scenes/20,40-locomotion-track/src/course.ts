import {
  Billboard,
  BillboardMode,
  engine,
  Material,
  MeshCollider,
  MeshRenderer,
  TextShape,
  Transform
} from '@dcl/sdk/ecs'
import { Color3, Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import {
  COURSE_FRONT_X,
  LEDGE_DEPTH,
  LEDGE_WIDTH,
  LEDGES,
  PLATEAU_DEPTH,
  SIDE_MIN_X,
  SLOPE_ANGLES,
  SLOPE_CREST_X,
  SLOPE_RISE,
  SLOPE_WIDTH,
  SLOPES_PITCH,
  SLOPES_Z_MIN,
  STAIR_RISERS,
  STAIR_STEPS,
  STAIR_TOP_DEPTH,
  STAIR_TREAD,
  STAIR_WIDTH,
  STAIRS_PITCH,
  STAIRS_Z_MIN,
  WALL
} from './layout'
import { flatLabel } from './track'

// Colours compare each step and slope with Unity Explorer's defaults (CharacterControllerSettings StepOffset 0.35 m,
// CharacterController slopeLimit 46 degrees): green below, yellow equal, red above.
const UNITY_STEP_OFFSET = 0.35
const UNITY_SLOPE_LIMIT = 46
const BELOW = Color4.create(0.3, 0.7, 0.35, 1)
const EQUAL = Color4.create(0.95, 0.8, 0.2, 1)
const ABOVE = Color4.create(0.85, 0.3, 0.25, 1)
const LEDGE_COLOR = Color4.create(0.45, 0.55, 0.7, 1)
const EDGE_COLOR = Color4.Yellow()

// Ground labels sit 1 m east of the track edge, upright for a player walking east.
const LABEL_X = SIDE_MIN_X + 1

function compare(value: number, limit: number): Color4 {
  if (value < limit) return BELOW
  return value === limit ? EQUAL : ABOVE
}

function shade(color: Color4, factor: number): Color4 {
  return Color4.create(color.r * factor, color.g * factor, color.b * factor, 1)
}

/** A solid box with a collider; `rotation` defaults to none. */
function block(center: Vector3, size: Vector3, color: Color4, rotation = Quaternion.Identity()) {
  const e = engine.addEntity()
  Transform.create(e, { position: center, rotation, scale: size })
  MeshRenderer.setBox(e)
  MeshCollider.setBox(e)
  Material.setPbrMaterial(e, { albedoColor: color, roughness: 1, metallic: 0 })
}

/** A box spanning x0..x1, y0..y1, z0..z1. */
function boxBetween(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, color: Color4) {
  block(Vector3.create((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), Vector3.create(x1 - x0, y1 - y0, z1 - z0), color)
}

/** A thin painted strip on a horizontal surface (no collider). */
function paint(x0: number, x1: number, y: number, z0: number, z1: number, color: Color4) {
  const e = engine.addEntity()
  Transform.create(e, {
    position: Vector3.create((x0 + x1) / 2, y + 0.01, (z0 + z1) / 2),
    rotation: Quaternion.fromEulerDegrees(90, 0, 0),
    scale: Vector3.create(x1 - x0, z1 - z0, 1)
  })
  MeshRenderer.setPlane(e)
  Material.setBasicMaterial(e, { diffuseColor: color })
}

function title(x: number, y: number, z: number, text: string) {
  const e = engine.addEntity()
  Transform.create(e, { position: Vector3.create(x, y, z) })
  TextShape.create(e, {
    text,
    fontSize: 16,
    textColor: Color4.White(),
    outlineWidth: 0.1,
    outlineColor: Color3.Black()
  })
  Billboard.create(e, { billboardMode: BillboardMode.BM_Y })
}

/** Platforms with a vertical west edge at COURSE_FRONT_X; walking west off them lands on the open track. */
function createLedges() {
  for (const { height, zMin } of LEDGES) {
    const zMax = zMin + LEDGE_WIDTH
    boxBetween(COURSE_FRONT_X, COURSE_FRONT_X + LEDGE_DEPTH, 0, height, zMin, zMax, LEDGE_COLOR)
    // Edge line on the top and a line 1 m back, where the ledge-<height> spawn point stands.
    paint(COURSE_FRONT_X, COURSE_FRONT_X + 0.1, height, zMin, zMax, EDGE_COLOR)
    paint(COURSE_FRONT_X + 0.98, COURSE_FRONT_X + 1.02, height, zMin, zMax, Color4.White())
    flatLabel(LABEL_X, zMin + LEDGE_WIDTH / 2, `ledge\n${height} m`, 5, Color4.White(), 90)
  }
  title(COURSE_FRONT_X + 5, 12, (LEDGES[0].zMin + LEDGES[LEDGES.length - 1].zMin + LEDGE_WIDTH) / 2, 'LEDGES')
}

/** Staircases rising east from COURSE_FRONT_X, one per riser height. */
function createStairs() {
  STAIR_RISERS.forEach((riser, i) => {
    const zMin = STAIRS_Z_MIN + i * STAIRS_PITCH
    const zMax = zMin + STAIR_WIDTH
    const color = compare(riser, UNITY_STEP_OFFSET)
    for (let s = 0; s < STAIR_STEPS; s++) {
      const x0 = COURSE_FRONT_X + s * STAIR_TREAD
      const x1 = s === STAIR_STEPS - 1 ? x0 + STAIR_TOP_DEPTH : x0 + STAIR_TREAD
      boxBetween(x0, x1, 0, (s + 1) * riser, zMin, zMax, shade(color, s % 2 === 0 ? 1 : 0.8))
    }
    flatLabel(LABEL_X, zMin + STAIR_WIDTH / 2, `step\n${riser} m`, 5, Color4.White(), 90)
  })
  const zMid = STAIRS_Z_MIN + ((STAIR_RISERS.length - 1) * STAIRS_PITCH + STAIR_WIDTH) / 2
  title(COURSE_FRONT_X + 3, 6, zMid, 'STAIRS')
}

/**
 * Ramps rising east to a plateau SLOPE_RISE high. Each ramp is a box turned about z so its top face runs from 0.2 m
 * below the ground to the plateau edge; it is thick enough to reach the ground under its whole top face, so the side
 * view is a solid wedge.
 */
function createSlopes() {
  const zMax = SLOPES_Z_MIN + (SLOPE_ANGLES.length - 1) * SLOPES_PITCH + SLOPE_WIDTH
  boxBetween(SLOPE_CREST_X, SLOPE_CREST_X + PLATEAU_DEPTH, 0, SLOPE_RISE, SLOPES_Z_MIN, zMax, LEDGE_COLOR)

  SLOPE_ANGLES.forEach((angle, i) => {
    const rad = (angle * Math.PI) / 180
    const sin = Math.sin(rad)
    const cos = Math.cos(rad)
    const below = 0.2
    const length = (SLOPE_RISE + below) / sin
    const thickness = SLOPE_RISE * cos + 0.3
    const bottomX = SLOPE_CREST_X - (SLOPE_RISE + below) / Math.tan(rad)
    const zMid = SLOPES_Z_MIN + i * SLOPES_PITCH + SLOPE_WIDTH / 2
    // Middle of the top face, moved half the thickness along the inward normal (sin, -cos).
    const topMidX = (bottomX + SLOPE_CREST_X) / 2
    const topMidY = (SLOPE_RISE - below) / 2
    const center = Vector3.create(topMidX + (sin * thickness) / 2, topMidY - (cos * thickness) / 2, zMid)
    block(
      center,
      Vector3.create(length, thickness, SLOPE_WIDTH),
      compare(angle, UNITY_SLOPE_LIMIT),
      Quaternion.fromEulerDegrees(0, 0, angle)
    )
    flatLabel(LABEL_X, zMid, `${angle}°`, 6, Color4.White(), 90)
  })
  title(SLOPE_CREST_X + PLATEAU_DEPTH / 2, SLOPE_RISE + 4, (SLOPES_Z_MIN + zMax) / 2, 'SLOPES')
}

function createWall() {
  boxBetween(WALL.x, WALL.x + WALL.thickness, 0, WALL.height, WALL.zMin, WALL.zMax, Color4.create(0.85, 0.45, 0.2, 1))
  title(WALL.x - 6, WALL.height + 2, (WALL.zMin + WALL.zMax) / 2, 'WALL')
}

/** Geometry course east of the track (parcels 28..29 x 40..47). Nothing here is on the open track. */
export function createCourse() {
  createLedges()
  createStairs()
  createSlopes()
  createWall()
}
