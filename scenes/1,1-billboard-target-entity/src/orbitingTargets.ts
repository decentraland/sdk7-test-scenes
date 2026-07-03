import { Entity, Transform } from '@dcl/sdk/ecs'
import { Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { createTargetMarker } from './markers'

export type Updatable = (dt: number) => void

/**
 * Station B target: a sphere that orbits a fixed center point. Used to prove that a billboard
 * with targetEntity set keeps tracking a moving entity, instead of the camera.
 */
export function createOrbitingSphere(center: Vector3, radius: number, angularSpeed: number, color: Color4): [Entity, Updatable] {
  const marker = createTargetMarker(Vector3.create(center.x + radius, center.y, center.z), color)
  let angle = 0

  const update: Updatable = (dt: number) => {
    angle += angularSpeed * dt
    Transform.getMutable(marker).position = Vector3.create(
      center.x + Math.cos(angle) * radius,
      center.y,
      center.z + Math.sin(angle) * radius
    )
  }

  return [marker, update]
}

/**
 * Station D target: orbits like the sphere above, but also continuously rolls around its own
 * forward axis. A billboard with billboardMode BM_ALL follows that roll (BM_Z included);
 * a billboard with billboardMode BM_Y only yaws to face it and ignores the roll.
 */
export function createSpinningOrbitTarget(
  center: Vector3,
  radius: number,
  angularSpeed: number,
  rollSpeedDegPerSecond: number,
  color: Color4
): [Entity, Updatable] {
  const marker = createTargetMarker(Vector3.create(center.x + radius, center.y, center.z), color)
  Transform.getMutable(marker).scale = Vector3.create(0.9, 0.9, 0.15)

  let angle = 0
  let rollDegrees = 0

  const update: Updatable = (dt: number) => {
    angle += angularSpeed * dt
    rollDegrees += rollSpeedDegPerSecond * dt

    const mutableTransform = Transform.getMutable(marker)
    mutableTransform.position = Vector3.create(
      center.x + Math.cos(angle) * radius,
      center.y,
      center.z + Math.sin(angle) * radius
    )
    mutableTransform.rotation = Quaternion.fromAngleAxis(rollDegrees, Vector3.Forward())
  }

  return [marker, update]
}
