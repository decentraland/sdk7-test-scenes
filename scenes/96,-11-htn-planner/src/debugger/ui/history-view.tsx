// History tab: the host's event ring newest first (upstream HTNDemo's History tab): replans with their reason and
// whether the running plan was kept, steps and their ends, senses. A replan row opens the run it made in the Plan tab.
// A run of identical events (a stuck agent's retry every tick) is one row with ×N and its time span.
import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { HistoryRow, historyRows, repeatText } from '../history-rows'
import { colored, escapeRich, HEX } from '../theme'
import { rowWindow } from '../tree-rows'
import { HostView } from './data'
import { button, C, label, scrollbar } from './kit'
import { BODY_H, BODY_W } from './layout'
import { set, state, touch } from './state'

const ROW_H = 22
const BAR_H = 30

let cache: { key: unknown[]; rows: HistoryRow[] } | null = null

function rowsOf(v: HostView): HistoryRow[] {
  const h = v.host.history
  const key = [h, h?.total, v.runs[v.runs.length - 1], state.hideHeard]
  if (cache && cache.key.every((k, i) => k === key[i])) return cache.rows
  const rows = h ? historyRows(h.toArray(), v.runs, { hideHeard: state.hideHeard }) : []
  cache = { key, rows }
  return rows
}

function line(r: HistoryRow, slot: number, shown: number | null) {
  const link = r.run !== undefined
  const open = () => {
    state.plan.pinned = r.run ?? null
    set({ tab: 'plan' })
  }
  const repeat = repeatText(r)
  const text = `${colored(HEX.faint, r.t.toFixed(2).padStart(8, ' ') + 's')}  ${colored(r.hex, r.glyph)}  ${colored(r.kind === 'step' ? HEX.text : r.hex, escapeRich(r.text))}${repeat ? colored(HEX.dim, `   ${repeat}`) : ''}${link ? colored(HEX.faint, `   run #${r.run} ›`) : ''}`
  return (
    <UiEntity
      key={slot}
      uiTransform={{ width: '100%', height: ROW_H, flexShrink: 0, padding: { left: 6 }, overflow: 'hidden' }}
      uiBackground={{ color: link && r.run === shown ? C.selected : Color4.Clear() }}
      uiText={{ value: text, fontSize: 14, color: C.text, textAlign: 'middle-left', textWrap: 'nowrap' }}
      onMouseDown={link ? open : undefined}
    />
  )
}

export function historyTab(v: HostView) {
  const rows = rowsOf(v)
  const height = BODY_H - BAR_H - 8
  const size = Math.floor(height / ROW_H)
  const { start, end } = rowWindow(rows.length, state.historyOffset, size)
  const slots = []
  const shown = v.pick.run?.seq ?? null
  for (let i = start; i < end; i++) slots.push(line(rows[i], i - start, shown))
  if (rows.length === 0) slots.push(label(v.host.history ? '  no events yet' : '  this host keeps no history', 14, C.dim, 'auto', 'empty'))
  const total = v.host.history?.total ?? 0
  return (
    <UiEntity uiTransform={{ width: BODY_W, height: BODY_H, flexDirection: 'column' }}>
      <UiEntity key="bar" uiTransform={{ flexDirection: 'row', height: BAR_H, alignItems: 'center', flexShrink: 0 }}>
        {button(state.hideHeard ? 'noises hidden' : 'noises shown', () => set({ hideHeard: !state.hideHeard, historyOffset: 0 }), !state.hideHeard, 'auto', 'heard')}
        {label(`   ${rows.length} rows shown, ${total} events since start, newest first (×N: repeats); click a replan to open its run`, 13, C.dim, 'auto', 'info')}
      </UiEntity>
      <UiEntity key="list" uiTransform={{ width: BODY_W, height, flexDirection: 'row', flexShrink: 0, margin: { top: 8 } }} uiBackground={{ color: C.card }}>
        <UiEntity uiTransform={{ width: BODY_W - 18, height, flexDirection: 'column', overflow: 'hidden' }}>{slots}</UiEntity>
        {scrollbar(rows.length, start, size, height, o => {
          state.historyOffset = o
          touch()
        })}
      </UiEntity>
    </UiEntity>
  )
}
