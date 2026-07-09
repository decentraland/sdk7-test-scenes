import { Billboard, Entity, engine, TextShape, Transform } from '@dcl/sdk/ecs'
import { Color3, Color4, Vector3 } from '@dcl/sdk/math'
import { createTargetMarker } from './markers'

/**
 * An entity number that will never be allocated by this small scene. Used as the demo
 * billboard's initial targetEntity, so it starts out pointing at an entity that "doesn't
 * exist yet" - exactly the scenario billboardMode/targetEntity docs describe as disabling
 * reorientation until the target exists.
 */
const NEVER_EXISTS_ENTITY = 65500 as Entity

const PRESENT_SECONDS = 3
const ABSENT_SECONDS = 3

/**
 * Wires up Station C: a billboard whose targetEntity alternates between a real, freshly
 * created entity (present) and a removed one (absent). While absent, the billboard keeps
 * its last orientation frozen; once a new target is created and assigned, tracking resumes.
 */
export function createLifecycleStation(billboardEntity: Entity, targetPosition: Vector3, color: Color4, statusPosition: Vector3) {
  Billboard.getMutable(billboardEntity).targetEntity = NEVER_EXISTS_ENTITY

  const status = engine.addEntity()
  Transform.create(status, { position: statusPosition })
  Billboard.create(status)
  TextShape.create(status, {
    text: 'target: ABSENT (not yet created)',
    fontSize: 1.5,
    textColor: Color4.create(1, 0.5, 0.3, 1),
    outlineWidth: 0.15,
    outlineColor: Color3.create(0, 0, 0)
  })

  let currentTarget: Entity | null = null
  let elapsed = 0
  let present = false

  function setStatus(text: string, textColor: Color4) {
    const mutableText = TextShape.getMutable(status)
    mutableText.text = text
    mutableText.textColor = textColor
  }

  function spawnTarget() {
    currentTarget = createTargetMarker(targetPosition, color)
    Billboard.getMutable(billboardEntity).targetEntity = currentTarget
    setStatus('target: ACTIVE (tracking)', Color4.create(0.4, 1, 0.4, 1))
  }

  function despawnTarget() {
    if (currentTarget !== null) {
      engine.removeEntity(currentTarget)
      currentTarget = null
    }
    // Deliberately do NOT change billboardEntity's targetEntity here: it keeps referencing
    // the now-removed entity id, so the billboard freezes at its last orientation.
    setStatus('target: ABSENT (removed - billboard frozen)', Color4.create(1, 0.5, 0.3, 1))
  }

  return function update(dt: number) {
    elapsed += dt
    if (!present && elapsed >= ABSENT_SECONDS) {
      elapsed = 0
      present = true
      spawnTarget()
    } else if (present && elapsed >= PRESENT_SECONDS) {
      elapsed = 0
      present = false
      despawnTarget()
    }
  }
}
