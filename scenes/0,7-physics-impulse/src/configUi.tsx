import ReactEcs, { ReactEcsRenderer, UiEntity, Label, Button, Input } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { engine, PhysicsForce, PhysicsImpulse } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'

// ---------------------------------------------------------------------------
// Panel type — only one can be active at a time
// ---------------------------------------------------------------------------

type ActivePanel = 'none' | 'tunnels' | 'forceConfig' | 'impulseConfig'
let activePanel: ActivePanel = 'none'

// ---------------------------------------------------------------------------
// Tunnel panel state
// ---------------------------------------------------------------------------

let horizontalMag = 10
let verticalMag = 10
let horizontalMagInput = '10'
let verticalMagInput = '10'
let tunnelStatus = ''
let tunnelStatusColor: Color4 = Color4.White()

export function getHorizontalMag() { return horizontalMag }
export function getVerticalMag() { return verticalMag }

export function showTunnelPanel() { activePanel = 'tunnels'; tunnelStatus = '' }
export function hideTunnelPanel() { activePanel = 'none'; tunnelStatus = '' }

function applyTunnelMagnitudes() {
    const h = parseFloat(horizontalMagInput)
    const v = parseFloat(verticalMagInput)

    if (isNaN(h) || isNaN(v)) {
        tunnelStatus = 'Invalid number'
        tunnelStatusColor = Color4.create(1, 0.3, 0.3, 1)
        return
    }

    horizontalMag = h
    verticalMag = v

    if (PhysicsForce.getOrNull(engine.PlayerEntity)) {
        const dir = PhysicsForce.get(engine.PlayerEntity).direction
        if (dir && dir.y !== 0) {
            PhysicsForce.createOrReplace(engine.PlayerEntity, {
                direction: Vector3.create(0, verticalMag, 0)
            })
        } else if (dir) {
            PhysicsForce.createOrReplace(engine.PlayerEntity, {
                direction: Vector3.create(0, 0, horizontalMag)
            })
        }
    }

    tunnelStatus = `Applied: H=${h}, V=${v}`
    tunnelStatusColor = Color4.create(0.3, 1, 0.4, 1)
}

// ---------------------------------------------------------------------------
// Force config panel state
// ---------------------------------------------------------------------------

let forceDirX = '0'
let forceDirY = '1'
let forceDirZ = '0'
let forceMag = '10'
let forceHeld = false
let forceStatus = ''
let forceStatusColor: Color4 = Color4.White()

export function showForcePanel() { activePanel = 'forceConfig'; forceStatus = '' }
export function hideForcePanel() {
    activePanel = 'none'
    forceStatus = ''
    forceHeld = false
}

function computeForceDir(): Vector3 {
    const x = parseFloat(forceDirX) || 0
    const y = parseFloat(forceDirY) || 0
    const z = parseFloat(forceDirZ) || 0
    const mag = parseFloat(forceMag) || 0
    const len = Math.sqrt(x * x + y * y + z * z)
    if (len === 0) return Vector3.create(0, mag, 0)
    return Vector3.create((x / len) * mag, (y / len) * mag, (z / len) * mag)
}

function startForce() {
    const dir = computeForceDir()
    PhysicsForce.createOrReplace(engine.PlayerEntity, { direction: dir })
    forceHeld = true
    forceStatus = `Force ON: (${dir.x.toFixed(1)}, ${dir.y.toFixed(1)}, ${dir.z.toFixed(1)})`
    forceStatusColor = Color4.create(0.3, 1, 0.4, 1)
}

function startForceDir(dir: Vector3) {
    PhysicsForce.createOrReplace(engine.PlayerEntity, { direction: dir })
    forceHeld = true
    forceStatus = `Force ON: (${dir.x.toFixed(1)}, ${dir.y.toFixed(1)}, ${dir.z.toFixed(1)})`
    forceStatusColor = Color4.create(0.3, 1, 0.4, 1)
}

function stopForce() {
    if (PhysicsForce.getOrNull(engine.PlayerEntity)) {
        PhysicsForce.deleteFrom(engine.PlayerEntity)
    }
    forceHeld = false
    forceStatus = 'Force OFF'
    forceStatusColor = Color4.create(0.7, 0.7, 0.7, 1)
}

// ---------------------------------------------------------------------------
// Impulse config panel state
// ---------------------------------------------------------------------------

let impDirX = '0'
let impDirY = '1'
let impDirZ = '0'
let impMag = '10'
let impTs = 0
let impStatus = ''
let impStatusColor: Color4 = Color4.White()

export function showImpulsePanel() { activePanel = 'impulseConfig'; impStatus = '' }
export function hideImpulsePanel() { activePanel = 'none'; impStatus = '' }

function fireImpulse() {
    const x = parseFloat(impDirX) || 0
    const y = parseFloat(impDirY) || 0
    const z = parseFloat(impDirZ) || 0
    const mag = parseFloat(impMag) || 0
    const len = Math.sqrt(x * x + y * y + z * z)

    let dir: Vector3
    if (len === 0) {
        dir = Vector3.create(0, mag, 0)
    } else {
        dir = Vector3.create((x / len) * mag, (y / len) * mag, (z / len) * mag)
    }

    impTs++
    PhysicsImpulse.createOrReplace(engine.PlayerEntity, { direction: dir, timestamp: impTs })
    impStatus = `Impulse #${impTs}: (${dir.x.toFixed(1)}, ${dir.y.toFixed(1)}, ${dir.z.toFixed(1)})`
    impStatusColor = Color4.create(0.3, 0.8, 1, 1)
}

function fireImpulseDir(dir: Vector3) {
    impTs++
    PhysicsImpulse.createOrReplace(engine.PlayerEntity, { direction: dir, timestamp: impTs })
    impStatus = `Impulse #${impTs}: (${dir.x.toFixed(1)}, ${dir.y.toFixed(1)}, ${dir.z.toFixed(1)})`
    impStatusColor = Color4.create(0.3, 0.8, 1, 1)
}

// ---------------------------------------------------------------------------
// Style constants
// ---------------------------------------------------------------------------

const PANEL_W = 380
const PANEL_BG = Color4.create(0.08, 0.08, 0.14, 0.95)
const INPUT_BG = Color4.create(0.15, 0.15, 0.22, 1)
const LABEL_CLR = Color4.create(0.7, 0.7, 0.8, 1)
const TITLE_CLR = Color4.create(0.8, 0.85, 1, 1)
const BTN_APPLY = Color4.create(0.2, 0.7, 0.3, 1)
const BTN_PRESET = Color4.create(0.3, 0.3, 0.4, 1)
const CLR_FORCE_TITLE = Color4.create(0.4, 0.7, 1, 1)
const CLR_IMPULSE_TITLE = Color4.create(1, 0.3, 0.2, 1)
const BTN_HOLD_IDLE = Color4.create(0.7, 0.2, 0.15, 1)
const BTN_HOLD_ACTIVE = Color4.create(0.2, 0.8, 0.3, 1)
const DPAD_BTN = Color4.create(0.25, 0.25, 0.35, 1)
const DPAD_SIZE = 54

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function DirRow(props: {
    label: string, value: string, placeholder: string,
    onChange: (v: string) => void
}): ReactEcs.JSX.Element {
    return (
        <UiEntity uiTransform={{ flexDirection: 'row', height: 36, margin: { bottom: 4 } }}>
            <Label value={props.label} fontSize={14} color={LABEL_CLR}
                uiTransform={{ width: 40 }} />
            <Input value={props.value} placeholder={props.placeholder}
                onChange={props.onChange}
                fontSize={14} color={Color4.White()}
                uiTransform={{ flex: 1, height: 36 }}
                uiBackground={{ color: INPUT_BG }}
            />
        </UiEntity>
    )
}

function PresetRow(setPreset: (x: string, y: string, z: string) => void): ReactEcs.JSX.Element {
    return (
        <UiEntity uiTransform={{ flexDirection: 'row', height: 32, margin: { bottom: 8 } }}>
            <Button value="Up" fontSize={12} color={Color4.White()}
                uiTransform={{ flex: 1, height: 32, margin: { right: 4 } }}
                uiBackground={{ color: BTN_PRESET }}
                onMouseDown={() => setPreset('0', '1', '0')}
            />
            <Button value="Fwd" fontSize={12} color={Color4.White()}
                uiTransform={{ flex: 1, height: 32, margin: { right: 4 } }}
                uiBackground={{ color: BTN_PRESET }}
                onMouseDown={() => setPreset('0', '0', '1')}
            />
            <Button value="45°" fontSize={12} color={Color4.White()}
                uiTransform={{ flex: 1, height: 32 }}
                uiBackground={{ color: BTN_PRESET }}
                onMouseDown={() => setPreset('0', '1', '1')}
            />
        </UiEntity>
    )
}

/**
 * D-pad: Up(Y+), Down(Y-), Left(X-), Right(X+).
 * For force: onPress starts, onRelease stops.
 * For impulse: onPress fires once, no onRelease needed.
 */
function DPad(props: {
    getMag: () => number,
    onDir: (dir: Vector3) => void,
    onRelease?: () => void
}): ReactEcs.JSX.Element {
    const s = DPAD_SIZE
    const gap = 2

    function btn(label: string, dir: Vector3): ReactEcs.JSX.Element {
        return (
            <Button value={label} fontSize={16} color={Color4.White()}
                uiTransform={{ width: s, height: s }}
                uiBackground={{ color: DPAD_BTN }}
                onMouseDown={() => props.onDir(dir)}
                onMouseUp={props.onRelease ? () => props.onRelease!() : undefined}
            />
        )
    }

    const empty = (
        <UiEntity uiTransform={{ width: s, height: s }} />
    )

    return (
        <UiEntity uiTransform={{
            flexDirection: 'column',
            alignItems: 'center',
            margin: { bottom: 8, top: 4 },
        }}>
            <Label value="Quick directions" fontSize={11} color={LABEL_CLR}
                uiTransform={{ height: 18, margin: { bottom: 4 } }} />

            {/* Row 1: UP */}
            <UiEntity uiTransform={{ flexDirection: 'row', margin: { bottom: gap } }}>
                {empty}
                {btn('\u2191', Vector3.create(0, props.getMag(), 0))}
                {empty}
            </UiEntity>

            {/* Row 2: LEFT, empty, RIGHT */}
            <UiEntity uiTransform={{ flexDirection: 'row', margin: { bottom: gap } }}>
                {btn('\u2190', Vector3.create(-props.getMag(), 0, 0))}
                {empty}
                {btn('\u2192', Vector3.create(props.getMag(), 0, 0))}
            </UiEntity>

            {/* Row 3: DOWN */}
            <UiEntity uiTransform={{ flexDirection: 'row' }}>
                {empty}
                {btn('\u2193', Vector3.create(0, -props.getMag(), 0))}
                {empty}
            </UiEntity>
        </UiEntity>
    )
}

// ---------------------------------------------------------------------------
// Tunnel panel
// ---------------------------------------------------------------------------

function TunnelPanel(): ReactEcs.JSX.Element {
    return (
        <UiEntity uiTransform={{
            width: PANEL_W, positionType: 'absolute',
            position: { top: 40, right: 20 },
            flexDirection: 'column', padding: 14,
        }} uiBackground={{ color: PANEL_BG }}>

            <Label value="Tunnel Magnitude"
                fontSize={20} color={TITLE_CLR}
                uiTransform={{ height: 30, margin: { bottom: 4 } }}
            />

            <UiEntity uiTransform={{ flexDirection: 'row', height: 22, margin: { bottom: 10 } }}>
                <UiEntity uiTransform={{ width: 14, height: 14, margin: { right: 4, top: 4 } }}
                    uiBackground={{ color: Color4.create(0.1, 0.4, 0.8, 1) }} />
                <Label value="Force" fontSize={12} color={Color4.create(0.4, 0.7, 1, 1)}
                    uiTransform={{ width: 50, margin: { right: 12 } }} />
                <UiEntity uiTransform={{ width: 14, height: 14, margin: { right: 4, top: 4 } }}
                    uiBackground={{ color: Color4.create(0.8, 0.15, 0.1, 1) }} />
                <Label value="Impulse" fontSize={12} color={Color4.create(1, 0.3, 0.2, 1)}
                    uiTransform={{ width: 60 }} />
            </UiEntity>

            <UiEntity uiTransform={{ flexDirection: 'row', height: 38, margin: { bottom: 6 } }}>
                <Label value="Horizontal:" fontSize={15} color={LABEL_CLR}
                    uiTransform={{ width: 110 }} />
                <Input value={horizontalMagInput} placeholder="10"
                    onChange={(v) => { horizontalMagInput = v }}
                    fontSize={15} color={Color4.White()}
                    uiTransform={{ flex: 1, height: 38 }}
                    uiBackground={{ color: INPUT_BG }}
                />
            </UiEntity>

            <UiEntity uiTransform={{ flexDirection: 'row', height: 38, margin: { bottom: 10 } }}>
                <Label value="Vertical:" fontSize={15} color={LABEL_CLR}
                    uiTransform={{ width: 110 }} />
                <Input value={verticalMagInput} placeholder="10"
                    onChange={(v) => { verticalMagInput = v }}
                    fontSize={15} color={Color4.White()}
                    uiTransform={{ flex: 1, height: 38 }}
                    uiBackground={{ color: INPUT_BG }}
                />
            </UiEntity>

            <Button value="APPLY" fontSize={18} color={Color4.White()}
                uiTransform={{ height: 44, margin: { bottom: 4 } }}
                uiBackground={{ color: BTN_APPLY }}
                onMouseDown={() => applyTunnelMagnitudes()}
            />

            {tunnelStatus ? (
                <Label value={tunnelStatus}
                    fontSize={14} color={tunnelStatusColor}
                    uiTransform={{ height: 24, margin: { top: 4 } }}
                    textAlign="middle-left"
                />
            ) : null}
        </UiEntity>
    )
}

// ---------------------------------------------------------------------------
// Force config panel
// ---------------------------------------------------------------------------

function ForceConfigPanel(): ReactEcs.JSX.Element {
    const holdColor = forceHeld ? BTN_HOLD_ACTIVE : BTN_HOLD_IDLE
    const holdLabel = forceHeld ? 'FORCE ACTIVE — release to stop' : 'HOLD TO APPLY FORCE'

    return (
        <UiEntity uiTransform={{
            width: PANEL_W, positionType: 'absolute',
            position: { top: 40, right: 20 },
            flexDirection: 'column', padding: 14,
        }} uiBackground={{ color: PANEL_BG }}>

            <Label value="Force Configurator"
                fontSize={20} color={CLR_FORCE_TITLE}
                uiTransform={{ height: 30, margin: { bottom: 8 } }}
            />

            {DirRow({ label: 'X:', value: forceDirX, placeholder: '0', onChange: (v) => { forceDirX = v } })}
            {DirRow({ label: 'Y:', value: forceDirY, placeholder: '1', onChange: (v) => { forceDirY = v } })}
            {DirRow({ label: 'Z:', value: forceDirZ, placeholder: '0', onChange: (v) => { forceDirZ = v } })}
            {DirRow({ label: 'Mag:', value: forceMag, placeholder: '10', onChange: (v) => { forceMag = v } })}

            {PresetRow((x, y, z) => { forceDirX = x; forceDirY = y; forceDirZ = z })}

            <Button value={holdLabel}
                fontSize={14} color={Color4.White()}
                uiTransform={{ height: 48, margin: { bottom: 8 } }}
                uiBackground={{ color: holdColor }}
                onMouseDown={() => startForce()}
                onMouseUp={() => stopForce()}
            />

            {DPad({
                getMag: () => parseFloat(forceMag) || 10,
                onDir: (dir) => startForceDir(dir),
                onRelease: () => stopForce()
            })}

            {forceStatus ? (
                <Label value={forceStatus}
                    fontSize={14} color={forceStatusColor}
                    uiTransform={{ height: 24, margin: { top: 4 } }}
                    textAlign="middle-left"
                />
            ) : null}
        </UiEntity>
    )
}

// ---------------------------------------------------------------------------
// Impulse config panel
// ---------------------------------------------------------------------------

function ImpulseConfigPanel(): ReactEcs.JSX.Element {
    return (
        <UiEntity uiTransform={{
            width: PANEL_W, positionType: 'absolute',
            position: { top: 40, right: 20 },
            flexDirection: 'column', padding: 14,
        }} uiBackground={{ color: PANEL_BG }}>

            <Label value="Impulse Configurator"
                fontSize={20} color={CLR_IMPULSE_TITLE}
                uiTransform={{ height: 30, margin: { bottom: 8 } }}
            />

            {DirRow({ label: 'X:', value: impDirX, placeholder: '0', onChange: (v) => { impDirX = v } })}
            {DirRow({ label: 'Y:', value: impDirY, placeholder: '1', onChange: (v) => { impDirY = v } })}
            {DirRow({ label: 'Z:', value: impDirZ, placeholder: '0', onChange: (v) => { impDirZ = v } })}
            {DirRow({ label: 'Mag:', value: impMag, placeholder: '10', onChange: (v) => { impMag = v } })}

            {PresetRow((x, y, z) => { impDirX = x; impDirY = y; impDirZ = z })}

            <Button value="FIRE IMPULSE" fontSize={18} color={Color4.White()}
                uiTransform={{ height: 48, margin: { bottom: 8 } }}
                uiBackground={{ color: BTN_APPLY }}
                onMouseDown={() => fireImpulse()}
            />

            {DPad({
                getMag: () => parseFloat(impMag) || 10,
                onDir: (dir) => fireImpulseDir(dir)
            })}

            {impStatus ? (
                <Label value={impStatus}
                    fontSize={14} color={impStatusColor}
                    uiTransform={{ height: 24, margin: { top: 4 } }}
                    textAlign="middle-left"
                />
            ) : null}
        </UiEntity>
    )
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

function UiRoot() {
    if (activePanel === 'tunnels') return TunnelPanel()
    if (activePanel === 'forceConfig') return ForceConfigPanel()
    if (activePanel === 'impulseConfig') return ImpulseConfigPanel()
    return null
}

export function setupConfigUi() {
    ReactEcsRenderer.setUiRenderer(UiRoot)
}
