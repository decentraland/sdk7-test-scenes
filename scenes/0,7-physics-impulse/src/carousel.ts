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

const CENTER_X = 24
const CENTER_Z = 24

const POLE_MAX_HEIGHT = 7
const POLE_RADIUS = 0.35
const DISK_RADIUS = 2.5
const DISK_HEIGHT = 0.15

const SEAT_COUNT = 6
const CHAIN_LENGTH = 7
const CHAIN_RADIUS = 0.04
const SEAT_SIZE = 0.9
const POLE_MIN_HEIGHT = SEAT_SIZE / 2
const LIFT_PERIOD_SECONDS = 8
const DIRECTION_MARKER_LENGTH = CHAIN_LENGTH
const DIRECTION_MARKER_RADIUS = CHAIN_RADIUS

const CAROUSEL_IMPULSE_MAG = 20
const CAROUSEL_MAX_TILT_DEG = 50
const CAROUSEL_SPEED_RPM = 1

const POLE_COLOR = Color4.create(0.5, 0.5, 0.55, 1)
const DISK_COLOR = Color4.create(0.2, 0.5, 0.8, 1)
const CHAIN_COLOR = Color4.create(0.6, 0.6, 0.6, 1)
const SEAT_COLOR = Color4.create(0.9, 0.7, 0.15, 1)
const MARKER_ATTACH_COLOR = Color4.create(0.9, 0.9, 0.9, 0.9)
const MARKER_NORMAL_COLOR = Color4.create(0.2, 1, 0.95, 0.9)

export function setupCarousel() {
    const movingPole = engine.addEntity()
    Transform.create(movingPole, {
        position: Vector3.create(CENTER_X, POLE_MAX_HEIGHT / 2, CENTER_Z),
        scale: Vector3.create(POLE_RADIUS * 2, POLE_MAX_HEIGHT, POLE_RADIUS * 2)
    })
    MeshRenderer.setCylinder(movingPole)
    MeshCollider.setCylinder(movingPole)
    Material.setPbrMaterial(movingPole, { albedoColor: POLE_COLOR })

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

    const label = engine.addEntity()
    Transform.create(label, {
        position: Vector3.create(CENTER_X, POLE_MAX_HEIGHT + 3, CENTER_Z)
    })
    TextShape.create(label, {
        text: `Chain Carousel\n(impulse=${CAROUSEL_IMPULSE_MAG})`,
        fontSize: 2
    })

    const chainTilts: Entity[] = []
    for (let i = 0; i < SEAT_COUNT; i++) {
        createChainSeat(diskPivot, i, chainTilts)
    }

    let yawDeg = 0
    let liftPhase = 0

    engine.addSystem((dt) => {
        const rpm = CAROUSEL_SPEED_RPM
        yawDeg = (yawDeg - rpm * 6 * dt) % 360

        liftPhase += (Math.PI * 2 * dt) / LIFT_PERIOD_SECONDS
        const liftT = (Math.sin(liftPhase) + 1) / 2
        const liftY = POLE_MIN_HEIGHT + (POLE_MAX_HEIGHT - POLE_MIN_HEIGHT) * liftT

        const maxTilt = clamp(CAROUSEL_MAX_TILT_DEG, 0, 89)
        const minTiltDeg = -90
        const dynamicTiltDeg = minTiltDeg + (90 - maxTilt) * liftT
        const tiltRotation = Quaternion.fromEulerDegrees(dynamicTiltDeg, 0, 0)

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

    const chainAnchor = engine.addEntity()
    Transform.create(chainAnchor, {
        parent: diskPivot,
        rotation: Quaternion.fromEulerDegrees(0, angle, 0),
        position: Vector3.create(0, 0, 0)
    })

    const chainTilt = engine.addEntity()
    Transform.create(chainTilt, {
        parent: chainAnchor,
        position: Vector3.create(0, 0, DISK_RADIUS),
        rotation: Quaternion.fromEulerDegrees(-CAROUSEL_MAX_TILT_DEG, 0, 0)
    })
    chainTilts.push(chainTilt)

    const chain = engine.addEntity()
    Transform.create(chain, {
        parent: chainTilt,
        position: Vector3.create(0, -CHAIN_LENGTH / 2, 0),
        scale: Vector3.create(CHAIN_RADIUS * 2, CHAIN_LENGTH, CHAIN_RADIUS * 2)
    })
    MeshRenderer.setCylinder(chain)
    Material.setPbrMaterial(chain, { albedoColor: CHAIN_COLOR })

    const seat = engine.addEntity()
    Transform.create(seat, {
        parent: chainTilt,
        position: Vector3.create(0, -CHAIN_LENGTH, 0),
        scale: Vector3.create(SEAT_SIZE, SEAT_SIZE, SEAT_SIZE)
    })
    MeshRenderer.setBox(seat)
    MeshCollider.setBox(seat)
    Material.setPbrMaterial(seat, { albedoColor: SEAT_COLOR })

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

    createChildFaceTriggers(seat, SEAT_SIZE, () => CAROUSEL_IMPULSE_MAG)
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
