import {
  Billboard,
  BillboardMode,
  engine,
  Entity,
  executeTask,
  InputAction,
  Material,
  MeshCollider,
  MeshRenderer,
  pointerEventsSystem,
  TextAlignMode,
  TextShape,
  Transform
} from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'
import { Web3MethodDef } from './methodRegistry'

// --- State colors for the cube ---
export type CubeState = 'idle' | 'pending' | 'ready' | 'error'

const STATE_COLORS: Record<CubeState, Color4> = {
  idle: Color4.fromHexString('#4a90e2'),
  pending: Color4.fromHexString('#f4b400'),
  ready: Color4.fromHexString('#34a853'),
  error: Color4.fromHexString('#ea4335')
}

// --- Background colors for billboard labels ---
const NAME_BG_COLOR = Color4.create(0.08, 0.08, 0.15, 1)
const RESULT_BG_COLOR = Color4.create(0.06, 0.06, 0.1, 1)

// --- Entities that make up a method test cube ---
export interface MethodCube {
  cube: Entity
  resultText: Entity
}

/**
 * Creates a billboard label: a dark background plane with text in front.
 * Both are children of an anchor entity that has Billboard rotation.
 */
function createBillboardLabel(opts: {
  position: Vector3
  text: string
  fontSize: number
  textColor: Color4
  bgColor: Color4
  bgWidth: number
  bgHeight: number
}): { anchor: Entity; text: Entity; bg: Entity } {
  const anchor = engine.addEntity()
  Transform.create(anchor, { position: opts.position })
  Billboard.create(anchor, { billboardMode: BillboardMode.BM_Y })

  const bg = engine.addEntity()
  Transform.create(bg, {
    parent: anchor,
    position: Vector3.create(0, 0, 0.02),
    scale: Vector3.create(opts.bgWidth, opts.bgHeight, 1)
  })
  MeshRenderer.setPlane(bg)
  Material.setPbrMaterial(bg, {
    albedoColor: opts.bgColor,
    metallic: 0,
    roughness: 1
  })

  const textEntity = engine.addEntity()
  Transform.create(textEntity, {
    parent: anchor,
    position: Vector3.create(0, 0, 0)
  })
  TextShape.create(textEntity, {
    text: opts.text,
    fontSize: opts.fontSize,
    textColor: opts.textColor,
    outlineWidth: 0.08,
    outlineColor: Color4.Black(),
    textAlign: TextAlignMode.TAM_MIDDLE_CENTER
  })

  return { anchor, text: textEntity, bg }
}

/**
 * Creates a full method test cube: clickable box + name billboard + result billboard.
 */
export function createMethodCube(method: Web3MethodDef, position: Vector3): MethodCube {
  // --- Clickable cube ---
  const cube = engine.addEntity()
  Transform.create(cube, {
    position,
    scale: Vector3.create(0.7, 0.7, 0.7)
  })
  MeshRenderer.setBox(cube)
  MeshCollider.setBox(cube)
  setCubeColor(cube, STATE_COLORS.idle)

  // --- Result label (just above the cube) ---
  const result = createBillboardLabel({
    position: Vector3.create(position.x, position.y + 0.6, position.z),
    text: 'Click to execute',
    fontSize: 1.6,
    textColor: Color4.Gray(),
    bgColor: RESULT_BG_COLOR,
    bgWidth: 1.8,
    bgHeight: 0.25
  })

  // --- Name label (above the result) ---
  createBillboardLabel({
    position: Vector3.create(position.x, position.y + 1.0, position.z),
    text: method.name,
    fontSize: 1.6,
    textColor: Color4.create(0.8, 0.85, 1, 1),
    bgColor: NAME_BG_COLOR,
    bgWidth: 1.8,
    bgHeight: 0.25
  })

  const mc: MethodCube = { cube, resultText: result.text }

  // --- Click handler ---
  pointerEventsSystem.onPointerDown(
    {
      entity: cube,
      opts: {
        button: InputAction.IA_PRIMARY,
        hoverText: method.name,
        maxDistance: 10
      }
    },
    () => executeMethod(method, mc)
  )

  return mc
}

// --- Execution logic ---

function executeMethod(method: Web3MethodDef, mc: MethodCube) {
  setCubeColor(mc.cube, STATE_COLORS.pending)
  setResultText(mc.resultText, 'Requesting...', Color4.Yellow())

  executeTask(async () => {
    const t0 = Date.now()
    try {
      const params: Record<string, string> = {}
      const result = await method.execute(params)
      const elapsed = Date.now() - t0
      console.log(`[web3] ${method.name} OK (${elapsed}ms): ${result}`)

      setCubeColor(mc.cube, STATE_COLORS.ready)
      setResultText(mc.resultText, result, Color4.White())
    } catch (err: any) {
      const elapsed = Date.now() - t0
      const msg = err?.message || String(err)
      console.error(`[web3] ${method.name} FAIL (${elapsed}ms): ${msg}`)

      setCubeColor(mc.cube, STATE_COLORS.error)
      setResultText(mc.resultText, `Error: ${msg.slice(0, 50)}`, Color4.create(1, 0.4, 0.4, 1))
    }
  })
}

// --- Helpers ---

function setCubeColor(entity: Entity, color: Color4) {
  Material.setPbrMaterial(entity, {
    albedoColor: color,
    metallic: 0.2,
    roughness: 0.5
  })
}

function setResultText(entity: Entity, text: string, color: Color4) {
  const shape = TextShape.getMutable(entity)
  shape.text = text
  shape.textColor = color
}
