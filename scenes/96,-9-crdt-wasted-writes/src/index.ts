import { engine, Transform, MeshRenderer, TextShape, Billboard } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'

// Writers for the Explorer's get_crdt_traffic MCP tool to classify:
// - replaced box: MeshRenderer re-set every frame with the same shape -> "wasted: rewrites identical values every tick"
//   (createOrReplace and the MeshRenderer.set* helpers always send, even when the value is identical)
// - mutable cylinder: Transform.getMutable every frame without a change -> nothing sent (the SDK skips unchanged bytes)
// - moving sphere: Transform really changes every frame -> "hot: changes every tick"

export function main() {
  const replaced = engine.addEntity()
  Transform.create(replaced, { position: Vector3.create(4, 1, 8) })
  MeshRenderer.setBox(replaced)
  addLabel('WASTED\nsetBox every frame', Vector3.create(4, 2.6, 8))

  const mutable = engine.addEntity()
  Transform.create(mutable, { position: Vector3.create(8, 1, 8) })
  MeshRenderer.setCylinder(mutable)
  addLabel('SILENT\ngetMutable, no change', Vector3.create(8, 2.6, 8))

  const mover = engine.addEntity()
  Transform.create(mover, { position: Vector3.create(12, 1, 8) })
  MeshRenderer.setSphere(mover)
  addLabel('HOT\nreally moves', Vector3.create(12, 2.6, 8))

  let time = 0
  engine.addSystem((dt) => {
    // createOrReplace under the hood: always sent, although the shape never changes
    MeshRenderer.setBox(replaced)

    // Marks the Transform dirty, but the SDK drops it because the bytes did not change
    Transform.getMutable(mutable)

    time += dt
    Transform.getMutable(mover).position.y = 1 + Math.sin(time)
  })
}

function addLabel(text: string, position: Vector3) {
  const label = engine.addEntity()
  Transform.create(label, { position })
  TextShape.create(label, { text, fontSize: 2 })
  Billboard.create(label)
}
