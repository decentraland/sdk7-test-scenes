import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { Label, ReactEcsRenderer, UiEntity, Input, Dropdown, Button } from '@dcl/sdk/react-ecs'
import { engine, UiCanvasInformation } from '@dcl/sdk/ecs'
import { openNftDialog } from "~system/RestrictedActions";
import { isFlexBasisOn } from './systems'

const description = "This is an example of a text that is too long to fit in a single line. It will be broken into multiple lines.\n\nBelow is an example of a static background."
const Max_Chars = 45
const testImage1 = "images/avatar.png"
const testImage2 = "images/rickmorty-logo.png"
const dropdownOptions = [`Red`, `Blue`, `Green`]
let selectedColor = Color4.Clear()
let selectedOption = ''
let enteredText = ''
let buttonClicked = ''
let selfDeleteInputAlive = true
let selfDeleteStatus = 'Alive. Click the field and type.'
let selfDeleteCount = 0

export function setupUi() {
    ReactEcsRenderer.setUiRenderer(uiComponent)
}

const uiComponent = () => (
    [
        TextsAndBackgroundsExample(),
        InputExample(),
        DropdownExample(),
        ButtonExample(),
        SelfDeletingInputExample(),
        CanvasInformationExample(),
        FlexBasisPersistentToggleExample(),
        FlexBasisPoolingToggleExample(),
    ]
)

function TextsAndBackgroundsExample() {
    return <UiEntity
        uiTransform={{
            width: 500,
            height: 300,
            positionType: 'absolute',
            position: { top: '10%', left: '15%' },
            margin: '0',
            padding: 4,
        }}
        uiBackground={{ color: Color4.fromHexString("#4d544e") }}
    >
        <UiEntity
            uiTransform={{
                width: '100%',
                height: '100%',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'space-between'
            }}
            uiBackground={{ color: Color4.fromHexString("#4d814e") }}
        >
            <UiEntity
                uiTransform={{
                    width: '100%',
                    height: 30,
                    margin: '8px 0'
                }}
                uiText={{
                    value: 'Static Text 1',
                    fontSize: 35,
                    color: Color4.Yellow()
                }}
            />
            <Label
                value={'Static Text 2'}
                fontSize={30}
                color={Color4.Red()}
                uiTransform={{ width: '100%', height: 30 } }
                font={'serif'}
            />
            <Label
                value={'Static Text 3'}
                fontSize={25}
                color={Color4.Black()}
                uiTransform={{ width: '100%', height: 30 } }
            />
            <Label
                value={'Static Text 4'}
                fontSize={20}
                color={Color4.Blue()}
                uiTransform={{ width: '100%', height: 30 } }
            />
            <Label
                value={'Static Text 5'}
                fontSize={15}
                color={Color4.Magenta()}
                uiTransform={{ width: '100%', height: 30 } }
            />
            <Label
                value={'Dynamic Text\n' + getTime()}
                fontSize={30}
                uiTransform={{ width: '100%', height: 80 } }
            />
        </UiEntity>
        <UiEntity
            uiTransform={{
                width: '100%',
                height: '100%',
                margin: '0 0 0 5'
            }}
            uiBackground={{
                textureMode: 'center',
                texture: {
                    src: getRandomImage()
                }
            }}
            uiText={{
                value: 'Background example\n(dynamic texture)',
                fontSize: 20,
                color: Color4.Yellow(),
                textAlign: 'top-center'
            }}
        />
    </UiEntity>
}

function InputExample() {
    return <UiEntity
        uiTransform={{
            width: 500,
            height: 80,
            margin: '0 0 0 520px',
            positionType: 'absolute',
            position: { top: '10%', left: '15%' },
        }}
    >
        <Input
            onSubmit={(value) => {
                enteredText = 'Submitted value: ' + value
            }}
            onChange={(value) => {
                enteredText = 'Entering value: ' + value
            }}
            fontSize={35}
            placeholder={'Input example...'}
            placeholderColor={Color4.Gray()}
            color={Color4.Black()}
            uiTransform={{
                width: '400px',
                height: '80px'
            }}
            uiBackground={{
                color: Color4.White(),
            }}
            disabled={false}
        ></Input>
        <Label
            value={enteredText}
            fontSize={20}
            color={Color4.White()}
            textAlign={'middle-left'}
            uiTransform={{
                width: '100px',
                height: '80px',
                margin: '0 0 0 10px',
            }}
        />
    </UiEntity>
}

// Deletes its own <Input /> while the field still has keyboard focus, to check that the
// explorer restores the Player/Camera/Shortcuts input maps that focus blocked.
function SelfDeletingInputExample() {
    return <UiEntity
        uiTransform={{
            width: 640,
            height: 240,
            positionType: 'absolute',
            position: { top: '55%', left: '15%' },
            flexDirection: 'column',
            padding: 8,
        }}
        uiBackground={{ color: Color4.fromHexString("#4d544e") }}
    >
        <Label
            value={'Self-deleting input'}
            fontSize={24}
            color={Color4.Yellow()}
            textAlign={'middle-left'}
            uiTransform={{ width: '100%', height: 32 }}
        />
        <Label
            value={'Click the field, type, then press Enter: it deletes itself while focused.'}
            fontSize={15}
            color={Color4.White()}
            textAlign={'middle-left'}
            uiTransform={{ width: '100%', height: 24 }}
        />
        <Label
            value={'Without using Enter: typing "del" deletes it the same way.'}
            fontSize={15}
            color={Color4.White()}
            textAlign={'middle-left'}
            uiTransform={{ width: '100%', height: 24 }}
        />
        {SelfDeletingInputSlot()}
        <Label
            value={selfDeleteStatus}
            fontSize={16}
            color={Color4.Yellow()}
            textAlign={'middle-left'}
            uiTransform={{ width: '100%', height: 26 }}
        />
        <Button
            value={'Respawn input'}
            variant={'secondary'}
            fontSize={16}
            uiTransform={{ width: 200, height: 36, margin: '4px 0 0 0' }}
            onMouseDown={respawnSelfDeletingInput}
        />
    </UiEntity>
}

function SelfDeletingInputSlot() {
    if (!selfDeleteInputAlive)
        return <Label
            value={'Input deleted. Try walking with WASD and opening chat with Enter.'}
            fontSize={15}
            color={Color4.fromHexString("#ff8080")}
            textAlign={'middle-left'}
            uiTransform={{ width: '100%', height: 50 }}
        />

    return <Input
        onSubmit={() => deleteSelfDeletingInput('submitted')}
        onChange={(value) => {
            if (value.trim().toLowerCase() === 'del')
                deleteSelfDeletingInput('typed del')
        }}
        fontSize={24}
        placeholder={'Type here, then press Enter...'}
        placeholderColor={Color4.Gray()}
        color={Color4.Black()}
        uiTransform={{ width: '100%', height: 50 }}
        uiBackground={{ color: Color4.White() }}
        disabled={false}
    ></Input>
}

function deleteSelfDeletingInput(reason: string) {
    if (!selfDeleteInputAlive) return

    selfDeleteInputAlive = false
    selfDeleteCount += 1
    selfDeleteStatus = 'Deleted while focused (' + reason + '). Deletions: ' + selfDeleteCount
}

function respawnSelfDeletingInput() {
    selfDeleteInputAlive = true
    selfDeleteStatus = 'Alive. Click the field and type.'
}

function DropdownExample() {
    return <UiEntity
        uiTransform={{
            width: 500,
            height: 50,
            margin: '150px 0 0 520px',
            positionType: 'absolute',
            position: { top: '5%', left: '15%' },
        }}
    >
        <Dropdown
            options={dropdownOptions}
            onChange={selectOption}
            uiTransform={{
                width: '400px',
                height: '50px',
            }}
            uiBackground={{
                color: Color4.Teal(),
            }}
            fontSize={20}
            color={Color4.Black()}
            disabled={false}
            acceptEmpty={true}
            emptyLabel={'-- Dropdown example --'}
        />
        <Label
            value={selectedOption}
            fontSize={20}
            color={Color4.White()}
            textAlign={'middle-left'}
            uiTransform={{
                width: '100px',
                height: '50px',
                margin: '0 0 0 10px',
            }}
        />
        
    </UiEntity>
}

function ButtonExample() {
    return <UiEntity
        uiTransform={{
            width: 300,
            height: 60,
            margin: '230px 0 0 520px',
            positionType: 'absolute',
            position: { top: '5%', left: '15%' },
        }}
    >
        <Button
            value="Button example"
            fontSize={20}
            variant="primary"
            uiTransform={{ width: 200, height: 60 }}
            onMouseDown={() => {
                buttonClicked = 'BUTTON EXAMPLE down at ' + getTime()
            }}
            onMouseUp={() => {
                buttonClicked = 'BUTTON EXAMPLE up at ' + getTime()
            }}
        />
        <Label
            value={buttonClicked}
            fontSize={20}
            color={Color4.White()}
            textAlign={'middle-left'}
            uiTransform={{
                width: '100px',
                height: '60px',
                margin: '0 0 0 10px',
            }}
        />
    </UiEntity>
}

function CanvasInformationExample() {
    const multiLineDescription = breakLines(description, Max_Chars)
    return <UiEntity
        uiTransform={{
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'space-between',
            positionType: 'absolute',
            position: { right: "3%", bottom: '3%' },
            margin: '0 0 130 0'
        }}
        uiBackground={{ color: Color4.fromHexString("#4d544e") }}
    >
        <UiEntity
            uiTransform={{
                width: "auto",
                height: "auto",
                alignSelf: "center",
                padding: 4,
                justifyContent: 'flex-start',
                alignContent: 'flex-start',
            }}
            uiBackground={{ color: Color4.fromHexString("#92b096") }}
        >
            <Label
                value={multiLineDescription}
                fontSize={18}
                textAlign="middle-center"

                uiTransform={{
                    width: "auto",
                    height: "auto",
                    alignSelf: "center",
                    margin: '16px 16px 8px 16px',

                }}
            />
            <Label
                value={GetCanvasInfo()}
                fontSize={20}
                textAlign="middle-center"

                uiTransform={{
                    width: "auto",
                    height: "auto",
                    alignSelf: "center",
                    margin: '16px 16px 8px 16px',
                }}

                uiBackground={{ color: Color4.fromHexString("#4d544e") }}
            />
        </UiEntity>
    </UiEntity >
}

function GetCanvasInfo() : string {
    let canvasInfo = UiCanvasInformation.get(engine.RootEntity)
    return 'CANVAS INFORMATION' + '\n\n' + 
        'Size: ' + canvasInfo.width + 'x' + canvasInfo.height + '\n' +
        'Device Pixel Ratio: ' + canvasInfo.devicePixelRatio
}

// Regression coverage for unity-explorer#10207: Unity never wrote StyleKeyword.Null for
// flex-basis when the SDK stopped sending it, so a persistent VisualElement kept whatever
// flex-basis it was last given. `isFlexBasisOn()` (from `src/systems.ts`) flips every ~2s.
//
// This case updates the SAME entity in place every render: width stays 80, and flexBasis
// is added/removed on that one entity. On a broken build the blue box sticks at 300 the
// first time flexBasis is sent and never shrinks back down; on a fixed build it oscillates
// 300 -> 80 -> 300 in lockstep with the "Scene is sending" label. A fixed 80px reference
// outline is drawn below it: when the label says "no flexBasis", the blue box's right edge
// must land on the reference outline's right edge -- no need to measure pixels, just compare
// the two edges.
function FlexBasisPersistentToggleExample() {
    const sendingFlexBasis = isFlexBasisOn()
    return <UiEntity
        uiTransform={{
            width: 460,
            height: 230,
            flexDirection: 'column',
            positionType: 'absolute',
            position: { top: '8%', left: '55%' },
            padding: 8,
        }}
        uiBackground={{ color: Color4.fromHexString("#2a2a2a") }}
    >
        <Label
            value={'flex-basis clearing (same entity, updated in place)'}
            fontSize={16}
            color={Color4.White()}
            uiTransform={{ width: '100%', height: 22 }}
        />
        <Label
            value={`Scene is sending: ${sendingFlexBasis ? 'flexBasis = 300' : 'no flexBasis (width = 80 only)'}`}
            fontSize={16}
            color={Color4.Yellow()}
            uiTransform={{ width: '100%', height: 22 }}
        />
        <UiEntity uiTransform={{ width: '100%', height: 60, flexDirection: 'row' }}>
            <UiEntity
                uiTransform={{
                    width: 80,
                    height: 60,
                    ...(sendingFlexBasis ? { flexBasis: 300 } : {})
                }}
                uiBackground={{ color: Color4.fromHexString("#00b7ff") }}
            />
        </UiEntity>
        <Label
            value={'Broken: box sticks at the wide size forever. Fixed: box shrinks to match\nthe reference outline below whenever the label above says "no flexBasis".'}
            fontSize={13}
            color={Color4.fromHexString("#cccccc")}
            uiTransform={{ width: '100%', height: 44 }}
        />
        <UiEntity uiTransform={{ width: '100%', height: 24, flexDirection: 'row' }}>
            <UiEntity uiTransform={{ width: 80, height: 20, borderWidth: 2, borderColor: Color4.White() }} />
        </UiEntity>
    </UiEntity>
}

// Pooling variant of the case above: instead of updating one persistent entity, this
// alternates between two structurally different children (different `key`s), so react-ecs
// unmounts the old entity and mounts a brand-new one each toggle -- see the report for the
// verification that this really tears the entity down rather than patching it in place.
// This exercises the actual bug scenario: a freshly created VisualElement handed out of
// Unity's pool must not inherit flex-basis from whatever entity used that pooled element
// before.
function FlexBasisPoolingToggleExample() {
    const sendingFlexBasis = isFlexBasisOn()
    return <UiEntity
        uiTransform={{
            width: 460,
            height: 230,
            flexDirection: 'column',
            positionType: 'absolute',
            position: { top: '42%', left: '55%' },
            padding: 8,
        }}
        uiBackground={{ color: Color4.fromHexString("#2a2a2a") }}
    >
        <Label
            value={'flex-basis clearing (fresh entity each toggle, pooled element)'}
            fontSize={16}
            color={Color4.White()}
            uiTransform={{ width: '100%', height: 22 }}
        />
        <Label
            value={`Scene is mounting: ${sendingFlexBasis ? 'a NEW child WITH flexBasis = 300' : 'a DIFFERENT new child, no flexBasis'}`}
            fontSize={16}
            color={Color4.Yellow()}
            uiTransform={{ width: '100%', height: 22 }}
        />
        <UiEntity uiTransform={{ width: '100%', height: 60, flexDirection: 'row' }}>
            {sendingFlexBasis
                ? <UiEntity
                    key="flex-basis-pool-with-basis"
                    uiTransform={{ width: 80, height: 60, flexBasis: 300 }}
                    uiBackground={{ color: Color4.fromHexString("#ff7a00") }}
                />
                : <UiEntity
                    key="flex-basis-pool-without-basis"
                    uiTransform={{ width: 80, height: 60 }}
                    uiBackground={{ color: Color4.fromHexString("#ff7a00") }}
                />}
        </UiEntity>
        <Label
            value={'Broken: the freshly mounted "no flexBasis" child still renders 300 wide\n(inherited from the pooled element). Fixed: it always matches the reference\noutline below, exactly like the persistent-entity case on the left.'}
            fontSize={13}
            color={Color4.fromHexString("#cccccc")}
            uiTransform={{ width: '100%', height: 56 }}
        />
        <UiEntity uiTransform={{ width: '100%', height: 24, flexDirection: 'row' }}>
            <UiEntity uiTransform={{ width: 80, height: 20, borderWidth: 2, borderColor: Color4.White() }} />
        </UiEntity>
    </UiEntity>
}

function GitHubLinkUi() {
    return <UiEntity
        uiTransform={{
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'space-between',
            positionType: 'absolute',
            position: { right: "3%", bottom: '3%' },
            margin: '0 135 10 0'
        }}
    >
        <UiEntity
            uiTransform={{
                width: '100',
                height: '100',
            }}
            uiBackground={{
                textureMode: 'stretch',
                texture: {
                    src: testImage1
                }
            }}
            onMouseDown={() => {
                //console.log("OPENING LINK")
                //openExternalUrl({ url: "https://www.google.com" })
                
                //console.log("MOVING PLAYER")
                //movePlayerTo({ newRelativePosition: { x: 15, y: 5, z: 15 }, cameraTarget: { x: 5, y: 0, z: 5 } })

                //console.log("TELEPORTING PLAYER")
                //teleportTo({ worldCoordinates: { x: 20, y: -15 } })

                //console.log("CHANGING REALM")
                //changeRealm({ 
                //    realm: "https://peer.decentraland.org",
                //    message: "SANTI -> Changing realm to peer.decentraland.org"
                //})

                //console.log("TRIGGERING EMOTE")
                //triggerEmote({ predefinedEmote: "robot" })

                //console.log("TRIGGERING SCENE EMOTE")
                //triggerSceneEmote({ src: 'animations/Snowball_Throw.glb', loop: true })

                //console.log("SHOWING NFT DIALOG")
                openNftDialog({ urn: "urn:decentraland:ethereum:erc721:0x06012c8cf97bead5deae237070f9587f8e7a266d:1540722" })
            }}
        />
        <Label
            value="Test Restricted Action"
            color={Color4.Black()}
            fontSize={18}
            textAlign="middle-center"
        />
    </UiEntity>
}

function breakLines(text: string, linelength: number) {
    const lineBreak = '\n'
    var counter = 0
    var line = ''
    var returnText = ''
    var bMatchFound = false
    const lineLen = linelength ? linelength : 50


    if (!text) return ''
    if (text.length < lineLen + 1) { return text }

    while (counter < text.length) {
        line = text.substring(counter, counter + lineLen);
        bMatchFound = false
        if (line.length == lineLen) {
            for (var i = line.length; i > -1; i--) {
                if (line.substring(i, i + 1) == ' ') {
                    counter += line.substring(0, i).length
                    line = line.substring(0, i) + lineBreak
                    returnText += line
                    bMatchFound = true
                    break
                }
            }

            if (!bMatchFound) {
                counter += line.length
                line = line + lineBreak
                returnText += line
            }
        }
        else {
            returnText += line
            break // We're breaking out of the the while(), not the for()
        }
    }

    return returnText
}

function getTime() {
    const date = new Date()
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const seconds = String(date.getSeconds()).padStart(2, '0')
    return `${hours}:${minutes}:${seconds}`
}

function getRandomImage() : string {
    const date = new Date()
    const seconds = date.getSeconds()
    if (seconds % 2 == 0) {
        return testImage2
    } else {
        return testImage1
    }
}

function selectOption(index: number) {
    switch (index) {
        case 0:
            selectedColor =  Color4.Red()
            break
        case 1:
            selectedColor = Color4.Blue()
            break
        case 2:
            selectedColor = Color4.Green()
            break
    }

    selectedOption = 'Selected option: ' + dropdownOptions[index]
}
