import {
  InputAction,
  Material,
  MeshCollider,
  MeshRenderer,
  TextAlignMode,
  TextShape,
  Transform,
  engine,
  pointerEventsSystem
} from '@dcl/sdk/ecs'
import { Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { TARGET_POSITION, TRY_PAD_POSITION } from '../shared/config'
import { room } from '../shared/messages'

// The last few award results, newest first, rendered on the results sign.
const log: string[] = []
let resultsSign = engine.RootEntity

export function setupClient(): void {
  buildScene()

  // Server → me: one award attempt's outcome. Only the server can send this; the
  // SDK drops awardResult from any other sender.
  room.onMessage('awardResult', ({ kind, ok, reason }) => {
    const line = `[${kind}] ${ok ? 'OK' : 'NO'}${reason ? ' — ' + reason : ''}`
    console.log(line)
    log.unshift(line)
    if (log.length > 6) log.pop()
    TextShape.getMutable(resultsSign).text = ['RESULTS', ...log].join('\n')
  })
}

function buildScene(): void {
  const ground = engine.addEntity()
  Transform.create(ground, { position: Vector3.create(8, 0, 8), scale: Vector3.create(16, 0.1, 16) })
  MeshRenderer.setBox(ground)
  MeshCollider.setBox(ground)
  Material.setPbrMaterial(ground, { albedoColor: Color4.fromHexString('#1b2a4aff') })

  // Pad 1: "try award". Works from anywhere; the server awards the sender and an
  // absent address, and the platform must refuse the second.
  const tryPad = orb(TRY_PAD_POSITION, '#4ec9ffff', '#0090ffff')
  pointerEventsSystem.onPointerDown(
    { entity: tryPad, opts: { button: InputAction.IA_POINTER, hoverText: 'Try award (anyone, plus an absent address)' } },
    () => {
      void room.send('tryAward', {})
    }
  )
  sign(Vector3.create(TRY_PAD_POSITION.x, 3.2, TRY_PAD_POSITION.z), 'TRY AWARD\n(click from anywhere)')

  // Pad 2: "claim badge". The server awards only if ITS copy of your position is
  // within reach of this pad. Clicking it from afar must be refused by the scene.
  const target = orb(TARGET_POSITION, '#ffd34eff', '#ffb000ff')
  pointerEventsSystem.onPointerDown(
    { entity: target, opts: { button: InputAction.IA_POINTER, hoverText: 'Claim badge (stand next to it)', maxDistance: 32 } },
    () => {
      void room.send('claimBadge', {})
    }
  )
  sign(Vector3.create(TARGET_POSITION.x, 3.2, TARGET_POSITION.z), 'CLAIM BADGE\n(stand next to it)')

  resultsSign = sign(Vector3.create(8, 3.6, 14), 'RESULTS')
}

function orb(position: Vector3, albedo: string, emissive: string) {
  const pedestal = engine.addEntity()
  Transform.create(pedestal, { position: Vector3.create(position.x, 0.5, position.z), scale: Vector3.create(1.2, 1, 1.2) })
  MeshRenderer.setCylinder(pedestal)
  MeshCollider.setCylinder(pedestal)
  Material.setPbrMaterial(pedestal, { albedoColor: Color4.fromHexString('#3a4a6bff') })

  const entity = engine.addEntity()
  Transform.create(entity, { position, scale: Vector3.create(0.9, 0.9, 0.9) })
  MeshRenderer.setSphere(entity)
  MeshCollider.setSphere(entity)
  Material.setPbrMaterial(entity, {
    albedoColor: Color4.fromHexString(albedo),
    emissiveColor: Color4.fromHexString(emissive),
    emissiveIntensity: 2
  })
  return entity
}

function sign(position: Vector3, text: string) {
  const entity = engine.addEntity()
  Transform.create(entity, { position, rotation: Quaternion.fromEulerDegrees(0, 180, 0) })
  TextShape.create(entity, { text, fontSize: 2.5, textColor: Color4.White(), textAlign: TextAlignMode.TAM_MIDDLE_CENTER })
  return entity
}
