import { Vector3, Color4 } from '@dcl/sdk/math'
import { engine, Entity, Transform, MeshRenderer, Material, VisibilityComponent } from '@dcl/sdk/ecs'

export function main() {
  // NO VisibilityComponent
  const parent1 = createEntity(Vector3.create(2, 3, 8))
    // NO VisibilityComponent
    const childA = createEntity(Vector3.create(0.5, -1, 0), parent1)
      // NO VisibilityComponent
      const grandChildA = createEntity(Vector3.create(0.5, -1, 0), childA)
    // VisibilityComponent: visible FALSE | Propagate TRUE
    const childB = createEntity(Vector3.create(1, -1, 0), parent1)
    VisibilityComponent.create(childB, { visible: false, propagateToChildren: true })
    // NO VisibilityComponent
    const childC = createEntity(Vector3.create(1.5, -1, 0), parent1)
      // VisibilityComponent: visible FALSE | Propagate TRUE
      const grandChildC = createEntity(Vector3.create(0.5, -1, 0), childC)
      VisibilityComponent.create(grandChildC, { visible: false, propagateToChildren: true })
      // NO VisibilityComponent
      const grandGrandChildC = createEntity(Vector3.create(0.5, -1, 0), grandChildC)
  
  // VisibilityComponent: visible FALSE | Propagate FALSE
  const parent2 = createEntity(Vector3.create(6, 3, 8))
  VisibilityComponent.create(parent2, { visible: false, propagateToChildren: false })

  // VisibilityComponent: visible TRUE
  const parent3 = createEntity(Vector3.create(10, 3, 8))
  VisibilityComponent.create(parent3, { visible: true, propagateToChildren: true })
}

function createEntity(position: Vector3, parentEntity : Entity | undefined = undefined) : Entity {
  const entity = engine.addEntity()
  
  Transform.create(entity, {
    position,
    scale: parentEntity ? Vector3.scale(Transform.get(parentEntity).scale, 0.5) : Vector3.One(),
    parent: parentEntity
  })
  MeshRenderer.setBox(entity)
  Material.setBasicMaterial(entity, {
    diffuseColor: Color4.fromHexString(getRandomHexColor())
  })
  
  return entity
}

function getRandomHexColor(): string {
  const letters = "0123456789ABCDEF";
  let color = "#";
  for (let i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)];
  }
  return color;
}
