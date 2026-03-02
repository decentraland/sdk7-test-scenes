import {
    ColliderLayer,
    Entity,
    engine,
    InputAction,
    KnockbackFalloff,
    Material,
    MeshCollider,
    MeshRenderer,
    Physics,
    TextShape,
    Transform,
    TriggerArea,
    pointerEventsSystem,
    triggerAreaEventsSystem
} from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'

const PARCEL_MIN_X = 16
const PARCEL_MAX_X = 48
const PARCEL_MIN_Z = -32
const PARCEL_MAX_Z = 0

const LAB_MIN_X = PARCEL_MIN_X + 0.8
const LAB_MAX_X = PARCEL_MAX_X - 0.8
const LAB_MIN_Z = PARCEL_MIN_Z + 0.8
const LAB_MAX_Z = PARCEL_MAX_Z - 0.8
const LAB_MIN_Y = 0.8
const LAB_MAX_Y = 12

const MOVE_STEP = 0.75
const CORE_RADIUS = 0.45
const SPHERE_DIAMETER_FACTOR = 2

type SphereState = {
    name: string
    root: Entity
    core: Entity
    halo: Entity
    position: Vector3
    magnitude: number
    radius: number
    falloff: KnockbackFalloff
    magnitudeInput: string
    radiusInput: string
}

const spheres: SphereState[] = []
export function setupKnockbackSphereLab(
    onPlayerEnterZone: () => void,
    onPlayerExitZone: () => void
) {
    createLabFloor()
    createLabLabel()
    // Place each sphere in a different parcel, clustered near 2x2 center with overlapping halos.
    createSphere('Sphere A', Vector3.create(29, 2, -17), Color4.create(1, 0.2, 0.2, 1), 10, 6, KnockbackFalloff.CONSTANT)
    createSphere('Sphere B', Vector3.create(35, 2, -17), Color4.create(1, 0.9, 0.2, 1), 12, 6, KnockbackFalloff.LINEAR)
    createSphere('Sphere C', Vector3.create(29, 2, -15), Color4.create(0.2, 0.95, 0.3, 1), -10, 6, KnockbackFalloff.INVERSE_SQUARE)
    createLabZoneTrigger(onPlayerEnterZone, onPlayerExitZone)
}

export function getKnockbackLabMoveStep() {
    return MOVE_STEP
}

export function getKnockbackLabSpheres(): readonly SphereState[] {
    return spheres
}

export function moveKnockbackLabSphere(index: number, delta: Vector3) {
    const sphere = spheres[index]
    if (!sphere) return
    sphere.position = clampSpherePosition(
        Vector3.create(
            sphere.position.x + delta.x,
            sphere.position.y + delta.y,
            sphere.position.z + delta.z
        )
    )
    Transform.getMutable(sphere.root).position = sphere.position
}

export function updateKnockbackLabSphere(index: number, magnitude: number, radius: number) {
    const sphere = spheres[index]
    if (!sphere) return
    sphere.magnitude = magnitude
    sphere.radius = Math.max(0.1, radius)
    Transform.getMutable(sphere.halo).scale = Vector3.create(
        sphere.radius * SPHERE_DIAMETER_FACTOR,
        sphere.radius * SPHERE_DIAMETER_FACTOR,
        sphere.radius * SPHERE_DIAMETER_FACTOR
    )
}

export function cycleKnockbackLabSphereFalloff(index: number): KnockbackFalloff {
    const sphere = spheres[index]
    if (!sphere) return KnockbackFalloff.CONSTANT

    if (sphere.falloff === KnockbackFalloff.CONSTANT) sphere.falloff = KnockbackFalloff.LINEAR
    else if (sphere.falloff === KnockbackFalloff.LINEAR) sphere.falloff = KnockbackFalloff.INVERSE_SQUARE
    else sphere.falloff = KnockbackFalloff.CONSTANT

    return sphere.falloff
}

function createLabZoneTrigger(
    onPlayerEnterZone: () => void,
    onPlayerExitZone: () => void
) {
    const trigger = engine.addEntity()
    const sizeX = PARCEL_MAX_X - PARCEL_MIN_X
    const sizeZ = PARCEL_MAX_Z - PARCEL_MIN_Z
    Transform.create(trigger, {
        position: Vector3.create(PARCEL_MIN_X + sizeX / 2, 4, PARCEL_MIN_Z + sizeZ / 2),
        scale: Vector3.create(sizeX, 8, sizeZ)
    })
    TriggerArea.setBox(trigger, ColliderLayer.CL_PLAYER)

    triggerAreaEventsSystem.onTriggerEnter(trigger, (event) => {
        if (event.trigger?.entity !== engine.PlayerEntity) return
        onPlayerEnterZone()
    })

    triggerAreaEventsSystem.onTriggerExit(trigger, (event) => {
        if (event.trigger?.entity !== engine.PlayerEntity) return
        onPlayerExitZone()
    })
}

function createLabLabel() {
    const label = engine.addEntity()
    Transform.create(label, {
        position: Vector3.create(32, 5.2, -16)
    })
    TextShape.create(label, {
        text: 'Knockback Sphere Lab (2x2: 1,5 2,5 1,6 2,6)\nClick core sphere to apply knockback',
        fontSize: 2.2
    })
}

function createLabFloor() {
    const floor = engine.addEntity()
    const sizeX = PARCEL_MAX_X - PARCEL_MIN_X
    const sizeZ = PARCEL_MAX_Z - PARCEL_MIN_Z
    Transform.create(floor, {
        position: Vector3.create(PARCEL_MIN_X + sizeX / 2, 0.05, PARCEL_MIN_Z + sizeZ / 2),
        scale: Vector3.create(sizeX, 0.1, sizeZ)
    })
    MeshRenderer.setBox(floor)
    MeshCollider.setBox(floor)
    Material.setPbrMaterial(floor, {
        albedoColor: Color4.create(0.96, 0.82, 0.9, 1)
    })
}

function createSphere(
    name: string,
    position: Vector3,
    color: Color4,
    magnitude: number,
    radius: number,
    falloff: KnockbackFalloff
) {
    const root = engine.addEntity()
    Transform.create(root, { position })

    const core = engine.addEntity()
    Transform.create(core, {
        parent: root,
        scale: Vector3.create(CORE_RADIUS, CORE_RADIUS, CORE_RADIUS)
    })
    MeshRenderer.setSphere(core)
    MeshCollider.setSphere(core, ColliderLayer.CL_POINTER)
    Material.setPbrMaterial(core, { albedoColor: color })

    const halo = engine.addEntity()
    Transform.create(halo, {
        parent: root,
        // Primitive sphere uses scale as diameter, while gameplay value is radius in meters.
        scale: Vector3.create(
            radius * SPHERE_DIAMETER_FACTOR,
            radius * SPHERE_DIAMETER_FACTOR,
            radius * SPHERE_DIAMETER_FACTOR
        )
    })
    MeshRenderer.setSphere(halo)
    Material.setPbrMaterial(halo, {
        albedoColor: Color4.create(color.r, color.g, color.b, 0.12)
    })

    const sphereState: SphereState = {
        name,
        root,
        core,
        halo,
        position,
        magnitude,
        radius,
        falloff,
        magnitudeInput: magnitude.toString(),
        radiusInput: radius.toString()
    }
    spheres.push(sphereState)

    pointerEventsSystem.onPointerDown(
        {
            entity: core,
            opts: {
                button: InputAction.IA_POINTER,
                hoverText: `${name}: knockback`,
                maxDistance: 24
            }
        },
        () => {
            Physics.applyKnockbackToPlayer(sphereState.position, sphereState.magnitude, sphereState.radius, sphereState.falloff)
        }
    )
}

function clampSpherePosition(position: Vector3): Vector3 {
    return Vector3.create(
        Math.min(LAB_MAX_X, Math.max(LAB_MIN_X, position.x)),
        Math.min(LAB_MAX_Y, Math.max(LAB_MIN_Y, position.y)),
        Math.min(LAB_MAX_Z, Math.max(LAB_MIN_Z, position.z))
    )
}
