import { Vector3, Color4 } from '@dcl/sdk/math'
import { engine, Entity, Transform, MeshRenderer, Material, VisibilityComponent, pointerEventsSystem, InputAction, MeshCollider } from '@dcl/sdk/ecs'

let selectedEntity : Entity | undefined

export function main() {
  const parent1 = createEntity('Parent1 (Normal)', Vector3.create(2, 5, 8))
  const parent1Child = createEntity('Parent1Child (Invisible, NoPropagation)', Vector3.One(), parent1, true)
  VisibilityComponent.create(parent1Child, { visible: false, propagateToChildren: false })
  const parent1GrandChild = createEntity('Parent1GrandChild (Normal)', Vector3.One(), parent1Child, true)

  const parent2 = createEntity('Parent2 (Normal)', Vector3.create(3.5, 5, 8))
  const parent2Child = createEntity('Parent2Child (Invisible, Propagation)', Vector3.One(), parent2, true)
  VisibilityComponent.create(parent2Child, { visible: false, propagateToChildren: true })
  const parent2GrandChild = createEntity('Parent2GrandChild (Normal)', Vector3.One(), parent2Child, true)

  const parent3 = createEntity('Parent3 (Invisible, Propagation)', Vector3.create(5, 5, 8))
  VisibilityComponent.create(parent3, { visible: false, propagateToChildren: true })
  const parent3Child = createEntity('Parent3Child (Visible, NoPropagation)', Vector3.One(), parent3, true)
  VisibilityComponent.create(parent3Child, { visible: true, propagateToChildren: false })
  const parent3GrandChild = createEntity('Parent3GrandChild (Normal)', Vector3.One(), parent3Child, true)

  const parent4 = createEntity('Parent4 (Invisible, Propagation)', Vector3.create(6.5, 5, 8))
  VisibilityComponent.create(parent4, { visible: false, propagateToChildren: true })
  const parent4Child = createEntity('Parent4Child (Visible, Propagation)', Vector3.One(), parent4, true)
  VisibilityComponent.create(parent4Child, { visible: true, propagateToChildren: true })
  const parent4GrandChild = createEntity('Parent4GrandChild (Normal)', Vector3.One(), parent4Child, true)

  const parent5 = createEntity('Parent5 (Normal)', Vector3.create(8, 5, 8))
  const parent5Child = createEntity('Parent5Child (Normal)', Vector3.One(), parent5, true)
}

function createEntity(name: string, position: Vector3, parentEntity : Entity | undefined = undefined, canBeReparented: boolean = false) : Entity {
  const entity = engine.addEntity()
  
  Transform.create(entity, {position})
  MeshRenderer.setBox(entity)
  MeshCollider.setBox(entity)
  Material.setBasicMaterial(entity, {
    diffuseColor: Color4.fromHexString(getRandomHexColor())
  })
  
  if (parentEntity) {
    ReparentEntity(entity, parentEntity)
  }
  
  pointerEventsSystem.onPointerDown(
      { entity: entity, opts: { button: InputAction.IA_POINTER, hoverText: name, showHighlight: true } },
      () => {
        if (selectedEntity && selectedEntity !== entity) {
          ReparentEntity(selectedEntity, entity)
          selectedEntity = undefined
        } else if (canBeReparented) {
          selectedEntity = entity
        }
      }
  )
  
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

function ReparentEntity(target: Entity, newParent: Entity) {
  const entityTransform = Transform.getMutable(target)
  entityTransform.parent = newParent
  entityTransform.scale = Vector3.create(0.75, 0.75, 0.75)
  // entityTransform.position = Vector3.create(0.5, -1, 0)
  entityTransform.position = Vector3.create(0, -1, 0)
}
