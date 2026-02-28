import {
    engine,
    ColliderLayer,
    Material,
    MeshRenderer,
    Transform,
    TriggerArea,
    triggerAreaEventsSystem,
    Physics,
    Entity
} from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'

const TRIGGER_THICKNESS = 0.3
const TRIGGER_OUTSET = 0.06
const IMPULSE_COOLDOWN_SECONDS = 1
const COOLDOWN_COLOR = Color4.create(0.45, 0.45, 0.45, 0.25)

type TriggerVisual = {
    entity: Entity
    baseColor: Color4
}

const allChildFaceTriggers: TriggerVisual[] = []
let cooldownRemainingSec = 0
let cooldownVisualApplied = false
let cooldownSystemInitialized = false

// Aggregator state: collects all trigger hits during frame, applies one impulse.
let pendingDirX = 0
let pendingDirY = 0
let pendingDirZ = 0
let pendingMagnitude = 0
let hasPendingImpulse = false

interface FaceDef {
    /** Position offset relative to parent center */
    localOffset: Vector3
    /** Trigger box dimensions */
    localSize: Vector3
    /** Unit-length push direction in parent-local space */
    localNormal: Vector3
    /** Default semi-transparent color */
    color: Color4
}

/**
 * Builds 6 face trigger definitions for a box of given size.
 * Faces: +X (red), -X (blue), +Z (red), -Z (blue), +Y (green), -Y (yellow).
 */
function buildFaceDefs(boxSize: number): FaceDef[] {
    const half = boxSize / 2
    const off = half + TRIGGER_THICKNESS / 2 + TRIGGER_OUTSET

    return [
        {
            localOffset: Vector3.create(off, 0, 0),
            localSize: Vector3.create(TRIGGER_THICKNESS, boxSize, boxSize),
            localNormal: Vector3.create(1, 0, 0),
            color: Color4.create(1, 0.3, 0.3, 0.4)
        },
        {
            localOffset: Vector3.create(-off, 0, 0),
            localSize: Vector3.create(TRIGGER_THICKNESS, boxSize, boxSize),
            localNormal: Vector3.create(-1, 0, 0),
            color: Color4.create(0.3, 0.3, 1, 0.4)
        },
        {
            localOffset: Vector3.create(0, 0, off),
            localSize: Vector3.create(boxSize, boxSize, TRIGGER_THICKNESS),
            localNormal: Vector3.create(0, 0, 1),
            color: Color4.create(1, 0.3, 0.3, 0.4)
        },
        {
            localOffset: Vector3.create(0, 0, -off),
            localSize: Vector3.create(boxSize, boxSize, TRIGGER_THICKNESS),
            localNormal: Vector3.create(0, 0, -1),
            color: Color4.create(0.3, 0.3, 1, 0.4)
        },
        {
            localOffset: Vector3.create(0, off, 0),
            localSize: Vector3.create(boxSize, TRIGGER_THICKNESS, boxSize),
            localNormal: Vector3.create(0, 1, 0),
            color: Color4.create(0.3, 1, 0.3, 0.4)
        },
        {
            localOffset: Vector3.create(0, -off, 0),
            localSize: Vector3.create(boxSize, TRIGGER_THICKNESS, boxSize),
            localNormal: Vector3.create(0, -1, 0),
            color: Color4.create(1, 0.9, 0.2, 0.4)
        }
    ]
}

/**
 * Creates 5 visible face-trigger boxes as **children** of `parent`.
 *
 * Each trigger uses `Transform.localToWorldDirection` to resolve the
 * push direction through the full parent hierarchy — this is the key
 * difference from the static repulsion cube which uses world-space normals.
 */
export function createChildFaceTriggers(
    parent: Entity,
    boxSize: number,
    getMag: () => number
) {
    ensureCooldownSystem()
    const faces = buildFaceDefs(boxSize)

    for (const face of faces) {
        const trigger = engine.addEntity()
        Transform.create(trigger, {
            parent,
            position: face.localOffset,
            scale: face.localSize
        })
        MeshRenderer.setBox(trigger)
        Material.setPbrMaterial(trigger, { albedoColor: face.color })
        TriggerArea.setBox(trigger, ColliderLayer.CL_PLAYER)
        allChildFaceTriggers.push({ entity: trigger, baseColor: face.color })

        triggerAreaEventsSystem.onTriggerEnter(trigger, (result) => {
            if (result.trigger?.entity !== engine.PlayerEntity) return
            if (cooldownRemainingSec > 0) return

            const worldDir = Transform.localToWorldDirection(trigger, face.localNormal)
            pendingDirX += worldDir.x
            pendingDirY += worldDir.y
            pendingDirZ += worldDir.z
            if (!hasPendingImpulse) {
                pendingMagnitude = getMag()
                hasPendingImpulse = true
            }
        })

        triggerAreaEventsSystem.onTriggerExit(trigger, (result) => {
            if (result.trigger?.entity !== engine.PlayerEntity) return
            if (cooldownRemainingSec > 0) return
            Material.setPbrMaterial(trigger, { albedoColor: face.color })
        })
    }
}

function ensureCooldownSystem() {
    if (cooldownSystemInitialized) return
    cooldownSystemInitialized = true

    engine.addSystem((dt) => {
        if (cooldownRemainingSec > 0) {
            cooldownRemainingSec = Math.max(0, cooldownRemainingSec - dt)
            if (!cooldownVisualApplied) applyCooldownVisual()
            return
        }

        if (cooldownVisualApplied) {
            restoreBaseVisuals()
        }

        if (hasPendingImpulse) {
            const len = Math.sqrt(
                pendingDirX * pendingDirX +
                pendingDirY * pendingDirY +
                pendingDirZ * pendingDirZ
            )

            const impulseDir = len > 0
                ? Vector3.create(pendingDirX / len, pendingDirY / len, pendingDirZ / len)
                : Vector3.create(0, 1, 0)

            // Keep magnitude exactly like a single regular side hit.
            Physics.applyImpulseToPlayer(impulseDir, pendingMagnitude)

            pendingDirX = 0
            pendingDirY = 0
            pendingDirZ = 0
            pendingMagnitude = 0
            hasPendingImpulse = false

            cooldownRemainingSec = IMPULSE_COOLDOWN_SECONDS
            applyCooldownVisual()
        }
    })
}

function applyCooldownVisual() {
    cooldownVisualApplied = true
    for (const trigger of allChildFaceTriggers) {
        Material.setPbrMaterial(trigger.entity, { albedoColor: COOLDOWN_COLOR })
    }
}

function restoreBaseVisuals() {
    cooldownVisualApplied = false
    for (const trigger of allChildFaceTriggers) {
        Material.setPbrMaterial(trigger.entity, { albedoColor: trigger.baseColor })
    }
}
