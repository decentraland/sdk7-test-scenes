// Scene line of sight through SDK7 raycasts. Results are asynchronous: raycastSystem registers the
// ray on the next tick and the renderer answers a frame or more later, so check() returns the
// latest finished answer (false until the first one) and keeps one ray in flight per observer.
// Headless (Node tests) no result ever arrives, so this always reports "blocked": use
// GeometricLineOfSight there.
import { ColliderLayer, engine, Entity, RaycastQueryType, raycastSystem, Transform } from '@dcl/sdk/ecs'
import type { LineOfSight } from './perception'
import { distance, Vec3 } from './vec'

export interface RaycastLineOfSightOptions {
  collisionMask?: number // default CL_PHYSICS: walls, trees and other solid colliders block sight
  /** Entities that never block (the guards' own bodies). Read on every result. */
  ignore?: () => Iterable<Entity>
  /** Start the ray this far toward the target, to clear the observer's own collider. */
  originClearance?: number
  /** A hit closer than (distance - endSlack) to the origin blocks. */
  endSlack?: number
  /** Answers older than this (s) count as blocked. */
  maxAge?: number
  /** Re-cast if no answer arrived within this time (s). */
  timeout?: number
}

interface Ray {
  entity: Entity
  inFlightSince: number | null
  visible: boolean
  answeredAt: number
}

export class RaycastLineOfSight implements LineOfSight {
  private readonly rays = new Map<string, Ray>()
  private readonly mask: number
  private readonly clearance: number
  private readonly endSlack: number
  private readonly maxAge: number
  private readonly timeout: number

  constructor(private readonly opts: RaycastLineOfSightOptions = {}) {
    this.mask = opts.collisionMask ?? ColliderLayer.CL_PHYSICS
    this.clearance = opts.originClearance ?? 0.6
    this.endSlack = opts.endSlack ?? 0.4
    this.maxAge = opts.maxAge ?? 0.6
    this.timeout = opts.timeout ?? 1
  }

  check(observerId: string, eye: Vec3, target: Vec3, now: number): boolean {
    let ray = this.rays.get(observerId)
    if (!ray) {
      ray = { entity: engine.addEntity(), inFlightSince: null, visible: false, answeredAt: -Infinity }
      this.rays.set(observerId, ray)
    }
    if (ray.inFlightSince !== null && now - ray.inFlightSince > this.timeout) {
      raycastSystem.removeRaycasterEntity(ray.entity)
      ray.inFlightSince = null
    }
    if (ray.inFlightSince === null) this.cast(ray, eye, target, now)
    return ray.visible && now - ray.answeredAt <= this.maxAge
  }

  release(observerId: string): void {
    const ray = this.rays.get(observerId)
    if (!ray) return
    raycastSystem.removeRaycasterEntity(ray.entity)
    engine.removeEntity(ray.entity)
    this.rays.delete(observerId)
  }

  releaseAll(): void {
    const ids: string[] = []
    this.rays.forEach((_r, id) => ids.push(id))
    for (const id of ids) this.release(id)
  }

  private cast(ray: Ray, eye: Vec3, target: Vec3, now: number): void {
    const total = distance(eye, target)
    if (total < 1e-3) {
      ray.visible = true
      ray.answeredAt = now
      return
    }
    const k = Math.min(this.clearance, total * 0.5) / total
    const origin = { x: eye.x + (target.x - eye.x) * k, y: eye.y + (target.y - eye.y) * k, z: eye.z + (target.z - eye.z) * k }
    const length = total - Math.min(this.clearance, total * 0.5)
    Transform.createOrReplace(ray.entity, { position: origin })
    ray.inFlightSince = now
    const ignore = this.opts.ignore
    raycastSystem.registerGlobalTargetRaycast(
      {
        entity: ray.entity,
        // Note: the option is `target` (raycastSystem reads options.target), not `globalTarget`.
        opts: { target: { x: target.x, y: target.y, z: target.z }, maxDistance: length, queryType: RaycastQueryType.RQT_QUERY_ALL, collisionMask: this.mask }
      },
      result => {
        const skip = new Set<number>()
        if (ignore) for (const e of ignore()) skip.add(e as number)
        ray.visible = !result.hits.some(h => h.length < length - this.endSlack && !(h.entityId !== undefined && skip.has(h.entityId)))
        ray.answeredAt = ray.inFlightSince ?? now
        ray.inFlightSince = null
      }
    )
  }
}
