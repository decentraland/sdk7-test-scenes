import {
    engine,
    ColliderLayer,
    Material,
    MeshRenderer,
    Transform,
    TextShape,
    TriggerArea,
    triggerAreaEventsSystem,
    PhysicsForce,
    PhysicsImpulse
} from '@dcl/sdk/ecs'
import { Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { showTunnelPanel, hideTunnelPanel, getHorizontalMag, getVerticalMag } from './configUi'

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

const FORCE_COLOR = Color4.create(0.1, 0.4, 0.8, 0.25)
const FORCE_ACTIVE = Color4.create(0.2, 0.7, 1, 0.3)
const IMPULSE_COLOR = Color4.create(0.8, 0.15, 0.1, 0.25)
const IMPULSE_ACTIVE = Color4.create(1, 0.3, 0.2, 0.3)

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

/**
 * Creates 4 tunnels (Force+Impulse horizontal, Force+Impulse vertical)
 * with a surrounding trigger zone that opens the magnitude UI.
 */
export function setupConfigurableTunnels() {
    const facingBack = Quaternion.fromEulerDegrees(0, 180, 0)

    // Left = Impulse (red), Right = Force (blue)

    // --- Horizontal Impulse tunnel (Z+) ---
    createImpulseTunnel(
        Vector3.create(-10, 1.5, 8), Vector3.create(2, 3, 12),
        () => Vector3.create(0, 0, getHorizontalMag()),
        'Impulse forward', facingBack
    )

    // --- Horizontal Force tunnel (Z+) ---
    createForceTunnel(
        Vector3.create(-6, 1.5, 8), Vector3.create(2, 3, 12),
        () => Vector3.create(0, 0, getHorizontalMag()),
        'Force forward', facingBack
    )

    // --- Vertical Impulse tunnel (Y+) ---
    createImpulseTunnel(
        Vector3.create(-10, 5, 2), Vector3.create(2, 10, 2),
        () => Vector3.create(0, getVerticalMag(), 0),
        'Impulse up', facingBack
    )

    // --- Vertical Force tunnel (Y+) ---
    createForceTunnel(
        Vector3.create(-6, 5, 2), Vector3.create(2, 10, 2),
        () => Vector3.create(0, getVerticalMag(), 0),
        'Force up', facingBack
    )

    // --- Invisible trigger zone around all tunnels — shows/hides UI ---
    const zone = engine.addEntity()
    Transform.create(zone, {
        position: Vector3.create(-8, 3, 6),
        scale: Vector3.create(12, 8, 14)
    })
    TriggerArea.setBox(zone, ColliderLayer.CL_PLAYER)

    triggerAreaEventsSystem.onTriggerEnter(zone, () => {
        showTunnelPanel()
    })

    triggerAreaEventsSystem.onTriggerExit(zone, () => {
        hideTunnelPanel()
        if (PhysicsForce.getOrNull(engine.PlayerEntity)) {
            PhysicsForce.deleteFrom(engine.PlayerEntity)
        }
    })
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function createForceTunnel(
    position: Vector3, size: Vector3,
    getDirection: () => Vector3, label: string,
    labelRotation: { x: number; y: number; z: number; w: number }
) {
    const tunnel = engine.addEntity()
    Transform.create(tunnel, { position, scale: size })
    MeshRenderer.setBox(tunnel)
    Material.setPbrMaterial(tunnel, { albedoColor: FORCE_COLOR })
    TriggerArea.setBox(tunnel, ColliderLayer.CL_PLAYER)

    const labelEntity = engine.addEntity()
    Transform.create(labelEntity, {
        position: Vector3.create(position.x, position.y + size.y / 2 + 0.5, position.z - size.z / 2),
        rotation: labelRotation
    })
    TextShape.create(labelEntity, { text: label, fontSize: 2 })

    triggerAreaEventsSystem.onTriggerEnter(tunnel, () => {
        PhysicsForce.createOrReplace(engine.PlayerEntity, { direction: getDirection() })
        Material.setPbrMaterial(tunnel, { albedoColor: FORCE_ACTIVE })
    })

    triggerAreaEventsSystem.onTriggerExit(tunnel, () => {
        PhysicsForce.deleteFrom(engine.PlayerEntity)
        Material.setPbrMaterial(tunnel, { albedoColor: FORCE_COLOR })
    })
}

function createImpulseTunnel(
    position: Vector3, size: Vector3,
    getDirection: () => Vector3, label: string,
    labelRotation: { x: number; y: number; z: number; w: number }
) {
    let ts = 0

    const tunnel = engine.addEntity()
    Transform.create(tunnel, { position, scale: size })
    MeshRenderer.setBox(tunnel)
    Material.setPbrMaterial(tunnel, { albedoColor: IMPULSE_COLOR })
    TriggerArea.setBox(tunnel, ColliderLayer.CL_PLAYER)

    const labelEntity = engine.addEntity()
    Transform.create(labelEntity, {
        position: Vector3.create(position.x, position.y + size.y / 2 + 0.5, position.z - size.z / 2),
        rotation: labelRotation
    })
    TextShape.create(labelEntity, { text: label, fontSize: 2 })

    triggerAreaEventsSystem.onTriggerStay(tunnel, () => {
        ts++
        PhysicsImpulse.createOrReplace(engine.PlayerEntity, {
            direction: getDirection(),
            timestamp: ts
        })
    })

    triggerAreaEventsSystem.onTriggerEnter(tunnel, () => {
        Material.setPbrMaterial(tunnel, { albedoColor: IMPULSE_ACTIVE })
    })

    triggerAreaEventsSystem.onTriggerExit(tunnel, () => {
        Material.setPbrMaterial(tunnel, { albedoColor: IMPULSE_COLOR })
    })
}
