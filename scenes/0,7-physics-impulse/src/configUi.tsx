import ReactEcs, { ReactEcsRenderer, UiEntity, Label, Button, Input } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { engine, PhysicsForce, PhysicsImpulse } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'

// ---------------------------------------------------------------------------
// Panel type — only one can be active at a time
// ---------------------------------------------------------------------------

type ActivePanel = 'none' | 'tunnels' | 'configurator'
let activePanel: ActivePanel = 'none'

// ---------------------------------------------------------------------------
// Tunnel panel state — magnitude values shared with tunnel callbacks
// ---------------------------------------------------------------------------

let horizontalMag = 10
let verticalMag = 10
let horizontalMagInput = '10'
let verticalMagInput = '10'
let tunnelStatus = ''
let tunnelStatusColor: Color4 = Color4.White()

export function getHorizontalMag() { return horizontalMag }
export function getVerticalMag() { return verticalMag }

export function showTunnelPanel() {
    activePanel = 'tunnels'
    tunnelStatus = ''
}

export function hideTunnelPanel() {
    activePanel = 'none'
    tunnelStatus = ''
}

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

    // Re-apply force if the player currently has PhysicsForce active
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
// Full configurator state (for parcel 0,8)
// ---------------------------------------------------------------------------

let cfgMode: 'force' | 'impulse' = 'force'
let cfgDirX = '0'
let cfgDirY = '1'
let cfgDirZ = '0'
let cfgMagnitude = '10'
let cfgImpulseTs = 0
let cfgStatus = ''
let cfgStatusColor: Color4 = Color4.White()

export function showConfigPanel() {
    activePanel = 'configurator'
    cfgStatus = ''
}

export function hideConfigPanel() {
    activePanel = 'none'
    cfgStatus = ''
}

function computeDirection(): Vector3 {
    const x = parseFloat(cfgDirX) || 0
    const y = parseFloat(cfgDirY) || 0
    const z = parseFloat(cfgDirZ) || 0
    const mag = parseFloat(cfgMagnitude) || 0
    const len = Math.sqrt(x * x + y * y + z * z)
    if (len === 0) return Vector3.create(0, mag, 0)
    return Vector3.create((x / len) * mag, (y / len) * mag, (z / len) * mag)
}

function applyConfigPhysics() {
    const dir = computeDirection()
    if (cfgMode === 'force') {
        PhysicsForce.createOrReplace(engine.PlayerEntity, { direction: dir })
        cfgStatus = `Force: (${dir.x.toFixed(1)}, ${dir.y.toFixed(1)}, ${dir.z.toFixed(1)})`
        cfgStatusColor = Color4.create(0.3, 1, 0.4, 1)
    } else {
        cfgImpulseTs++
        PhysicsImpulse.createOrReplace(engine.PlayerEntity, { direction: dir, timestamp: cfgImpulseTs })
        cfgStatus = `Impulse #${cfgImpulseTs}: (${dir.x.toFixed(1)}, ${dir.y.toFixed(1)}, ${dir.z.toFixed(1)})`
        cfgStatusColor = Color4.create(0.3, 0.8, 1, 1)
    }
}

function resetConfigPhysics() {
    if (PhysicsForce.getOrNull(engine.PlayerEntity)) {
        PhysicsForce.deleteFrom(engine.PlayerEntity)
    }
    cfgStatus = 'Reset'
    cfgStatusColor = Color4.create(0.7, 0.7, 0.7, 1)
}

function setPreset(x: string, y: string, z: string, label: string) {
    cfgDirX = x; cfgDirY = y; cfgDirZ = z
    cfgStatus = `Preset: ${label}`
    cfgStatusColor = Color4.create(0.8, 0.8, 0.3, 1)
}

// ---------------------------------------------------------------------------
// Style constants
// ---------------------------------------------------------------------------

const PANEL_BG = Color4.create(0.08, 0.08, 0.14, 0.95)
const INPUT_BG = Color4.create(0.15, 0.15, 0.22, 1)
const LABEL_CLR = Color4.create(0.7, 0.7, 0.8, 1)
const TITLE_CLR = Color4.create(0.8, 0.85, 1, 1)
const BTN_FORCE = Color4.create(0.2, 0.5, 0.9, 1)
const BTN_IMPULSE = Color4.create(0.9, 0.4, 0.2, 1)
const BTN_APPLY = Color4.create(0.2, 0.7, 0.3, 1)
const BTN_RESET = Color4.create(0.5, 0.5, 0.5, 1)
const BTN_PRESET = Color4.create(0.3, 0.3, 0.4, 1)

// ---------------------------------------------------------------------------
// Tunnel magnitude panel
// ---------------------------------------------------------------------------

function TunnelPanel(): ReactEcs.JSX.Element {
    return (
        <UiEntity uiTransform={{
            width: 300,
            positionType: 'absolute',
            position: { top: 40, right: 20 },
            flexDirection: 'column',
            padding: 12,
        }} uiBackground={{ color: PANEL_BG }}>

            <Label value="Tunnel Magnitude"
                fontSize={18} color={TITLE_CLR}
                uiTransform={{ height: 28, margin: { bottom: 4 } }}
            />

            {/* Color legend */}
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

            {/* Horizontal magnitude */}
            <UiEntity uiTransform={{ flexDirection: 'row', height: 36, margin: { bottom: 6 } }}>
                <Label value="Horizontal:" fontSize={14} color={LABEL_CLR}
                    uiTransform={{ width: 100 }} />
                <Input value={horizontalMagInput} placeholder="10"
                    onChange={(v) => { horizontalMagInput = v }}
                    fontSize={14} color={Color4.White()}
                    uiTransform={{ flex: 1, height: 36 }}
                    uiBackground={{ color: INPUT_BG }}
                />
            </UiEntity>

            {/* Vertical magnitude */}
            <UiEntity uiTransform={{ flexDirection: 'row', height: 36, margin: { bottom: 10 } }}>
                <Label value="Vertical:" fontSize={14} color={LABEL_CLR}
                    uiTransform={{ width: 100 }} />
                <Input value={verticalMagInput} placeholder="10"
                    onChange={(v) => { verticalMagInput = v }}
                    fontSize={14} color={Color4.White()}
                    uiTransform={{ flex: 1, height: 36 }}
                    uiBackground={{ color: INPUT_BG }}
                />
            </UiEntity>

            <Button value="APPLY" fontSize={16} color={Color4.White()}
                uiTransform={{ height: 40, margin: { bottom: 4 } }}
                uiBackground={{ color: BTN_APPLY }}
                onMouseDown={() => applyTunnelMagnitudes()}
            />

            {tunnelStatus ? (
                <Label value={tunnelStatus}
                    fontSize={13} color={tunnelStatusColor}
                    uiTransform={{ height: 24, margin: { top: 4 } }}
                    textAlign="middle-left"
                />
            ) : null}
        </UiEntity>
    )
}

// ---------------------------------------------------------------------------
// Full configurator panel
// ---------------------------------------------------------------------------

function ConfiguratorPanel(): ReactEcs.JSX.Element {
    const modeColor = cfgMode === 'force' ? BTN_FORCE : BTN_IMPULSE
    const modeLabel = cfgMode === 'force' ? 'MODE: FORCE' : 'MODE: IMPULSE'

    return (
        <UiEntity uiTransform={{
            width: 320,
            positionType: 'absolute',
            position: { top: 40, right: 20 },
            flexDirection: 'column',
            padding: 12,
        }} uiBackground={{ color: PANEL_BG }}>

            <Label value="Physics Configurator"
                fontSize={18} color={TITLE_CLR}
                uiTransform={{ height: 28, margin: { bottom: 8 } }}
            />

            <Button value={modeLabel}
                fontSize={14} color={Color4.White()}
                uiTransform={{ height: 36, margin: { bottom: 8 } }}
                uiBackground={{ color: modeColor }}
                onMouseDown={() => { cfgMode = cfgMode === 'force' ? 'impulse' : 'force' }}
            />

            {/* Direction X */}
            <UiEntity uiTransform={{ flexDirection: 'row', height: 36, margin: { bottom: 4 } }}>
                <Label value="X:" fontSize={14} color={LABEL_CLR}
                    uiTransform={{ width: 30 }} />
                <Input value={cfgDirX} placeholder="0"
                    onChange={(v) => { cfgDirX = v }}
                    fontSize={14} color={Color4.White()}
                    uiTransform={{ flex: 1, height: 36 }}
                    uiBackground={{ color: INPUT_BG }}
                />
            </UiEntity>

            {/* Direction Y */}
            <UiEntity uiTransform={{ flexDirection: 'row', height: 36, margin: { bottom: 4 } }}>
                <Label value="Y:" fontSize={14} color={LABEL_CLR}
                    uiTransform={{ width: 30 }} />
                <Input value={cfgDirY} placeholder="1"
                    onChange={(v) => { cfgDirY = v }}
                    fontSize={14} color={Color4.White()}
                    uiTransform={{ flex: 1, height: 36 }}
                    uiBackground={{ color: INPUT_BG }}
                />
            </UiEntity>

            {/* Direction Z */}
            <UiEntity uiTransform={{ flexDirection: 'row', height: 36, margin: { bottom: 4 } }}>
                <Label value="Z:" fontSize={14} color={LABEL_CLR}
                    uiTransform={{ width: 30 }} />
                <Input value={cfgDirZ} placeholder="0"
                    onChange={(v) => { cfgDirZ = v }}
                    fontSize={14} color={Color4.White()}
                    uiTransform={{ flex: 1, height: 36 }}
                    uiBackground={{ color: INPUT_BG }}
                />
            </UiEntity>

            {/* Magnitude */}
            <UiEntity uiTransform={{ flexDirection: 'row', height: 36, margin: { bottom: 8 } }}>
                <Label value="Mag:" fontSize={14} color={LABEL_CLR}
                    uiTransform={{ width: 40 }} />
                <Input value={cfgMagnitude} placeholder="10"
                    onChange={(v) => { cfgMagnitude = v }}
                    fontSize={14} color={Color4.White()}
                    uiTransform={{ flex: 1, height: 36 }}
                    uiBackground={{ color: INPUT_BG }}
                />
            </UiEntity>

            {/* Presets row */}
            <UiEntity uiTransform={{ flexDirection: 'row', height: 32, margin: { bottom: 8 } }}>
                <Button value="Up" fontSize={12} color={Color4.White()}
                    uiTransform={{ flex: 1, height: 32, margin: { right: 4 } }}
                    uiBackground={{ color: BTN_PRESET }}
                    onMouseDown={() => setPreset('0', '1', '0', 'Up')}
                />
                <Button value="Forward" fontSize={12} color={Color4.White()}
                    uiTransform={{ flex: 1, height: 32, margin: { right: 4 } }}
                    uiBackground={{ color: BTN_PRESET }}
                    onMouseDown={() => setPreset('0', '0', '1', 'Forward')}
                />
                <Button value="45 deg" fontSize={12} color={Color4.White()}
                    uiTransform={{ flex: 1, height: 32 }}
                    uiBackground={{ color: BTN_PRESET }}
                    onMouseDown={() => setPreset('0', '1', '1', '45 deg')}
                />
            </UiEntity>

            {/* Apply / Reset row */}
            <UiEntity uiTransform={{ flexDirection: 'row', height: 40, margin: { bottom: 4 } }}>
                <Button value="APPLY" fontSize={16} color={Color4.White()}
                    uiTransform={{ flex: 2, height: 40, margin: { right: 4 } }}
                    uiBackground={{ color: BTN_APPLY }}
                    onMouseDown={() => applyConfigPhysics()}
                />
                <Button value="RESET" fontSize={14} color={Color4.White()}
                    uiTransform={{ flex: 1, height: 40 }}
                    uiBackground={{ color: BTN_RESET }}
                    onMouseDown={() => resetConfigPhysics()}
                />
            </UiEntity>

            {cfgStatus ? (
                <Label value={cfgStatus}
                    fontSize={13} color={cfgStatusColor}
                    uiTransform={{ height: 24, margin: { top: 4 } }}
                    textAlign="middle-left"
                />
            ) : null}
        </UiEntity>
    )
}

// ---------------------------------------------------------------------------
// Root — renders the active panel
// ---------------------------------------------------------------------------

function UiRoot() {
    if (activePanel === 'tunnels') return TunnelPanel()
    if (activePanel === 'configurator') return ConfiguratorPanel()
    return null
}

export function setupConfigUi() {
    ReactEcsRenderer.setUiRenderer(UiRoot)
}
