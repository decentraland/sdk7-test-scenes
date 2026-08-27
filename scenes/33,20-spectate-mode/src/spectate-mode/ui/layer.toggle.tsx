import ReactEcs, { Button, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'

import { SpectateMode } from '..'
import { CONFIG } from '../config'


// MARK: Vars
const bgDefault = Color4.fromHexString('#88888855')
const bgHover   = Color4.fromHexString('#55555588')
let bgCurrent   = bgDefault

const borderDefault = Color4.fromHexString('#88888855')
const borderHover   = Color4.fromHexString('#cccccc55')
let borderCurrent   = bgDefault


// MARK: UI: Controls
export function UIToggle() {
	return (
		<UiEntity
			key         = {`ui_SpectateMode_Toggle_Layer`}
			uiTransform = {{
				width       : '64',
				height      : '64',
				positionType: "absolute",
				position    : { top: 8, right: "30vw" },
				borderRadius: 8,
				borderWidth : 1,
				borderColor : borderCurrent,
			}}
			uiBackground = {{
				color: bgCurrent,
			}}
			onMouseEnter = {() => {
				bgCurrent     = bgHover
				borderCurrent = borderHover
			}}
			onMouseLeave = {() => {
				bgCurrent     = bgDefault
				borderCurrent = borderDefault
			}}
			onMouseDown  = {() => {
				if (CONFIG.DEBUG_LOGGING) console.log('SpectateMode: pointerEventsSystem: clicked')
				SpectateMode.toggleSpectateMode()
			}}
		>
			<UiEntity
				key          = {`ui_SpectateMode_Toggle_Icon`}
				uiTransform  = {{
					width : '100%',
					height: '100%',
				}}
				uiBackground = {{
					texture: {
						src: "assets/images/spectate-mode/icon-spectate.png",
					},
					textureMode: "stretch",
				}}
			/>
		</UiEntity>
	)
}
