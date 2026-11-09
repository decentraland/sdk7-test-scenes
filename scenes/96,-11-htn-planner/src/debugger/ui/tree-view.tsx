// The decomposition tree of one run (upstream's Normal / Verbose projection, library viewRows) drawn as a windowed
// list: only the rows in view, each a container with its tree guides, a fold mark and one rich-text line, plus our
// scrollbar; and the watch of the selected node (upstream RenderWatch). Shared by the Plan and Domain Runner tabs.
import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { viewRows } from '../../htn-planner'
import type { DomainGraph, DomainIR, PlanRun, ViewMode, ViewRow, WorldSnapshot } from '../../htn-planner'
import { Guide, revealOffset, rowRich, rowWindow, sameNode, treeGuides, watchOf } from '../tree-rows'
import { colored, escapeRich, GLYPH, HEX, STATUS_HEX, TOKEN_HEX } from '../theme'
import { whyLines } from '../why-rows'
import { C, hex, label, para, rect, scrollbar } from './kit'
import { hold, state, touch, TreeUi } from './state'

export const ROW_H = 22
const INDENT = 16
const FONT = 14

interface Rows {
  run: PlanRun
  mode: ViewMode
  open: Map<number, boolean>
  choice: Map<number, number>
  rows: ViewRow[]
  guides: Guide[][]
}

const cache = new WeakMap<TreeUi, Rows>()

/** The rows of `run` for this tree's fold state, cached until the run, the mode or the folds change. */
export function treeRows(run: PlanRun, tree: TreeUi): Rows {
  const c = cache.get(tree)
  if (c && c.run === run && c.mode === state.mode && c.open === tree.open && c.choice === tree.choice) return c
  const rows = viewRows(run, state.mode, { open: tree.open, choice: tree.choice })
  const out = { run, mode: state.mode, open: tree.open, choice: tree.choice, rows, guides: treeGuides(rows) }
  cache.set(tree, out)
  return out
}

/**
 * Follow a run: another run of the same host keeps the folds and the selection where its node is the same (a live
 * NPC replans every few seconds); another host or the first run start with upstream's default expansion.
 */
export function adoptRun(tree: TreeUi, key: string, run: PlanRun | null, host: string) {
  if (tree.runKey === key) return
  const before = tree.run
  const same = before !== null && run !== null && tree.runKey.startsWith(host + '#')
  tree.runKey = key
  tree.run = run
  if (same && before && run) {
    const keep = <V,>(m: Map<number, V>) => new Map([...m].filter(([id]) => sameNode(before, run, id)))
    tree.open = keep(tree.open)
    tree.choice = new Map([...tree.choice].filter(([id, c]) => sameNode(before, run, id) && (c < 0 || sameNode(before, run, c))))
    if (tree.selected !== null && !sameNode(before, run, tree.selected)) tree.selected = null
    return
  }
  tree.open = new Map()
  tree.choice = new Map()
  tree.selected = null
  tree.offset = 0
}

/** Select a node; scroll so its row shows. */
export function selectNode(run: PlanRun, tree: TreeUi, node: number, windowRows: number) {
  tree.selected = node
  hold()
  const r = treeRows(run, tree)
  const at = r.rows.findIndex(x => x.node === node)
  if (at >= 0) tree.offset = revealOffset(tree.offset, at, windowRows)
  touch()
}

function toggleRow(tree: TreeUi, row: ViewRow) {
  tree.open = new Map(tree.open)
  tree.open.set(row.node, !row.open)
  if (row.choice >= 0 && row.choiceParent !== undefined && row.choiceParent >= 0) {
    // Upstream: opening a candidate makes it the expanded one of its group; closing it lists them all again.
    tree.choice = new Map(tree.choice)
    tree.choice.set(row.choiceParent, row.open ? -1 : row.node)
  }
  hold()
  touch()
}

function guideRects(guides: Guide[]) {
  const out = []
  for (let col = 0; col < guides.length; col++) {
    const g = guides[col]
    const x = col * INDENT + INDENT / 2 - 1
    if (g === 'line' || g === 'tee') out.push(rect(`v${col}`, x, 0, 1, ROW_H, C.guide))
    if (g === 'elbow') out.push(rect(`v${col}`, x, 0, 1, ROW_H / 2, C.guide))
    if (g === 'tee' || g === 'elbow') out.push(rect(`h${col}`, x, ROW_H / 2 - 1, INDENT / 2, 1, C.guide))
  }
  return out
}

function treeRow(run: PlanRun, graph: DomainGraph, tree: TreeUi, row: ViewRow, guides: Guide[], slot: number, width: number) {
  const id = row.node
  const select = () => {
    tree.selected = id
    hold()
    touch()
  }
  // Nested clickable entities do not both get the click (the Explorer delivers it to one): the fold mark and the
  // text are siblings, each with its own handler; the row itself takes none.
  return (
    <UiEntity
      key={slot}
      uiTransform={{ width, height: ROW_H, flexShrink: 0, flexDirection: 'row', alignItems: 'center', padding: { left: row.depth * INDENT }, overflow: 'hidden' }}
      uiBackground={{ color: id === tree.selected ? C.selected : Color4.Clear() }}
    >
      {guideRects(guides)}
      <UiEntity
        key="fold"
        uiTransform={{ width: 16, height: ROW_H, flexShrink: 0 }}
        uiText={row.collapsible ? { value: row.open ? '−' : '+', fontSize: FONT, color: C.dim, textAlign: 'middle-center' } : undefined}
        onMouseDown={row.collapsible ? () => toggleRow(tree, row) : select}
      />
      <UiEntity
        key="text"
        uiTransform={{ height: ROW_H, flexGrow: 1, flexShrink: 0 }}
        uiText={{ value: rowRich(run, graph, row, { values: state.values }), fontSize: FONT, color: C.text, textAlign: 'middle-left', textWrap: 'nowrap' }}
        onMouseDown={select}
      />
    </UiEntity>
  )
}

/** The tree of `run` in a box of `width` x `height`, windowed. */
export function treeBox(run: PlanRun, graph: DomainGraph, tree: TreeUi, width: number, height: number) {
  const { rows, guides } = treeRows(run, tree)
  const size = Math.floor(height / ROW_H)
  const { start, end } = rowWindow(rows.length, tree.offset, size)
  const slots = []
  // Keyed by slot, not by node: scrolling updates the same entities instead of making new ones.
  for (let i = start; i < end; i++) slots.push(treeRow(run, graph, tree, rows[i], guides[i], i - start, width - 18))
  if (rows.length === 0) slots.push(label('  (this run has no nodes)', 14, C.dim, 'auto', 'empty'))
  return (
    <UiEntity uiTransform={{ width, height, flexDirection: 'row', flexShrink: 0 }} uiBackground={{ color: C.card }}>
      <UiEntity uiTransform={{ width: width - 18, height, flexDirection: 'column', overflow: 'hidden' }}>{slots}</UiEntity>
      {scrollbar(rows.length, start, size, height, o => {
        tree.offset = o
        touch()
      })}
    </UiEntity>
  )
}

/** What the watch needs to say why a node ended as it did: the run's domain and the worlds it planned against. */
export interface WhySource {
  domain: DomainIR
  world?: (revision: number) => WorldSnapshot | undefined
}

/**
 * Upstream's watch of the selected node: result, source, then (ours) why it ended as it did (a method: its branches;
 * a branch: the failing terms, needed vs the world; a failed condition: its failing terms), constants, Before /
 * After, and a failed fact's rows.
 */
export function watchBox(run: PlanRun, graph: DomainGraph, tree: TreeUi, width: number, height: number, why?: WhySource) {
  const id = tree.selected
  const children = []
  if (id === null || !run.nodes[id]) {
    children.push(label('Watch', 15, Color4.White(), 'auto', 'title'))
    children.push(para(colored(HEX.dim, 'Click a row to watch its variables Before / After.'), 13, 'hint'))
  } else {
    // A choice row's own result; the selection may have been carried over from an earlier run: read it from the rows.
    const row = treeRows(run, tree).rows.find(r => r.node === id)
    const w = watchOf(run, graph, id, row ? row.ok : undefined)
    children.push(label('Watch', 15, Color4.White(), 'auto', 'title'))
    children.push(para(w.title, 14, 'node'))
    const result = colored(STATUS_HEX[w.status], `${GLYPH[w.status]} ${w.result}`)
    children.push(para(`${colored(HEX.dim, w.kind)}  ${result}  ${colored(HEX.faint, w.source)}`, 13, 'meta'))
    const lines = why ? whyLines(why.domain, run, id, why.world, Math.max(3, Math.floor((height - 300) / 36))) : []
    if (lines.length > 0) {
      children.push(label(run.nodes[id].kind === 'method' ? 'why: its branches' : 'why', 12, C.dim, 'auto', 'wh'))
      lines.forEach((l, i) => children.push(para(l, 12, `w${i}`)))
    }
    if (w.constants.length > 0) {
      children.push(label('constants', 12, C.dim, 'auto', 'ch'))
      w.constants.forEach((c, i) => children.push(para(`${colored(TOKEN_HEX.const, c.name)} = ${escapeRich(c.value)}`, 13, `c${i}`)))
    }
    if (w.vars.length === 0) children.push(para(colored(HEX.dim, 'No bound variables at this event.'), 13, 'novars'))
    else {
      // Name, Before, After; a long value (a position) wraps inside its cell instead of running into the next.
      const nameW = Math.floor((width - 24) * 0.28)
      const col = Math.floor((width - 24 - nameW) / 2)
      const cell = (key: string, value: string, w: number, color: Color4, size = 13) => (
        <UiEntity key={key} uiTransform={{ width: w, height: 'auto', flexShrink: 0, padding: { right: 6 } }} uiText={{ value, fontSize: size, color, textAlign: 'top-left', textWrap: 'wrap' }} />
      )
      children.push(
        <UiEntity key="vh" uiTransform={{ flexDirection: 'row', height: 20, flexShrink: 0 }}>
          {cell('a', 'variable', nameW, C.dim, 12)}
          {cell('b', 'before', col, C.dim, 12)}
          {cell('c', 'after', col, C.dim, 12)}
        </UiEntity>
      )
      const max = Math.max(4, Math.floor((height - 260 - lines.length * 18) / 20))
      w.vars.slice(0, max).forEach(v =>
        children.push(
          <UiEntity key={`v-${v.name}`} uiTransform={{ flexDirection: 'row', height: 'auto', flexShrink: 0, margin: { bottom: 2 } }}>
            {cell('n', escapeRich('?' + v.name), nameW, hex(TOKEN_HEX.var))}
            {cell('b', escapeRich(v.before), col, C.text)}
            {cell('a', escapeRich(v.after), col, v.changed ? hex(HEX.warn) : C.text)}
          </UiEntity>
        )
      )
      if (w.vars.length > max) children.push(label(`+${w.vars.length - max} more`, 12, C.dim, 'auto', 'vmore'))
    }
    if (w.rows !== undefined) {
      const head = w.rowCount === 0 ? 'its table was empty' : `checked against ${w.rowCount} row${w.rowCount === 1 ? '' : 's'}${w.rows.length < (w.rowCount ?? 0) ? ` (first ${w.rows.length})` : ''}`
      children.push(para(colored(STATUS_HEX.failed, head), 13, 'rh'))
      w.rows.forEach((r, i) => children.push(para(colored(HEX.dim, r), 13, `r${i}`)))
    }
  }
  return (
    <UiEntity uiTransform={{ width, height, flexDirection: 'column', padding: 10, borderRadius: 6, flexShrink: 0, overflow: 'hidden' }} uiBackground={{ color: C.card }}>
      {children}
    </UiEntity>
  )
}

/** The legend line under a tree. */
export function legend(): string {
  const g = (s: keyof typeof STATUS_HEX, text: string) => colored(STATUS_HEX[s], `${GLYPH[s]} ${text}`)
  return [
    g('chosen', 'chosen'),
    g('failed', 'failed'),
    g('abandoned', 'abandoned'),
    colored(STATUS_HEX.retry, `${GLYPH.retry} retry`),
    g('untried', 'not reached'),
    '   ',
    colored(TOKEN_HEX.result, '(fact'),
    colored(TOKEN_HEX.var, '?var'),
    colored(TOKEN_HEX.call, 'call'),
    colored(TOKEN_HEX.const, '@const'),
    colored(TOKEN_HEX.string, '"text"')
  ].join('  ')
}
