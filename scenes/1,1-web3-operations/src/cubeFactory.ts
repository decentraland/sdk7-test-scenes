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

// --- Label sizing constants ---
const CHAR_WIDTH = 0.065
const BG_PADDING_X = 0.15
const BG_LINE_HEIGHT = 0.25

function estimateBgWidth(text: string, fontSize: number): number {
  return Math.max(text.length * CHAR_WIDTH * fontSize + BG_PADDING_X, 0.4)
}

function clampedBgWidth(text: string, fontSize: number, maxWidth: number): number {
  return Math.min(estimateBgWidth(text, fontSize), maxWidth)
}

function maxCharsForWidth(fontSize: number, maxWidth: number): number {
  return Math.floor((maxWidth - BG_PADDING_X) / (CHAR_WIDTH * fontSize))
}

function wrapText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text

  const lines: string[] = []
  let remaining = text
  while (remaining.length > 0) {
    if (remaining.length <= maxChars) {
      lines.push(remaining)
      break
    }
    let breakAt = remaining.lastIndexOf(' ', maxChars)
    if (breakAt <= 0) breakAt = maxChars
    lines.push(remaining.slice(0, breakAt).trimEnd())
    remaining = remaining.slice(breakAt).trimStart()
  }
  return lines.join('\n')
}

function countLines(text: string): number {
  return text.split('\n').length
}

function bgHeightForLines(lines: number): number {
  return BG_LINE_HEIGHT * lines
}

// --- Entities that make up a method test cube ---
export interface MethodCube {
  cube: Entity
  resultText: Entity
  resultBg: Entity
  resultAnchor: Entity
  resultFontSize: number
  resultBottomY: number
  maxResultWidth: number
}

/**
 * Creates a billboard label (single line, auto-width, no wrapping).
 */
function createBillboardLabel(opts: {
  position: Vector3
  text: string
  fontSize: number
  textColor: Color4
  bgColor: Color4
}): { anchor: Entity; text: Entity; bg: Entity } {
  const anchor = engine.addEntity()
  Transform.create(anchor, { position: opts.position })
  Billboard.create(anchor, { billboardMode: BillboardMode.BM_Y })

  const bgWidth = estimateBgWidth(opts.text, opts.fontSize)

  const bg = engine.addEntity()
  Transform.create(bg, {
    parent: anchor,
    position: Vector3.create(0, 0, 0.02),
    scale: Vector3.create(bgWidth, BG_LINE_HEIGHT, 1)
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
 * Creates a billboard label with max width constraint and text wrapping.
 */
function createWrappedBillboardLabel(opts: {
  position: Vector3
  text: string
  fontSize: number
  textColor: Color4
  bgColor: Color4
  maxWidth: number
}): { anchor: Entity; text: Entity; bg: Entity } {
  const maxChars = maxCharsForWidth(opts.fontSize, opts.maxWidth)
  const wrapped = wrapText(opts.text, maxChars)
  const lines = countLines(wrapped)

  const anchor = engine.addEntity()
  Transform.create(anchor, { position: opts.position })
  Billboard.create(anchor, { billboardMode: BillboardMode.BM_Y })

  const bgWidth = clampedBgWidth(opts.text, opts.fontSize, opts.maxWidth)
  const bgHeight = bgHeightForLines(lines)

  const bg = engine.addEntity()
  Transform.create(bg, {
    parent: anchor,
    position: Vector3.create(0, 0, 0.02),
    scale: Vector3.create(bgWidth, bgHeight, 1)
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
    text: wrapped,
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
 * @param spacing — distance between cube centers (used to cap result label width)
 */
export function createMethodCube(method: Web3MethodDef, position: Vector3, spacing: number): MethodCube {
  const cube = engine.addEntity()
  Transform.create(cube, {
    position,
    scale: Vector3.create(0.7, 0.7, 0.7)
  })
  MeshRenderer.setBox(cube)
  MeshCollider.setBox(cube)
  setCubeColor(cube, STATE_COLORS.idle)

  const fontSize = 1.6
  const maxResultWidth = spacing

  // --- Name label (just above the cube) — single line, no max width ---
  createBillboardLabel({
    position: Vector3.create(position.x, position.y + 0.6, position.z),
    text: method.name,
    fontSize,
    textColor: Color4.create(0.8, 0.85, 1, 1),
    bgColor: NAME_BG_COLOR
  })

  // --- Result label (above the name) — wraps to fit maxResultWidth ---
  const resultBottomY = position.y + 0.6 + BG_LINE_HEIGHT / 2 + 0.1
  const result = createWrappedBillboardLabel({
    position: Vector3.create(position.x, resultBottomY + BG_LINE_HEIGHT / 2, position.z),
    text: 'Click to execute',
    fontSize,
    textColor: Color4.Gray(),
    bgColor: RESULT_BG_COLOR,
    maxWidth: maxResultWidth
  })

  const mc: MethodCube = {
    cube,
    resultText: result.text,
    resultBg: result.bg,
    resultAnchor: result.anchor,
    resultFontSize: fontSize,
    resultBottomY,
    maxResultWidth
  }

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
  setResultText(mc, 'Requesting...', Color4.Yellow())

  executeTask(async () => {
    const t0 = Date.now()
    try {
      const params: Record<string, string> = {}
      const result = await method.execute(params)
      const elapsed = Date.now() - t0
      console.log(`[web3] ${method.name} OK (${elapsed}ms): ${result}`)

      setCubeColor(mc.cube, STATE_COLORS.ready)
      setResultText(mc, result, Color4.White())
    } catch (err: any) {
      const elapsed = Date.now() - t0
      const msg = err?.message || String(err)
      console.error(`[web3] ${method.name} FAIL (${elapsed}ms): ${msg}`)

      setCubeColor(mc.cube, STATE_COLORS.error)
      setResultText(mc, `Error: ${msg.slice(0, 80)}`, Color4.create(1, 0.4, 0.4, 1))
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

function setResultText(mc: MethodCube, text: string, color: Color4) {
  const maxChars = maxCharsForWidth(mc.resultFontSize, mc.maxResultWidth)
  const wrapped = wrapText(text, maxChars)
  const lines = countLines(wrapped)

  const shape = TextShape.getMutable(mc.resultText)
  shape.text = wrapped
  shape.textColor = color

  const newWidth = clampedBgWidth(text, mc.resultFontSize, mc.maxResultWidth)
  const newHeight = bgHeightForLines(lines)
  const bgTransform = Transform.getMutable(mc.resultBg)
  bgTransform.scale = Vector3.create(newWidth, newHeight, 1)

  const anchorTransform = Transform.getMutable(mc.resultAnchor)
  anchorTransform.position.y = mc.resultBottomY + newHeight / 2
}
