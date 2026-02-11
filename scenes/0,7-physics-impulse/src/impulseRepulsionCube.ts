import {
    engine,
    ColliderLayer,
    Material,
    MeshCollider,
    MeshRenderer,
    Transform,
    TextShape,
    TriggerArea,
    triggerAreaEventsSystem,
    PhysicsImpulse
} from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'

const TRIGGER_THICKNESS = 0.3
const IMPULSE_STRENGTH = 15

interface FaceTrigger {
    offset: Vector3
    size: Vector3
    direction: Vector3
    color: Color4
}

/**
 * A solid cube with thin trigger zones on each face.
 * Each trigger pushes the player away along the face normal.
 * 4 horizontal sides + 1 top (jump-pad).
 */
export function setupRepulsionCube(position: Vector3, cubeSize: number = 2) {
    const half = cubeSize / 2
    const triggerOffset = half + TRIGGER_THICKNESS / 2

    // Solid cube
    const cube = engine.addEntity()
    Transform.create(cube, {
        position: Vector3.create(position.x, position.y + half, position.z),
        scale: Vector3.create(cubeSize, cubeSize, cubeSize)
    })
    MeshRenderer.setBox(cube)
    MeshCollider.setBox(cube)
    Material.setPbrMaterial(cube, {
        albedoColor: Color4.create(0.6, 0.6, 0.6, 1)
    })

    // Label
    const label = engine.addEntity()
    Transform.create(label, {
        position: Vector3.create(position.x, position.y + cubeSize + 1, position.z)
    })
    TextShape.create(label, {
        text: 'Repulsion cube\n(push from each face)',
        fontSize: 2
    })

    const cubeCenter = Vector3.create(position.x, position.y + half, position.z)

    // Define 5 face triggers: 4 horizontal + 1 top
    const faces: FaceTrigger[] = [
        {   // X+ (right)
            offset: Vector3.create(triggerOffset, 0, 0),
            size: Vector3.create(TRIGGER_THICKNESS, cubeSize, cubeSize),
            direction: Vector3.create(IMPULSE_STRENGTH, 0, 0),
            color: Color4.create(1, 0.3, 0.3, 0.4)
        },
        {   // X- (left)
            offset: Vector3.create(-triggerOffset, 0, 0),
            size: Vector3.create(TRIGGER_THICKNESS, cubeSize, cubeSize),
            direction: Vector3.create(-IMPULSE_STRENGTH, 0, 0),
            color: Color4.create(0.3, 0.3, 1, 0.4)
        },
        {   // Z+ (forward)
            offset: Vector3.create(0, 0, triggerOffset),
            size: Vector3.create(cubeSize, cubeSize, TRIGGER_THICKNESS),
            direction: Vector3.create(0, 0, IMPULSE_STRENGTH),
            color: Color4.create(1, 0.3, 0.3, 0.4)
        },
        {   // Z- (back)
            offset: Vector3.create(0, 0, -triggerOffset),
            size: Vector3.create(cubeSize, cubeSize, TRIGGER_THICKNESS),
            direction: Vector3.create(0, 0, -IMPULSE_STRENGTH),
            color: Color4.create(0.3, 0.3, 1, 0.4)
        },
        {   // Y+ (top — jump pad)
            offset: Vector3.create(0, triggerOffset, 0),
            size: Vector3.create(cubeSize, TRIGGER_THICKNESS, cubeSize),
            direction: Vector3.create(0, IMPULSE_STRENGTH, 0),
            color: Color4.create(0.3, 1, 0.3, 0.4)
        }
    ]

    for (const face of faces) {
        createFaceTrigger(cubeCenter, face)
    }
}

function createFaceTrigger(cubeCenter: Vector3, face: FaceTrigger) {
    let localTimestamp = 0

    const trigger = engine.addEntity()
    Transform.create(trigger, {
        position: Vector3.create(
            cubeCenter.x + face.offset.x,
            cubeCenter.y + face.offset.y,
            cubeCenter.z + face.offset.z
        ),
        scale: face.size
    })
    MeshRenderer.setBox(trigger)
    Material.setPbrMaterial(trigger, { albedoColor: face.color })
    TriggerArea.setBox(trigger, ColliderLayer.CL_PLAYER)

    triggerAreaEventsSystem.onTriggerEnter(trigger, () => {
        localTimestamp++
        PhysicsImpulse.createOrReplace(engine.PlayerEntity, {
            direction: face.direction,
            timestamp: localTimestamp
        })
        Material.setPbrMaterial(trigger, {
            albedoColor: Color4.create(1, 1, 1, 0.5)
        })
    })

    triggerAreaEventsSystem.onTriggerExit(trigger, () => {
        Material.setPbrMaterial(trigger, { albedoColor: face.color })
    })
}
