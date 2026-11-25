import { Billboard, ColliderLayer, engine, Material, MeshCollider, MeshRenderer, TextShape, Transform, type Entity } from '@dcl/sdk/ecs'
import { Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { SCENARIOS, SLABS } from './layout'
import type { OpenNavigation, PreparedMesh } from '../types'

export type TwoFloorResult = {
  status: 'pass' | 'fail'
  detail: string
  metrics?: Record<string, number>
}

export function mountTwoFloorExample(
  openNavigation: OpenNavigation,
  data: PreparedMesh,
  onResult?: (result: TwoFloorResult) => void,
  queries = 0,
) {
  const entities: Entity[] = []
  let cancelled = false
  let movement: ((dt: number) => void) | undefined
  const names = { navcat: 'navcat', detour: 'Detour' }
  const { start, goal } = SCENARIOS[0]
  const isolated = SCENARIOS[3]
  const floorColor = Color4.fromHexString('#697eac')
  const markerColor = Color4.fromHexString('#52dbc2')
  function entity(position: Vector3, scale = Vector3.One(), rotation = Quaternion.Identity()) {
    const id = engine.addEntity()
    entities.push(id)
    Transform.create(id, { position, scale, rotation })
    return id
  }
  function paint(id: Entity, color: Color4) {
    Material.setBasicMaterial(id, { diffuseColor: color })
  }
  for (const slab of SLABS) {
    const dy = slab.farY - slab.nearY
    const dz = slab.maxZ - slab.minZ
    const angle = Math.atan2(dy, dz)
    const id = entity(
      Vector3.create(
        (slab.minX + slab.maxX) / 2,
        (slab.nearY + slab.farY) / 2 - Math.cos(angle) * .08,
        (slab.minZ + slab.maxZ) / 2 + Math.sin(angle) * .08,
      ),
      Vector3.create(slab.maxX - slab.minX, .16, Math.hypot(dy, dz)),
      Quaternion.fromEulerDegrees(-angle * 180 / Math.PI, 0, 0),
    )
    MeshRenderer.setBox(id)
    if (slab.kind !== 'floor') MeshCollider.setBox(id, ColliderLayer.CL_PHYSICS)
    paint(id, floorColor)
  }
  const npc = entity(Vector3.create(start[0], start[1] + .25, start[2]), Vector3.create(.5, .5, .5))
  MeshRenderer.setSphere(npc)
  paint(npc, Color4.Yellow())
  const marker = entity(Vector3.create(goal[0], goal[1] + .15, goal[2]), Vector3.create(.45, .3, .45))
  MeshRenderer.setBox(marker)
  paint(marker, markerColor)
  const label = entity(Vector3.create(8, 2.2, 3))
  TextShape.create(label, { text: names[data.backend] + ' · Opening prepared mesh', fontSize: 2 })
  Billboard.create(label)

  function finish(result: TwoFloorResult) {
    TextShape.getMutable(label).text = names[data.backend] + ' · ' + result.status.toUpperCase() + '\n' + result.detail
    console.log('[navmesh-two-floors] ' + JSON.stringify({ backend: data.backend, ...result }))
    onResult?.(result)
  }

  async function run() {
    const opened = Date.now()
    const navigator = await openNavigation(data)
    const openMs = Date.now() - opened
    let points: Vector3[]
    let queryBatchMs: number
    try {
      if (cancelled) return
      const route = navigator.route(start, goal)
      const end = route.points[route.points.length - 1]
      if (route.status !== 'complete' || !end || Math.abs(end[1] - goal[1]) > .35 ||
          navigator.route(isolated.start, isolated.goal).status !== 'unreachable') {
        throw new Error('Expected an upper-floor route and rejection of the isolated platform.')
      }
      const queryStarted = Date.now()
      for (let i = 0; i < queries; i++) navigator.route(start, goal)
      queryBatchMs = Date.now() - queryStarted
      points = route.points.map(([x, y, z]) => Vector3.create(x, y + .25, z))
    } finally {
      navigator.dispose()
    }
    TextShape.getMutable(label).text = names[data.backend] + ' · Following the upper-floor route'
    let waypoint = 0
    movement = (dt: number) => {
      const transform = Transform.getMutable(npc)
      let budget = 3 * Math.min(.1, Math.max(0, dt))
      while (waypoint < points.length && budget > 0) {
        const target = points[waypoint]
        const distance = Vector3.distance(transform.position, target)
        if (distance > budget) {
          transform.position = Vector3.lerp(transform.position, target, budget / distance)
          break
        }
        transform.position = target
        budget -= distance
        waypoint++
      }
      if (waypoint === points.length) {
        engine.removeSystem(movement!)
        movement = undefined
        finish({
          status: 'pass',
          detail: 'Reached upper floor. Isolated platform rejected.\nOpen ' + openMs + ' ms' +
            (queries ? ' · ' + queries + ' queries in ' + queryBatchMs + ' ms' : ''),
          metrics: { openMs, queryBatchMs, queries, finalY: transform.position.y - .25 }
        })
      }
    }
    engine.addSystem(movement)
  }

  void run().catch((error: unknown) => {
    if (!cancelled) finish({ status: 'fail', detail: String(error) })
  })
  return () => {
    cancelled = true
    if (movement) engine.removeSystem(movement)
    for (const id of entities) engine.removeEntity(id)
  }
}
