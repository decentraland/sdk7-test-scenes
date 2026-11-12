import {
    engine,
    InputAction,
    MeshCollider,
    MeshRenderer,
    pointerEventsSystem,
    Transform,
    CameraMode,
    CameraType,
    Material,
    TextShape,
    AvatarModifierType,
    AvatarModifierArea,
    CameraModeArea,
    Entity,
    TriggerArea,
    triggerAreaEventsSystem,
    ColliderLayer
} from '@dcl/sdk/ecs'

import { Quaternion, Vector3, Color4 } from '@dcl/sdk/math'
import { getPlayer } from '@dcl/sdk/players'
import { movePlayerTo } from '~system/RestrictedActions'
import { addCubeHint, getNearbyCubeHint } from './cubeHints'
import { setupQaPanelUi } from './qaPanelUi'
import { setupAreaScaleDrift, runAreaScaleDriftCheck, getAreaScaleDriftStatus, getAreaScaleDriftStatusColor } from './areaScaleDrift'

// AVATAR MODIFIER AREA
const avatarModifierAreaEntity = engine.addEntity()
const avatarModifierAreaSize = Vector3.create(4, 4, 4)
Transform.create(avatarModifierAreaEntity, {
    position: Vector3.create(0, 1, 12),
    scale: avatarModifierAreaSize
})
AvatarModifierArea.create(avatarModifierAreaEntity, {
    area: avatarModifierAreaSize,
    modifiers: [AvatarModifierType.AMT_HIDE_AVATARS],
    // modifiers: [AvatarModifierType.AMT_DISABLE_PASSPORTS],
    excludeIds: []
})
MeshRenderer.setBox(avatarModifierAreaEntity)
Material.setPbrMaterial(avatarModifierAreaEntity, { albedoColor: Color4.create(0.5, 0.5, 0.5, 0.5) })
const avatarModifierAreaCube = createCube(1, 1, 15, false)
MeshCollider.setBox(avatarModifierAreaCube)
pointerEventsSystem.onPointerDown(
    { entity: avatarModifierAreaCube, opts: { button: InputAction.IA_POINTER, hoverText: 'toggle excluded id' } },
    () => {
        const userId = getPlayer()?.userId
        if (userId === undefined) return

        const mutable = AvatarModifierArea.getMutable(avatarModifierAreaEntity)
        if (mutable.excludeIds.includes(userId)) {
            mutable.excludeIds = mutable.excludeIds.filter((id) => id !== userId)
            console.log(`REMOVED own user id from excluded ids`)
        }
        else {
            mutable.excludeIds = [...mutable.excludeIds, userId]
            console.log(`ADDED own user id to excluded ids`)
        }
    }
)
addCubeHint(avatarModifierAreaCube, {
    title: 'AVATAR MODIFIER AREA — toggle excluded id',
    whatIsTested: 'The gray box at the back left is an AvatarModifierArea with HIDE_AVATARS, half outside the scene. ' +
        'This cube adds or removes your own user id in the area\'s excludeIds.',
    steps: '1. Switch to third person and walk into the gray box: your avatar hides.\n' +
        '2. Click this cube (status: excluded) and walk into the box again: your avatar stays visible.\n' +
        '3. Click again (status: not excluded): your avatar hides inside the box again.\n' +
        'Each client applies only its own list: excluding yourself does not change what other players see.',
    getStatus: () => {
        const userId = getPlayer()?.userId
        const excluded = userId !== undefined && AvatarModifierArea.get(avatarModifierAreaEntity).excludeIds.includes(userId)
        return excluded ? 'your id is excluded' : 'your id is not excluded'
    }
})

const avatarModifierAreaText = engine.addEntity()
Transform.create(avatarModifierAreaText, {
    parent: avatarModifierAreaEntity,
    position: Vector3.create(0.25, 0.65, 0),
    rotation: Quaternion.fromEulerDegrees(0, -90, 0)
})
TextShape.create(avatarModifierAreaText, {
    text: "AVATAR MODIFIER AREA",
    fontSize: 1.25,
    textColor: Color4.Black()
})

// CAMERA MODE AREA
const cameraModeAreaEntity = engine.addEntity()
const areaSize = Vector3.create(4, 4, 4)
Transform.create(cameraModeAreaEntity, {
    position: Vector3.create(5.5, 1, 8),
    scale: areaSize,
    rotation: Quaternion.fromEulerDegrees(0, 45, 0)
})
CameraModeArea.create(cameraModeAreaEntity, {
    area: areaSize,
    mode: CameraType.CT_FIRST_PERSON
})
MeshRenderer.setBox(cameraModeAreaEntity)
Material.setPbrMaterial(cameraModeAreaEntity, { albedoColor: Color4.create(0.5, 0.5, 0.5, 0.5) })

const cube = createCube(8, 1, 12, false)
MeshCollider.setBox(cube)
pointerEventsSystem.onPointerDown(
    { entity: cube, opts: { button: InputAction.IA_POINTER, hoverText: 'reposition area' } },
    () => {
        // const mutable = CameraModeArea.getMutable(cameraModeAreaEntity)
        // if (mutable.mode == CameraType.CT_FIRST_PERSON) {
        //     mutable.mode = CameraType.CT_THIRD_PERSON
        //     console.log(`Camera mode changed to THIRD PERSON`)
        // } else {
        //     mutable.mode = CameraType.CT_FIRST_PERSON
        //     console.log(`Camera mode changed to FIRST PERSON`)
        // }
        
        const mutable = Transform.getMutable(cameraModeAreaEntity)
        mutable.position = Vector3.create(mutable.position.x === 16 ? 5.5 : 16, mutable.position.y, mutable.position.z)
    }
)
addCubeHint(cube, {
    title: 'CAMERA MODE AREA — reposition area',
    whatIsTested: 'Two CameraModeAreas under the CAMERA MODE AREA sign: the rotated box on the left forces first person, ' +
        'the box on the right forces third person, they overlap in the middle. ' +
        'This cube moves the rotated box to the scene border, half outside the scene, and back.',
    steps: '1. Walk into the rotated box: the camera switches to first person and V does not change it.\n' +
        '2. Walk into the right box: the camera switches to third person and stays locked.\n' +
        '3. Walk out of both boxes: the camera unlocks, V works again.\n' +
        '4. Click this cube: the rotated box moves to the scene border. Walk into it (first person), then keep walking ' +
        'out of the scene while still inside the box: the camera unlocks once you leave the scene.\n' +
        '5. Click again to move the box back.',
    getStatus: () => Transform.get(cameraModeAreaEntity).position.x === 16 ? 'rotated box at the scene border' : 'rotated box in place'
})

const cameraModeAreaEntity2 = engine.addEntity()
Transform.create(cameraModeAreaEntity2, {
    position: Vector3.create(8.5, 1, 8),
    scale: areaSize,
})
CameraModeArea.create(cameraModeAreaEntity2, {
    area: areaSize,
    mode: CameraType.CT_THIRD_PERSON
})
MeshRenderer.setBox(cameraModeAreaEntity2)
Material.setPbrMaterial(cameraModeAreaEntity2, { albedoColor: Color4.create(0.5, 0.5, 0.5, 0.5) })

const cameraModAreaText = engine.addEntity()
Transform.create(cameraModAreaText, {
    position: Vector3.create(7, 3.5, 8),
    // Face the spawn side of the scene
    rotation: Quaternion.fromEulerDegrees(0, 180, 0)
})
TextShape.create(cameraModAreaText, {
    text: "CAMERA MODE AREA",
    fontSize: 5,
    textColor: Color4.Black()
})

// POOLED AREA REUSE
// Regression coverage for unity-explorer#10428: a pooled area collider kept the scale of its previous owner.
// The explorer pools the collider behind every area. The red donor area is scaled to its own size, like the areas
// above; the swap button in the QA panel removes it (its collider goes back to the pool) and creates the green
// recipient area, which reuses that collider. The recipient hides your avatar anywhere inside its box, not only in a spot
// at its center. The auto check runs the same reuse with a TriggerArea probe, which shares that pool, moves the player
// next to the probe's edge and reports PASS when the probe reports the player entering.
const pooledAreaPosition = Vector3.create(13, 0, 3)
const donorAreaSize = Vector3.create(5, 2, 5)
const recipientAreaSize = Vector3.create(5, 4, 5)
const recipientCreationDelay = 0.5

const donorAreaEntity = engine.addEntity()
Transform.create(donorAreaEntity, {
    position: Vector3.add(pooledAreaPosition, Vector3.create(0, donorAreaSize.y / 2, 0)),
    scale: donorAreaSize
})
addDonorArea()

let recipientAreaEntity: Entity | undefined
let recipientCreationCountdown = 0

// Auto check: donor removed -> probe created -> player moved inside the probe, near its edge -> verdict
enum AutoCheckStep { Idle, CreateProbe, MovePlayer, Verdict }
const autoCheckStepDelay = 0.5
const autoCheckVerdictDelay = 1.5
// Inside the probe, 0.5m from its edge: well outside the 1x2x1 spot a probe with the donor's scale would cover
const autoCheckPlayerPosition = Vector3.create(11, 0, 1.5)

let autoCheckStep = AutoCheckStep.Idle
let autoCheckCountdown = 0
let autoCheckProbe: Entity | undefined
let autoCheckPlayerEntered = false
let autoCheckStatus = 'click to run'
let autoCheckStatusColor = Color4.White()

engine.addSystem((dt: number) => {
    if (autoCheckStep === AutoCheckStep.Idle) return

    autoCheckCountdown -= dt
    if (autoCheckCountdown > 0) return

    switch (autoCheckStep) {
        case AutoCheckStep.CreateProbe:
            autoCheckProbe = createAutoCheckProbe()
            console.log(`[pooledAreaReuse] auto check: probe added`)
            startAutoCheckStep(AutoCheckStep.MovePlayer, autoCheckStepDelay)
            break
        case AutoCheckStep.MovePlayer:
            movePlayerTo({
                newRelativePosition: autoCheckPlayerPosition,
                cameraTarget: Vector3.add(pooledAreaPosition, Vector3.create(0, 1, 0))
            })
            console.log(`[pooledAreaReuse] auto check: player moved next to the probe edge`)
            startAutoCheckStep(AutoCheckStep.Verdict, autoCheckVerdictDelay)
            break
        case AutoCheckStep.Verdict:
            finishAutoCheck()
            break
    }
})

setupAreaScaleDrift()

setupQaPanelUi({
    getAutoCheckStatus: () => autoCheckStatus,
    getAutoCheckStatusColor: () => autoCheckStatusColor,
    runAutoCheck,
    swapDonorAndRecipient,
    getAreaScaleDriftStatus,
    getAreaScaleDriftStatusColor,
    runAreaScaleDriftCheck,
    getNearbyCubeHint
})

engine.addSystem((dt: number) => {
    if (recipientCreationCountdown <= 0) return

    recipientCreationCountdown -= dt
    if (recipientCreationCountdown > 0) return

    recipientCreationCountdown = 0
    recipientAreaEntity = createRecipientArea()
    console.log(`[pooledAreaReuse] recipient area added`)
})

const pooledAreaText = engine.addEntity()
Transform.create(pooledAreaText, {
    position: Vector3.create(13, 3, 7),
    rotation: Quaternion.fromEulerDegrees(0, 180, 0)
})
TextShape.create(pooledAreaText, {
    text: "POOLED AREA REUSE\nQA info panel (top right): swap red donor / green recipient\nthird person: avatar hides anywhere in green",
    fontSize: 1.5,
    textColor: Color4.Black()
})

function addDonorArea() {
    AvatarModifierArea.createOrReplace(donorAreaEntity, {
        area: donorAreaSize,
        modifiers: [],
        excludeIds: []
    })
    MeshRenderer.setBox(donorAreaEntity)
    Material.setPbrMaterial(donorAreaEntity, { albedoColor: Color4.create(1, 0, 0, 0.3) })
}

function swapDonorAndRecipient() {
    if (recipientAreaEntity !== undefined) {
        engine.removeEntityWithChildren(recipientAreaEntity)
        recipientAreaEntity = undefined
        addDonorArea()
        console.log(`[pooledAreaReuse] recipient area removed, donor area added`)
        return
    }

    if (recipientCreationCountdown > 0 || autoCheckStep !== AutoCheckStep.Idle) return

    removeDonorArea()
    // Let the explorer release the donor's collider before the recipient asks the pool for one
    recipientCreationCountdown = recipientCreationDelay
    console.log(`[pooledAreaReuse] donor area removed`)
}

function runAutoCheck() {
    if (autoCheckStep !== AutoCheckStep.Idle || recipientCreationCountdown > 0) return

    if (recipientAreaEntity !== undefined) {
        setAutoCheckStatus('restore the red donor first', Color4.White())
        return
    }

    removeDonorArea()
    setAutoCheckStatus('running...', Color4.White())
    console.log(`[pooledAreaReuse] auto check: donor area removed`)
    startAutoCheckStep(AutoCheckStep.CreateProbe, autoCheckStepDelay)
}

function removeDonorArea() {
    AvatarModifierArea.deleteFrom(donorAreaEntity)
    MeshRenderer.deleteFrom(donorAreaEntity)
    Material.deleteFrom(donorAreaEntity)
}

function createAutoCheckProbe(): Entity {
    // Sized by its Transform scale, like any TriggerArea; scene code can't read whether an avatar is hidden, so the
    // probe's enter event stands in for the recipient's hide
    const entity = engine.addEntity()
    Transform.create(entity, {
        position: Vector3.add(pooledAreaPosition, Vector3.create(0, recipientAreaSize.y / 2, 0)),
        scale: recipientAreaSize
    })
    TriggerArea.setBox(entity, ColliderLayer.CL_PLAYER)
    autoCheckPlayerEntered = false
    triggerAreaEventsSystem.onTriggerEnter(entity, () => {
        autoCheckPlayerEntered = true
    })
    MeshRenderer.setBox(entity)
    Material.setPbrMaterial(entity, { albedoColor: Color4.create(0, 0, 1, 0.3) })
    return entity
}

function startAutoCheckStep(step: AutoCheckStep, delay: number) {
    autoCheckStep = step
    autoCheckCountdown = delay
}

function finishAutoCheck() {
    if (autoCheckPlayerEntered)
        setAutoCheckStatus('PASS: probe saw the player at its edge', Color4.Green())
    else
        setAutoCheckStatus('FAIL: probe missed the player at its edge, its collider kept the donor scale', Color4.Red())
    console.log(`[pooledAreaReuse] auto check: ${autoCheckPlayerEntered ? 'PASS' : 'FAIL'}`)

    if (autoCheckProbe !== undefined) {
        triggerAreaEventsSystem.removeOnTriggerEnter(autoCheckProbe)
        engine.removeEntity(autoCheckProbe)
        autoCheckProbe = undefined
    }
    addDonorArea()
    autoCheckStep = AutoCheckStep.Idle
}

function setAutoCheckStatus(status: string, color: Color4) {
    autoCheckStatus = status
    autoCheckStatusColor = color
}

function createRecipientArea(): Entity {
    // The Transform keeps scale 1: the area alone sets the size, the visible box is a scaled child
    const entity = engine.addEntity()
    Transform.create(entity, {
        position: Vector3.add(pooledAreaPosition, Vector3.create(0, recipientAreaSize.y / 2, 0))
    })
    AvatarModifierArea.create(entity, {
        area: recipientAreaSize,
        modifiers: [AvatarModifierType.AMT_HIDE_AVATARS],
        excludeIds: []
    })

    const box = engine.addEntity()
    Transform.create(box, { parent: entity, scale: recipientAreaSize })
    MeshRenderer.setBox(box)
    Material.setPbrMaterial(box, { albedoColor: Color4.create(0, 1, 0, 0.3) })

    return entity
}

function createCube(x: number, y: number, z: number, spawner = true): Entity {
    const entity = engine.addEntity()
    Transform.create(entity, { position: { x, y, z } })
    MeshRenderer.setBox(entity)
    MeshCollider.setBox(entity)
    Material.setPbrMaterial(entity, { albedoColor: Color4.fromHexString(getRandomHexColor()) })
    return entity
}

function getRandomHexColor(): string {
    const letters = "0123456789ABCDEF";
    let color = "#";
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}