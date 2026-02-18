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
    PhysicsImpulse,
    Tween,
    TweenSequence,
    TweenLoop,
    EasingFunction,
    Entity
} from '@dcl/sdk/ecs'
import { Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { rotateVectorByQuaternion } from './utils'
import { getPendulumMag } from './configUi'

// Bridge layout
const BRIDGE_X = 24
const BRIDGE_Z_START = 2
const BRIDGE_Z_END = 14
const BRIDGE_Y = 1
const BRIDGE_WIDTH = 1.5

// Pendulum geometry
const ARM_LENGTH = 4           // longer rod
const HAMMER_SIZE = 1.2
const HAMMER_DEPTH = 0.5
const ROD_THICKNESS = 0.1
const TRIGGER_THICKNESS = 0.2
const SWING_ANGLE = 60         // wider swing

/**
 * A narrow bridge with rotating hammer pendulums that knock the player off.
 */
export function setupPendulumBridge() {
    const bridgeLength = BRIDGE_Z_END - BRIDGE_Z_START

    // --- Bridge platform ---
    const bridge = engine.addEntity()
    Transform.create(bridge, {
        position: Vector3.create(BRIDGE_X, BRIDGE_Y, (BRIDGE_Z_START + BRIDGE_Z_END) / 2),
        scale: Vector3.create(BRIDGE_WIDTH, 0.2, bridgeLength)
    })
    MeshRenderer.setBox(bridge)
    MeshCollider.setBox(bridge)
    Material.setPbrMaterial(bridge, {
        albedoColor: Color4.create(0.4, 0.35, 0.3, 1)
    })

    // --- Label ---
    const label = engine.addEntity()
    Transform.create(label, {
        position: Vector3.create(BRIDGE_X, BRIDGE_Y + 3, BRIDGE_Z_START - 1)
    })
    TextShape.create(label, {
        text: 'Pendulum bridge\n(don\'t get knocked off!)',
        fontSize: 2
    })

    // --- Pendulums ---
    const pendulumCount = 4
    const spacing = bridgeLength / (pendulumCount + 1)

    for (let i = 0; i < pendulumCount; i++) {
        const z = BRIDGE_Z_START + spacing * (i + 1)
        const startsLeft = i % 2 === 0
        const duration = 2000 + i * 300
        createPendulum(z, startsLeft, duration)
    }
}

function createPendulum(z: number, startsLeft: boolean, duration: number) {
    let leftTimestamp = 0
    let rightTimestamp = 0

    const pivotY = BRIDGE_Y + ARM_LENGTH + HAMMER_SIZE / 2 + 0.3
    const pivot = engine.addEntity()
    Transform.create(pivot, {
        position: Vector3.create(BRIDGE_X, pivotY, z)
    })

    const startAngle = startsLeft ? -SWING_ANGLE : SWING_ANGLE
    const endAngle = startsLeft ? SWING_ANGLE : -SWING_ANGLE

    Tween.create(pivot, {
        mode: Tween.Mode.Rotate({
            start: Quaternion.fromEulerDegrees(0, 0, startAngle),
            end: Quaternion.fromEulerDegrees(0, 0, endAngle)
        }),
        duration,
        easingFunction: EasingFunction.EF_EASEOUTSINE
    })
    TweenSequence.create(pivot, { sequence: [], loop: TweenLoop.TL_YOYO })

    // --- Rod ---
    const rod = engine.addEntity()
    Transform.create(rod, {
        parent: pivot,
        position: Vector3.create(0, -ARM_LENGTH / 2, 0),
        scale: Vector3.create(ROD_THICKNESS, ARM_LENGTH, ROD_THICKNESS)
    })
    MeshRenderer.setBox(rod)
    Material.setPbrMaterial(rod, {
        albedoColor: Color4.create(0.5, 0.5, 0.5, 1)
    })

    // --- Hammer ---
    const hammer = engine.addEntity()
    Transform.create(hammer, {
        parent: pivot,
        position: Vector3.create(0, -ARM_LENGTH, 0),
        scale: Vector3.create(HAMMER_SIZE, HAMMER_SIZE, HAMMER_DEPTH)
    })
    MeshRenderer.setBox(hammer)
    MeshCollider.setBox(hammer)
    Material.setPbrMaterial(hammer, {
        albedoColor: Color4.create(0.9, 0.15, 0.15, 0.9)
    })

    // --- Trigger faces ---
    const triggerOffsetX = HAMMER_SIZE / 2 + TRIGGER_THICKNESS / 2

    // Local normals for each face (in pivot-local space)
    const LEFT_LOCAL_NORMAL = Vector3.create(-1, 0, 0)
    const RIGHT_LOCAL_NORMAL = Vector3.create(1, 0, 0)

    createTriggerFace(pivot, Vector3.create(-triggerOffsetX, -ARM_LENGTH, 0), LEFT_LOCAL_NORMAL,
        Color4.create(0.3, 0.3, 1, 0.4), () => leftTimestamp++)

    createTriggerFace(pivot, Vector3.create(triggerOffsetX, -ARM_LENGTH, 0), RIGHT_LOCAL_NORMAL,
        Color4.create(1, 0.3, 0.3, 0.4), () => rightTimestamp++)
}

/**
 * Creates a thin trigger on a face of the hammer.
 * On contact, reads the pivot's current rotation and applies impulse
 * along the world-space normal of that face.
 */
function createTriggerFace(
    pivot: Entity,
    localPosition: Vector3,
    localNormal: Vector3,
    color: Color4,
    incrementTimestamp: () => number
) {
    const trigger = engine.addEntity()
    Transform.create(trigger, {
        parent: pivot,
        position: localPosition,
        scale: Vector3.create(TRIGGER_THICKNESS, HAMMER_SIZE, HAMMER_DEPTH)
    })
    MeshRenderer.setBox(trigger)
    Material.setPbrMaterial(trigger, { albedoColor: color })
    TriggerArea.setBox(trigger, ColliderLayer.CL_PLAYER)

    triggerAreaEventsSystem.onTriggerEnter(trigger, () => {
        const ts = incrementTimestamp()

        // Read the pivot's current rotation and transform the local normal to world space
        const pivotRotation = Transform.get(pivot).rotation
        const worldNormal = rotateVectorByQuaternion(localNormal, pivotRotation)
        const mag = getPendulumMag()

        PhysicsImpulse.createOrReplace(engine.PlayerEntity, {
            direction: Vector3.create(
                worldNormal.x * mag,
                worldNormal.y * mag,
                worldNormal.z * mag
            ),
            timestamp: ts
        })
    })
}
