import ReactEcs, { Button, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'

import { SpectateMode } from '..'
import { CONFIG } from '../config'
import { InfoRow } from './components'
import { SM_Camera } from '../camera'
import { SM_PlayerRoster } from '../playerRoster'


// MARK: formatUserId
/**
 * Truncates a userId to first 4 + ... + last 4 chars, or 'None' if missing.
 */
function formatUserId(userId: string | null | undefined): string {
	if (!userId) return 'None'
	return `${userId.substring(0, 4)}...${userId.substring(userId.length - 6)}`
}


// MARK: UI: Debug
export function UIDebug() {
	return (
		<UiEntity
			key         = {`ui_SpectateMode_Debug_Layer`}
			uiTransform = {{
				width         : '200',
				height        : '200',
				positionType  : "absolute",
				position      : { left: 58, top: "30vh" },
				borderRadius  : 8,
				flexDirection : "column",
				justifyContent: "center",
				alignItems    : "center",
				display       : CONFIG.DEBUG_LOGGING ? "flex" : "none",
			}}
			uiBackground = {{
				color: Color4.fromHexString('#88888855'),
			}}
		>
			<UiEntity
				uiTransform={{
					width: '100%',
					height: 'auto',
				}}
				uiText={{
					fontSize: 16,
					value   : 'Spectate Mode',
				}}
			/>
			<InfoRow
				title="Spectate Mode"
				value="Enabled"
				/>
			<InfoRow
				title="Pitch"
				value={SM_Camera.getPitch().toFixed(2)}
			/>
			<InfoRow
				title="Yaw"
				value={SM_Camera.getYaw().toFixed(2)}
			/>
			<InfoRow
				title="Zoom"
				value={SM_Camera.getZoom().toFixed(2)}
			/>
			<InfoRow
				title="Y Offset"
				value={SM_Camera.getYOffset().toFixed(2)}
			/>
			<InfoRow
				title="Player Count"
				value={SM_PlayerRoster.getPlayerCount().toString()}
			/>
			<InfoRow
				title="Current Player"
				value={formatUserId(SM_PlayerRoster.getCurrentPlayerUserId())}
			/>
		</UiEntity>
	)
}
