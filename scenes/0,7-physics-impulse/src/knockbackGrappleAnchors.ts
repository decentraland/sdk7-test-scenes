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
    TriggerArea,
    triggerAreaEventsSystem,
    pointerEventsSystem
} from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'
import { getGrappleAnchorScale, hideGrapplePanel, showGrapplePanel } from './configUi'

const PARCEL_SIZE = 16
const PARCELS_X = 2
const PARCELS_Z = 2
const VOLUME_MIN_X = 32
const VOLUME_MIN_Z = 16
const VOLUME_MIN_Y = 0
const VOLUME_MARGIN = 1

const ANCHOR_COOLDOWN_SEC = 0.35

const GRAPPLE_MAGNITUDE = 14
const GRAPPLE_RADIUS = 36

const ANCHOR_ACTIVE_COLOR = Color4.create(1, 0.9, 0.2, 1)

const FIELD_COUNT = 320
const FIELD_MIN_X = VOLUME_MIN_X + VOLUME_MARGIN
const FIELD_MAX_X = VOLUME_MIN_X + PARCEL_SIZE * PARCELS_X - VOLUME_MARGIN
const FIELD_MIN_Z = VOLUME_MIN_Z + VOLUME_MARGIN
const FIELD_MAX_Z = VOLUME_MIN_Z + PARCEL_SIZE * PARCELS_Z - VOLUME_MARGIN
const FIELD_MIN_Y = VOLUME_MIN_Y + VOLUME_MARGIN
const FIELD_MAX_Y = VOLUME_MIN_Y + PARCEL_SIZE - VOLUME_MARGIN

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
    const volumeSizeX = PARCEL_SIZE * PARCELS_X
    const volumeSizeY = PARCEL_SIZE
    const volumeSizeZ = PARCEL_SIZE * PARCELS_Z

    const volumeCenter = Vector3.create(
        VOLUME_MIN_X + volumeSizeX / 2,
        VOLUME_MIN_Y + volumeSizeY / 2,
        VOLUME_MIN_Z + volumeSizeZ / 2
    )

    // Trigger zone to show grapple config panel while player is inside.
    const grappleZone = engine.addEntity()
    Transform.create(grappleZone, {
        position: volumeCenter,
        scale: Vector3.create(volumeSizeX, volumeSizeY, volumeSizeZ)
    })
    TriggerArea.setBox(grappleZone, ColliderLayer.CL_PLAYER)
    triggerAreaEventsSystem.onTriggerEnter(grappleZone, (result) => {
        if (result.trigger?.entity !== engine.PlayerEntity) return
        showGrapplePanel()
    })
    triggerAreaEventsSystem.onTriggerExit(grappleZone, (result) => {
        if (result.trigger?.entity !== engine.PlayerEntity) return
        hideGrapplePanel()
    })

    // Label
    const label = engine.addEntity()
    const labelPos = Vector3.create(volumeCenter.x, VOLUME_MIN_Y + volumeSizeY + 1.8, volumeCenter.z)
    Transform.create(label, {
        position: labelPos
    })
    TextShape.create(label, {
        text: 'Grapple Volume 32x32x16 (2x2 parcels)\n(click any sphere to pull yourself)',
        fontSize: 2
    })

    const anchorEntities: Entity[] = []
    const flashing: FlashItem[] = []
    for (let i = 0; i < FIELD_COUNT; i++) {
        const position = Vector3.create(
            randomRange(i * 3 + 1, FIELD_MIN_X, FIELD_MAX_X),
            randomRange(i * 3 + 2, FIELD_MIN_Y, FIELD_MAX_Y),
            randomRange(i * 3 + 3, FIELD_MIN_Z, FIELD_MAX_Z)
        )
        const color = COLOR_PALETTE[Math.floor(randomRange(i * 7 + 11, 0, COLOR_PALETTE.length))]
        const anchor = createAnchor(position, color, flashing)
        anchorEntities.push(anchor)
    }

    // One shared blink system for all anchors.
    let lastScale = -1
    engine.addSystem(() => {
        const now = Date.now() / 1000

        const currentScale = getGrappleAnchorScale()
        if (Math.abs(currentScale - lastScale) > 0.0001) {
            for (const anchor of anchorEntities) {
                Transform.getMutable(anchor).scale = Vector3.create(currentScale, currentScale, currentScale)
            }
            lastScale = currentScale
        }

        for (const item of flashing) {
            if (item.activeUntilSec !== 0 && now >= item.activeUntilSec) {
                item.activeUntilSec = 0
                Material.setPbrMaterial(item.entity, { albedoColor: item.idleColor })
            }
        }
    })
}

function createAnchor(position: Vector3, idleColor: Color4, flashing: FlashItem[]): Entity {
    const anchor = engine.addEntity()
    const scale = getGrappleAnchorScale()
    Transform.create(anchor, {
        position,
        scale: Vector3.create(scale, scale, scale)
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

    return anchor
}

function random01(seed: number): number {
    const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453123
    return x - Math.floor(x)
}

function randomRange(seed: number, min: number, max: number): number {
    return min + random01(seed) * (max - min)
}
