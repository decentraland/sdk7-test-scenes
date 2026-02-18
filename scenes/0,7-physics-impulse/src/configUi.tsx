import ReactEcs, { ReactEcsRenderer, UiEntity, Label, Button, Input } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { engine, PhysicsForce, PhysicsImpulse } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'

// ---------------------------------------------------------------------------
// Panel type
// ---------------------------------------------------------------------------

type ActivePanel =
    | 'none'
    | 'tunnels'
    | 'impulseCubeConfig'
    | 'repulsionCubeConfig'
    | 'pendulumConfig'
    | 'forceConfig'
    | 'impulseConfig'

let activePanel: ActivePanel = 'none'

// ---------------------------------------------------------------------------
// Style (based on PR #51 web3 scene)
// ---------------------------------------------------------------------------

const PANEL_W = 450
const PANEL_BG = Color4.create(0.08, 0.08, 0.14, 0.95)
const INPUT_BG = Color4.create(0.15, 0.15, 0.22, 1)
const RESULT_BG = Color4.create(0.06, 0.06, 0.1, 1)
const LABEL_CLR = Color4.create(0.7, 0.7, 0.8, 1)
const TITLE_CLR = Color4.create(0.8, 0.85, 1, 1)
const DIM_CLR = Color4.create(0.6, 0.6, 0.65, 1)
const PLACEHOLDER_CLR = Color4.create(0.4, 0.4, 0.5, 1)

const CLR_FORCE = Color4.create(0.4, 0.7, 1, 1)
const CLR_IMPULSE = Color4.create(1, 0.3, 0.2, 1)

// ---------------------------------------------------------------------------
// Shared UI helpers (PR #51 style: label above input)
// ---------------------------------------------------------------------------

function FieldBlock(props: {
    label: string, value: string, placeholder: string,
    onChange: (v: string) => void
}): ReactEcs.JSX.Element {
    return (
        <UiEntity uiTransform={{ flexDirection: 'column', width: '100%', margin: { bottom: 8 } }}>
            <Label value={props.label}
                fontSize={16} color={LABEL_CLR}
                uiTransform={{ width: '100%', height: 22 }}
            />
            <Input value={props.value} placeholder={props.placeholder}
                onChange={props.onChange}
                fontSize={16} color={Color4.White()}
                placeholderColor={PLACEHOLDER_CLR}
                uiTransform={{ width: '100%', height: 40, margin: { top: 4 } }}
                uiBackground={{ color: INPUT_BG }}
            />
        </UiEntity>
    )
}

function StatusBlock(text: string, color: Color4): ReactEcs.JSX.Element | null {
    if (!text) return null
    return (
        <UiEntity uiTransform={{
            width: '100%', minHeight: 36, margin: { top: 10 },
            padding: 8, flexDirection: 'column'
        }} uiBackground={{ color: RESULT_BG }}>
            <Label value={text} fontSize={15} color={color}
                uiTransform={{ width: '100%' }} textWrap="wrap" />
        </UiEntity>
    )
}

function PresetButtons(set: (x: string, y: string, z: string) => void): ReactEcs.JSX.Element {
    return (
        <UiEntity uiTransform={{ flexDirection: 'row', width: '100%', height: 40, margin: { bottom: 10 } }}>
            <Button value="Up" variant="secondary" fontSize={15} color={Color4.White()}
                uiTransform={{ flex: 1, height: 40, margin: { right: 4 } }}
                onMouseDown={() => set('0', '1', '0')}
            />
            <Button value="Forward" variant="secondary" fontSize={15} color={Color4.White()}
                uiTransform={{ flex: 1, height: 40, margin: { right: 4 } }}
                onMouseDown={() => set('0', '0', '1')}
            />
            <Button value="45°" variant="secondary" fontSize={15} color={Color4.White()}
                uiTransform={{ flex: 1, height: 40 }}
                onMouseDown={() => set('0', '1', '1')}
            />
        </UiEntity>
    )
}

function DPadBlock(props: {
    getMag: () => number,
    onDir: (dir: Vector3) => void,
    onRelease?: () => void
}): ReactEcs.JSX.Element {
    const S = 60

    function btn(label: string, dir: Vector3): ReactEcs.JSX.Element {
        return (
            <Button value={label} variant="secondary" fontSize={22} color={Color4.White()}
                uiTransform={{ width: S, height: S }}
                onMouseDown={() => props.onDir(dir)}
                onMouseUp={props.onRelease ? () => props.onRelease!() : undefined}
            />
        )
    }

    const empty = <UiEntity uiTransform={{ width: S, height: S }} />

    return (
        <UiEntity uiTransform={{ flexDirection: 'column', alignItems: 'center', margin: { top: 8, bottom: 4 } }}>
            <Label value="Quick directions:" fontSize={14} color={DIM_CLR}
                uiTransform={{ height: 20, margin: { bottom: 6 } }} />
            <UiEntity uiTransform={{ flexDirection: 'row', margin: { bottom: 2 } }}>
                {empty}
                {btn('\u2191', Vector3.create(0, props.getMag(), 0))}
                {empty}
            </UiEntity>
            <UiEntity uiTransform={{ flexDirection: 'row', margin: { bottom: 2 } }}>
                {btn('\u2190', Vector3.create(-props.getMag(), 0, 0))}
                {empty}
                {btn('\u2192', Vector3.create(props.getMag(), 0, 0))}
            </UiEntity>
            <UiEntity uiTransform={{ flexDirection: 'row' }}>
                {empty}
                {btn('\u2193', Vector3.create(0, -props.getMag(), 0))}
                {empty}
            </UiEntity>
        </UiEntity>
    )
}

// =========================================================================
// TUNNEL PANEL (parcel -1,7)
// =========================================================================

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
        tunnelStatus = 'Invalid number'; tunnelStatusColor = Color4.create(1, 0.4, 0.4, 1); return
    }
    horizontalMag = h; verticalMag = v
    if (PhysicsForce.getOrNull(engine.PlayerEntity)) {
        const dir = PhysicsForce.get(engine.PlayerEntity).direction
        if (dir && dir.y !== 0) {
            PhysicsForce.createOrReplace(engine.PlayerEntity, { direction: Vector3.create(0, v, 0) })
        } else if (dir) {
            PhysicsForce.createOrReplace(engine.PlayerEntity, { direction: Vector3.create(0, 0, h) })
        }
    }
    tunnelStatus = `Applied: Horizontal=${h}, Vertical=${v}`
    tunnelStatusColor = Color4.create(0.3, 1, 0.4, 1)
}

function TunnelPanel(): ReactEcs.JSX.Element {
    return (
        <UiEntity uiTransform={{
            width: PANEL_W, positionType: 'absolute',
            position: { right: 10, top: '15%' },
            flexDirection: 'column', padding: 20,
        }} uiBackground={{ color: PANEL_BG }}>

            <Label value="Tunnel Magnitude" fontSize={22} color={TITLE_CLR}
                uiTransform={{ width: '100%', height: 30, margin: { bottom: 4 } }} />
            <Label value="Same value applies to both Force and Impulse tunnels"
                fontSize={14} color={DIM_CLR}
                uiTransform={{ width: '100%', height: 20, margin: { bottom: 12 } }} />

            <UiEntity uiTransform={{ flexDirection: 'row', height: 24, margin: { bottom: 10 } }}>
                <UiEntity uiTransform={{ width: 16, height: 16, margin: { right: 6, top: 4 } }}
                    uiBackground={{ color: Color4.create(0.1, 0.4, 0.8, 1) }} />
                <Label value="Force" fontSize={15} color={CLR_FORCE}
                    uiTransform={{ width: 55, margin: { right: 16 } }} />
                <UiEntity uiTransform={{ width: 16, height: 16, margin: { right: 6, top: 4 } }}
                    uiBackground={{ color: Color4.create(0.8, 0.15, 0.1, 1) }} />
                <Label value="Impulse" fontSize={15} color={CLR_IMPULSE}
                    uiTransform={{ width: 70 }} />
            </UiEntity>

            {FieldBlock({ label: 'Horizontal magnitude:', value: horizontalMagInput, placeholder: '10', onChange: (v) => { horizontalMagInput = v } })}
            {FieldBlock({ label: 'Vertical magnitude:', value: verticalMagInput, placeholder: '10', onChange: (v) => { verticalMagInput = v } })}

            <Button value="Apply" variant="primary" fontSize={18}
                uiTransform={{ width: '100%', height: 48, margin: { top: 4 } }}
                onMouseDown={() => applyTunnelMagnitudes()} />

            {StatusBlock(tunnelStatus, tunnelStatusColor)}
        </UiEntity>
    )
}

// =========================================================================
// IMPULSE CUBE PANEL (parcel 0,7 — left cube)
// =========================================================================

let cubeMag = 10
let cubeMagInput = '10'
let cubeDirX = '0'
let cubeDirY = '1'
let cubeDirZ = '1'
let cubeStatus = ''
let cubeStatusColor: Color4 = Color4.White()

export function getCubeMag() { return cubeMag }
export function getCubeDir(): Vector3 {
    const x = parseFloat(cubeDirX) || 0
    const y = parseFloat(cubeDirY) || 0
    const z = parseFloat(cubeDirZ) || 0
    const len = Math.sqrt(x * x + y * y + z * z)
    if (len === 0) return Vector3.create(0, cubeMag, 0)
    return Vector3.create((x / len) * cubeMag, (y / len) * cubeMag, (z / len) * cubeMag)
}

export function showImpulseCubePanel() { activePanel = 'impulseCubeConfig'; cubeStatus = '' }
export function hideImpulseCubePanel() { activePanel = 'none'; cubeStatus = '' }

function applyCubeSettings() {
    const m = parseFloat(cubeMagInput)
    if (isNaN(m)) {
        cubeStatus = 'Invalid number'; cubeStatusColor = Color4.create(1, 0.4, 0.4, 1); return
    }
    cubeMag = m
    const dir = getCubeDir()
    cubeStatus = `Magnitude=${m}, Dir=(${dir.x.toFixed(1)}, ${dir.y.toFixed(1)}, ${dir.z.toFixed(1)})`
    cubeStatusColor = Color4.create(0.3, 1, 0.4, 1)
}

function ImpulseCubePanel(): ReactEcs.JSX.Element {
    return (
        <UiEntity uiTransform={{
            width: PANEL_W, positionType: 'absolute',
            position: { right: 10, top: '15%' },
            flexDirection: 'column', padding: 20,
        }} uiBackground={{ color: PANEL_BG }}>

            <Label value="Impulse Cube" fontSize={22} color={TITLE_CLR}
                uiTransform={{ width: '100%', height: 30, margin: { bottom: 4 } }} />
            <Label value="Single impulse on trigger enter"
                fontSize={14} color={DIM_CLR}
                uiTransform={{ width: '100%', height: 20, margin: { bottom: 12 } }} />

            {FieldBlock({ label: 'Direction X:', value: cubeDirX, placeholder: '0', onChange: (v) => { cubeDirX = v } })}
            {FieldBlock({ label: 'Direction Y:', value: cubeDirY, placeholder: '1', onChange: (v) => { cubeDirY = v } })}
            {FieldBlock({ label: 'Direction Z:', value: cubeDirZ, placeholder: '1', onChange: (v) => { cubeDirZ = v } })}
            {FieldBlock({ label: 'Magnitude:', value: cubeMagInput, placeholder: '10', onChange: (v) => { cubeMagInput = v } })}

            {PresetButtons((x, y, z) => { cubeDirX = x; cubeDirY = y; cubeDirZ = z })}

            <Button value="Apply" variant="primary" fontSize={18}
                uiTransform={{ width: '100%', height: 48, margin: { top: 4 } }}
                onMouseDown={() => applyCubeSettings()} />

            {StatusBlock(cubeStatus, cubeStatusColor)}
        </UiEntity>
    )
}

// =========================================================================
// REPULSION CUBE PANEL (parcel 0,7 — right cube)
// =========================================================================

let repulsionMag = 10
let repulsionMagInput = '10'
let repulsionStatus = ''
let repulsionStatusColor: Color4 = Color4.White()

export function getRepulsionMag() { return repulsionMag }

export function showRepulsionCubePanel() { activePanel = 'repulsionCubeConfig'; repulsionStatus = '' }
export function hideRepulsionCubePanel() { activePanel = 'none'; repulsionStatus = '' }

function applyRepulsionSettings() {
    const m = parseFloat(repulsionMagInput)
    if (isNaN(m)) {
        repulsionStatus = 'Invalid number'; repulsionStatusColor = Color4.create(1, 0.4, 0.4, 1); return
    }
    repulsionMag = m
    repulsionStatus = `Magnitude=${m} (applied to all faces)`
    repulsionStatusColor = Color4.create(0.3, 1, 0.4, 1)
}

function RepulsionCubePanel(): ReactEcs.JSX.Element {
    return (
        <UiEntity uiTransform={{
            width: PANEL_W, positionType: 'absolute',
            position: { right: 10, top: '15%' },
            flexDirection: 'column', padding: 20,
        }} uiBackground={{ color: PANEL_BG }}>

            <Label value="Repulsion Cube" fontSize={22} color={TITLE_CLR}
                uiTransform={{ width: '100%', height: 30, margin: { bottom: 4 } }} />
            <Label value="Pushes player away from each face on contact"
                fontSize={14} color={DIM_CLR}
                uiTransform={{ width: '100%', height: 20, margin: { bottom: 12 } }} />

            {FieldBlock({ label: 'Impulse magnitude (all faces):', value: repulsionMagInput, placeholder: '10', onChange: (v) => { repulsionMagInput = v } })}

            <Button value="Apply" variant="primary" fontSize={18}
                uiTransform={{ width: '100%', height: 48, margin: { top: 4 } }}
                onMouseDown={() => applyRepulsionSettings()} />

            {StatusBlock(repulsionStatus, repulsionStatusColor)}
        </UiEntity>
    )
}

// =========================================================================
// PENDULUM BRIDGE PANEL (parcel 1,7)
// =========================================================================

let pendulumMag = 18
let pendulumMagInput = '18'
let pendulumStatus = ''
let pendulumStatusColor: Color4 = Color4.White()

export function getPendulumMag() { return pendulumMag }

export function showPendulumPanel() { activePanel = 'pendulumConfig'; pendulumStatus = '' }
export function hidePendulumPanel() { activePanel = 'none'; pendulumStatus = '' }

function applyPendulumSettings() {
    const m = parseFloat(pendulumMagInput)
    if (isNaN(m)) {
        pendulumStatus = 'Invalid number'; pendulumStatusColor = Color4.create(1, 0.4, 0.4, 1); return
    }
    pendulumMag = m
    pendulumStatus = `Magnitude=${m} (applied to all hammers)`
    pendulumStatusColor = Color4.create(0.3, 1, 0.4, 1)
}

function PendulumPanel(): ReactEcs.JSX.Element {
    return (
        <UiEntity uiTransform={{
            width: PANEL_W, positionType: 'absolute',
            position: { right: 10, top: '15%' },
            flexDirection: 'column', padding: 20,
        }} uiBackground={{ color: PANEL_BG }}>

            <Label value="Pendulum Bridge" fontSize={22} color={TITLE_CLR}
                uiTransform={{ width: '100%', height: 30, margin: { bottom: 4 } }} />
            <Label value="Swinging hammers knock player off the bridge"
                fontSize={14} color={DIM_CLR}
                uiTransform={{ width: '100%', height: 20, margin: { bottom: 12 } }} />

            {FieldBlock({ label: 'Impulse magnitude (all hammers):', value: pendulumMagInput, placeholder: '18', onChange: (v) => { pendulumMagInput = v } })}

            <Button value="Apply" variant="primary" fontSize={18}
                uiTransform={{ width: '100%', height: 48, margin: { top: 4 } }}
                onMouseDown={() => applyPendulumSettings()} />

            {StatusBlock(pendulumStatus, pendulumStatusColor)}
        </UiEntity>
    )
}

// =========================================================================
// FORCE CONFIG PANEL (parcel 0,8 — red zone)
// =========================================================================

let forceDirX = '0'
let forceDirY = '1'
let forceDirZ = '0'
let forceMag = '10'
let forceHeld = false
let forceStatus = ''
let forceStatusColor: Color4 = Color4.White()

export function showForcePanel() { activePanel = 'forceConfig'; forceStatus = '' }
export function hideForcePanel() { activePanel = 'none'; forceStatus = ''; forceHeld = false }

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

function ForceConfigPanel(): ReactEcs.JSX.Element {
    const holdLabel = forceHeld ? 'Release to stop' : 'Hold to apply force'

    return (
        <UiEntity uiTransform={{
            width: PANEL_W, positionType: 'absolute',
            position: { right: 10, top: '10%' },
            flexDirection: 'column', padding: 20,
        }} uiBackground={{ color: PANEL_BG }}>

            <Label value="Force Configurator" fontSize={22} color={CLR_FORCE}
                uiTransform={{ width: '100%', height: 30, margin: { bottom: 4 } }} />
            <Label value="Continuous force — active while button is held"
                fontSize={14} color={DIM_CLR}
                uiTransform={{ width: '100%', height: 20, margin: { bottom: 12 } }} />

            {FieldBlock({ label: 'Direction X:', value: forceDirX, placeholder: '0', onChange: (v) => { forceDirX = v } })}
            {FieldBlock({ label: 'Direction Y:', value: forceDirY, placeholder: '1', onChange: (v) => { forceDirY = v } })}
            {FieldBlock({ label: 'Direction Z:', value: forceDirZ, placeholder: '0', onChange: (v) => { forceDirZ = v } })}
            {FieldBlock({ label: 'Magnitude:', value: forceMag, placeholder: '10', onChange: (v) => { forceMag = v } })}

            {PresetButtons((x, y, z) => { forceDirX = x; forceDirY = y; forceDirZ = z })}

            <Button value={holdLabel} variant="primary" fontSize={18}
                uiTransform={{ width: '100%', height: 52, margin: { top: 4 } }}
                uiBackground={forceHeld
                    ? { color: Color4.create(0.2, 0.8, 0.3, 1) }
                    : { color: Color4.create(0.7, 0.2, 0.15, 1) }}
                onMouseDown={() => startForce()}
                onMouseUp={() => stopForce()}
            />

            {DPadBlock({
                getMag: () => parseFloat(forceMag) || 10,
                onDir: (dir) => startForceDir(dir),
                onRelease: () => stopForce()
            })}

            {StatusBlock(forceStatus, forceStatusColor)}
        </UiEntity>
    )
}

// =========================================================================
// IMPULSE CONFIG PANEL (parcel 0,8 — blue zone)
// =========================================================================

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
    const dir = len === 0
        ? Vector3.create(0, mag, 0)
        : Vector3.create((x / len) * mag, (y / len) * mag, (z / len) * mag)

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

function ImpulseConfigPanel(): ReactEcs.JSX.Element {
    return (
        <UiEntity uiTransform={{
            width: PANEL_W, positionType: 'absolute',
            position: { right: 10, top: '10%' },
            flexDirection: 'column', padding: 20,
        }} uiBackground={{ color: PANEL_BG }}>

            <Label value="Impulse Configurator" fontSize={22} color={CLR_IMPULSE}
                uiTransform={{ width: '100%', height: 30, margin: { bottom: 4 } }} />
            <Label value="Single impulse — fires once per click"
                fontSize={14} color={DIM_CLR}
                uiTransform={{ width: '100%', height: 20, margin: { bottom: 12 } }} />

            {FieldBlock({ label: 'Direction X:', value: impDirX, placeholder: '0', onChange: (v) => { impDirX = v } })}
            {FieldBlock({ label: 'Direction Y:', value: impDirY, placeholder: '1', onChange: (v) => { impDirY = v } })}
            {FieldBlock({ label: 'Direction Z:', value: impDirZ, placeholder: '0', onChange: (v) => { impDirZ = v } })}
            {FieldBlock({ label: 'Magnitude:', value: impMag, placeholder: '10', onChange: (v) => { impMag = v } })}

            {PresetButtons((x, y, z) => { impDirX = x; impDirY = y; impDirZ = z })}

            <Button value="Fire Impulse" variant="primary" fontSize={18}
                uiTransform={{ width: '100%', height: 52, margin: { top: 4 } }}
                onMouseDown={() => fireImpulse()} />

            {DPadBlock({
                getMag: () => parseFloat(impMag) || 10,
                onDir: (dir) => fireImpulseDir(dir)
            })}

            {StatusBlock(impStatus, impStatusColor)}
        </UiEntity>
    )
}

// =========================================================================
// Root
// =========================================================================

function UiRoot() {
    if (activePanel === 'tunnels') return TunnelPanel()
    if (activePanel === 'impulseCubeConfig') return ImpulseCubePanel()
    if (activePanel === 'repulsionCubeConfig') return RepulsionCubePanel()
    if (activePanel === 'pendulumConfig') return PendulumPanel()
    if (activePanel === 'forceConfig') return ForceConfigPanel()
    if (activePanel === 'impulseConfig') return ImpulseConfigPanel()
    return null
}

export function setupConfigUi() {
    ReactEcsRenderer.setUiRenderer(UiRoot)
}
