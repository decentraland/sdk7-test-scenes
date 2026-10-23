// One playground at a time: spawn() builds it in front of the player under a root entity that carries its frame,
// and removes the one spawned before (with every entity under its root). Spawning the same one again restarts it
// where it stands. One system ticks the spawned playground on the scene's simulation clock (the debugger's pause, step
// and time scale): a frame in steps of at most MAX_STEP, nothing while paused.
import { engine, Entity, removeEntityWithChildren, Transform } from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'
import { sceneClock } from '../htn-planner'
import { Footprint, Frame, placeInFront, SCENE } from './frame'

export interface Playground {
  id: string
  /** The menu label. */
  label: string
  half: Footprint
  /** Build it under `root` (placed and turned by `frame`): everything it makes must be a descendant of root. */
  build(root: Entity, frame: Frame): Built
}

export interface Built {
  /** One step of simulated time (at most MAX_STEP s); not called while the simulation is paused. */
  update(dt: number): void
  /** Release what is not an entity under root (e.g. a shared system). */
  dispose?(): void
}

export interface Spawned {
  playground: Playground
  frame: Frame
  root: Entity
  built: Built
}

/** s, the longest step a playground takes. */
export const MAX_STEP = 0.1

let current: Spawned | null = null
let ticking = false
let waiting: (() => void) | null = null

/** The spawned playground, if any. */
export const spawned = (): Spawned | null => current

/** Where the player stands and which way the camera looks (radians, 0 = +z). */
function viewer(): { at: Vector3; facing: number } {
  const player = Transform.getOrNull(engine.PlayerEntity)
  const rotation = Transform.getOrNull(engine.CameraEntity)?.rotation ?? player?.rotation ?? Quaternion.Identity()
  const forward = Vector3.rotate(Vector3.Forward(), rotation)
  return { at: player?.position ?? Vector3.create(SCENE.x / 2, 0, SCENE.z / 2), facing: Math.atan2(forward.x, forward.z) }
}

/** Start the default playground once the player's transform arrives; a menu choice or Remove cancels it. */
export function spawnWhenReady(p: Playground): void {
  cancelWaiting()
  if (Transform.has(engine.PlayerEntity)) {
    spawn(p)
    return
  }
  waiting = () => {
    if (Transform.has(engine.PlayerEntity)) spawn(p)
  }
  engine.addSystem(waiting, undefined, 'playground-startup')
}

function cancelWaiting(): void {
  if (!waiting) return
  engine.removeSystem(waiting)
  waiting = null
}

/** Spawn `p` in front of the player instead of the spawned one; if `p` is the spawned one, restart it in place. */
export function spawn(p: Playground): Spawned {
  let frame: Frame
  if (current?.playground.id === p.id) frame = current.frame
  else {
    const v = viewer()
    frame = placeInFront(v.at, v.facing, p.half)
  }
  despawn()
  if (!ticking) {
    ticking = true
    const clock = sceneClock()
    engine.addSystem(() => clock.each(MAX_STEP, dt => current?.built.update(dt)), undefined, 'playground')
  }
  const root = engine.addEntity()
  Transform.create(root, { position: frame.origin, rotation: Quaternion.fromEulerDegrees(0, (frame.yaw * 180) / Math.PI, 0) })
  current = { playground: p, frame, root, built: p.build(root, frame) }
  return current
}

/** Remove the spawned playground. */
export function despawn() {
  cancelWaiting()
  if (!current) return
  current.built.dispose?.()
  removeEntityWithChildren(engine, current.root)
  current = null
}
