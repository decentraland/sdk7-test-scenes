// The History tab's rows: an agent's event ring (npc/history.ts) newest first, as upstream HTNDemo's History tab
// lists an NPC's events (HTNNPCSimulationPanel.cpp RenderSelectedNPCHistory), with a glyph and colour per kind and,
// for a replan, the run it made, so a click opens that run in the Plan tab. A run of identical events the history
// collapsed (npc/history.ts) is one row with ×N and its time span, as upstream's debugger tree shows a node visited
// again once with "retry xN" (HTNGeneratedDebuggerView.h:755-761); the History tab has no Verbose mode. Pure, no SDK.
import { formatTask } from '../htn-planner/htn/atom'
import type { AgentLogEntry, PlanRun, ReplanEvent } from '../htn-planner'
import { GLYPH, HEX, STATUS_HEX } from './theme'

export interface HistoryRow {
  t: number
  glyph: string
  hex: string
  /** `replan`, `kept`, `check`, `step`, `done`, `failed`, `cancelled`, `sense`, `heard`, `signal`, `catch`, `diagnostic`. */
  kind: string
  text: string
  /** The run a replan made (its last top-level run at that time), when the recorder still has it. */
  run?: number
  /** A collapsed run of identical events: how many (more than 1) and the time of the last. */
  count?: number
  until?: number
}

/** `×N, first–last s` for a collapsed row, else empty. */
export function repeatText(r: HistoryRow): string {
  if (r.count === undefined || r.count <= 1) return ''
  return `×${r.count}, ${r.t.toFixed(2)}–${(r.until ?? r.t).toFixed(2)} s`
}

export interface HistoryOptions {
  /** Leave out `heard` (noises arrive every footstep). */
  hideHeard?: boolean
}

/** The run a replan at time `t` made: the newest top-level run stamped `t`, else the newest one before it. */
export function runAt(runs: readonly PlanRun[], t: number): PlanRun | undefined {
  let best: PlanRun | undefined
  for (const r of runs) {
    if (r.deferred || r.t === undefined || r.t > t + 1e-9) continue
    if (!best || (best.t as number) < r.t || ((best.t as number) === r.t && best.seq < r.seq)) best = r
  }
  return best
}

/**
 * An agent's perception key in words. GuardAgent keys what it knows as `visible|remembered` (ids joined by ','):
 * `tester|` sees the tester, `|tester` only remembers it.
 */
export function knowledgeText(key: string): string {
  const [visible = '', remembered = ''] = key.split('|')
  const list = (s: string) => s.split(',').filter(Boolean).join(', ')
  const parts = [visible && `sees ${list(visible)}`, remembered && `remembers ${list(remembered)}`].filter(Boolean)
  return parts.length ? parts.join(' · ') : 'nothing'
}

/** A replan reason with its perception keys spelled out (`perception tester| -> |tester`). */
export function readableReason(reason: string): string {
  const m = /^perception (\S*) -> (\S*)$/.exec(reason)
  return m ? `perception: ${knowledgeText(m[1])} → ${knowledgeText(m[2])}` : reason
}

/** `<trigger>: <text>`, the trigger said once: left out when the text already starts with it as a word (`debug`,
 *  `reload`, `perception: sees tester`, `active_plan failed`), the text when empty. */
export function withTrigger(trigger: string | undefined, text: string): string {
  if (!trigger) return text
  if (!text) return trigger
  return text.startsWith(trigger) && !/^\w/.test(text.slice(trigger.length)) ? text : `${trigger}: ${text}`
}

/** `+target_visible −last_seen`: which facts changed, by name, in the order listed. */
export function changeSummary(changes: readonly string[] | undefined): string {
  if (!changes || changes.length === 0) return ''
  const out: string[] = []
  for (const c of changes) {
    const m = /^([+-]) \((\S+?)[\s)]/.exec(c)
    if (!m) continue
    const s = `${m[1] === '+' ? '+' : '−'}${m[2]}`
    if (!out.includes(s)) out.push(s)
  }
  return out.join(' ')
}

/** What a replan came to: `new plan`, `same plan`, `running plan kept`, or its status. */
export function replanOutcome(e: ReplanEvent): string {
  if (e.status !== 'succeeded') return e.kept ? `${e.status}, running plan kept` : e.status
  if (e.kept) return e.continued ? 'running plan continued' : 'running plan kept'
  return e.changed === false ? 'same plan' : 'new plan'
}

/** Rows newest first. */
export function historyRows(entries: readonly AgentLogEntry[], runs: readonly PlanRun[], opts: HistoryOptions = {}): HistoryRow[] {
  const out: HistoryRow[] = []
  for (let i = entries.length - 1; i >= 0; i--) {
    const { t, event: e, until, count } = entries[i]
    const before = out.length
    switch (e.type) {
      case 'replan': {
        const run = runAt(runs, until ?? t)
        const kept = e.kept
        // A replan that made the same steps again says so; a new plan says how long it is.
        const what = e.status !== 'succeeded' || kept || e.changed === false ? replanOutcome(e) : `${e.plan.length} step${e.plan.length === 1 ? '' : 's'}`
        const passes = e.passes > 1 ? `, ${e.passes} passes` : ''
        const changed = changeSummary(e.changes)
        out.push({
          t,
          glyph: '◆',
          hex: e.status !== 'succeeded' ? STATUS_HEX.failed : kept ? HEX.dim : STATUS_HEX.running,
          kind: kept ? 'kept' : 'replan',
          text: `replan: ${readableReason(e.reason)} → ${what}${passes}${!kept && e.changed !== false && e.plan.length ? '   ' + e.plan.slice(0, 3).join(', ') + (e.plan.length > 3 ? ' …' : '') : ''}${changed ? '   Δ ' + changed : ''}`,
          run: run?.seq
        })
        break
      }
      case 'check':
        out.push({ t, glyph: '◆', hex: STATUS_HEX.failed, kind: 'check', text: `${e.method} rejects ${e.step} (${e.status}): cancel` })
        break
      case 'step':
        out.push({ t, glyph: GLYPH.running, hex: STATUS_HEX.running, kind: 'step', text: formatTask(e.name, e.args) })
        break
      case 'step_end': {
        const kind = e.status === 'done' ? 'done' : e.status === 'cancelled' ? 'cancelled' : 'failed'
        const hex = kind === 'done' ? STATUS_HEX.chosen : kind === 'cancelled' ? STATUS_HEX.abandoned : STATUS_HEX.failed
        const glyph = kind === 'done' ? GLYPH.chosen : GLYPH.failed
        out.push({ t, glyph, hex, kind, text: `${e.name} ${kind}` })
        break
      }
      case 'sense':
        out.push({ t, glyph: '◇', hex: HEX.warn, kind: 'sense', text: e.what === 'perception' ? `perception: ${knowledgeText(e.from)} → ${knowledgeText(e.to)}` : `${e.what}: ${e.from || '∅'} → ${e.to || '∅'}` })
        break
      case 'heard':
        if (!opts.hideHeard) out.push({ t, glyph: '♪', hex: HEX.dim, kind: 'heard', text: `heard ${e.kind} from ${e.source} (${e.level})` })
        break
      case 'signal':
        out.push({ t, glyph: '!', hex: HEX.warn, kind: 'signal', text: `${e.name}${e.target ? ' ' + e.target : ''}` })
        break
      case 'diagnostic':
        out.push({ t, glyph: '!', hex: HEX.warn, kind: 'diagnostic', text: e.message })
        break
      case 'catch':
        out.push({ t, glyph: '!', hex: HEX.warn, kind: 'catch', text: `caught ${e.target}` })
        break
    }
    if (count !== undefined && count > 1 && out.length > before) Object.assign(out[out.length - 1], { count, until: until ?? t })
  }
  return out
}
