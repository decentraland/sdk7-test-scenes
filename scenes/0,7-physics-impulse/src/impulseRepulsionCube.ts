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
    Physics
} from '@dcl/sdk/ecs'
import { Color4, Quaternion, Vector3 } from '@dcl/sdk/math'

const TRIGGER_THICKNESS = 0.3
const REPULSION_MAGNITUDE = 20

interface FaceDef {
    offset: Vector3
    size: Vector3
    normal: Vector3
    color: Color4
}

const LABEL_ROT = Quaternion.fromEulerDegrees(0, 180, 0)

export function setupRepulsionCube(position: Vector3, cubeSize: number = 2) {
    const half = cubeSize / 2
    const triggerOffset = half + TRIGGER_THICKNESS / 2

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

    const label = engine.addEntity()
    Transform.create(label, {
        position: Vector3.create(position.x, position.y + cubeSize + 1, position.z),
        rotation: LABEL_ROT
    })
    TextShape.create(label, {
        text: `Repulsion cube\n(magnitude=${REPULSION_MAGNITUDE})`,
        fontSize: 2
    })

    const cubeCenter = Vector3.create(position.x, position.y + half, position.z)

    const faces: FaceDef[] = [
        {
            offset: Vector3.create(triggerOffset, 0, 0),
            size: Vector3.create(TRIGGER_THICKNESS, cubeSize, cubeSize),
            normal: Vector3.create(1, 0, 0),
            color: Color4.create(1, 0.3, 0.3, 0.4)
        },
        {
            offset: Vector3.create(-triggerOffset, 0, 0),
            size: Vector3.create(TRIGGER_THICKNESS, cubeSize, cubeSize),
            normal: Vector3.create(-1, 0, 0),
            color: Color4.create(0.3, 0.3, 1, 0.4)
        },
        {
            offset: Vector3.create(0, 0, triggerOffset),
            size: Vector3.create(cubeSize, cubeSize, TRIGGER_THICKNESS),
            normal: Vector3.create(0, 0, 1),
            color: Color4.create(1, 0.3, 0.3, 0.4)
        },
        {
            offset: Vector3.create(0, 0, -triggerOffset),
            size: Vector3.create(cubeSize, cubeSize, TRIGGER_THICKNESS),
            normal: Vector3.create(0, 0, -1),
            color: Color4.create(0.3, 0.3, 1, 0.4)
        },
        {
            offset: Vector3.create(0, triggerOffset, 0),
            size: Vector3.create(cubeSize, TRIGGER_THICKNESS, cubeSize),
            normal: Vector3.create(0, 1, 0),
            color: Color4.create(0.3, 1, 0.3, 0.4)
        }
    ]

    for (const face of faces) {
        createFaceTrigger(cubeCenter, face)
    }
}

function createFaceTrigger(cubeCenter: Vector3, face: FaceDef) {
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

    triggerAreaEventsSystem.onTriggerEnter(trigger, (result) => {
        if (result.trigger?.entity !== engine.PlayerEntity) return;
        Physics.applyImpulseToPlayer(face.normal, REPULSION_MAGNITUDE)
    })
}
