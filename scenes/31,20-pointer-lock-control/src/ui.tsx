import {Color4} from '@dcl/sdk/math';
import ReactEcs, {Button, ReactEcsRenderer, UiEntity} from '@dcl/sdk/react-ecs'
import {engine, PointerLock} from '@dcl/sdk/ecs'

export function setup() {
    ReactEcsRenderer.setUiRenderer(() => [
        menu()
    ]);
}

function menu() {
    return (
        <UiEntity
            uiTransform={{
                position: {top: 200, left: 200},
                width: 500,
                height: 300,
                margin: '16px 0 8px 270px',
                padding: 4,
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'space-between'
            }}
            uiBackground={{color: Color4.create(0.5, 0.8, 0.1, 0.6)}}
        >
            <Button
                uiTransform={{width: 300, height: 100, margin: 8}}
                value='Lock'
                variant='primary'
                fontSize={14}
                onMouseDown={() => {
                    console.log('lock');
                    PointerLock.getMutable(engine.CameraEntity).isPointerLocked = true;
                }}
            />

            <Button
                uiTransform={{width: 300, height: 100, margin: 8}}
                value='Unlock'
                variant='primary'
                fontSize={14}
                onMouseDown={() => {
                    console.log('unlock');
                    PointerLock.getMutable(engine.CameraEntity).isPointerLocked = false;
                }}
            />
        </UiEntity>
    );
}