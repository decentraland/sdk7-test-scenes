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
  VisibilityComponent,
  engine,
  pointerEventsSystem
} from '@dcl/sdk/ecs'
import { Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { GATE, OPPOSING_GROUPS, SCENARIOS, SLABS, type Point, type Scenario, type Slab } from './arena'
import { createCrowdObserver, createNavcatCrowd } from './crowd'
import meshes from './generated/meshes'
import { createNavcatNavigatorFromMesh, type Route } from './navigation'
import referenceRoutes from './reference-routes.json'

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

type Reference = {
  backend: string
  scenarios: { id: string; status: string; points: number[][] }[]
}
const references: readonly Reference[] = referenceRoutes
const BACKEND_NAMES: Record<string, string> = { navcat: 'navcat live', detour: 'Detour replay', godot: 'Godot replay', landmass: 'landmass replay' }
const BACKENDS = ['navcat', ...references.map((reference) => reference.backend)]

function replayRoute(backend: string, id: string): Route {
  const reference = references.find((entry) => entry.backend === backend)?.scenarios.find((item) => item.id === id)
  if (reference?.status !== 'complete') return { status: 'unreachable', points: [] }
  return { status: 'complete', points: reference.points.map(([x, y, z]) => [x, y, z]) }
}

export function mountGroundLab() {
  const entities = new Set<Entity>()
  const buttons = new Set<Entity>()
  let disposed = false
  let cancelProbe: (() => void) | undefined

  function addEntity() {
    const entity = engine.addEntity()
    entities.add(entity)
    return entity
  }

  function removeEntity(entity: Entity) {
    entities.delete(entity)
    engine.removeEntity(entity)
  }

  function box(position: Vector3, scale: Vector3, color: Color4, rotation = Quaternion.Identity()): Entity {
    const entity = addEntity()
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
    const entity = addEntity()
    Transform.create(entity, { position })
    TextShape.create(entity, { text: value, fontSize, textColor: ink })
    Billboard.create(entity)
    return entity
  }

  function button(x: number, label: string, action: () => void) {
    const entity = box(Vector3.create(x, 0.58, 2.15), Vector3.create(0.66, 0.57, 0.42), colors.bridge)
    buttons.add(entity)
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

  for (const shape of SLABS) slab(shape)
  const open = createNavcatNavigatorFromMesh(meshes.open)
  const closed = createNavcatNavigatorFromMesh(meshes.closed)
  const gate = box(Vector3.create(GATE.x, GATE.y, GATE.z), Vector3.create(3, 1.55, 0.16), colors.island)
  const bot = addEntity()
  Transform.create(bot, { position: Vector3.create(12.4, BOT_HEIGHT / 2, 2.6), scale: Vector3.create(0.58, BOT_HEIGHT, 0.58) })
  MeshRenderer.setSphere(bot)
  Material.setBasicMaterial(bot, { diffuseColor: Color4.fromHexString('#ffd05aff') })
  const marker = box(Vector3.Zero(), Vector3.create(0.36, 0.25, 0.36), routeColor)
  VisibilityComponent.create(bot, { visible: true })
  VisibilityComponent.create(marker, { visible: true })

  const board = text(Vector3.create(8, 2.06, 2.3), '', 1.65)
  const probeBoard = text(Vector3.create(12.9, 2.8, 2.3), '', 1.25)
  let probeRunning = false
  let backendIndex = 0
  let current: Scenario = SCENARIOS[0]
  let doorOpen = true
  let route: Route = { status: 'unreachable', points: [] }
  let visual: Entity[] = []
  let waypoint = 0
  let active = false
  let group: ReturnType<typeof createNavcatCrowd> | undefined
  let observer: ReturnType<typeof createCrowdObserver> | undefined
  let groupEntities: Entity[] = []
  let seconds = 0
  let steps = 0

  function status(message: string) {
    TextShape.getMutable(board).text = 'Ground Navigation Lab  •  ' + BACKEND_NAMES[BACKENDS[backendIndex]] +
      '\n' + current.id + '  •  Gate ' +
      (doorOpen ? 'open' : 'closed') + '\n' + message
  }

  function clearRoute() {
    for (const entity of visual) removeEntity(entity)
    visual = []
  }

  function clearCrowd() {
    group = undefined
    observer = undefined
    for (const entity of groupEntities) removeEntity(entity)
    groupEntities = []
    VisibilityComponent.getMutable(bot).visible = true
    VisibilityComponent.getMutable(marker).visible = true
  }

  function showGate() {
    const pose = Transform.getMutable(gate)
    pose.position.y = doorOpen ? GATE.y + 2 : GATE.y
    if (doorOpen) MeshCollider.deleteFrom(gate)
    else MeshCollider.setBox(gate, ColliderLayer.CL_PHYSICS)
  }

  function findRoute(start: Point) {
    const before = Date.now()
    const backend = BACKENDS[backendIndex]
    route = backend === 'navcat'
      ? (doorOpen ? open : closed).route(start, current.goal)
      : replayRoute(backend, current.id)
    const elapsed = Date.now() - before
    clearRoute()
    visual = drawRoute(route.points)
    waypoint = 0
    active = route.status === 'complete' && route.points.length > 0
    status(active ? 'Following route' : 'No complete route')
    console.log('[ground-navigation] ' + JSON.stringify({
      backend, scenario: current.id, doorOpen, status: route.status, points: route.points.length,
      ...(backend === 'navcat' && { queryMs: elapsed })
    }))
  }

  function run(scenario: Scenario) {
    clearCrowd()
    current = scenario
    doorOpen = scenario.doorOpen
    showGate()
    Transform.getMutable(bot).position = worldPoint(current.start, BOT_HEIGHT / 2)
    Transform.getMutable(marker).position = worldPoint(current.goal, 0.15)
    findRoute(current.start)
  }

  function runCrowd() {
    clearCrowd()
    clearRoute()
    active = false
    doorOpen = true
    showGate()
    VisibilityComponent.getMutable(bot).visible = false
    VisibilityComponent.getMutable(marker).visible = false
    group = createNavcatCrowd(meshes.open)
    observer = createCrowdObserver()
    seconds = 0
    steps = 0
    groupEntities = group.positions().map((point, i) => {
      const entity = addEntity()
      Transform.create(entity, {
        position: worldPoint(point, BOT_HEIGHT / 2),
        scale: Vector3.create(0.6, BOT_HEIGHT, 0.6)
      })
      MeshRenderer.setSphere(entity)
      Material.setBasicMaterial(entity, { diffuseColor: i < 3 ? routeColor : Color4.fromHexString('#ffd05aff') })
      return entity
    })
    TextShape.getMutable(board).text = 'Opposing groups  •  navcat live\n6 bots crossing the upper deck'
  }

  button(3.4, 'Switch engine', () => {
    backendIndex = (backendIndex + 1) % BACKENDS.length
    run(current)
  })
  button(5.2, 'Upper deck', () => run(SCENARIOS[0]))
  button(7.0, 'Toggle gate', () => {
    if (group || BACKENDS[backendIndex] !== 'navcat') {
      run(doorOpen ? SCENARIOS[1] : SCENARIOS[0])
      return
    }
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
  button(12.6, 'Opposing groups', runCrowd)
  button(14.4, 'Run WASM probe', () => {
    if (probeRunning) return
    probeRunning = true
    TextShape.getMutable(probeBoard).text = 'Loading Detour WASM…'
    void import('../tools/sdk-detour-probe/probe')
      .then(({ runProbe }) => {
        if (disposed) return
        cancelProbe = runProbe(({ message, finished }) => {
          TextShape.getMutable(probeBoard).text = message
          probeRunning = !finished
        })
      })
      .catch((error: unknown) => {
        if (disposed) return
        probeRunning = false
        TextShape.getMutable(probeBoard).text = 'WASM probe could not load. See scene logs.'
        console.error('[detour-sdk-probe] ' + String(error))
      })
  })

  run(current)
  const tick = (dt: number) => {
    if (disposed) return
    if (group && observer && steps < OPPOSING_GROUPS.steps) {
      const stepSeconds = OPPOSING_GROUPS.stepSeconds
      seconds = Math.min(seconds + dt, stepSeconds * 5)
      while (seconds >= stepSeconds && steps < OPPOSING_GROUPS.steps) {
        group.step(stepSeconds)
        observer.observe(group.positions())
        steps++
        seconds -= stepSeconds
      }
      group.positions().forEach((point, i) => {
        Transform.getMutable(groupEntities[i]).position = worldPoint(point, BOT_HEIGHT / 2)
      })
      const metrics = observer.metrics()
      TextShape.getMutable(board).text = 'Opposing groups  •  navcat live\n' +
        metrics.arrived + '/' + metrics.total + ' reached  •  ' + metrics.overlapSteps + ' overlap steps'
      if (steps === OPPOSING_GROUPS.steps) console.log('[ground-navigation] crowd ' + JSON.stringify(metrics))
      return
    }
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
  }
  engine.addSystem(tick)
  return () => {
    disposed = true
    cancelProbe?.()
    engine.removeSystem(tick)
    for (const entity of buttons) pointerEventsSystem.removeOnPointerDown(entity)
    for (const entity of entities) engine.removeEntity(entity)
  }
}
