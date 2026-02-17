import ReactEcs, { ReactEcsRenderer, UiEntity, Label, Button, Input } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { executeTask } from '@dcl/sdk/ecs'
import { Web3MethodDef } from './methodRegistry'

// ---------------------------------------------------------------------------
// Module-level state (read by the renderer every frame)
// ---------------------------------------------------------------------------

let activeMethod: Web3MethodDef | null = null
let paramValues: Record<string, string> = {}
let resultText = ''
let resultColor: Color4 = Color4.White()
let isExecuting = false
let onExecuteResult: ((success: boolean, result: string) => void) | null = null

// ---------------------------------------------------------------------------
// Public API — called from index.ts / cubeFactory.ts
// ---------------------------------------------------------------------------

/** Show the parameter panel for the given method. */
export function showMethodPanel(
  method: Web3MethodDef,
  callback?: (success: boolean, result: string) => void
) {
  activeMethod = method
  paramValues = {}
  resultText = ''
  resultColor = Color4.White()
  isExecuting = false
  onExecuteResult = callback ?? null

  if (method.params) {
    for (const p of method.params) {
      try {
        paramValues[p.name] = typeof p.defaultValue === 'function' ? p.defaultValue() : p.defaultValue
      } catch {
        paramValues[p.name] = ''
      }
    }
  }
}

/** Hide the panel (player left trigger zone). */
export function hideMethodPanel() {
  activeMethod = null
  onExecuteResult = null
}

export function isMethodPanelVisible(): boolean {
  return activeMethod !== null
}

export function getActiveMethodId(): string | null {
  return activeMethod?.id ?? null
}

/** Return a copy of the current parameter values shown in the panel. */
export function getCurrentParamValues(): Record<string, string> {
  return { ...paramValues }
}

/** Push an external result into the panel (e.g. after cube-click execution). */
export function setUiResult(text: string, color: Color4) {
  resultText = text
  resultColor = color
  isExecuting = false
}

// ---------------------------------------------------------------------------
// Execute logic (triggered by the Execute button)
// ---------------------------------------------------------------------------

function doExecute() {
  if (!activeMethod || isExecuting) return
  const method = activeMethod
  const params = { ...paramValues }

  isExecuting = true
  resultText = 'Requesting...'
  resultColor = Color4.Yellow()

  executeTask(async () => {
    const t0 = Date.now()
    try {
      const result = await method.execute(params)
      const elapsed = Date.now() - t0
      console.log(`[web3] ${method.name} OK (${elapsed}ms): ${result}`)

      resultText = result
      resultColor = Color4.create(0.3, 1, 0.4, 1)
      isExecuting = false
      onExecuteResult?.(true, result)
    } catch (err: any) {
      const elapsed = Date.now() - t0
      const msg = err?.message || String(err)
      console.error(`[web3] ${method.name} FAIL (${elapsed}ms): ${msg}`)

      resultText = `Error: ${msg.slice(0, 200)}`
      resultColor = Color4.create(1, 0.4, 0.4, 1)
      isExecuting = false
      onExecuteResult?.(false, msg)
    }
  })
}

// ---------------------------------------------------------------------------
// React-ECS UI component
// ---------------------------------------------------------------------------

const PANEL_BG = Color4.create(0.08, 0.08, 0.14, 0.95)
const INPUT_BG = Color4.create(0.15, 0.15, 0.22, 1)
const RESULT_BG = Color4.create(0.06, 0.06, 0.1, 1)
const LABEL_COLOR = Color4.create(0.7, 0.7, 0.8, 1)
const TITLE_COLOR = Color4.create(0.8, 0.85, 1, 1)

function MethodPanel(): ReactEcs.JSX.Element | null {
  if (!activeMethod) return null
  const method = activeMethod
  const params = method.params ?? []

  return (
    <UiEntity
      uiTransform={{
        width: 400,
        positionType: 'absolute',
        position: { right: 10, top: '20%' },
        flexDirection: 'column',
        padding: 16
      }}
      uiBackground={{ color: PANEL_BG }}
    >
      {/* ---- Header ---- */}
      <Label
        value={method.name}
        fontSize={20}
        color={TITLE_COLOR}
        uiTransform={{ width: '100%', height: 30, margin: { bottom: 4 } }}
      />
      <Label
        value={'Type: ' + method.type}
        fontSize={13}
        color={Color4.Gray()}
        uiTransform={{ width: '100%', height: 18, margin: { bottom: 12 } }}
      />

      {/* ---- Parameter fields ---- */}
      {params.map((p) => (
        <UiEntity
          key={p.name}
          uiTransform={{ flexDirection: 'column', width: '100%', margin: { bottom: 8 } }}
        >
          <Label
            value={p.label + ':'}
            fontSize={14}
            color={LABEL_COLOR}
            uiTransform={{ width: '100%', height: 20 }}
          />
          <UiEntity uiTransform={{ flexDirection: 'row', width: '100%', margin: { top: 4 } }}>
            <Input
              value={paramValues[p.name] ?? ''}
              placeholder={p.label}
              onChange={(val) => { paramValues[p.name] = val }}
              fontSize={14}
              color={Color4.White()}
              placeholderColor={Color4.create(0.4, 0.4, 0.5, 1)}
              uiTransform={{ flex: 1, height: 36 }}
              uiBackground={{ color: INPUT_BG }}
            />
            {p.randomValues ? (
              <Button
                value="Random"
                variant="secondary"
                fontSize={13}
                uiTransform={{ width: 80, height: 36, margin: { left: 4 } }}
                onMouseDown={() => {
                  const list = p.randomValues!
                  paramValues[p.name] = list[Math.floor(Math.random() * list.length)]
                }}
              />
            ) : null}
          </UiEntity>
        </UiEntity>
      ))}

      {/* ---- Execute button ---- */}
      <Button
        value={isExecuting ? 'Executing...' : 'Execute'}
        variant="primary"
        fontSize={16}
        uiTransform={{ width: '100%', height: 44, margin: { top: 8 } }}
        onMouseDown={() => doExecute()}
      />

      {/* ---- Result area ---- */}
      {resultText ? (
        <UiEntity
          uiTransform={{
            width: '100%',
            minHeight: 40,
            margin: { top: 12 },
            padding: 8,
            flexDirection: 'column'
          }}
          uiBackground={{ color: RESULT_BG }}
        >
          <Label
            value={resultText}
            fontSize={13}
            color={resultColor}
            uiTransform={{ width: '100%' }}
            textWrap="wrap"
          />
        </UiEntity>
      ) : null}
    </UiEntity>
  )
}

// ---------------------------------------------------------------------------
// Bootstrap — call once from main()
// ---------------------------------------------------------------------------

export function setupUi() {
  ReactEcsRenderer.setUiRenderer(MethodPanel)
}
