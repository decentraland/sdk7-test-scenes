import { engine, Entity } from '@dcl/sdk/ecs'
import { ReactEcsRenderer } from '@dcl/sdk/react-ecs'

import { UIControls } from './layer.controls'
import { UIToggle } from './layer.toggle'
import { UIDebug } from './layer.debug'


// MARK: Main
const uiComponent = () => [
	UIControls(),
	UIToggle(),
	UIDebug()
]

export function setupSpectateModeUI(): Entity {
	const e = engine.addEntity()
	ReactEcsRenderer.addUiRenderer(e, uiComponent);
	return e
}
