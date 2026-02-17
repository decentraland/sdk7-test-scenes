import { engine, executeTask, Transform } from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'
import { readSimpleMethods, readParamMethods, Web3MethodDef } from './methodRegistry'
import {
  createMethodCube,
  createSectionHeader,
  MethodCube,
  setCubeColor,
  setResultText,
  STATE_COLORS
} from './cubeFactory'
import {
  setupUi,
  showMethodPanel,
  hideMethodPanel,
  getActiveMethodId,
  getCurrentParamValues,
  setUiResult
} from './ui'

// ---------------------------------------------------------------------------
// Track parameterized cubes for the trigger-area system
// ---------------------------------------------------------------------------

interface ParamCubeRecord {
  method: Web3MethodDef
  position: Vector3
  mc: MethodCube
}

const paramCubes: ParamCubeRecord[] = []

// ---------------------------------------------------------------------------
// main()
// ---------------------------------------------------------------------------

export function main() {
  console.log('[web3-operations] Scene started')

  // ---- Setup UI renderer (once) ----
  setupUi()

  // ---- Non-parameterized read-only methods along the left border (X=2) ----
  const simpleRowX = 2
  const startZ = 2
  const spacingZ = 2.2

  readSimpleMethods.forEach((method, index) => {
    const position = Vector3.create(simpleRowX, 1.1, startZ + index * spacingZ)
    createMethodCube(method, position, spacingZ)
  })

  const simpleLastZ = startZ + (readSimpleMethods.length - 1) * spacingZ
  const simpleCenterZ = (startZ + simpleLastZ) / 2
  createSectionHeader('Read-only (no params)', Vector3.create(simpleRowX, 4, simpleCenterZ))

  // ---- Parameterized read-only methods on the opposite border (X=14) ----
  const paramRowX = 14

  readParamMethods.forEach((method, index) => {
    const position = Vector3.create(paramRowX, 1.1, startZ + index * spacingZ)

    const mc = createMethodCube(method, position, spacingZ, (m, cube) => {
      onParamCubeClick(m, cube)
    })

    paramCubes.push({ method, position, mc })
  })

  if (readParamMethods.length > 0) {
    const paramLastZ = startZ + (readParamMethods.length - 1) * spacingZ
    const paramCenterZ = (startZ + paramLastZ) / 2
    createSectionHeader('Read-only (with params)', Vector3.create(paramRowX, 4, paramCenterZ))
  }

  // ---- Register trigger-area system ----
  engine.addSystem(triggerAreaSystem)
}

// ---------------------------------------------------------------------------
// Trigger-area system — checks player proximity each frame
// ---------------------------------------------------------------------------

const TRIGGER_RADIUS = 4
const TRIGGER_RADIUS_SQ = TRIGGER_RADIUS * TRIGGER_RADIUS

function triggerAreaSystem() {
  const playerPos = Transform.getOrNull(engine.PlayerEntity)?.position
  if (!playerPos) return

  let closestRecord: ParamCubeRecord | null = null
  let closestDistSq = Infinity

  for (const rec of paramCubes) {
    const dx = playerPos.x - rec.position.x
    const dz = playerPos.z - rec.position.z
    const distSq = dx * dx + dz * dz

    if (distSq < TRIGGER_RADIUS_SQ && distSq < closestDistSq) {
      closestRecord = rec
      closestDistSq = distSq
    }
  }

  const currentId = getActiveMethodId()

  if (closestRecord && closestRecord.method.id !== currentId) {
    showMethodPanel(closestRecord.method, (success, result) => {
      onUiExecuteResult(closestRecord!.mc, success, result)
    })
  } else if (!closestRecord && currentId !== null) {
    hideMethodPanel()
  }
}

// ---------------------------------------------------------------------------
// Callbacks
// ---------------------------------------------------------------------------

/** Called when the UI panel Execute button returns a result. */
function onUiExecuteResult(mc: MethodCube, success: boolean, result: string) {
  if (success) {
    setCubeColor(mc.cube, STATE_COLORS.ready)
    setResultText(mc, result, Color4.create(0.3, 1, 0.4, 1))
  } else {
    setCubeColor(mc.cube, STATE_COLORS.error)
    setResultText(mc, `Error: ${result.slice(0, 160)}`, Color4.create(1, 0.4, 0.4, 1), 1.1)
  }
}

/** Called when a parameterized cube is clicked directly. */
function onParamCubeClick(method: Web3MethodDef, mc: MethodCube) {
  // Gather params: use panel values if panel is open for this method, else defaults
  let params: Record<string, string> = {}

  if (getActiveMethodId() === method.id) {
    params = getCurrentParamValues()
  } else if (method.params) {
    for (const p of method.params) {
      try {
        params[p.name] = typeof p.defaultValue === 'function' ? p.defaultValue() : p.defaultValue
      } catch {
        params[p.name] = ''
      }
    }
  }

  setCubeColor(mc.cube, STATE_COLORS.pending)
  setResultText(mc, 'Requesting...', Color4.Yellow())

  executeTask(async () => {
    const t0 = Date.now()
    try {
      const result = await method.execute(params)
      const elapsed = Date.now() - t0
      console.log(`[web3] ${method.name} OK (${elapsed}ms): ${result}`)

      setCubeColor(mc.cube, STATE_COLORS.ready)
      setResultText(mc, result, Color4.create(0.3, 1, 0.4, 1))
      setUiResult(result, Color4.create(0.3, 1, 0.4, 1))
    } catch (err: any) {
      const elapsed = Date.now() - t0
      const msg = err?.message || String(err)
      console.error(`[web3] ${method.name} FAIL (${elapsed}ms): ${msg}`)

      setCubeColor(mc.cube, STATE_COLORS.error)
      setResultText(mc, `Error: ${msg.slice(0, 160)}`, Color4.create(1, 0.4, 0.4, 1), 1.1)
      setUiResult(`Error: ${msg.slice(0, 200)}`, Color4.create(1, 0.4, 0.4, 1))
    }
  })
}
