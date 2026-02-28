import {
    engine,
    ColliderLayer,
    InputAction,
    Material,
    MeshCollider,
    MeshRenderer,
    Physics,
    TextShape,
    Transform,
    pointerEventsSystem
} from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'

const ARENA_CENTER = Vector3.create(40, 0, 24)
const ARENA_RADIUS = 6

const ANCHOR_HEIGHT = 3.5
const ANCHOR_RING_RADIUS = 4.8
const ANCHOR_COOLDOWN_SEC = 0.35

const GRAPPLE_MAGNITUDE = 14
const GRAPPLE_RADIUS = 36

const ANCHOR_IDLE_COLOR = Color4.create(0.25, 0.8, 1, 1)
const ANCHOR_ACTIVE_COLOR = Color4.create(1, 0.9, 0.2, 1)

/**
 * "Grapple anchors" playground:
 * player can click floating anchors to pull toward them using negative knockback.
 */
export function setupKnockbackGrappleAnchors() {
    // Arena floor
    const floor = engine.addEntity()
    Transform.create(floor, {
        position: Vector3.create(ARENA_CENTER.x, 0.15, ARENA_CENTER.z),
        scale: Vector3.create(ARENA_RADIUS * 2, 0.3, ARENA_RADIUS * 2)
    })
    MeshRenderer.setCylinder(floor)
    MeshCollider.setCylinder(floor, ColliderLayer.CL_PHYSICS)
    Material.setPbrMaterial(floor, { albedoColor: Color4.create(0.12, 0.14, 0.2, 1) })

    // Central pole for visual grounding
    const pole = engine.addEntity()
    Transform.create(pole, {
        position: Vector3.create(ARENA_CENTER.x, ANCHOR_HEIGHT / 2, ARENA_CENTER.z),
        scale: Vector3.create(0.35, ANCHOR_HEIGHT, 0.35)
    })
    MeshRenderer.setCylinder(pole)
    Material.setPbrMaterial(pole, { albedoColor: Color4.create(0.45, 0.45, 0.52, 1) })

    // Label
    const label = engine.addEntity()
    Transform.create(label, {
        position: Vector3.create(ARENA_CENTER.x, ANCHOR_HEIGHT + 1.8, ARENA_CENTER.z)
    })
    TextShape.create(label, {
        text: 'Grapple Anchors\n(click anchor to pull yourself)',
        fontSize: 2
    })

    const anchors: Vector3[] = []
    for (let i = 0; i < 5; i++) {
        const angle = (Math.PI * 2 * i) / 5
        anchors.push(
            Vector3.create(
                ARENA_CENTER.x + Math.cos(angle) * ANCHOR_RING_RADIUS,
                ANCHOR_HEIGHT,
                ARENA_CENTER.z + Math.sin(angle) * ANCHOR_RING_RADIUS
            )
        )
    }
    anchors.push(Vector3.create(ARENA_CENTER.x, ANCHOR_HEIGHT + 1.1, ARENA_CENTER.z))

    for (const pos of anchors) {
        createAnchor(pos)
    }
}

function createAnchor(position: Vector3) {
    // Cable from anchor to floor
    const cable = engine.addEntity()
    Transform.create(cable, {
        position: Vector3.create(position.x, position.y / 2, position.z),
        scale: Vector3.create(0.08, position.y, 0.08)
    })
    MeshRenderer.setCylinder(cable)
    Material.setPbrMaterial(cable, { albedoColor: Color4.create(0.6, 0.6, 0.65, 0.95) })

    const anchor = engine.addEntity()
    Transform.create(anchor, {
        position,
        scale: Vector3.create(2, 2, 2)
    })
    MeshRenderer.setSphere(anchor)
    MeshCollider.setSphere(anchor, ColliderLayer.CL_POINTER)
    Material.setPbrMaterial(anchor, { albedoColor: ANCHOR_IDLE_COLOR })

    let cooldownUntilSec = 0
    let activeUntilSec = 0

    pointerEventsSystem.onPointerDown(
        {
            entity: anchor,
            opts: {
                button: InputAction.IA_POINTER,
                hoverText: 'Grapple pull',
                maxDistance: 20
            }
        },
        () => {
            const nowSec = Date.now() / 1000
            if (nowSec < cooldownUntilSec) return

            cooldownUntilSec = nowSec + ANCHOR_COOLDOWN_SEC
            activeUntilSec = nowSec + 0.12
            Material.setPbrMaterial(anchor, { albedoColor: ANCHOR_ACTIVE_COLOR })

            Physics.applyKnockbackToPlayer(position, -GRAPPLE_MAGNITUDE, GRAPPLE_RADIUS)
        }
    )

    engine.addSystem(() => {
        if (activeUntilSec === 0) return
        if (Date.now() / 1000 < activeUntilSec) return
        activeUntilSec = 0
        Material.setPbrMaterial(anchor, { albedoColor: ANCHOR_IDLE_COLOR })
    })
}
