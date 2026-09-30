import { Material, MeshCollider, MeshRenderer, TextAlignMode, TextShape, Transform, engine } from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'
import { setupFeedbackState } from './state'

export function setupClient(): void {
  const ground = engine.addEntity()
  Transform.create(ground, { position: Vector3.create(8, 0, 8), scale: Vector3.create(16, 0.1, 16) })
  MeshRenderer.setBox(ground)
  MeshCollider.setBox(ground)
  Material.setPbrMaterial(ground, { albedoColor: Color4.fromHexString('#1b2a4aff') })

  const sign = engine.addEntity()
  Transform.create(sign, { position: Vector3.create(8, 2.5, 13) })
  TextShape.create(sign, {
    text: 'SCENE FEEDBACK\n\nUse the debug buttons (top-left)\nto show a question',
    fontSize: 3,
    textColor: Color4.White(),
    textAlign: TextAlignMode.TAM_MIDDLE_CENTER
  })

  setupFeedbackState()
}
