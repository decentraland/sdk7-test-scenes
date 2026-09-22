// Shared store for openExplorerUi call results, rendered by the HUD in ui.tsx so QA can
// verify verdicts on screen without tailing logs.
export interface UiCallResult {
  time: string
  label: string
  verdict: string
  code: number
}

const MAX_RESULTS = 8

export const callResults: UiCallResult[] = []

export function pushResult(label: string, code: number, verdict: string): string {
  const time = formatNow()
  callResults.unshift({ time, label, verdict, code })
  if (callResults.length > MAX_RESULTS) callResults.pop()
  return time
}

export function formatNow(): string {
  const d = new Date()
  const pad = (n: number, width: number = 2) => n.toString().padStart(width, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`
}
