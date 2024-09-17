import {
  engine,
  Transform,
  inputSystem,
  PointerEvents,
  InputAction,
  PointerEventType,
} from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'
import { Cube, Spinner } from './components'
import { movePlayerTo } from '~system/RestrictedActions'


/**
 * All cubes rotating behavior
 */
export function circularSystem(dt: number) {
  const entitiesWithSpinner = engine.getEntitiesWith(Spinner, Transform)
  for (const [entity, _spinner, _transform] of entitiesWithSpinner) {
    const mutableTransform = Transform.getMutable(entity)
    const spinnerData = Spinner.get(entity)

    mutableTransform.rotation = Quaternion.multiply(
      mutableTransform.rotation,
      Quaternion.fromAngleAxis(dt * spinnerData.speed, Vector3.Up())
    )
  }
}

/**
 * Search for the cubes that has pointerEvents, and when there is a click change the color.
 */
export function movePlayerSystem() {
  for (const [entity] of engine.getEntitiesWith(Cube, PointerEvents)) {
    if (inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_DOWN, entity)) {

      let position = Transform.get(entity).position;
      movePlayerTo({ newRelativePosition:  position});   
    }
  }
}
