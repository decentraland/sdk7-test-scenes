import {
  InputAction,
  Material,
  MeshCollider,
  MeshRenderer,
  Transform,
  engine,
  pointerEventsSystem
} from '@dcl/sdk/ecs'
import { Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { RARE_VALUE } from '../shared/config'
import { Gem } from '../shared/schemas'
import { queueCollect } from './setup'

// ---------------------------------------------------------------------------
// Client-side renderer for the server-spawned gem entities.
//
// The server syncs ONLY the Gem component (gemId, value, position). This system
// decorates each gem entity with purely LOCAL components — Transform, mesh,
// material, collider, pointer handler. Because those componentIds are not in the
// entity's SyncComponents list, nothing here is ever broadcast, which is what
// lets every client animate its own gems for free.
//
// Despawn needs no client code at all: when the server calls engine.removeEntity,
// the deletion is synced and takes all local decorations (and the pointer
// handler) along with it.
// ---------------------------------------------------------------------------

// Local marker so we only decorate each gem once. Defined at module scope (this
// module is statically imported on both sides via index.ts, so componentId tables
// stay consistent); the server simply never uses it.
const GemVisual = engine.defineComponent('gemrush-client::GemVisual', {})

const NORMAL_COLOR = Color4.fromHexString('#37d5efff')
const RARE_COLOR = Color4.fromHexString('#ffd34eff')

export function setupGems(): void {
  engine.addSystem(gemDecoratorSystem)
}

function gemDecoratorSystem(dt: number): void {
  for (const [entity, gem] of engine.getEntitiesWith(Gem)) {
    if (!GemVisual.has(entity)) {
      GemVisual.create(entity)

      const rare = gem.value >= RARE_VALUE
      const color = rare ? RARE_COLOR : NORMAL_COLOR

      // A box on its corner reads as a "gem" without any model asset.
      Transform.create(entity, {
        position: Vector3.create(gem.position.x, gem.position.y, gem.position.z),
        scale: rare ? Vector3.create(0.55, 0.9, 0.55) : Vector3.create(0.4, 0.65, 0.4),
        rotation: Quaternion.fromEulerDegrees(45, 0, 45)
      })
      MeshRenderer.setBox(entity)
      MeshCollider.setBox(entity) // required for the pointer raycast to hit the gem
      Material.setPbrMaterial(entity, {
        albedoColor: color,
        emissiveColor: color,
        emissiveIntensity: rare ? 3 : 2
      })

      const gemId = gem.gemId
      pointerEventsSystem.onPointerDown(
        {
          entity,
          opts: {
            button: InputAction.IA_POINTER,
            hoverText: rare ? `Rare gem! (+${gem.value})` : 'Collect (+1)',
            // Clickable from across the parcel — the server's COLLECT_RADIUS is
            // the real gate, so keep this at least as large as that.
            maxDistance: 25
          }
        },
        () => queueCollect(gemId)
      )
    }

    // Free client-side flair: spin. Purely local Transform writes — never synced.
    const transform = Transform.getMutable(entity)
    transform.rotation = Quaternion.multiply(transform.rotation, Quaternion.fromEulerDegrees(0, dt * 90, 0))
  }
}
