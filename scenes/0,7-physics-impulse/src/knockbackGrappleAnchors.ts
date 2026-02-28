import {
    engine,
    Entity,
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

const ANCHOR_COOLDOWN_SEC = 0.35

const GRAPPLE_MAGNITUDE = 14
const GRAPPLE_RADIUS = 36

const ANCHOR_SCALE = 2
const ANCHOR_ACTIVE_COLOR = Color4.create(1, 0.9, 0.2, 1)

const FIELD_COUNT = 80
const FIELD_MIN_X = 33
const FIELD_MAX_X = 63
const FIELD_MIN_Z = 17
const FIELD_MAX_Z = 63
const FIELD_MIN_Y = 1
const FIELD_MAX_Y = 5
const POLE_HEIGHT = FIELD_MAX_Y

const COLOR_PALETTE: Color4[] = [
    Color4.create(1, 0.35, 0.35, 1),
    Color4.create(1, 0.7, 0.2, 1),
    Color4.create(1, 0.95, 0.35, 1),
    Color4.create(0.35, 0.9, 0.45, 1),
    Color4.create(0.3, 0.85, 1, 1),
    Color4.create(0.45, 0.55, 1, 1),
    Color4.create(0.8, 0.45, 1, 1),
    Color4.create(1, 0.45, 0.8, 1)
]

type FlashItem = {
    entity: Entity
    idleColor: Color4
    activeUntilSec: number
}

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
        position: Vector3.create(ARENA_CENTER.x, POLE_HEIGHT / 2, ARENA_CENTER.z),
        scale: Vector3.create(0.35, POLE_HEIGHT, 0.35)
    })
    MeshRenderer.setCylinder(pole)
    Material.setPbrMaterial(pole, { albedoColor: Color4.create(0.45, 0.45, 0.52, 1) })

    // Label
    const label = engine.addEntity()
    Transform.create(label, {
        position: Vector3.create(ARENA_CENTER.x, POLE_HEIGHT + 1.8, ARENA_CENTER.z)
    })
    TextShape.create(label, {
        text: 'Grapple Anchors\n(click anchor to pull yourself)',
        fontSize: 2
    })

    const flashing: FlashItem[] = []
    for (let i = 0; i < FIELD_COUNT; i++) {
        const position = Vector3.create(
            randomRange(i * 3 + 1, FIELD_MIN_X, FIELD_MAX_X),
            randomRange(i * 3 + 2, FIELD_MIN_Y, FIELD_MAX_Y),
            randomRange(i * 3 + 3, FIELD_MIN_Z, FIELD_MAX_Z)
        )
        const color = COLOR_PALETTE[Math.floor(randomRange(i * 7 + 11, 0, COLOR_PALETTE.length))]
        createAnchor(position, color, flashing)
    }

    // One shared blink system for all anchors.
    engine.addSystem(() => {
        const now = Date.now() / 1000
        for (const item of flashing) {
            if (item.activeUntilSec !== 0 && now >= item.activeUntilSec) {
                item.activeUntilSec = 0
                Material.setPbrMaterial(item.entity, { albedoColor: item.idleColor })
            }
        }
    })
}

function createAnchor(position: Vector3, idleColor: Color4, flashing: FlashItem[]) {
    const anchor = engine.addEntity()
    Transform.create(anchor, {
        position,
        scale: Vector3.create(ANCHOR_SCALE, ANCHOR_SCALE, ANCHOR_SCALE)
    })
    MeshRenderer.setSphere(anchor)
    MeshCollider.setSphere(anchor, ColliderLayer.CL_POINTER)
    Material.setPbrMaterial(anchor, { albedoColor: idleColor })

    let cooldownUntilSec = 0
    const flashItem: FlashItem = { entity: anchor, idleColor, activeUntilSec: 0 }
    flashing.push(flashItem)

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
            flashItem.activeUntilSec = nowSec + 0.12
            Material.setPbrMaterial(anchor, { albedoColor: ANCHOR_ACTIVE_COLOR })

            Physics.applyKnockbackToPlayer(position, -GRAPPLE_MAGNITUDE, GRAPPLE_RADIUS)
        }
    )
}

function random01(seed: number): number {
    const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453123
    return x - Math.floor(x)
}

function randomRange(seed: number, min: number, max: number): number {
    return min + random01(seed) * (max - min)
}
