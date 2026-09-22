import {
  engine,
  Transform,
  inputSystem,
  PointerEvents,
  InputAction,
  PointerEventType,
  Material,
} from '@dcl/sdk/ecs'
import { Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { Cube, Spinner } from './components'
import { getRandomHexColor } from './utils'


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
export function changeColorSystem() {
  for (const [entity] of engine.getEntitiesWith(Cube, PointerEvents)) {
    if (inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_DOWN, entity)) {
      Material.setPbrMaterial(entity, { albedoColor: Color4.fromHexString(getRandomHexColor()) })
    }
  }
}

/**
 * Regression coverage for unity-explorer#10207: Unity never cleared `flex-basis` when the
 * SDK stopped sending it, so a pooled VisualElement kept a stale basis from a previous
 * entity. This system flips a shared boolean every ~2 seconds; `ui.tsx` uses it to alternate
 * a `flexBasis` prop on and off so a reviewer can watch it oscillate (fixed) or stick
 * (broken).
 */
let flexBasisElapsedSeconds = 0
let flexBasisToggleOn = true

export function flexBasisToggleSystem(dt: number) {
  flexBasisElapsedSeconds += dt
  if (flexBasisElapsedSeconds >= 2) {
    flexBasisElapsedSeconds = 0
    flexBasisToggleOn = !flexBasisToggleOn
  }
}

export function isFlexBasisOn(): boolean {
  return flexBasisToggleOn
}
