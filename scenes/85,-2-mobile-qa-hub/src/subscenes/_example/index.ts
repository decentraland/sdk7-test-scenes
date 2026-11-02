import {
  ColliderLayer,
  InputAction,
  Material,
  MeshCollider,
  MeshRenderer,
  TextShape,
  Transform,
  pointerEventsSystem
} from '@dcl/sdk/ecs'
import { Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import type { SubsceneContext } from '../../hub/types'

// Module level state: reset it in unmount() so the subscene can be opened twice.
let angle = 0
let clicks = 0
let counterEntity: ReturnType<SubsceneContext['addEntity']> | null = null

/**
 * Template subscene: copy this folder, rename it, replace this file and edit
 * subscene.json. Three things are demonstrated on purpose:
 *  - entities created through `ctx.addEntity()` (removed for you on unmount),
 *  - a system registered with `ctx.addSystem()` (removed for you on unmount),
 *  - local state that `unmount()` resets, so re-opening the subscene starts clean.
 */
export function mount(ctx: SubsceneContext): void {
  // 1. spinning cube, driven by a tracked system
  const spinner = ctx.addEntity()
  Transform.create(spinner, {
    position: Vector3.create(ctx.origin.x - 2, 1, ctx.origin.z),
    scale: Vector3.create(1.5, 1.5, 1.5)
  })
  MeshRenderer.setBox(spinner)
  MeshCollider.setBox(spinner, ColliderLayer.CL_PHYSICS)
  Material.setPbrMaterial(spinner, { albedoColor: Color4.create(0.24, 0.52, 0.94, 1), metallic: 0, roughness: 0.6 })

  ctx.addSystem(
    (dt) => {
      angle = (angle + dt * 45) % 360
      Transform.getMutable(spinner).rotation = Quaternion.fromEulerDegrees(0, angle, 0)
    },
    0,
    `qa-example-spin`
  )

  // 2. clickable cube with a counter: the kind of thing a mobile PR adds
  const target = ctx.addEntity()
  Transform.create(target, {
    position: Vector3.create(ctx.origin.x + 2, 1, ctx.origin.z),
    scale: Vector3.create(1.5, 1.5, 1.5)
  })
  MeshRenderer.setBox(target)
  MeshCollider.setBox(target, ColliderLayer.CL_PHYSICS | ColliderLayer.CL_POINTER)
  Material.setPbrMaterial(target, { albedoColor: Color4.create(0.9, 0.62, 0.16, 1), metallic: 0, roughness: 0.6 })

  counterEntity = ctx.addEntity()
  Transform.create(counterEntity, { position: Vector3.create(ctx.origin.x + 2, 2.4, ctx.origin.z) })
  TextShape.create(counterEntity, { text: 'taps: 0', fontSize: 4, textColor: Color4.White() })

  pointerEventsSystem.onPointerDown(
    { entity: target, opts: { button: InputAction.IA_POINTER, hoverText: 'tap me' } },
    () => {
      clicks += 1
      if (counterEntity !== null) TextShape.getMutable(counterEntity).text = `taps: ${clicks}`
    }
  )

  // 3. on screen / in world instructions, so a tester knows what to look at
  const help = ctx.addEntity()
  Transform.create(help, { position: Vector3.create(ctx.origin.x, 3.4, ctx.origin.z - 6) })
  TextShape.create(help, {
    text: 'example subscene\nleft: auto rotating cube (system) · right: tap the cube',
    fontSize: 3.5,
    textColor: Color4.create(0.85, 0.9, 1, 1),
    textWrapping: true,
    width: 12,
    height: 3
  })

  ctx.log('example subscene mounted at', ctx.origin)
}

/** Optional: reset your own state. Tracked entities/systems are removed by the hub. */
export function unmount(): void {
  angle = 0
  clicks = 0
  counterEntity = null
  console.log('[qa-hub] example subscene unmounted')
}
