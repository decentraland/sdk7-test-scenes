import {
    engine,
    Entity,
    PointerLock,
    pointerEventsSystem,
    Transform,
    MeshRenderer,
    MeshCollider,
    InputAction,
    EventSystemCallback
} from '@dcl/sdk/ecs'
import {Vector3} from '@dcl/sdk/math';

let lockPointerTimer = 0;

export async function main() {
    PointerLock.create(engine.CameraEntity, {isPointerLocked: false});
    
    PointerLock.onChange(engine.CameraEntity, (pointerLock) => {
        if (!pointerLock) return;
        console.log(`Is pointer locked: ${pointerLock?.isPointerLocked}`);
    });

    createTestBox(Vector3.create(6, 1, 8), 'Lock', () => {
        PointerLock.getMutable(engine.CameraEntity).isPointerLocked = true;
    });

    createTestBox(Vector3.create(10, 1, 8), 'Unlock', () => {
        PointerLock.getMutable(engine.CameraEntity).isPointerLocked = false;
    });

    engine.addSystem(lockPointerAfterDelay);
}

function lockPointerAfterDelay(time: number) {
    lockPointerTimer += time;
    
    if (lockPointerTimer >= 10) {
        PointerLock.getMutable(engine.CameraEntity).isPointerLocked = true;
        lockPointerTimer = 0;
    }
}

function createTestBox(position: Vector3, hoverText: string, onClickCallback: EventSystemCallback) {
    const box = engine.addEntity()

    Transform.create(box, {
        position: position,
    })

    MeshRenderer.setBox(box)
    MeshCollider.setBox(box)

    pointerEventsSystem.onPointerDown(
        {
            entity: box,
            opts: {button: InputAction.IA_POINTER, hoverText: hoverText},
        },
        onClickCallback
    )
}