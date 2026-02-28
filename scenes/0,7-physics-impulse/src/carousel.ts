import {
    engine,
    Material,
    MeshCollider,
    MeshRenderer,
    Transform,
    TextShape,
    Entity
} from '@dcl/sdk/ecs'
import { Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { createChildFaceTriggers } from './faceTriggers'
import { getCarouselMaxTiltDeg, getCarouselSpeedRpm, isCarouselTiltFrozen, isCarouselVerticalPaused } from './configUi'

// ---------------------------------------------------------------------------
// Layout — parcel 1,8 (X: 16–32, Z: 16–32), center at (24, 0, 24)
// ---------------------------------------------------------------------------
const CENTER_X = 24
const CENTER_Z = 24

// Pole & disk
const POLE_MAX_HEIGHT = 7
const POLE_RADIUS = 0.35
const DISK_RADIUS = 2.5 // slightly reduced to keep seats inside parcel bounds
const DISK_HEIGHT = 0.15

// Chains & seats
const SEAT_COUNT = 6
const CHAIN_LENGTH = 7
const CHAIN_RADIUS = 0.04
const SEAT_SIZE = 0.9
const POLE_MIN_HEIGHT = SEAT_SIZE / 2 // lowest state: seats can skim the floor
const CAROUSEL_MAG = 12
const LIFT_PERIOD_SECONDS = 8
const DIRECTION_MARKER_LENGTH = CHAIN_LENGTH
const DIRECTION_MARKER_RADIUS = CHAIN_RADIUS

// Colors
const POLE_COLOR = Color4.create(0.5, 0.5, 0.55, 1)
const DISK_COLOR = Color4.create(0.2, 0.5, 0.8, 1)
const CHAIN_COLOR = Color4.create(0.6, 0.6, 0.6, 1)
const SEAT_COLOR = Color4.create(0.9, 0.7, 0.15, 1)
const MARKER_ATTACH_COLOR = Color4.create(0.9, 0.9, 0.9, 0.9)
const MARKER_NORMAL_COLOR = Color4.create(0.2, 1, 0.95, 0.9)

/**
 * Soviet-style chain carousel "Вихрь".
 *
 * Hierarchy for Transform.localToWorldDirection():
 *   movingPole → diskPivot (Y rotation + vertical motion) → chainAnchor → chainTilt → seat → triggers
 */
export function setupCarousel() {
    // --- Pole: telescopic visual, never goes below ground ---
    const movingPole = engine.addEntity()
    Transform.create(movingPole, {
        position: Vector3.create(CENTER_X, POLE_MAX_HEIGHT / 2, CENTER_Z),
        scale: Vector3.create(POLE_RADIUS * 2, POLE_MAX_HEIGHT, POLE_RADIUS * 2)
    })
    MeshRenderer.setCylinder(movingPole)
    MeshCollider.setCylinder(movingPole)
    Material.setPbrMaterial(movingPole, { albedoColor: POLE_COLOR })

    // --- Disk pivot: runtime-animated (rotation speed + vertical motion) ---
    const diskPivot = engine.addEntity()
    Transform.create(diskPivot, {
        position: Vector3.create(CENTER_X, POLE_MAX_HEIGHT, CENTER_Z)
    })

    const disk = engine.addEntity()
    Transform.create(disk, {
        parent: diskPivot,
        scale: Vector3.create(DISK_RADIUS * 2, DISK_HEIGHT, DISK_RADIUS * 2)
    })
    MeshRenderer.setCylinder(disk)
    Material.setPbrMaterial(disk, { albedoColor: DISK_COLOR })

    // --- Label ---
    const label = engine.addEntity()
    Transform.create(label, {
        position: Vector3.create(CENTER_X, POLE_MAX_HEIGHT + 3, CENTER_Z)
    })
    TextShape.create(label, {
        text: 'Chain Carousel «Вихрь»\n(each seat pushes from every face)',
        fontSize: 2
    })

    // --- Chains & seats ---
    const chainTilts: Entity[] = []
    for (let i = 0; i < SEAT_COUNT; i++) {
        createChainSeat(diskPivot, i, chainTilts)
    }

    let yawDeg = 0
    let liftPhase = Math.PI / 2 // start at top (default behavior like before)
    let frozenTiltDeg = -45
    let lastTiltFrozen = false

    engine.addSystem((dt) => {
        const rpm = Math.max(0, getCarouselSpeedRpm())
        yawDeg = (yawDeg - rpm * 6 * dt) % 360

        if (!isCarouselVerticalPaused()) {
            liftPhase += (Math.PI * 2 * dt) / LIFT_PERIOD_SECONDS
        }
        const liftT = (Math.sin(liftPhase) + 1) / 2
        const liftY = POLE_MIN_HEIGHT + (POLE_MAX_HEIGHT - POLE_MIN_HEIGHT) * liftT

        const maxTilt = clamp(getCarouselMaxTiltDeg(), 0, 89)
        const minTiltDeg = -90
        const maxTiltDeg = -maxTilt
        const dynamicTiltDeg = minTiltDeg + (90 - maxTilt) * liftT
        const tiltFrozen = isCarouselTiltFrozen()
        if (tiltFrozen) {
            if (!lastTiltFrozen) {
                // Freeze current value, but ensure it stays inside allowed tilt range.
                frozenTiltDeg = clamp(dynamicTiltDeg, minTiltDeg, maxTiltDeg)
            } else {
                // If UI changes max tilt while frozen, keep clamped to updated range.
                frozenTiltDeg = clamp(frozenTiltDeg, minTiltDeg, maxTiltDeg)
            }
        }
        const tiltDeg = tiltFrozen ? frozenTiltDeg : dynamicTiltDeg
        lastTiltFrozen = tiltFrozen
        const tiltRotation = Quaternion.fromEulerDegrees(tiltDeg, 0, 0)

        const pivot = Transform.getMutable(diskPivot)
        pivot.position = Vector3.create(CENTER_X, liftY, CENTER_Z)
        pivot.rotation = Quaternion.fromEulerDegrees(0, yawDeg, 0)

        const pole = Transform.getMutable(movingPole)
        pole.position = Vector3.create(CENTER_X, liftY / 2, CENTER_Z)
        pole.scale = Vector3.create(POLE_RADIUS * 2, Math.max(0.05, liftY), POLE_RADIUS * 2)

        for (const chainTilt of chainTilts) {
            Transform.getMutable(chainTilt).rotation = tiltRotation
        }
    })
}

function clamp(value: number, min: number, max: number) {
    if (value < min) return min
    if (value > max) return max
    return value
}

function createChainSeat(diskPivot: Entity, index: number, chainTilts: Entity[]) {
    const angle = (360 / SEAT_COUNT) * index

    // Anchor at disk edge, rotated around Y to distribute seats evenly
    const chainAnchor = engine.addEntity()
    Transform.create(chainAnchor, {
        parent: diskPivot,
        rotation: Quaternion.fromEulerDegrees(0, angle, 0),
        position: Vector3.create(0, 0, 0)
    })

    // Tilt entity: at disk edge, tilted outward by fixed angle
    // X rotation tilts local -Y toward local +Z (outward from center)
    const chainTilt = engine.addEntity()
    Transform.create(chainTilt, {
        parent: chainAnchor,
        position: Vector3.create(0, 0, DISK_RADIUS),
        rotation: Quaternion.fromEulerDegrees(-getCarouselMaxTiltDeg(), 0, 0)
    })
    chainTilts.push(chainTilt)

    // Chain visual: thin cylinder hanging down in tilted local space
    const chain = engine.addEntity()
    Transform.create(chain, {
        parent: chainTilt,
        position: Vector3.create(0, -CHAIN_LENGTH / 2, 0),
        scale: Vector3.create(CHAIN_RADIUS * 2, CHAIN_LENGTH, CHAIN_RADIUS * 2)
    })
    MeshRenderer.setCylinder(chain)
    Material.setPbrMaterial(chain, { albedoColor: CHAIN_COLOR })

    // Seat: box at chain bottom
    const seat = engine.addEntity()
    Transform.create(seat, {
        parent: chainTilt,
        position: Vector3.create(0, -CHAIN_LENGTH, 0),
        scale: Vector3.create(SEAT_SIZE, SEAT_SIZE, SEAT_SIZE)
    })
    MeshRenderer.setBox(seat)
    MeshCollider.setBox(seat)
    Material.setPbrMaterial(seat, { albedoColor: SEAT_COLOR })

    // Direction markers from seat center:
    // 1) along attachment direction (+Y in seat-local space)
    // 2) along outer face normal (+Z in seat-local space), which points upward when tilt reaches -90 deg
    createSeatDirectionMarker(
        seat,
        Vector3.create(0, DIRECTION_MARKER_LENGTH / 2, 0),
        Quaternion.fromEulerDegrees(0, 0, 0),
        MARKER_ATTACH_COLOR
    )
    createSeatDirectionMarker(
        seat,
        Vector3.create(0, 0, DIRECTION_MARKER_LENGTH / 2),
        Quaternion.fromEulerDegrees(90, 0, 0),
        MARKER_NORMAL_COLOR
    )

    // Face triggers on the seat — resolved through the full hierarchy
    createChildFaceTriggers(seat, SEAT_SIZE, () => CAROUSEL_MAG)
}

function createSeatDirectionMarker(
    seat: Entity,
    position: Vector3,
    rotation: Quaternion,
    color: Color4
) {
    const marker = engine.addEntity()
    Transform.create(marker, {
        parent: seat,
        position,
        rotation,
        scale: Vector3.create(
            DIRECTION_MARKER_RADIUS * 2,
            DIRECTION_MARKER_LENGTH,
            DIRECTION_MARKER_RADIUS * 2
        )
    })
    MeshRenderer.setCylinder(marker)
    Material.setPbrMaterial(marker, { albedoColor: color })
}
