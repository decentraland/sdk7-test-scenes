import { engine } from '@dcl/sdk/ecs'
import { Color4 } from '@dcl/sdk/math'
import ReactEcs, {
    UiEntity,
    Label,
    ReactEcsRenderer,
    Dropdown
} from '@dcl/sdk/react-ecs'

const src = 'img.png'
const centeredImage = 'img.png'

// img.png is an RGBA sprite sheet with large transparent regions, so anything painted behind it
// shows through its own alpha. The padding cases below compare against a magenta backdrop, which
// only works with a fully opaque texture - hence this one (RGB, no alpha channel). Its 10px white
// frame also makes the painted quad's edges readable at a glance.
const opaqueSrc = 'opaque.png'

let dt = 0
let userId: string | undefined

engine.addSystem((t) => {
    dt += t
})

let currentValue = 0
const options = [
    function StretchAndTint() {
        const tint2 = Color4.lerp(
            Color4.Red(),
            Color4.Blue(),
            1 + Math.sin(dt + Math.cos(dt * 0.3)) * 0.5
        )
        return (
            <UiEntity
                uiTransform={{
                    width: `${(1 + Math.sin(dt) * 0.5) * 50}%`,
                    height: 244
                }}
                uiBackground={{
                    color: tint2,
                    textureMode: 'stretch',
                    texture: {
                        src
                    }
                }}
            >
                <Label value="STRETCH + TINT\n(borders are deformed)" fontSize={29} />
            </UiEntity>
        )
    },
    function NineSlicesAndTint() {
        const tint = Color4.lerp(
            Color4.Red(),
            Color4.Blue(),
            1 + Math.sin(dt + Math.cos(dt * 0.3)) * 0.5
        )
        return (
            <UiEntity
                uiTransform={{
                    width: `${(1 + Math.sin(dt) * 0.5) * 50}%`,
                    height: 128
                }}
                uiBackground={{
                    color: tint,
                    textureMode: 'nine-slices',
                    texture: {
                        src
                    }
                }}
            >
                <Label
                    value="NINE_SLICES + TINT"
                    color={Color4.Black()}
                    fontSize={29}
                />
            </UiEntity>
        )
    },
    function NineSlicesAndTint() {
        const tint = Color4.lerp(
            Color4.fromHexString('#336613ff'),
            Color4.fromHexString('#f099f3ff'),
            1 + Math.sin(dt) * 0.5
        )

        return (
            <UiEntity
                uiTransform={{
                    width: 200,
                    height: (1 + Math.sin(dt) * 0.5) * 200
                }}
                uiBackground={{
                    color: tint,
                    textureMode: 'nine-slices',
                    texture: {
                        src: centeredImage
                    }
                }}
            >
                <Label value="NINE_SLICES + TINT" color={Color4.Red()} fontSize={29} />
            </UiEntity>
        )
    },
    function NineSlicesAndMargin() {
        const margin = (1 + Math.cos(dt * 0.3)) * 0.1

        return (
            <UiEntity
                uiTransform={{
                    width: 256,
                    height: 256
                }}
                uiBackground={{
                    textureMode: 'nine-slices',
                    texture: {
                        src: centeredImage
                    },
                    textureSlices: {
                        top: margin,
                        bottom: margin,
                        left: margin,
                        right: margin
                    }
                }}
            >
                <Label
                    value={`NINE_SLICES (with margins ${margin.toFixed(2)})`}
                    color={Color4.Red()}
                    fontSize={29}
                />
            </UiEntity>
        )
    },
    function Center() {
        return (
            <UiEntity
                uiTransform={{
                    width: 250 + Math.cos(dt) * 100,
                    height: 128 + Math.sin(dt * 0.2) * 64
                }}
                uiBackground={{
                    textureMode: 'center',
                    texture: {
                        src: centeredImage
                    }
                }}
            >
                <Label value="CENTER" color={Color4.Green()} fontSize={29} />
            </UiEntity>
        )
    },
    function AvatarTexture() {
        return (
            <UiEntity
                uiTransform={{
                    width: 250 + Math.cos(dt) * 100,
                    height: 128 + Math.sin(dt * 0.2) * 64
                }}
                uiBackground={{
                    textureMode: 'center',
                    avatarTexture: {
                        userId: userId ?? ''
                    }
                }}
            >
                <Label value="CENTER" color={Color4.Green()} fontSize={29} />
            </UiEntity>
        )
    },
    // Regression coverage for unity-explorer#8758 / #10207: uiBackground did not cover
    // the padding area for 'stretch' and 'center' textureMode. Each case below wraps its
    // child in a magenta parent sized to exactly the child's own box, with no padding of
    // its own. The child paints on top of that magenta; any area the child fails to cover
    // shows the parent through as a magenta frame. Broken build = visible magenta,
    // fixed build = no magenta.
    function PaddingStretch() {
        const boxWidth = 460
        const boxHeight = 200
        return (
            <UiEntity
                uiTransform={{ width: boxWidth, height: boxHeight }}
                uiBackground={{ color: Color4.Magenta() }}
            >
                <UiEntity
                    uiTransform={{ width: boxWidth, height: boxHeight, padding: 36 }}
                    uiBackground={{ texture: { src: opaqueSrc }, textureMode: 'stretch' }}
                >
                    <Label
                        value={
                            'PADDING + STRETCH (repro of #8758)\n' +
                            'Texture must cover this whole box, including the 36px padding.\n' +
                            'ANY magenta visible anywhere = BROKEN (texture stopped at 388x128).\n' +
                            'NO magenta = FIXED.'
                        }
                        fontSize={18}
                        color={Color4.White()}
                    />
                </UiEntity>
            </UiEntity>
        )
    },
    function PaddingCenter() {
        const boxWidth = 400
        const boxHeight = 300
        return (
            <UiEntity
                uiTransform={{ width: boxWidth, height: boxHeight }}
                uiBackground={{ color: Color4.Magenta() }}
            >
                <UiEntity
                    uiTransform={{
                        width: boxWidth,
                        height: boxHeight,
                        padding: { top: 0, right: 72, bottom: 72, left: 0 },
                        positionType: 'absolute',
                        position: { top: 0, left: 0 }
                    }}
                    uiBackground={{ texture: { src: opaqueSrc }, textureMode: 'center' }}
                />
                {/* Fixed crosshair marking the TRUE center of the box (ignores padding). */}
                <UiEntity
                    uiTransform={{
                        width: 4,
                        height: 28,
                        positionType: 'absolute',
                        position: { top: boxHeight / 2 - 14, left: boxWidth / 2 - 2 }
                    }}
                    uiBackground={{ color: Color4.Black() }}
                />
                <UiEntity
                    uiTransform={{
                        width: 28,
                        height: 4,
                        positionType: 'absolute',
                        position: { top: boxHeight / 2 - 2, left: boxWidth / 2 - 14 }
                    }}
                    uiBackground={{ color: Color4.Black() }}
                />
                <UiEntity
                    uiTransform={{
                        width: boxWidth,
                        height: boxHeight,
                        positionType: 'absolute',
                        position: { top: 0, left: 0 },
                        padding: 8
                    }}
                >
                    <Label
                        value={
                            'PADDING + CENTER (asymmetric padding: top 0, right 72, bottom 72, left 0)\n' +
                            'Coverage is NOT the signal here (center mode never fills the box).\n' +
                            'Compare the image to the black crosshair, which marks the true center:\n' +
                            'BROKEN = image sits up-and-left of the crosshair.\n' +
                            'FIXED = image is centered exactly on the crosshair.'
                        }
                        fontSize={16}
                        color={Color4.White()}
                    />
                </UiEntity>
            </UiEntity>
        )
    },
    // Regression controls: nine-slices and plain color were already drawn by UITK itself
    // over the full box, so they must show NO magenta both before and after the fix.
    function PaddingNineSlices() {
        const boxWidth = 460
        const boxHeight = 200
        return (
            <UiEntity
                uiTransform={{ width: boxWidth, height: boxHeight }}
                uiBackground={{ color: Color4.Magenta() }}
            >
                <UiEntity
                    uiTransform={{ width: boxWidth, height: boxHeight, padding: 36 }}
                    uiBackground={{ texture: { src: opaqueSrc }, textureMode: 'nine-slices' }}
                >
                    <Label
                        value={
                            'PADDING + NINE-SLICES (regression control, NOT part of the bug)\n' +
                            'This mode was always correct. No magenta should ever show here,\n' +
                            'on either a broken or a fixed build.'
                        }
                        fontSize={18}
                        color={Color4.Black()}
                    />
                </UiEntity>
            </UiEntity>
        )
    },
    function PaddingColor() {
        const boxWidth = 460
        const boxHeight = 200
        return (
            <UiEntity
                uiTransform={{ width: boxWidth, height: boxHeight }}
                uiBackground={{ color: Color4.Magenta() }}
            >
                <UiEntity
                    uiTransform={{ width: boxWidth, height: boxHeight, padding: 36 }}
                    uiBackground={{ color: Color4.fromHexString('#1c7ed6ff') }}
                >
                    <Label
                        value={
                            'PADDING + COLOR (regression control, NOT part of the bug)\n' +
                            'A plain color fill was always correct. No magenta should ever show\n' +
                            'here, on either a broken or a fixed build.'
                        }
                        fontSize={18}
                        color={Color4.White()}
                    />
                </UiEntity>
            </UiEntity>
        )
    },
    function PaddingAndBorder() {
        const boxWidth = 460
        const boxHeight = 200
        return (
            <UiEntity
                uiTransform={{ width: boxWidth, height: boxHeight }}
                uiBackground={{ color: Color4.Magenta() }}
            >
                <UiEntity
                    uiTransform={{
                        width: boxWidth,
                        height: boxHeight,
                        padding: 36,
                        borderWidth: 8,
                        borderColor: Color4.Green()
                    }}
                    uiBackground={{ texture: { src: opaqueSrc }, textureMode: 'stretch' }}
                >
                    <Label
                        value={
                            'PADDING + BORDER (padding box and border box differ)\n' +
                            'The opaque green 8px border must stay fully visible at all times --\n' +
                            'the texture deliberately stops at the inner edge of the border, since\n' +
                            'in UI Toolkit custom-generated content draws on top of the border.\n' +
                            'BROKEN = magenta ring between the border and the texture.\n' +
                            'FIXED = texture flush against the border, no magenta.'
                        }
                        fontSize={16}
                        color={Color4.White()}
                    />
                </UiEntity>
            </UiEntity>
        )
    }
]

function selectOption(index: number) {
    currentValue = index
}

export const ui = () => {
    const Renderer = options[currentValue] || (() => null)

    return (
        <UiEntity
            uiTransform={{
                width: '100%',
                height: '50%',
                flexDirection: 'column',
                margin: { left: 300 }
            }}
            uiBackground={{ color: Color4.Black() }}
        >
            <Label value="Select an example from below" />
            <Dropdown options={options.map(($) => $.name)} onChange={selectOption} />
            <Renderer />
        </UiEntity>
    )
}

export function setupUi() {
    ReactEcsRenderer.setUiRenderer(ui)
}