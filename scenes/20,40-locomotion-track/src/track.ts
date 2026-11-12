import {
  Billboard,
  BillboardMode,
  engine,
  Material,
  MeshCollider,
  MeshRenderer,
  TextShape,
  TextureWrapMode,
  Transform
} from '@dcl/sdk/ecs'
import { Color3, Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { BASE_PARCEL, GRID_TILE, PARCEL_SIZE, SIDE_MAX_X, SIDE_MIN_X, SPAWN, TRACK_SIZE } from './layout'

// Heights of the flat layers. Everything is visual only: the player walks on the explorer's own floor at y = 0.
// TextShape fontSize F is about F / 10 m tall.
const GROUND_Y = 0.01
const PARCEL_LINE_Y = 0.02
const AXIS_Y = 0.03
const LABEL_Y = 0.04

const FLAT = Quaternion.fromEulerDegrees(90, 0, 0)

/** A flat rectangle; `yawDeg` turns its text-up direction from north (0) towards east (90). */
function flatRotation(yawDeg: number): Quaternion {
  return Quaternion.multiply(Quaternion.fromEulerDegrees(0, yawDeg, 0), FLAT)
}

function strip(centerX: number, centerZ: number, sizeX: number, sizeZ: number, y: number, color: Color4) {
  const e = engine.addEntity()
  Transform.create(e, {
    position: Vector3.create(centerX, y, centerZ),
    rotation: FLAT,
    scale: Vector3.create(sizeX, sizeZ, 1)
  })
  MeshRenderer.setPlane(e)
  Material.setBasicMaterial(e, { diffuseColor: color })
}

function flatLabel(x: number, z: number, text: string, fontSize: number, color: Color4, yawDeg = 0) {
  const e = engine.addEntity()
  Transform.create(e, { position: Vector3.create(x, LABEL_Y, z), rotation: flatRotation(yawDeg) })
  TextShape.create(e, { text, fontSize, textColor: color })
}

/**
 * A textured ground plane centred on (centerX, centerZ). Its UVs are symmetric around the centre, so whatever corner
 * order an explorer uses, a grid line passes through the centre; centres are chosen a multiple of 10 m from the
 * spawn so every plane's grid lines up with the spawn.
 */
function groundPlane(centerX: number, centerZ: number, sizeX: number, sizeZ: number, tint: Color4) {
  const u = sizeX / GRID_TILE / 2
  const v = sizeZ / GRID_TILE / 2
  const face = [-u, -v, u, -v, u, v, -u, v]
  const e = engine.addEntity()
  Transform.create(e, {
    position: Vector3.create(centerX, GROUND_Y, centerZ),
    rotation: FLAT,
    scale: Vector3.create(sizeX, sizeZ, 1)
  })
  MeshRenderer.setPlane(e, [...face, ...face])
  Material.setPbrMaterial(e, {
    texture: Material.Texture.Common({ src: 'assets/grid-10m.png', wrapMode: TextureWrapMode.TWM_REPEAT }),
    albedoColor: tint,
    metallic: 0,
    roughness: 1,
    specularIntensity: 0
  })
}

export function createTrack() {
  // Ground: the open track and the side area, both gridded around the spawn.
  groundPlane(SPAWN.x, SPAWN.z, TRACK_SIZE, TRACK_SIZE, Color4.White())
  groundPlane(
    (SIDE_MIN_X + SIDE_MAX_X) / 2,
    SPAWN.z,
    SIDE_MAX_X - SIDE_MIN_X,
    TRACK_SIZE,
    Color4.create(1, 0.8, 0.6, 1)
  )

  // Parcel borders every 16 m.
  const parcelColor = Color4.create(0.2, 0.75, 1, 1)
  for (let x = 0; x <= SIDE_MAX_X; x += PARCEL_SIZE)
    strip(x, TRACK_SIZE / 2, 0.08, TRACK_SIZE, PARCEL_LINE_Y, parcelColor)
  for (let z = 0; z <= TRACK_SIZE; z += PARCEL_SIZE)
    strip(SIDE_MAX_X / 2, z, SIDE_MAX_X, 0.08, PARCEL_LINE_Y, parcelColor)

  // Axes through the spawn: north-south blue, east-west red; the track's east edge orange.
  strip(SPAWN.x, TRACK_SIZE / 2, 0.15, TRACK_SIZE, AXIS_Y, Color4.create(0.25, 0.45, 1, 1))
  strip(TRACK_SIZE / 2, SPAWN.z, TRACK_SIZE, 0.15, AXIS_Y, Color4.create(1, 0.3, 0.25, 1))
  strip(TRACK_SIZE, TRACK_SIZE / 2, 0.4, TRACK_SIZE, AXIS_Y, Color4.create(1, 0.55, 0, 1))
  strip(SPAWN.x, SPAWN.z, 0.5, 0.5, LABEL_Y, Color4.Yellow())

  // Parcel coordinates at each parcel centre, north up.
  for (let px = 0; px < SIDE_MAX_X / PARCEL_SIZE; px++) {
    for (let pz = 0; pz < TRACK_SIZE / PARCEL_SIZE; pz++) {
      const label = `${BASE_PARCEL.x + px},${BASE_PARCEL.y + pz}`
      flatLabel(px * PARCEL_SIZE + 8, pz * PARCEL_SIZE + 8, label, 6, Color4.create(0.6, 0.85, 1, 1))
    }
  }

  // Distance from the spawn every 10 m along each axis, upright for a player walking outwards.
  const directions = [
    { name: 'N', dx: 0, dz: 1, yaw: 0 },
    { name: 'E', dx: 1, dz: 0, yaw: 90 },
    { name: 'S', dx: 0, dz: -1, yaw: 180 },
    { name: 'W', dx: -1, dz: 0, yaw: 270 }
  ]
  for (const d of directions) {
    for (let m = 10; m <= 60; m += 10) {
      // 2.5 m to the walker's right of the axis line
      const x = SPAWN.x + d.dx * m + d.dz * 2.5
      const z = SPAWN.z + d.dz * m - d.dx * 2.5
      flatLabel(x, z, `${d.name} ${m} m`, 8, Color4.White(), d.yaw)
    }

    const marker = engine.addEntity()
    Transform.create(marker, { position: Vector3.create(SPAWN.x + d.dx * 61, 6, SPAWN.z + d.dz * 61) })
    TextShape.create(marker, {
      text: d.name,
      fontSize: 40,
      textColor: Color4.Yellow(),
      outlineWidth: 0.1,
      outlineColor: Color3.Black()
    })
    Billboard.create(marker, { billboardMode: BillboardMode.BM_Y })
  }

  flatLabel(SPAWN.x - 3, SPAWN.z - 1.5, 'SPAWN 24,44\n(64, 0, 64)', 5, Color4.Yellow())
}

/** Side area east of the track for later collision tests. Nothing here is on the open track. */
export function createSideArea() {
  const wall = engine.addEntity()
  Transform.create(wall, {
    position: Vector3.create(148, 1.5, SPAWN.z),
    scale: Vector3.create(0.5, 3, 48)
  })
  MeshRenderer.setBox(wall)
  MeshCollider.setBox(wall)
  Material.setPbrMaterial(wall, { albedoColor: Color4.create(0.85, 0.45, 0.2, 1), roughness: 1, metallic: 0 })

  const sign = engine.addEntity()
  Transform.create(sign, { position: Vector3.create(140, 4.5, SPAWN.z) })
  TextShape.create(sign, {
    text: 'Collision area\n(not part of the open track)',
    fontSize: 10,
    textColor: Color4.White(),
    outlineWidth: 0.1,
    outlineColor: Color3.Black()
  })
  Billboard.create(sign, { billboardMode: BillboardMode.BM_Y })
}
