import { Vector3 } from '@dcl/sdk/math'

/**
 * Rotates a vector by a quaternion using the general formula:
 *   t = 2 * cross(q_xyz, v)
 *   v' = v + q.w * t + cross(q_xyz, t)
 *
 * Works for any rotation, any axis — not tied to a specific geometry.
 */
export function rotateVectorByQuaternion(
    v: Vector3,
    q: { x: number; y: number; z: number; w: number }
): Vector3 {
    // t = 2 * (q_xyz × v)
    const tx = 2 * (q.y * v.z - q.z * v.y)
    const ty = 2 * (q.z * v.x - q.x * v.z)
    const tz = 2 * (q.x * v.y - q.y * v.x)

    // v' = v + w * t + (q_xyz × t)
    return Vector3.create(
        v.x + q.w * tx + (q.y * tz - q.z * ty),
        v.y + q.w * ty + (q.z * tx - q.x * tz),
        v.z + q.w * tz + (q.x * ty - q.y * tx)
    )
}
