import {
  Billboard,
  ColliderLayer,
  type Entity,
  InputAction,
  Material,
  MeshCollider,
  MeshRenderer,
  TextShape,
  Transform,
  engine,
  pointerEventsSystem
} from '@dcl/sdk/ecs'
import { Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { GATE, SCENARIOS, SLABS, type Point, type Scenario, type Slab } from './arena'
import meshes from './generated/meshes'
import { createNavcatNavigatorFromMesh, type Route } from './navigation'

const WALK_SPEED = 3
const ROUTE_LIFT = 0.12
const BOT_HEIGHT = 0.9
const ink = Color4.fromHexString('#dcf4ffff')
const routeColor = Color4.fromHexString('#43e6c6ff')
const colors = {
  floor: Color4.fromHexString('#3b4b5aff'),
  ramp: Color4.fromHexString('#74889aff'),
  bridge: Color4.fromHexString('#5974acff'),
  island: Color4.fromHexString('#b07853ff')
}

function box(position: Vector3, scale: Vector3, color: Color4, rotation = Quaternion.Identity()): Entity {
  const entity = engine.addEntity()
  Transform.create(entity, { position, scale, rotation })
  MeshRenderer.setBox(entity)
  Material.setBasicMaterial(entity, { diffuseColor: color })
  return entity
}

function worldPoint(point: Point, lift = 0): Vector3 {
  return Vector3.create(point[0], point[1] + lift, point[2])
}

function slab(s: Slab) {
  const dz = s.maxZ - s.minZ
  const dy = s.farY - s.nearY
  const angle = Math.atan2(dy, dz)
  const thickness = s.kind === 'floor' ? 0.04 : 0.16
  const entity = box(
    Vector3.create(
      (s.minX + s.maxX) / 2,
      (s.nearY + s.farY) / 2 - (s.kind === 'floor' ? -thickness / 2 : Math.cos(angle) * thickness / 2),
      (s.minZ + s.maxZ) / 2 + Math.sin(angle) * thickness / 2
    ),
    Vector3.create(s.maxX - s.minX, thickness, Math.hypot(dz, dy)),
    colors[s.kind],
    Quaternion.fromEulerDegrees(-angle * 180 / Math.PI, 0, 0)
  )
  if (s.kind !== 'floor') MeshCollider.setBox(entity, ColliderLayer.CL_PHYSICS)
}

function text(position: Vector3, value: string, fontSize: number): Entity {
  const entity = engine.addEntity()
  Transform.create(entity, { position })
  TextShape.create(entity, { text: value, fontSize, textColor: ink })
  Billboard.create(entity)
  return entity
}

function button(x: number, label: string, action: () => void) {
  const entity = box(Vector3.create(x, 0.58, 2.15), Vector3.create(0.66, 0.57, 0.42), colors.bridge)
  MeshCollider.setBox(entity, ColliderLayer.CL_POINTER)
  text(Vector3.create(x, 1.1, 2.15), label, 1.25)
  pointerEventsSystem.onPointerDown(
    { entity, opts: { button: InputAction.IA_POINTER, hoverText: label, maxDistance: 9 } },
    action
  )
}

function drawRoute(points: readonly Point[]): Entity[] {
  const entities: Entity[] = []
  for (let i = 1; i < points.length; i++) {
    const start = worldPoint(points[i - 1], ROUTE_LIFT)
    const end = worldPoint(points[i], ROUTE_LIFT)
    const delta = Vector3.subtract(end, start)
    const length = Vector3.distance(start, end)
    if (length < 0.001) continue
    const pitch = -Math.atan2(delta.y, Math.hypot(delta.x, delta.z)) * 180 / Math.PI
    const yaw = Math.atan2(delta.x, delta.z) * 180 / Math.PI
    entities.push(box(
      Vector3.scale(Vector3.add(start, end), 0.5),
      Vector3.create(0.09, 0.07, length),
      routeColor,
      Quaternion.fromEulerDegrees(pitch, yaw, 0)
    ))
  }
  return entities
}

export function main() {
  for (const shape of SLABS) slab(shape)
  const open = createNavcatNavigatorFromMesh(meshes.open)
  const closed = createNavcatNavigatorFromMesh(meshes.closed)
  const gate = box(Vector3.create(GATE.x, GATE.y, GATE.z), Vector3.create(3, 1.55, 0.16), colors.island)
  const bot = engine.addEntity()
  Transform.create(bot, { position: Vector3.create(12.4, BOT_HEIGHT / 2, 2.6), scale: Vector3.create(0.58, BOT_HEIGHT, 0.58) })
  MeshRenderer.setSphere(bot)
  Material.setBasicMaterial(bot, { diffuseColor: Color4.fromHexString('#ffd05aff') })
  const marker = box(Vector3.Zero(), Vector3.create(0.36, 0.25, 0.36), routeColor)

  const board = text(Vector3.create(8, 2.06, 2.3), '', 1.65)
  let current: Scenario = SCENARIOS[0]
  let doorOpen = true
  let route: Route = { status: 'unreachable', points: [] }
  let visual: Entity[] = []
  let waypoint = 0
  let active = false

  function status(message: string) {
    TextShape.getMutable(board).text = 'Ground Navigation Lab\n' + current.id + '  •  Gate ' +
      (doorOpen ? 'open' : 'closed') + '\n' + message
  }

  function showGate() {
    const pose = Transform.getMutable(gate)
    pose.position.y = doorOpen ? GATE.y + 2 : GATE.y
    if (doorOpen) MeshCollider.deleteFrom(gate)
    else MeshCollider.setBox(gate, ColliderLayer.CL_PHYSICS)
  }

  function findRoute(start: Point) {
    const before = Date.now()
    route = (doorOpen ? open : closed).route(start, current.goal)
    const elapsed = Date.now() - before
    for (const entity of visual) engine.removeEntity(entity)
    visual = drawRoute(route.points)
    waypoint = 0
    active = route.status === 'complete' && route.points.length > 0
    status(active ? 'Following route' : 'No complete route')
    console.log('[ground-navigation] ' + JSON.stringify({
      scenario: current.id, doorOpen, status: route.status, points: route.points.length, queryMs: elapsed
    }))
  }

  function run(scenario: Scenario) {
    current = scenario
    doorOpen = scenario.doorOpen
    showGate()
    Transform.getMutable(bot).position = worldPoint(current.start, BOT_HEIGHT / 2)
    Transform.getMutable(marker).position = worldPoint(current.goal, 0.15)
    findRoute(current.start)
  }

  button(5.2, 'Upper deck', () => run(SCENARIOS[0]))
  button(7.0, 'Toggle gate', () => {
    doorOpen = !doorOpen
    showGate()
    const { x, y, z } = Transform.get(bot).position
    const occupyingGate = x >= 11 && x <= 14 && z >= 7 && z <= 8 && y > 1.8
    if (!doorOpen && occupyingGate) {
      // The gate footprint becomes unwalkable. Reset this run to its named start.
      Transform.getMutable(bot).position = worldPoint(current.start, BOT_HEIGHT / 2)
      findRoute(current.start)
    } else {
      findRoute([x, y - BOT_HEIGHT / 2, z])
    }
  })
  button(9.0, 'Underpass', () => run(SCENARIOS[2]))
  button(10.8, 'Isolated platform', () => run(SCENARIOS[3]))

  run(current)
  engine.addSystem((dt) => {
    if (!active) return
    const pose = Transform.getMutable(bot)
    let remaining = dt * WALK_SPEED
    while (waypoint < route.points.length) {
      const target = worldPoint(route.points[waypoint], BOT_HEIGHT / 2)
      const displacement = Vector3.subtract(target, pose.position)
      const distance = Vector3.length(displacement)
      if (distance <= remaining || distance < 0.001) {
        pose.position = target
        remaining = Math.max(0, remaining - distance)
        waypoint++
      } else {
        pose.position = Vector3.add(pose.position, Vector3.scale(displacement, remaining / distance))
        return
      }
    }
    active = false
    status('Goal reached')
    console.log('[ground-navigation] goal reached: ' + current.id)
  })
}
