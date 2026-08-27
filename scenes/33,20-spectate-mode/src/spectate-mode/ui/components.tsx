import { Color4 } from '@dcl/sdk/math'
import { isMobile } from '@dcl/sdk/platform'
import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'


// MARK: Column
export function Column({
	width,
	children,
	uiTransform
}: any) {
	return (
		<UiEntity
			uiTransform={{
				height        : 'auto',
				width         : width ?? '100%',
				display       : 'flex',
				flexDirection : 'column',
				alignItems    : 'stretch',
				justifyContent: 'flex-start',
				...uiTransform,
			}}
		>
			{children}
		</UiEntity>
	)
}


// MARK: Row
export function Row({
	children,
	uiTransform
}: any) {
	return (
		<UiEntity
			uiTransform={{
				height        : 'auto',
				width         : '100%',
				flexShrink    : 0,
				display       : 'flex',
				flexDirection : 'row',
				alignItems    : 'center',
				justifyContent: 'center',
				...uiTransform,
			}}
		>
			{children}
		</UiEntity>
	)
}


// MARK: Tile
export function Tile({
	children,
	backgroundColor,
	uiTransform
}: any) {
	return (
		<UiEntity
			uiTransform={{
				width         : isMobile() ? 48 : 32,
				height        : isMobile() ? 48 : 32,
				borderRadius  : 6,
				alignItems    : 'center',
				justifyContent: 'center',
				flexDirection : 'column',
				margin        : 2,
				...uiTransform,
			}}
			uiBackground = {{
				color: backgroundColor ?? Color4.fromHexString('#333333'),
			}}
		>
			{children}
		</UiEntity>
	)
}


// MARK: Text
export function Text({
	children,
	value,
	uiTransform,
	textAlign,
}: any) {
	return (
		<UiEntity
			uiTransform={{
				width     : '100%',
				height    : 24,
				flexShrink: 0,
				...uiTransform,
			}}
			uiText = {{
				value    : value,
				fontSize : 16,
				textAlign: textAlign ?? 'middle-center',
				color    : Color4.fromHexString('#ffffff'),
			}}
		>
			{children}
		</UiEntity>
	)
}


// MARK: InfoRow
export function InfoRow({
	title,
	value
}: any) {
	return (
		<UiEntity
			uiTransform={{
				height        : 'auto',
				width         : '100%',
				flexShrink    : 0,
				display       : 'flex',
				flexDirection : 'row',
				alignItems    : 'center',
				justifyContent: 'flex-start',
			}}
		>
			<UiEntity
				uiTransform={{
					height    : 'auto',
					width     : "50%",
					flexShrink: 0,
				}}
				uiText={{
					value    : title,
					textAlign: 'middle-left',
					textWrap : 'nowrap',
				}}
			></UiEntity>
			<UiEntity
				uiTransform={{
					height      : 'auto',
					width       : "50%",
					alignContent: 'flex-end',
					flexShrink  : 0,
				}}
				uiText={{
					textAlign: 'middle-right',
					value    : value,
					textWrap : 'nowrap',
				}}
			></UiEntity>
		</UiEntity>
	)
}


// MARK: Icon
export function Icon({
	src,
	children,
	uiTransform
}: any) {
	return (
		
		<UiEntity
			uiTransform={{
				width         : isMobile() ? 48 : 32,
				height        : isMobile() ? 48 : 32,
				borderRadius  : 6,
				alignItems    : 'center',
				justifyContent: 'center',
				flexDirection : 'column',
				margin        : 2,
				padding       : 6,
				...uiTransform,
			}}
			uiBackground = {{
				color: Color4.fromHexString('#333333'),
			}}
		>
			<UiEntity
				uiTransform={{
					height        : "100%",
					width         : "100%",
					flexShrink    : 0,
					display       : 'flex',
					alignItems    : 'center',
					justifyContent: 'center',
					...uiTransform,
				}}
				uiBackground = {{
					texture    : { src: src },
					textureMode: 'stretch',
				}}
			>
				{children}
			</UiEntity>
		</UiEntity>
	)
}
