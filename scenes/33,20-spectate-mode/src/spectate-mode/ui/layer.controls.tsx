import ReactEcs, { Button, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { Column, Icon, Row, Text, Tile } from './components'
import { UiText } from '@dcl/sdk/ecs'
import { SpectateMode } from '..'
import { SM_PlayerRoster } from '../playerRoster'

import { getPlayer } from '@dcl/sdk/players'
import { isMobile } from '@dcl/sdk/platform'

function getDisplayName(userId: string): string | undefined {
	return getPlayer({ userId: userId.toLowerCase() })?.name
}

function getCameraControls() {
	const desktop = <Column width="33%">
		<Row>
			<Tile backgroundColor={Color4.Clear()}>
				<Text value = ' ' />
			</Tile>
			<Tile>
				<Text value = 'W' />
			</Tile>
			<Tile backgroundColor={Color4.Clear()}>
				<Text value = ' ' />
			</Tile>
		</Row>
		<Row>
			<Tile>
				<Text value = 'A' />
			</Tile>
			<Tile>
				<Text value = 'S' />
			</Tile>
			<Tile>
				<Text value = 'D' />
			</Tile>
		</Row>
		<Row>
			<Text value = 'Move' />
		</Row>
	</Column>

	const mobile = <Column width="33%">		
		<Row>
			<Icon src="assets/images/spectate-mode/icon-pan.png" />
		</Row>	
		<Row>
			<Text value = 'Move' />
		</Row>
	</Column>

	return isMobile() ? mobile : desktop
}

function getElevationControls() {
	const desktop = <Column width="33%">
		<Row>
			<Tile backgroundColor={Color4.Clear()}>
				<Text value = ' ' />
			</Tile>
		</Row>
		<Row>
			<Tile>
				<Text value = 'E' />
			</Tile>
			<Tile>
				<Text value = 'F' />
			</Tile>
		</Row>
		<Row>
			<Text value = {SM_PlayerRoster.getCurrentPlayerUserId() ? 'Zoom' : 'Up / Down'} />
		</Row>
	</Column>

	const mobile = <Column width="33%">	
		<Row>
			<Icon src = {SM_PlayerRoster.getCurrentPlayerUserId() ? "assets/images/spectate-mode/icon-zoomIn.png" : "assets/images/spectate-mode/icon-up.png" } />
			<Icon src = {SM_PlayerRoster.getCurrentPlayerUserId() ? "assets/images/spectate-mode/icon-zoomOut.png" : "assets/images/spectate-mode/icon-down.png" } />
		</Row>	
		<Row>
		<Text value = {SM_PlayerRoster.getCurrentPlayerUserId() ? 'Zoom' : 'Raise / Lower'} />
		</Row>
	</Column>

	return isMobile() ? mobile : desktop
}

// MARK: UI: Controls
export function UIControls() {
	return (
		<UiEntity
			key         = {`ui_SpectateMode_Controls_Layer`}
			uiTransform = {{
				width         : '100%',
				height        : 'auto',
				positionType  : "absolute",
				position      : { bottom: 8 },
				flexDirection : 'column',
				justifyContent: 'flex-end',
				alignItems    : 'center',
				display       : SpectateMode.isEnabled() ? 'flex' : 'none',
			}}
		>
			<UiEntity
				key         = {`ui_SpectateMode_Controls_Button_Body`}
				uiTransform = {{
					width         : '25vw',
					height        : 'auto',
					borderRadius  : 8,
					flexDirection : 'column',
					alignItems    : 'stretch',
					justifyContent: 'flex-start',
					padding       : { top: 6, bottom: 6, left: 4, right: 4 },
				}}
				uiBackground = {{
					color: Color4.fromHexString('#88888855'),
				}}
			>
				<Row>
					{getElevationControls()}

					{getCameraControls()}

					<Column width="33%">
						<Row uiTransform={{ display: isMobile() ? 'none' : 'flex' }}>
							<Tile backgroundColor={Color4.Clear()}>
								<Text value = ' ' />
							</Tile>
						</Row>
						<Row>
							<Tile>
								<Text value = '1' />
							</Tile>
							<Tile>
								<Text value = '2' />
							</Tile>
						</Row>
						<Row>
							<Text value = 'Change target' />
						</Row>
					</Column>
				</Row>

				<UiEntity
					uiTransform = {{
						width     : '100%',
						height    : 3,
						flexShrink: 0,
						margin    : { top: 6, bottom: 6 },
					}}
					uiBackground={{
						color: Color4.fromHexString('#88888855'),
					}}
				/>

				<Row>
					<Column width="50%">
						<Row>
							<Text 
								textAlign = "middle-right"
								value     = 'Current Target: ' 
								/>
						</Row>
					</Column>
					<Column width="50%">
						<Row>
							<Text 
								textAlign = "middle-left"
								value     = {SM_PlayerRoster.getCurrentPlayerUserId() ? getDisplayName(SM_PlayerRoster.getCurrentPlayerUserId()!) : 'None'} 
								/>
						</Row>
					</Column>
				</Row>
			</UiEntity>
		</UiEntity>
	)
}
