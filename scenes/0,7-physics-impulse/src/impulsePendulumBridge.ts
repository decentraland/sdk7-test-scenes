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
    EasingFunction
} from '@dcl/sdk/ecs'
import { Color4, Quaternion, Vector3 } from '@dcl/sdk/math'

// Bridge layout
const BRIDGE_X = 24
const BRIDGE_Z_START = 2
const BRIDGE_Z_END = 14
const BRIDGE_Y = 1
const BRIDGE_WIDTH = 1.5

// Pendulum geometry
const ARM_LENGTH = 2.5         // rod length from pivot to hammer center
const HAMMER_SIZE = 1.2        // hammer cube side
const HAMMER_DEPTH = 0.5       // hammer thickness along bridge (Z)
const ROD_THICKNESS = 0.1
const TRIGGER_THICKNESS = 0.2  // thin trigger on each side of hammer
const SWING_ANGLE = 40         // degrees each way from vertical
const PUSH_STRENGTH = 18

/**
 * A narrow bridge with rotating hammer pendulums that knock the player off.
 * Each hammer is a rod+cube assembly rotating around a pivot above the bridge.
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
        const duration = 2000 + i * 300  // slightly different speeds
        createPendulum(z, startsLeft, duration)
    }
}

function createPendulum(z: number, startsLeft: boolean, duration: number) {
    let leftTimestamp = 0
    let rightTimestamp = 0

    // Pivot above the bridge — this is the rotation center
    const pivotY = BRIDGE_Y + ARM_LENGTH + HAMMER_SIZE / 2 + 0.3
    const pivot = engine.addEntity()
    Transform.create(pivot, {
        position: Vector3.create(BRIDGE_X, pivotY, z)
    })

    // Swing rotation around Z axis (pendulum plane is XY, perpendicular to bridge)
    const startAngle = startsLeft ? -SWING_ANGLE : SWING_ANGLE
    const endAngle = startsLeft ? SWING_ANGLE : -SWING_ANGLE

    Tween.create(pivot, {
        mode: Tween.Mode.Rotate({
            start: Quaternion.fromEulerDegrees(0, 0, startAngle),
            end: Quaternion.fromEulerDegrees(0, 0, endAngle)
        }),
        duration,
        easingFunction: EasingFunction.EF_EASEINOUTSINE
    })
    TweenSequence.create(pivot, { sequence: [], loop: TweenLoop.TL_YOYO })

    // --- Rod (thin stick from pivot down to hammer) ---
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

    // --- Hammer cube (at the bottom of the rod) ---
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

    // --- Trigger on left side (X-) of hammer → pushes LEFT ---
    const triggerOffsetX = HAMMER_SIZE / 2 + TRIGGER_THICKNESS / 2
    const leftTrigger = engine.addEntity()
    Transform.create(leftTrigger, {
        parent: pivot,
        position: Vector3.create(-triggerOffsetX, -ARM_LENGTH, 0),
        scale: Vector3.create(TRIGGER_THICKNESS, HAMMER_SIZE, HAMMER_DEPTH)
    })
    MeshRenderer.setBox(leftTrigger)
    Material.setPbrMaterial(leftTrigger, {
        albedoColor: Color4.create(0.3, 0.3, 1, 0.4)
    })
    TriggerArea.setBox(leftTrigger, ColliderLayer.CL_PLAYER)

    triggerAreaEventsSystem.onTriggerEnter(leftTrigger, () => {
        leftTimestamp++
        PhysicsImpulse.createOrReplace(engine.PlayerEntity, {
            direction: Vector3.create(-PUSH_STRENGTH, 3, 0),
            timestamp: leftTimestamp
        })
    })

    // --- Trigger on right side (X+) of hammer → pushes RIGHT ---
    const rightTrigger = engine.addEntity()
    Transform.create(rightTrigger, {
        parent: pivot,
        position: Vector3.create(triggerOffsetX, -ARM_LENGTH, 0),
        scale: Vector3.create(TRIGGER_THICKNESS, HAMMER_SIZE, HAMMER_DEPTH)
    })
    MeshRenderer.setBox(rightTrigger)
    Material.setPbrMaterial(rightTrigger, {
        albedoColor: Color4.create(1, 0.3, 0.3, 0.4)
    })
    TriggerArea.setBox(rightTrigger, ColliderLayer.CL_PLAYER)

    triggerAreaEventsSystem.onTriggerEnter(rightTrigger, () => {
        rightTimestamp++
        PhysicsImpulse.createOrReplace(engine.PlayerEntity, {
            direction: Vector3.create(PUSH_STRENGTH, 3, 0),
            timestamp: rightTimestamp
        })
    })
}
