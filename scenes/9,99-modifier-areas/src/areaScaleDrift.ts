import {
    engine,
    Transform,
    CameraMode,
    CameraType,
    CameraModeArea,
    MeshRenderer,
    Material,
    Entity
} from '@dcl/sdk/ecs'

import { Vector3, Color4 } from '@dcl/sdk/math'
import { movePlayerTo } from '~system/RestrictedActions'

// AREA SCALE DRIFT
// Regression coverage for unity-explorer#10428: an area with an explicit size ignored its Transform scale only when it
// was created. Scaling the entity afterwards grew the area along with it.
// The auto check creates a 2x2x2 CameraModeArea with Transform scale 1, then scales the entity to 2.5. It moves the player
// to the area's center, where the camera must switch, then 2m away from it: outside the 2x2x2 area, but inside the 5x5x5
// one the area turns into when it follows the scale. The scene reads the camera mode to tell whether the area applies.
enum Step { Idle, ScaleEntity, MovePlayerInside, MovePlayerOutside, Verdict }

const areaPosition = Vector3.create(13.5, 1, 12.5)
const areaSize = Vector3.create(2, 2, 2)
const entityScale = Vector3.create(2.5, 2.5, 2.5)
const playerInsidePosition = Vector3.create(13.5, 0, 12.5)
const playerOutsidePosition = Vector3.create(13.5, 0, 14.5)
const stepDelay = 0.5
const cameraSettleDelay = 1.5

let step = Step.Idle
let countdown = 0
let areaEntity: Entity | undefined
let areaBox: Entity | undefined
let initialMode = CameraType.CT_THIRD_PERSON
let forcedMode = CameraType.CT_FIRST_PERSON
let status = 'click to run'
let statusColor = Color4.White()

export function setupAreaScaleDrift() {
    engine.addSystem(updateAreaScaleDriftCheck)
}

export function runAreaScaleDriftCheck() {
    if (step !== Step.Idle) return

    initialMode = getCameraMode()
    forcedMode = initialMode === CameraType.CT_FIRST_PERSON ? CameraType.CT_THIRD_PERSON : CameraType.CT_FIRST_PERSON

    areaEntity = engine.addEntity()
    Transform.create(areaEntity, { position: areaPosition })
    CameraModeArea.create(areaEntity, { area: areaSize, mode: forcedMode })

    // A separate entity, so the visible box keeps the real area size when the area entity is scaled
    areaBox = engine.addEntity()
    Transform.create(areaBox, { position: areaPosition, scale: areaSize })
    MeshRenderer.setBox(areaBox)
    Material.setPbrMaterial(areaBox, { albedoColor: Color4.create(1, 0.5, 0, 0.3) })

    setStatus('running...', Color4.White())
    console.log(`[areaScaleDrift] area added, forced ${forcedMode === CameraType.CT_FIRST_PERSON ? 'first' : 'third'} person`)
    startStep(Step.ScaleEntity, stepDelay)
}

export function getAreaScaleDriftStatus(): string {
    return status
}

export function getAreaScaleDriftStatusColor(): Color4 {
    return statusColor
}

function updateAreaScaleDriftCheck(dt: number) {
    if (step === Step.Idle) return

    countdown -= dt
    if (countdown > 0) return

    switch (step) {
        case Step.ScaleEntity:
            Transform.getMutable(areaEntity!).scale = entityScale
            console.log(`[areaScaleDrift] area entity scaled to ${entityScale.x}`)
            startStep(Step.MovePlayerInside, stepDelay)
            break
        case Step.MovePlayerInside:
            movePlayer(playerInsidePosition)
            console.log(`[areaScaleDrift] player moved to the area center`)
            startStep(Step.MovePlayerOutside, cameraSettleDelay)
            break
        case Step.MovePlayerOutside:
            if (getCameraMode() !== forcedMode) {
                finish('NOT RUN: the area did not switch the camera at its center', Color4.create(1, 0.5, 0, 1))
                break
            }
            movePlayer(playerOutsidePosition)
            console.log(`[areaScaleDrift] player moved 2m from the area center`)
            startStep(Step.Verdict, cameraSettleDelay)
            break
        case Step.Verdict:
            if (getCameraMode() === initialMode)
                finish('PASS: the area kept its size', Color4.Green())
            else
                finish('FAIL: the area grew with the entity scale', Color4.Red())
            break
    }
}

function movePlayer(position: Vector3) {
    movePlayerTo({
        newRelativePosition: position,
        cameraTarget: Vector3.add(position, Vector3.create(0, 1, 5))
    })
}

function startStep(nextStep: Step, delay: number) {
    step = nextStep
    countdown = delay
}

function finish(result: string, color: Color4) {
    setStatus(result, color)
    console.log(`[areaScaleDrift] ${result}`)

    engine.removeEntity(areaEntity!)
    engine.removeEntity(areaBox!)
    areaEntity = undefined
    areaBox = undefined
    step = Step.Idle
}

function setStatus(text: string, color: Color4) {
    status = text
    statusColor = color
}

function getCameraMode(): CameraType {
    return CameraMode.getOrNull(engine.CameraEntity)?.mode ?? CameraType.CT_THIRD_PERSON
}
