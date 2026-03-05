import ReactEcs, { ReactEcsRenderer, UiEntity, Label, Button, Input } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { engine, KnockbackFalloff, Physics } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import {
    getKnockbackLabApplyMode,
    cycleKnockbackLabSphereFalloff,
    getKnockbackLabMoveStep,
    getKnockbackLabSpheres,
    KnockbackLabApplyMode,
    moveKnockbackLabSphere,
    setKnockbackLabApplyMode,
    updateKnockbackLabSphere
} from './knockbackSphereLab'

const uiForceSource = engine.addEntity()
const uiForceDurationSource = engine.addEntity()

// ---------------------------------------------------------------------------
// Panel type
// ---------------------------------------------------------------------------

type ActivePanel =
    | 'none'
    | 'tunnels'
    | 'impulseCubeConfig'
    | 'repulsionCubeConfig'
    | 'pendulumConfig'
    | 'carouselConfig'
    | 'grappleConfig'
    | 'forceConfig'
    | 'impulseConfig'
    | 'forceDurationConfig'
    | 'knockbackLabConfig'

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
const CLR_CAROUSEL = Color4.create(0.95, 0.75, 0.2, 1)
const CLR_GRAPPLE = Color4.create(0.3, 0.85, 1, 1)
export const CAROUSEL_VERTICAL_NUDGE_STEP = 0.01
export const CAROUSEL_TILT_NUDGE_DEG = 5

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
    tunnelStatus = `Applied: Horizontal=${h}, Vertical=${v} (re-enter tunnel to feel change)`
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

let globalCooldownStatus = ''
let globalCooldownStatusColor: Color4 = Color4.White()
let cubeGlobalCooldownSec = 0
let cubeGlobalCooldownInput = '0'
let cubeGlobalCooldownEnabled = false

export function getRepulsionMag() { return repulsionMag }
export function getCubeGlobalCooldownSec() { return cubeGlobalCooldownSec }
export function isCubeGlobalCooldownEnabled() { return cubeGlobalCooldownEnabled }

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
// GLOBAL COOLDOWN PANEL (always visible, bottom-right)
// =========================================================================

function applyGlobalCooldowns() {
    const cooldown = parseFloat(cubeGlobalCooldownInput)

    if (isNaN(cooldown)) {
        globalCooldownStatus = 'Invalid number'
        globalCooldownStatusColor = Color4.create(1, 0.4, 0.4, 1)
        return
    }

    cubeGlobalCooldownSec = Math.max(0, cooldown)
    globalCooldownStatus = `Applied shared cooldown=${cubeGlobalCooldownSec.toFixed(2)}s for both cubes`
    globalCooldownStatusColor = Color4.create(0.3, 1, 0.4, 1)
}

function toggleGlobalCubeCooldown() {
    cubeGlobalCooldownEnabled = !cubeGlobalCooldownEnabled
    globalCooldownStatus = cubeGlobalCooldownEnabled ? 'Shared cooldown enabled' : 'Shared cooldown disabled'
    globalCooldownStatusColor = Color4.create(0.3, 1, 0.4, 1)
}

function GlobalCooldownPanel(): ReactEcs.JSX.Element {
    const toggleLabel = cubeGlobalCooldownEnabled ? 'Cooldown: ON' : 'Cooldown: OFF'

    return (
        <UiEntity uiTransform={{
            width: 420, positionType: 'absolute',
            position: { right: 10, bottom: '2%' },
            flexDirection: 'column', padding: 14,
        }} uiBackground={{ color: Color4.create(0.05, 0.05, 0.09, 0.9) }}>

            <Label value="Global Cube Cooldown" fontSize={18} color={TITLE_CLR}
                uiTransform={{ width: '100%', height: 26, margin: { bottom: 8 } }} />

            {FieldBlock({
                label: 'Shared cooldown for Impulse + Repulsion cubes (sec):',
                value: cubeGlobalCooldownInput,
                placeholder: '0',
                onChange: (v) => { cubeGlobalCooldownInput = v }
            })}

            <Button value="Apply Cube Cooldowns" variant="secondary" fontSize={16}
                uiTransform={{ width: '100%', height: 40, margin: { top: 4 } }}
                onMouseDown={() => applyGlobalCooldowns()} />

            <Button value={toggleLabel} variant="secondary" fontSize={16}
                uiTransform={{ width: '100%', height: 38, margin: { top: 6 } }}
                onMouseDown={() => toggleGlobalCubeCooldown()} />

            {StatusBlock(globalCooldownStatus, globalCooldownStatusColor)}
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
// CAROUSEL PANEL (parcel 1,8)
// =========================================================================

let carouselMaxTiltDeg = 50
let carouselSpeedRpm = 1
let carouselImpulseMag = 12
let carouselVerticalPaused = true
let carouselTiltFrozen = false
let carouselVerticalNudgeSteps = 0
let carouselMaxTiltInput = '50'
let carouselSpeedInput = '1'
let carouselImpulseMagInput = '12'
let carouselStatus = ''
let carouselStatusColor: Color4 = Color4.White()

export function getCarouselMaxTiltDeg() { return carouselMaxTiltDeg }
export function getCarouselSpeedRpm() { return carouselSpeedRpm }
export function getCarouselImpulseMag() { return carouselImpulseMag }
export function isCarouselVerticalPaused() { return carouselVerticalPaused }
export function isCarouselTiltFrozen() { return carouselTiltFrozen }
export function consumeCarouselVerticalNudgeSteps() {
    const steps = carouselVerticalNudgeSteps
    carouselVerticalNudgeSteps = 0
    return steps
}

export function showCarouselPanel() { activePanel = 'carouselConfig'; carouselStatus = '' }
export function hideCarouselPanel() { activePanel = 'none'; carouselStatus = '' }

function clamp(value: number, min: number, max: number) {
    if (value < min) return min
    if (value > max) return max
    return value
}

function applyCarouselSettings() {
    const angle = parseFloat(carouselMaxTiltInput)
    const speed = parseFloat(carouselSpeedInput)
    const impulseMag = parseFloat(carouselImpulseMagInput)

    if (isNaN(angle) || isNaN(speed) || isNaN(impulseMag)) {
        carouselStatus = 'Invalid number'
        carouselStatusColor = Color4.create(1, 0.4, 0.4, 1)
        return
    }

    carouselMaxTiltDeg = clamp(angle, 0, 89)
    carouselSpeedRpm = Math.max(0, speed)
    carouselImpulseMag = Math.max(0, impulseMag)
    carouselStatus = `Applied: max tilt=${carouselMaxTiltDeg.toFixed(1)} deg, speed=${carouselSpeedRpm.toFixed(1)} rpm, impulse=${carouselImpulseMag.toFixed(1)}`
    carouselStatusColor = Color4.create(0.3, 1, 0.4, 1)
}

function toggleCarouselVerticalPause() {
    carouselVerticalPaused = !carouselVerticalPaused
    carouselStatus = carouselVerticalPaused ? 'Vertical oscillation paused' : 'Vertical oscillation resumed'
    carouselStatusColor = Color4.create(0.3, 1, 0.4, 1)
}

function toggleCarouselTiltFreeze() {
    carouselTiltFrozen = !carouselTiltFrozen
    carouselStatus = carouselTiltFrozen ? 'Seat tilt frozen at current angle' : 'Seat tilt unfrozen'
    carouselStatusColor = Color4.create(0.3, 1, 0.4, 1)
}

function nudgeCarouselVertical(step: number) {
    carouselVerticalPaused = true
    carouselVerticalNudgeSteps += step
    carouselStatus = step > 0 ? 'Vertical nudge: Up' : 'Vertical nudge: Down'
    carouselStatusColor = Color4.create(0.3, 1, 0.4, 1)
}

function nudgeCarouselTilt(stepDeg: number) {
    // Manual tilt nudges should always have visible effect.
    if (carouselTiltFrozen) carouselTiltFrozen = false
    carouselMaxTiltDeg = clamp(carouselMaxTiltDeg + stepDeg, 0, 89)
    carouselMaxTiltInput = carouselMaxTiltDeg.toFixed(0)
    carouselStatus = `Max tilt adjusted: ${carouselMaxTiltDeg.toFixed(0)} deg`
    carouselStatusColor = Color4.create(0.3, 1, 0.4, 1)
}

function CarouselPanel(): ReactEcs.JSX.Element {
    const pauseLabel = carouselVerticalPaused ? 'Resume vertical oscillation' : 'Pause vertical oscillation'
    const freezeTiltLabel = carouselTiltFrozen ? 'Unfreeze seat tilt' : 'Freeze seat tilt'

    return (
        <UiEntity uiTransform={{
            width: PANEL_W, positionType: 'absolute',
            position: { right: 10, top: '15%' },
            flexDirection: 'column', padding: 20,
        }} uiBackground={{ color: PANEL_BG }}>

            <Label value="Carousel Config" fontSize={22} color={CLR_CAROUSEL}
                uiTransform={{ width: '100%', height: 30, margin: { bottom: 4 } }} />
            <Label value="Cylinder lifts up/down: bottom = chains horizontal on floor"
                fontSize={14} color={DIM_CLR}
                uiTransform={{ width: '100%', height: 36, margin: { bottom: 10 } }} textWrap="wrap" />

            {FieldBlock({
                label: 'Max seat angle at top (deg, 0-89):',
                value: carouselMaxTiltInput,
                placeholder: '45',
                onChange: (v) => { carouselMaxTiltInput = v }
            })}

            {FieldBlock({
                label: 'Rotation speed (rpm):',
                value: carouselSpeedInput,
                placeholder: '12',
                onChange: (v) => { carouselSpeedInput = v }
            })}

            {FieldBlock({
                label: 'Impulse magnitude (all seats):',
                value: carouselImpulseMagInput,
                placeholder: '12',
                onChange: (v) => { carouselImpulseMagInput = v }
            })}

            <Button value="Apply" variant="primary" fontSize={18}
                uiTransform={{ width: '100%', height: 48, margin: { top: 4 } }}
                onMouseDown={() => applyCarouselSettings()} />

            <Button value={pauseLabel} variant="secondary" fontSize={16}
                uiTransform={{ width: '100%', height: 44, margin: { top: 8 } }}
                onMouseDown={() => toggleCarouselVerticalPause()} />

            <Button value={freezeTiltLabel} variant="secondary" fontSize={16}
                uiTransform={{ width: '100%', height: 44, margin: { top: 6 } }}
                onMouseDown={() => toggleCarouselTiltFreeze()} />

            <UiEntity uiTransform={{ flexDirection: 'row', width: '100%', margin: { top: 8 } }}>
                <Button value="Down" variant="secondary" fontSize={16}
                    uiTransform={{ flex: 1, height: 40, margin: { right: 4 } }}
                    onMouseDown={() => nudgeCarouselVertical(-1)} />
                <Button value="Up" variant="secondary" fontSize={16}
                    uiTransform={{ flex: 1, height: 40 }}
                    onMouseDown={() => nudgeCarouselVertical(1)} />
            </UiEntity>

            <UiEntity uiTransform={{ flexDirection: 'row', width: '100%', margin: { top: 6 } }}>
                <Button value="Tilt -" variant="secondary" fontSize={16}
                    uiTransform={{ flex: 1, height: 40, margin: { right: 4 } }}
                    onMouseDown={() => nudgeCarouselTilt(-CAROUSEL_TILT_NUDGE_DEG)} />
                <Button value="Tilt +" variant="secondary" fontSize={16}
                    uiTransform={{ flex: 1, height: 40 }}
                    onMouseDown={() => nudgeCarouselTilt(CAROUSEL_TILT_NUDGE_DEG)} />
            </UiEntity>

            {StatusBlock(carouselStatus, carouselStatusColor)}
        </UiEntity>
    )
}

// =========================================================================
// GRAPPLE VOLUME PANEL (parcels 2,8 + 2,9 + 3,8 + 3,9)
// =========================================================================

let grappleAnchorScale = 2
let grappleAnchorScaleInput = '2'
let grappleStatus = ''
let grappleStatusColor: Color4 = Color4.White()

export function getGrappleAnchorScale() { return grappleAnchorScale }
export function showGrapplePanel() { activePanel = 'grappleConfig'; grappleStatus = '' }
export function hideGrapplePanel() { activePanel = 'none'; grappleStatus = '' }

function applyGrappleSettings() {
    const s = parseFloat(grappleAnchorScaleInput)
    if (isNaN(s)) {
        grappleStatus = 'Invalid number'
        grappleStatusColor = Color4.create(1, 0.4, 0.4, 1)
        return
    }

    grappleAnchorScale = clamp(s, 0.2, 8)
    grappleStatus = `Applied sphere scale=${grappleAnchorScale.toFixed(2)}`
    grappleStatusColor = Color4.create(0.3, 1, 0.4, 1)
}

function GrapplePanel(): ReactEcs.JSX.Element {
    return (
        <UiEntity uiTransform={{
            width: PANEL_W, positionType: 'absolute',
            position: { right: 10, top: '10%' },
            flexDirection: 'column', padding: 20,
        }} uiBackground={{ color: PANEL_BG }}>

            <Label value="Grapple Volume" fontSize={22} color={CLR_GRAPPLE}
                uiTransform={{ width: '100%', height: 30, margin: { bottom: 4 } }} />
            <Label value="Runtime settings for random pull spheres"
                fontSize={14} color={DIM_CLR}
                uiTransform={{ width: '100%', height: 20, margin: { bottom: 12 } }} />

            {FieldBlock({
                label: 'Sphere scale (0.2..8):',
                value: grappleAnchorScaleInput,
                placeholder: '2',
                onChange: (v) => { grappleAnchorScaleInput = v }
            })}

            <Button value="Apply" variant="primary" fontSize={18}
                uiTransform={{ width: '100%', height: 48, margin: { top: 4 } }}
                onMouseDown={() => applyGrappleSettings()} />

            {StatusBlock(grappleStatus, grappleStatusColor)}
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
export function hideForcePanel() {
    activePanel = 'none'; forceStatus = ''
    if (forceHeld) stopUiForce()
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
    Physics.applyForceToPlayer(uiForceSource, dir)
    forceHeld = true
    forceStatus = `Force ON: (${dir.x.toFixed(1)}, ${dir.y.toFixed(1)}, ${dir.z.toFixed(1)})`
    forceStatusColor = Color4.create(0.3, 1, 0.4, 1)
}

function startForceDir(dir: Vector3) {
    Physics.applyForceToPlayer(uiForceSource, dir)
    forceHeld = true
    forceStatus = `Force ON: (${dir.x.toFixed(1)}, ${dir.y.toFixed(1)}, ${dir.z.toFixed(1)})`
    forceStatusColor = Color4.create(0.3, 1, 0.4, 1)
}

export function stopUiForce() {
    Physics.removeForceFromPlayer(uiForceSource)
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
                onMouseUp={() => stopUiForce()}
            />

            {DPadBlock({
                getMag: () => parseFloat(forceMag) || 10,
                onDir: (dir) => startForceDir(dir),
                onRelease: () => stopUiForce()
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
let impStatus = ''
let impStatusColor: Color4 = Color4.White()

export function showImpulsePanel() { activePanel = 'impulseConfig'; impStatus = '' }
export function hideImpulsePanel() { activePanel = 'none'; impStatus = '' }

function fireImpulse() {
    const x = parseFloat(impDirX) || 0
    const y = parseFloat(impDirY) || 0
    const z = parseFloat(impDirZ) || 0
    const mag = parseFloat(impMag) || 0
    const direction = (x === 0 && y === 0 && z === 0)
        ? Vector3.create(0, 1, 0)
        : Vector3.create(x, y, z)

    Physics.applyImpulseToPlayer(direction, mag)

    const len = Math.sqrt(direction.x ** 2 + direction.y ** 2 + direction.z ** 2)
    const scaled = Vector3.create(direction.x / len * mag, direction.y / len * mag, direction.z / len * mag)
    impStatus = `Impulse: (${scaled.x.toFixed(1)}, ${scaled.y.toFixed(1)}, ${scaled.z.toFixed(1)})`
    impStatusColor = Color4.create(0.3, 0.8, 1, 1)
}

function fireImpulseDir(dir: Vector3) {
    Physics.applyImpulseToPlayer(dir)
    impStatus = `Impulse: (${dir.x.toFixed(1)}, ${dir.y.toFixed(1)}, ${dir.z.toFixed(1)})`
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
// FORCE FOR DURATION PANEL (parcel 2,7 — violet zone)
// =========================================================================

let forceDurationDirX = '0'
let forceDurationDirY = '1'
let forceDurationDirZ = '0'
let forceDurationMagnitude = '10'
let forceDurationSeconds = '2'
let forceDurationStatus = ''
let forceDurationStatusColor: Color4 = Color4.White()

export function showForceDurationPanel() { activePanel = 'forceDurationConfig'; forceDurationStatus = '' }
export function hideForceDurationPanel() { activePanel = 'none'; forceDurationStatus = '' }

function startForceForDuration() {
    const x = parseFloat(forceDurationDirX) || 0
    const y = parseFloat(forceDurationDirY) || 0
    const z = parseFloat(forceDurationDirZ) || 0
    const magnitude = parseFloat(forceDurationMagnitude)
    const duration = parseFloat(forceDurationSeconds)

    if (isNaN(magnitude) || isNaN(duration) || duration < 0) {
        forceDurationStatus = 'Invalid magnitude or duration'
        forceDurationStatusColor = Color4.create(1, 0.4, 0.4, 1)
        return
    }

    const direction = (x === 0 && y === 0 && z === 0)
        ? Vector3.create(0, 1, 0)
        : Vector3.create(x, y, z)

    Physics.applyForceToPlayerForDuration(
        uiForceDurationSource,
        duration,
        direction,
        magnitude
    )

    const len = Math.sqrt(direction.x ** 2 + direction.y ** 2 + direction.z ** 2)
    const normalized = len === 0
        ? Vector3.create(0, 1, 0)
        : Vector3.create(direction.x / len, direction.y / len, direction.z / len)
    const scaled = Vector3.create(
        normalized.x * magnitude,
        normalized.y * magnitude,
        normalized.z * magnitude
    )
    forceDurationStatus = `Started: ${duration.toFixed(2)}s, force=(${scaled.x.toFixed(1)}, ${scaled.y.toFixed(1)}, ${scaled.z.toFixed(1)})`
    forceDurationStatusColor = Color4.create(0.3, 1, 0.4, 1)
}

function ForceDurationPanel(): ReactEcs.JSX.Element {
    return (
        <UiEntity uiTransform={{
            width: PANEL_W, positionType: 'absolute',
            position: { right: 10, top: '10%' },
            flexDirection: 'column', padding: 20
        }} uiBackground={{ color: PANEL_BG }}>

            <Label value="Force For Duration" fontSize={22} color={Color4.create(0.78, 0.55, 1, 1)}
                uiTransform={{ width: '100%', height: 30, margin: { bottom: 4 } }} />
            <Label value="Applies force for N seconds, then auto-removes"
                fontSize={14} color={DIM_CLR}
                uiTransform={{ width: '100%', height: 20, margin: { bottom: 12 } }} />

            {FieldBlock({ label: 'Direction X:', value: forceDurationDirX, placeholder: '0', onChange: (v) => { forceDurationDirX = v } })}
            {FieldBlock({ label: 'Direction Y:', value: forceDurationDirY, placeholder: '1', onChange: (v) => { forceDurationDirY = v } })}
            {FieldBlock({ label: 'Direction Z:', value: forceDurationDirZ, placeholder: '0', onChange: (v) => { forceDurationDirZ = v } })}
            {FieldBlock({ label: 'Magnitude:', value: forceDurationMagnitude, placeholder: '10', onChange: (v) => { forceDurationMagnitude = v } })}
            {FieldBlock({ label: 'Duration (sec):', value: forceDurationSeconds, placeholder: '2', onChange: (v) => { forceDurationSeconds = v } })}

            {PresetButtons((x, y, z) => { forceDurationDirX = x; forceDurationDirY = y; forceDurationDirZ = z })}

            <Button value="Start" variant="primary" fontSize={18}
                uiTransform={{ width: '100%', height: 52, margin: { top: 4 } }}
                onMouseDown={() => startForceForDuration()} />

            {StatusBlock(forceDurationStatus, forceDurationStatusColor)}
        </UiEntity>
    )
}

// =========================================================================
// KNOCKBACK LAB PANEL (2x2 parcels: 1,5 2,5 1,6 2,6)
// =========================================================================

let knockbackLabMagnitudeInputs: string[] = []
let knockbackLabRadiusInputs: string[] = []
let knockbackLabStatus = ''
let knockbackLabStatusColor: Color4 = Color4.White()

export function showKnockbackLabPanel() {
    activePanel = 'knockbackLabConfig'
    knockbackLabStatus = ''
    syncKnockbackLabInputBuffers()
}

export function hideKnockbackLabPanel() {
    if (activePanel === 'knockbackLabConfig') activePanel = 'none'
    knockbackLabStatus = ''
}

function syncKnockbackLabInputBuffers() {
    const spheres = getKnockbackLabSpheres()
    if (knockbackLabMagnitudeInputs.length !== spheres.length) {
        knockbackLabMagnitudeInputs = spheres.map((s) => s.magnitude.toString())
    }
    if (knockbackLabRadiusInputs.length !== spheres.length) {
        knockbackLabRadiusInputs = spheres.map((s) => s.radius.toString())
    }
}

function knockbackFalloffLabel(value: KnockbackFalloff): string {
    if (value === KnockbackFalloff.LINEAR) return 'LINEAR'
    if (value === KnockbackFalloff.INVERSE_SQUARE) return 'INVERSE_SQUARE'
    return 'CONSTANT'
}

function moveLabSphere(index: number, delta: Vector3, label: string) {
    moveKnockbackLabSphere(index, delta)
    knockbackLabStatus = `Sphere ${index + 1}: moved ${label}`
    knockbackLabStatusColor = Color4.create(0.3, 1, 0.4, 1)
}

function applyLabSphere(index: number) {
    const spheres = getKnockbackLabSpheres()
    const sphere = spheres[index]
    if (!sphere) return

    const magnitude = parseFloat(knockbackLabMagnitudeInputs[index] ?? `${sphere.magnitude}`)
    const radius = parseFloat(knockbackLabRadiusInputs[index] ?? `${sphere.radius}`)
    if (isNaN(magnitude) || isNaN(radius)) {
        knockbackLabStatus = `Sphere ${index + 1}: invalid number`
        knockbackLabStatusColor = Color4.create(1, 0.4, 0.4, 1)
        return
    }

    updateKnockbackLabSphere(index, magnitude, radius)
    knockbackLabStatus = `${sphere.name}: impulse=${magnitude.toFixed(2)}, radius=${Math.max(0.1, radius).toFixed(2)}`
    knockbackLabStatusColor = Color4.create(0.3, 1, 0.4, 1)
}

function cycleLabSphereFalloff(index: number) {
    const next = cycleKnockbackLabSphereFalloff(index)
    knockbackLabStatus = `Sphere ${index + 1}: falloff=${knockbackFalloffLabel(next)}`
    knockbackLabStatusColor = Color4.create(0.3, 0.85, 1, 1)
}

function toggleLabApplyMode() {
    const current = getKnockbackLabApplyMode()
    const next = current === KnockbackLabApplyMode.KNOCKBACK
        ? KnockbackLabApplyMode.REPULSION
        : KnockbackLabApplyMode.KNOCKBACK

    setKnockbackLabApplyMode(next)
    knockbackLabStatus = next === KnockbackLabApplyMode.KNOCKBACK
        ? 'Apply mode: Knockback impulse'
        : 'Apply mode: Repulsion force'
    knockbackLabStatusColor = Color4.create(0.3, 0.85, 1, 1)
}

function LabMoveButtons(index: number): ReactEcs.JSX.Element {
    const step = getKnockbackLabMoveStep()

    return (
        <UiEntity uiTransform={{ width: '100%', flexDirection: 'column', margin: { bottom: 6 } }}>
            <UiEntity uiTransform={{ width: '100%', flexDirection: 'row', margin: { bottom: 4 } }}>
                <Button value="Up" variant="secondary" fontSize={14}
                    uiTransform={{ flex: 1, height: 34, margin: { right: 4 } }}
                    onMouseDown={() => moveLabSphere(index, Vector3.create(0, step, 0), 'Up')} />
                <Button value="Down" variant="secondary" fontSize={14}
                    uiTransform={{ flex: 1, height: 34, margin: { right: 4 } }}
                    onMouseDown={() => moveLabSphere(index, Vector3.create(0, -step, 0), 'Down')} />
                <Button value="Forward" variant="secondary" fontSize={14}
                    uiTransform={{ flex: 1, height: 34 }}
                    onMouseDown={() => moveLabSphere(index, Vector3.create(0, 0, step), 'Forward')} />
            </UiEntity>
            <UiEntity uiTransform={{ width: '100%', flexDirection: 'row' }}>
                <Button value="Left" variant="secondary" fontSize={14}
                    uiTransform={{ flex: 1, height: 34, margin: { right: 4 } }}
                    onMouseDown={() => moveLabSphere(index, Vector3.create(-step, 0, 0), 'Left')} />
                <Button value="Right" variant="secondary" fontSize={14}
                    uiTransform={{ flex: 1, height: 34, margin: { right: 4 } }}
                    onMouseDown={() => moveLabSphere(index, Vector3.create(step, 0, 0), 'Right')} />
                <Button value="Backward" variant="secondary" fontSize={14}
                    uiTransform={{ flex: 1, height: 34 }}
                    onMouseDown={() => moveLabSphere(index, Vector3.create(0, 0, -step), 'Backward')} />
            </UiEntity>
        </UiEntity>
    )
}

function KnockbackLabPanel(): ReactEcs.JSX.Element {
    syncKnockbackLabInputBuffers()
    const spheres = getKnockbackLabSpheres()
    const mode = getKnockbackLabApplyMode()
    const modeLabel = mode === KnockbackLabApplyMode.KNOCKBACK
        ? 'Mode: Knockback impulse'
        : 'Mode: Repulsion force'

    return (
        <UiEntity uiTransform={{
            width: PANEL_W, positionType: 'absolute',
            position: { right: 10, top: '6%' },
            flexDirection: 'column', padding: 20
        }} uiBackground={{ color: PANEL_BG }}>

            <Label value="Knockback Sphere Lab" fontSize={22} color={TITLE_CLR}
                uiTransform={{ width: '100%', height: 30, margin: { bottom: 4 } }} />
            <Label value="2x2 parcels (1,5 2,5 1,6 2,6): click core sphere to apply selected mode"
                fontSize={14} color={DIM_CLR}
                uiTransform={{ width: '100%', height: 22, margin: { bottom: 12 } }} />

            <Button value={modeLabel} variant="secondary" fontSize={16}
                uiTransform={{ width: '100%', height: 40, margin: { bottom: 10 } }}
                onMouseDown={() => toggleLabApplyMode()} />

            {spheres.map((sphere, i) => (
                <UiEntity key={`lab-sphere-${i}`} uiTransform={{
                    width: '100%', flexDirection: 'column',
                    padding: 8, margin: { bottom: 8 }
                }} uiBackground={{ color: Color4.create(0.1, 0.1, 0.16, 0.9) }}>
                    <Label
                        value={`${sphere.name} | Pos: ${sphere.position.x.toFixed(1)}, ${sphere.position.y.toFixed(1)}, ${sphere.position.z.toFixed(1)}`}
                        fontSize={14}
                        color={Color4.create(0.82, 0.88, 1, 1)}
                        uiTransform={{ width: '100%', height: 22, margin: { bottom: 4 } }}
                    />

                    {LabMoveButtons(i)}

                    {FieldBlock({
                        label: 'Impulse (can be +/-):',
                        value: knockbackLabMagnitudeInputs[i] ?? '',
                        placeholder: `${sphere.magnitude}`,
                        onChange: (v) => { knockbackLabMagnitudeInputs[i] = v }
                    })}

                    {FieldBlock({
                        label: 'Radius:',
                        value: knockbackLabRadiusInputs[i] ?? '',
                        placeholder: `${sphere.radius}`,
                        onChange: (v) => { knockbackLabRadiusInputs[i] = v }
                    })}

                    <Button value={`Falloff: ${knockbackFalloffLabel(sphere.falloff)}`} variant="secondary" fontSize={15}
                        uiTransform={{ width: '100%', height: 38, margin: { bottom: 6 } }}
                        onMouseDown={() => cycleLabSphereFalloff(i)} />

                    <Button value="Apply sphere params" variant="primary" fontSize={16}
                        uiTransform={{ width: '100%', height: 40 }}
                        onMouseDown={() => applyLabSphere(i)} />
                </UiEntity>
            ))}

            {StatusBlock(knockbackLabStatus, knockbackLabStatusColor)}
        </UiEntity>
    )
}

// =========================================================================
// Root
// =========================================================================

function UiRoot() {
    let mainPanel: ReactEcs.JSX.Element | null = null
    if (activePanel === 'tunnels') mainPanel = TunnelPanel()
    else if (activePanel === 'impulseCubeConfig') mainPanel = ImpulseCubePanel()
    else if (activePanel === 'repulsionCubeConfig') mainPanel = RepulsionCubePanel()
    else if (activePanel === 'pendulumConfig') mainPanel = PendulumPanel()
    else if (activePanel === 'carouselConfig') mainPanel = CarouselPanel()
    else if (activePanel === 'grappleConfig') mainPanel = GrapplePanel()
    else if (activePanel === 'forceConfig') mainPanel = ForceConfigPanel()
    else if (activePanel === 'impulseConfig') mainPanel = ImpulseConfigPanel()
    else if (activePanel === 'forceDurationConfig') mainPanel = ForceDurationPanel()
    else if (activePanel === 'knockbackLabConfig') mainPanel = KnockbackLabPanel()

    return (
        <UiEntity uiTransform={{ width: '100%', height: '100%' }}>
            {mainPanel}
            {activePanel === 'carouselConfig' ? GlobalCooldownPanel() : null}
        </UiEntity>
    )
}

export function setupConfigUi() {
    ReactEcsRenderer.setUiRenderer(UiRoot)
}
