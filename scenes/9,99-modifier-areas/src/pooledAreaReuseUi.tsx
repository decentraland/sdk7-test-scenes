import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { ReactEcsRenderer, UiEntity, Button, Label } from '@dcl/sdk/react-ecs'

export type PooledAreaReuseUiActions = {
    getAutoCheckStatus: () => string
    getAutoCheckStatusColor: () => Color4
    runAutoCheck: () => void
    swapDonorAndRecipient: () => void
}

const sections: [string, string][] = [
    ['WHAT IS TESTED',
        'Regression for unity-explorer PR #10428. AvatarModifierArea, CameraModeArea and TriggerArea share one collider ' +
        'pool. A reused collider kept its previous owner\'s scale, so the new area covered only a spot at its center.\n' +
        'Red box: donor area, scaled to its own size. Green box: HIDE_AVATARS area, scale 1. ' +
        'Blue box: TriggerArea probe. Green and blue reuse the red box collider.'],
    ['1. AUTO CHECK (right cube or button above)',
        'Click and wait ~3s. The scene removes the red box, creates the blue probe and moves you inside it, 0.5m from its edge.\n' +
        'FIXED: green PASS above the cube.\n' +
        'BROKEN: red FAIL above the cube.'],
    ['2. HIDE AVATARS (left cube or button above)',
        'Click: the red box disappears, the green box appears. Switch to third person and walk into the green box away ' +
        'from its center.\n' +
        'FIXED: your avatar hides anywhere inside the green box.\n' +
        'BROKEN: your avatar hides only in a 1m spot at the center.\n' +
        'Click again to restore the red box.'],
    ['3. MULTIPLAYER (two clients)',
        'Each player sees only the boxes they clicked. Player A creates the green box (step 2) and watches from outside; ' +
        'player B stands where A sees the green box, near its edge. Then swap roles.\n' +
        'FIXED: the player inside the green box is hidden for the other one.\n' +
        'BROKEN: the player inside stays visible unless at the very center.\n' +
        'Hiding depends on the build of the player who watches.'],
    ['REPORT',
        'Explorer build or PR, which step failed, a screenshot. Scene logs use the [pooledAreaReuse] prefix.']
]

const panelWidth = 860
const bodyFontSize = 19
// SDK UI labels don't grow with wrapped text, so each body gets a height from its estimated line count
const charsPerLine = 80
const lineHeight = 26

let panelOpen = false

export function setupPooledAreaReuseUi(actions: PooledAreaReuseUiActions) {
    ReactEcsRenderer.setUiRenderer(() => (
        <UiEntity uiTransform={{ width: '100%', height: '100%', positionType: 'absolute' }}>
            <UiEntity uiTransform={{ positionType: 'absolute', position: { top: 80, right: 20 }, width: panelWidth, flexDirection: 'column', alignItems: 'flex-end' }}>
                <Button value={panelOpen ? 'Close QA info' : 'Pooled Area Reuse — QA info'} fontSize={20}
                    uiTransform={{ width: 360, height: 46 }} onMouseDown={() => { panelOpen = !panelOpen }} />
                {panelOpen && (
                    <UiEntity uiTransform={{ width: panelWidth, flexDirection: 'column', padding: 12, margin: { top: 6 } }}
                        uiBackground={{ color: Color4.create(0, 0, 0, 0.85) }}>
                        <Label value='POOLED AREA REUSE' fontSize={26} textAlign='middle-left' uiTransform={{ height: 40 }} />
                        <Label value={'Auto check: ' + actions.getAutoCheckStatus()} fontSize={21} color={statusColor(actions.getAutoCheckStatusColor())}
                            textAlign='middle-left' uiTransform={{ height: 32 }} />
                        <UiEntity uiTransform={{ flexDirection: 'row' }}>
                            <Button value='Run auto check' fontSize={20} uiTransform={{ width: 300, height: 46, margin: 2 }}
                                onMouseDown={actions.runAutoCheck} />
                            <Button value='Swap red / green box' fontSize={20} uiTransform={{ width: 300, height: 46, margin: 2 }}
                                onMouseDown={actions.swapDonorAndRecipient} />
                        </UiEntity>
                        <Label value='Alt: unlock the cursor to use the buttons.' fontSize={17} textAlign='middle-left' uiTransform={{ height: 28, margin: { bottom: 6 } }} />
                        {sections.map(([title, body]) => (
                            <UiEntity key={title} uiTransform={{ flexDirection: 'column', margin: { bottom: 6 } }}>
                                <Label value={title} fontSize={21} color={Color4.Yellow()} textAlign='middle-left' uiTransform={{ height: 30 }} />
                                <Label value={body} fontSize={bodyFontSize} textAlign='top-left' textWrap='wrap'
                                    uiTransform={{ width: panelWidth - 24, height: bodyHeight(body) }} />
                            </UiEntity>
                        ))}
                    </UiEntity>
                )}
            </UiEntity>
        </UiEntity>
    ))
}

function bodyHeight(body: string): number {
    const lines = body.split('\n').reduce((count, line) => count + Math.max(1, Math.ceil(line.length / charsPerLine)), 0)
    return lines * lineHeight
}

// The world label uses black for idle states, unreadable on the dark panel
function statusColor(color: Color4): Color4 {
    return color.r === 0 && color.g === 0 && color.b === 0 ? Color4.White() : color
}
