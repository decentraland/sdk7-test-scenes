// World tab: the world the shown run planned against (the recorder keeps one snapshot per revision), grouped by fact,
// + / − / ~ against the world of the run before it, "changed only"; windowed with our scrollbar.
import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { colored, escapeRich, HEX, TOKEN_HEX } from '../theme'
import { rowWindow } from '../tree-rows'
import { Mark, WorldLine, worldView } from '../world-rows'
import { HostView, runWorlds } from './data'
import { button, C, hex, label, scrollbar } from './kit'
import { BODY_H, BODY_W } from './layout'
import { set, state, touch } from './state'

const ROW_H = 22
const BAR_H = 30
const TINT: Record<Mark, Color4> = { '+': C.added, '-': C.removed, '~': C.changed, '=': Color4.Clear() }
const MARK_HEX: Record<Mark, string> = { '+': HEX.added, '-': HEX.removed, '~': HEX.changed, '=': HEX.faint }

let cache: { key: unknown[]; lines: WorldLine[]; summary: string } | null = null

function lines(v: HostView) {
  const w = runWorlds(v)
  const key = [w.now, w.before, state.worldChangedOnly]
  if (cache && cache.key.every((k, i) => k === key[i])) return cache
  const view = worldView(w.now, w.before, { changedOnly: state.worldChangedOnly })
  const run = v.pick.run
  const c = view.counts
  const vs = w.beforeRun ? `vs rev ${w.beforeRun.world} (run #${w.beforeRun.seq})` : 'nothing earlier to compare'
  const summary = run
    ? `rev ${run.world} (run #${run.seq}) ${vs}:  ${c.facts} facts, ${c.rows} rows  ${colored(HEX.added, `+${c.added}`)} ${colored(HEX.removed, `−${c.removed}`)} ${colored(HEX.changed, `~${c.changed}`)}`
    : 'no run: nothing recorded yet'
  cache = { key, lines: view.lines, summary }
  return cache
}

function line(l: WorldLine, slot: number) {
  if (l.kind === 'group') {
    const counts = [l.added ? colored(HEX.added, `+${l.added}`) : '', l.removed ? colored(HEX.removed, `−${l.removed}`) : '', l.changed ? colored(HEX.changed, `~${l.changed}`) : '']
      .filter(Boolean)
      .join(' ')
    const value = `<b>${colored(TOKEN_HEX.result, l.name)}</b>${colored(HEX.faint, `/${l.arity}  ${l.rows} row${l.rows === 1 ? '' : 's'}`)}  ${counts}`
    return (
      <UiEntity
        key={slot}
        uiTransform={{ width: '100%', height: ROW_H, flexShrink: 0, padding: { left: 6 } }}
        uiBackground={{ color: C.group }}
        uiText={{ value, fontSize: 14, color: C.text, textAlign: 'middle-left', textWrap: 'nowrap' }}
      />
    )
  }
  const mark = l.mark === '-' ? '−' : l.mark === '=' ? '' : l.mark
  return (
    <UiEntity key={slot} uiTransform={{ width: '100%', height: ROW_H, flexShrink: 0, flexDirection: 'row', borderRadius: 3 }} uiBackground={{ color: TINT[l.mark] }}>
      {label(mark, 15, hex(MARK_HEX[l.mark]), 34, 'm')}
      <UiEntity
        key="v"
        uiTransform={{ width: 520, height: ROW_H, flexShrink: 0, overflow: 'hidden' }}
        uiText={{ value: escapeRich(l.values), fontSize: 14, color: l.mark === '-' ? C.dim : C.text, textAlign: 'middle-left', textWrap: 'nowrap' }}
      />
      <UiEntity
        key="w"
        uiTransform={{ width: 420, height: ROW_H, flexShrink: 0, overflow: 'hidden' }}
        uiText={{ value: l.was ? colored(HEX.faint, 'was ') + escapeRich(l.was) : '', fontSize: 14, color: C.dim, textAlign: 'middle-left', textWrap: 'nowrap' }}
      />
    </UiEntity>
  )
}

export function worldTab(v: HostView) {
  const { lines: all, summary } = lines(v)
  const height = BODY_H - BAR_H - 8
  const size = Math.floor(height / ROW_H)
  const { start, end } = rowWindow(all.length, state.worldOffset, size)
  const slots = []
  for (let i = start; i < end; i++) slots.push(line(all[i], i - start))
  if (all.length === 0) slots.push(label(state.worldChangedOnly ? '  nothing changed' : '  (no world recorded)', 14, C.dim, 'auto', 'empty'))
  return (
    <UiEntity uiTransform={{ width: BODY_W, height: BODY_H, flexDirection: 'column' }}>
      <UiEntity key="bar" uiTransform={{ flexDirection: 'row', height: BAR_H, alignItems: 'center', flexShrink: 0 }}>
        {button('all facts', () => set({ worldChangedOnly: false, worldOffset: 0 }), !state.worldChangedOnly, 'auto', 'all')}
        {button('changed only', () => set({ worldChangedOnly: true, worldOffset: 0 }), state.worldChangedOnly, 'auto', 'changed')}
        <UiEntity
          key="sum"
          uiTransform={{ height: 26, flexShrink: 0, margin: { left: 8 } }}
          uiText={{ value: summary, fontSize: 13, color: C.dim, textAlign: 'middle-left', textWrap: 'nowrap' }}
        />
      </UiEntity>
      <UiEntity key="table" uiTransform={{ width: BODY_W, height, flexDirection: 'row', flexShrink: 0, margin: { top: 8 } }} uiBackground={{ color: C.card }}>
        <UiEntity uiTransform={{ width: BODY_W - 18, height, flexDirection: 'column', overflow: 'hidden' }}>{slots}</UiEntity>
        {scrollbar(all.length, start, size, height, o => {
          state.worldOffset = o
          touch()
        })}
      </UiEntity>
    </UiEntity>
  )
}

