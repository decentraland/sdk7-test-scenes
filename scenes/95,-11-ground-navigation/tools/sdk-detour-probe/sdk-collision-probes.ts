import {
  ColliderLayer, engine, Material, MeshCollider, MeshRenderer, Raycast, RaycastQueryType,
  RaycastResult, Transform, type Entity
} from '@dcl/sdk/ecs'
import { Color4, Quaternion, Vector3 } from '@dcl/sdk/math'

export type ProbeWorld = ReturnType<typeof createProbeWorld>
export type PhysicalRay = { entity: Entity; timestamp: number }

let nextTimestamp = 0

export function requireCheck(condition: unknown, detail: string): asserts condition {
  if (!condition) throw new Error(detail)
}

export function* until(condition: () => boolean, detail: string, frames = 300) {
  for (let tick = 0; tick < frames; tick++) {
    if (condition()) return
    yield
  }
  requireCheck(condition(), detail)
}

export function createProbeWorld() {
  const entities = new Set<Entity>()
  function entity(position: Vector3, parent?: Entity, rotation?: Quaternion, scale?: Vector3) {
    const result = engine.addEntity()
    entities.add(result)
    Transform.create(result, {
      position, parent: parent ?? engine.RootEntity, rotation: rotation ?? Quaternion.Identity(), scale: scale ?? Vector3.One()
    })
    return result
  }
  function box(position: Vector3, size: Vector3, color: Color4) {
    const result = entity(position, undefined, undefined, size)
    MeshRenderer.setBox(result)
    MeshCollider.setBox(result, ColliderLayer.CL_PHYSICS)
    Material.setBasicMaterial(result, { diffuseColor: color })
    return result
  }
  function marker(position: Vector3, color: Color4, parent?: Entity, physical = false) {
    const result = entity(position, parent, undefined, Vector3.create(0.14, 0.14, 0.14))
    MeshRenderer.setSphere(result)
    if (physical) MeshCollider.setSphere(result, ColliderLayer.CL_PHYSICS)
    Material.setBasicMaterial(result, { diffuseColor: color })
    return result
  }
  function remove(target: Entity) {
    if (entities.delete(target)) engine.removeEntity(target)
  }
  function issueRay(
    origin: Vector3, direction: Vector3, maxDistance: number, collisionMask: number = ColliderLayer.CL_PHYSICS
  ): PhysicalRay {
    const source = entity(origin)
    const timestamp = ++nextTimestamp
    Raycast.create(source, {
      direction: { $case: 'globalDirection', globalDirection: direction },
      originOffset: Vector3.Zero(), continuous: false, maxDistance, timestamp, collisionMask,
      queryType: RaycastQueryType.RQT_QUERY_ALL
    })
    return { entity: source, timestamp }
  }
  function* readRay({ entity: source, timestamp }: PhysicalRay) {
    yield* until(() => RaycastResult.getOrNull(source)?.timestamp === timestamp,
      'Explorer did not return raycast ' + timestamp)
    const result = RaycastResult.get(source)
    const hits = result.hits.map((hit) => ({ ...hit, position: hit.position && { ...hit.position } }))
    const tick = result.tickNumber
    remove(source)
    return { timestamp, tick, hits }
  }
  function* cast(origin: Vector3, direction: Vector3, maxDistance: number, mask?: number) {
    return yield* readRay(issueRay(origin, direction, maxDistance, mask))
  }
  return {
    entity, box, marker, issueRay, readRay, cast, remove,
    dispose() { for (const target of entities) remove(target) }
  }
}

export function fromAbove(target: Vector3, distance: number) {
  return Vector3.create(target.x, target.y + distance, target.z)
}

export function* surfaceAt(world: ProbeWorld, at: Vector3, entity: Entity) {
  const { hits } = yield* world.cast(fromAbove(at, 0.35), Vector3.Down(), 0.6)
  return hits.some((hit) => hit.entityId === entity && hit.position && Math.abs(hit.position.y - at.y) <= 0.02)
}

export function* awaitSurface(world: ProbeWorld, at: Vector3, entity: Entity, present: boolean) {
  for (let i = 0; i < 24; i++) {
    if ((yield* surfaceAt(world, at, entity)) === present) return
    yield
  }
  throw new Error('Explorer surface at ' + JSON.stringify(at) + ' did not become ' + (present ? 'solid' : 'clear'))
}
