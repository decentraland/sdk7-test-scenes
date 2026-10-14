import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { ReactEcsRenderer, UiEntity, Button, Label } from '@dcl/sdk/react-ecs'
import { CubeHint } from './cubeHints'

export type QaPanelActions = {
    getAutoCheckStatus: () => string
    getAutoCheckStatusColor: () => Color4
    runAutoCheck: () => void
    swapDonorAndRecipient: () => void
    getAreaScaleDriftStatus: () => string
    getAreaScaleDriftStatusColor: () => Color4
    runAreaScaleDriftCheck: () => void
    getNearbyCubeHint: () => CubeHint | undefined
}

const sections: [string, string][] = [
    ['WHAT IS TESTED',
        'Regressions for unity-explorer PR #10428. AvatarModifierArea, CameraModeArea and TriggerArea share one collider ' +
        'pool.\n' +
        'Pooled area reuse: a reused collider kept its previous owner\'s scale, so the new area covered only a spot at ' +
        'its center. Red box: donor area, scaled to its own size. Green box: HIDE_AVATARS area, scale 1. ' +
        'Blue box: TriggerArea probe. Green and blue reuse the red box collider.\n' +
        'Area scale drift: an area with an explicit size grew when its entity was scaled after the area was created. ' +
        'Orange box: a 2x2x2 CameraModeArea whose entity is scaled to 2.5.'],
    ['1. POOLED AREA AUTO CHECK (Run pooled area check)',
        'Click and wait ~3s. The scene removes the red box, creates the blue probe and moves you inside it, 0.5m from its edge.\n' +
        'FIXED: green PASS in the status line above.\n' +
        'BROKEN: red FAIL in the status line above.'],
    ['2. HIDE AVATARS (Swap red / green box)',
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
    ['4. AREA SCALE DRIFT AUTO CHECK (Run scale drift check)',
        'Click and wait ~4s. The scene creates the orange box, scales its entity, moves you to its center (the camera ' +
        'switches), then 2m from the center, outside the box.\n' +
        'FIXED: green PASS, the camera switches back outside the box.\n' +
        'BROKEN: red FAIL, the camera stays switched outside the box.\n' +
        'NOT RUN: the camera did not switch at the center, repeat the check.\n' +
        'On a build without the pool fix (dev) run this check first after entering the scene: a reused pooled ' +
        'collider can shrink the area and hide the bug.'],
    ['REPORT',
        'Explorer build or PR, which step failed, a screenshot. Scene logs use the [pooledAreaReuse] and ' +
        '[areaScaleDrift] prefixes.']
]

const panelWidth = 860
const bodyFontSize = 19
// SDK UI labels don't grow with wrapped text, so each label gets a height from its estimated line count
const charsPerLine = 80
const lineHeight = 26
const statusCharsPerLine = 70
const statusLineHeight = 30

let panelOpen = false

export function setupQaPanelUi(actions: QaPanelActions) {
    ReactEcsRenderer.setUiRenderer(() => (
        <UiEntity uiTransform={{ width: '100%', height: '100%', positionType: 'absolute' }}>
            <UiEntity uiTransform={{ positionType: 'absolute', position: { top: 80, right: 20 }, width: panelWidth, flexDirection: 'column', alignItems: 'flex-end' }}>
                <Button value={panelOpen ? 'Close QA info' : 'Modifier Areas — QA info'} fontSize={20}
                    uiTransform={{ width: 360, height: 46 }} onMouseDown={() => { panelOpen = !panelOpen }} />
                {panelOpen && (
                    <UiEntity uiTransform={{ width: panelWidth, flexDirection: 'column', padding: 12, margin: { top: 6 } }}
                        uiBackground={{ color: Color4.create(0, 0, 0, 0.85) }}>
                        <Label value='MODIFIER AREAS' fontSize={26} textAlign='middle-left' uiTransform={{ height: 40 }} />
                        {statusLabel('Pooled area auto check: ' + actions.getAutoCheckStatus(), actions.getAutoCheckStatusColor())}
                        {statusLabel('Area scale drift auto check: ' + actions.getAreaScaleDriftStatus(), actions.getAreaScaleDriftStatusColor())}
                        <UiEntity uiTransform={{ flexDirection: 'row' }}>
                            <Button value='Run pooled area check' fontSize={20} uiTransform={{ width: 270, height: 46, margin: 2 }}
                                onMouseDown={actions.runAutoCheck} />
                            <Button value='Swap red / green box' fontSize={20} uiTransform={{ width: 270, height: 46, margin: 2 }}
                                onMouseDown={actions.swapDonorAndRecipient} />
                            <Button value='Run scale drift check' fontSize={20} uiTransform={{ width: 270, height: 46, margin: 2 }}
                                onMouseDown={actions.runAreaScaleDriftCheck} />
                        </UiEntity>
                        <Label value='Alt: unlock the cursor to use the buttons.' fontSize={17} textAlign='middle-left' uiTransform={{ height: 28, margin: { bottom: 6 } }} />
                        {sections.map(([title, body]) => (
                            <UiEntity key={title} uiTransform={{ flexDirection: 'column', margin: { bottom: 6 } }}>
                                <Label value={title} fontSize={21} color={Color4.Yellow()} textAlign='middle-left' uiTransform={{ height: 30 }} />
                                <Label value={body} fontSize={bodyFontSize} textAlign='top-left' textWrap='wrap'
                                    uiTransform={{ width: panelWidth - 24, height: textHeight(body, charsPerLine, lineHeight) }} />
                            </UiEntity>
                        ))}
                    </UiEntity>
                )}
            </UiEntity>
            {cubeHintCard(actions.getNearbyCubeHint())}
        </UiEntity>
    ))
}

function cubeHintCard(hint: CubeHint | undefined) {
    if (hint === undefined) return null

    const bodyWidth = panelWidth - 24
    return (
        <UiEntity uiTransform={{ positionType: 'absolute', position: { bottom: 110, left: 0 }, width: '100%', justifyContent: 'center' }}>
            <UiEntity uiTransform={{ width: panelWidth, flexDirection: 'column', padding: 12 }}
                uiBackground={{ color: Color4.create(0, 0, 0, 0.85) }}>
                <Label value={hint.title} fontSize={24} textAlign='middle-left' uiTransform={{ height: 36 }} />
                {hint.getStatus !== undefined && (
                    <Label value={'Now: ' + hint.getStatus()} fontSize={20} color={Color4.Green()} textAlign='middle-left' uiTransform={{ height: 30 }} />
                )}
                <Label value='WHAT IS TESTED' fontSize={21} color={Color4.Yellow()} textAlign='middle-left' uiTransform={{ height: 30 }} />
                <Label value={hint.whatIsTested} fontSize={bodyFontSize} textAlign='top-left' textWrap='wrap'
                    uiTransform={{ width: bodyWidth, height: textHeight(hint.whatIsTested, charsPerLine, lineHeight) }} />
                <Label value='STEPS AND EXPECTED RESULT' fontSize={21} color={Color4.Yellow()} textAlign='middle-left' uiTransform={{ height: 30 }} />
                <Label value={hint.steps} fontSize={bodyFontSize} textAlign='top-left' textWrap='wrap'
                    uiTransform={{ width: bodyWidth, height: textHeight(hint.steps, charsPerLine, lineHeight) }} />
            </UiEntity>
        </UiEntity>
    )
}

function statusLabel(text: string, color: Color4) {
    return <Label value={text} fontSize={21} color={color} textAlign='top-left' textWrap='wrap'
        uiTransform={{ width: panelWidth - 24, height: textHeight(text, statusCharsPerLine, statusLineHeight) }} />
}

function textHeight(text: string, lineChars: number, lineHeightPx: number): number {
    const lines = text.split('\n').reduce((count, line) => count + Math.max(1, Math.ceil(line.length / lineChars)), 0)
    return lines * lineHeightPx
}
