// Scene-space conversion for possessed figures. Uniform ancestor scale keeps rigid rotations
// representable by SDK Transform (non-uniform rotated ancestors can introduce shear).
import { engine, Entity, Transform } from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'
import type { Vec3 } from './vec'

export interface BodyFrame {
  position: Vec3
  rotation: Quaternion
  scale: number
}

/** Private writer scratch: each resolve re-reads the hierarchy; the returned frame is borrowed. */
export class ParentFrameResolver {
  readonly frame = { position: Vector3.Zero(), rotation: Quaternion.Identity(), scale: 1 }
  private readonly chain: Entity[] = []
  private readonly scaled = Vector3.Zero()
  private readonly rotated = Vector3.Zero()
  private readonly rotation = Quaternion.Identity()

  resolve(entity: Entity, driven: ReadonlySet<Entity>): BodyFrame {
    let count = 0
    let parent = Transform.get(entity).parent
    while (parent && parent !== engine.RootEntity) {
      if (parent === entity) throw new Error('possessEntityBody: cyclic parent hierarchy')
      // Reuse a short numeric chain rather than a new visited Set/array each frame.
      for (let i = 0; i < count; i++) {
        if (this.chain[i] === parent) throw new Error('possessEntityBody: cyclic parent hierarchy')
      }
      if (driven.has(parent)) throw new Error('possessEntityBody: attachments must not be descendants of another driven entity')
      const t = Transform.getOrNull(parent)
      if (!t) break
      const { x, y, z } = t.scale
      if (!Number.isFinite(x) || x <= 0 || x !== y || x !== z) {
        throw new Error('possessEntityBody: ancestors must have uniform positive scale; use a separate root body for sheared figures')
      }
      this.chain[count++] = parent
      parent = t.parent
    }
    const frame = this.frame
    frame.position.x = frame.position.y = frame.position.z = 0
    frame.rotation.x = frame.rotation.y = frame.rotation.z = 0
    frame.rotation.w = frame.scale = 1
    for (let i = count - 1; i >= 0; i--) {
      const t = Transform.get(this.chain[i])
      Vector3.scaleToRef(t.position, frame.scale, this.scaled)
      Vector3.rotateToRef(this.scaled, frame.rotation, this.rotated)
      frame.position.x += this.rotated.x
      frame.position.y += this.rotated.y
      frame.position.z += this.rotated.z
      // SDK multiplyToRef is not alias-safe: retain a distinct destination.
      Quaternion.multiplyToRef(frame.rotation, t.rotation, this.rotation)
      frame.rotation.x = this.rotation.x
      frame.rotation.y = this.rotation.y
      frame.rotation.z = this.rotation.z
      frame.rotation.w = this.rotation.w
      frame.scale *= t.scale.x
    }
    return frame
  }
}

/** An independent frame snapshot for callers; hot body writers own a reusable resolver instead. */
export function parentFrame(entity: Entity, driven: ReadonlySet<Entity>): BodyFrame {
  return new ParentFrameResolver().resolve(entity, driven)
}

export function fromParent(position: Vec3, frame: BodyFrame): Vec3 {
  return Vector3.add(frame.position, Vector3.rotate(Vector3.scale(position, frame.scale), frame.rotation))
}
