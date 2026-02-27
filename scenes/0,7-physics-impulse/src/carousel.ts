import {
    engine,
    Material,
    MeshCollider,
    MeshRenderer,
    Transform,
    TextShape,
    Tween,
    TweenSequence,
    TweenLoop,
    EasingFunction
} from '@dcl/sdk/ecs'
import { Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { createChildFaceTriggers } from './faceTriggers'
import { getCarouselMag } from './configUi'

// ---------------------------------------------------------------------------
// Layout — parcel 1,8 (X: 16–32, Z: 16–32), center at (24, 0, 24)
// ---------------------------------------------------------------------------
const CENTER_X = 24
const CENTER_Z = 24

// Pole & disk
const POLE_HEIGHT = 6
const POLE_RADIUS = 0.3
const DISK_RADIUS = 3.5
const DISK_HEIGHT = 0.15

// Chains & seats
const SEAT_COUNT = 6
const CHAIN_LENGTH = 3
const CHAIN_RADIUS = 0.05
const SEAT_SIZE = 0.8
const CHAIN_TILT_DEG = -25      // negative X = tilt outward from pole (like real ride photos)

// Disk rotation — full 360° split into 3×120° segments (quaternion-safe)
const DISK_SEGMENT_DEG = 120
const DISK_FULL_ROTATION_DURATION = 1250 // ms for full 360° — max speed
const DISK_SEGMENT_DURATION = Math.round(DISK_FULL_ROTATION_DURATION / 3)

// Colors
const POLE_COLOR = Color4.create(0.5, 0.5, 0.55, 1)
const DISK_COLOR = Color4.create(0.2, 0.5, 0.8, 1)
const CHAIN_COLOR = Color4.create(0.6, 0.6, 0.6, 1)
const SEAT_COLOR = Color4.create(0.9, 0.7, 0.15, 1)

/**
 * Soviet-style chain carousel "Вихрь".
 *
 * Hierarchy for Transform.localToWorldDirection():
 *   pole (static) → diskPivot (Y rotation) → chainAnchor (Y offset) → chainTilt (static X tilt) → seat → triggers
 */
export function setupCarousel() {
    // --- Pole: static tall cylinder ---
    const pole = engine.addEntity()
    Transform.create(pole, {
        position: Vector3.create(CENTER_X, POLE_HEIGHT / 2, CENTER_Z),
        scale: Vector3.create(POLE_RADIUS * 2, POLE_HEIGHT, POLE_RADIUS * 2)
    })
    MeshRenderer.setCylinder(pole)
    MeshCollider.setCylinder(pole)
    Material.setPbrMaterial(pole, { albedoColor: POLE_COLOR })

    // --- Disk visual: flat cylinder at top of pole ---
    // Continuous constant-speed rotation: 3 segments of 120° = 360°, LINEAR, RESTART
    const diskPivot = engine.addEntity()
    Transform.create(diskPivot, {
        position: Vector3.create(CENTER_X, POLE_HEIGHT, CENTER_Z)
    })
    Tween.create(diskPivot, {
        mode: Tween.Mode.Rotate({
            start: Quaternion.fromEulerDegrees(0, 0, 0),
            end: Quaternion.fromEulerDegrees(0, -DISK_SEGMENT_DEG, 0)
        }),
        duration: DISK_SEGMENT_DURATION,
        easingFunction: EasingFunction.EF_LINEAR
    })
    TweenSequence.create(diskPivot, {
        sequence: [
            {
                mode: Tween.Mode.Rotate({
                    start: Quaternion.fromEulerDegrees(0, -DISK_SEGMENT_DEG, 0),
                    end: Quaternion.fromEulerDegrees(0, -DISK_SEGMENT_DEG * 2, 0)
                }),
                duration: DISK_SEGMENT_DURATION,
                easingFunction: EasingFunction.EF_LINEAR
            },
            {
                mode: Tween.Mode.Rotate({
                    start: Quaternion.fromEulerDegrees(0, -DISK_SEGMENT_DEG * 2, 0),
                    end: Quaternion.fromEulerDegrees(0, -359.9, 0)
                }),
                duration: DISK_SEGMENT_DURATION,
                easingFunction: EasingFunction.EF_LINEAR
            }
        ],
        loop: TweenLoop.TL_RESTART
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
        position: Vector3.create(CENTER_X, POLE_HEIGHT + 3, CENTER_Z)
    })
    TextShape.create(label, {
        text: 'Chain Carousel «Вихрь»\n(each seat pushes from every face)',
        fontSize: 2
    })

    // --- Chains & seats ---
    for (let i = 0; i < SEAT_COUNT; i++) {
        createChainSeat(diskPivot, i)
    }
}

function createChainSeat(diskPivot: ReturnType<typeof engine.addEntity>, index: number) {
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
        rotation: Quaternion.fromEulerDegrees(CHAIN_TILT_DEG, 0, 0)
    })

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

    // Face triggers on the seat — resolved through the full hierarchy
    createChildFaceTriggers(seat, SEAT_SIZE, getCarouselMag)
}
