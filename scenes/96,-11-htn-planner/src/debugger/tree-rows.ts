// The decomposition tree as drawable rows: the rows themselves come from the library's viewRows (upstream's Normal /
// Verbose projection); this adds the tree guides, the window of rows a view draws, one rich-text line per row
// (status glyph, coloured title with the bound values, retry ×N, the rows a failed fact was checked against) and
// the watch of one node (upstream HTNGeneratedDebuggerView RenderWatch :72-143: name, result, source, constants,
// variables Before / After). Pure, no SDK.
import { literalText } from '../htn-planner/htn/titles'
import type { Atom, Binding, DebugNode, DomainGraph, PlanRun, TitleToken, ViewRow } from '../htn-planner'
import { clip, colored, GLYPH, HEX, Status, STATUS_HEX, TOKEN_HEX } from './theme'

/** What to draw in one indent column of a row. */
export type Guide =
  | 'none' // blank
  | 'line' // an ancestor continues below: a vertical line
  | 'tee' // this row's connector, more siblings below: ├
  | 'elbow' // this row's connector, the last sibling: └

/** One entry per indent column (length = depth) per row, from the rows' depths in pre-order. */
export function treeGuides(rows: readonly { depth: number }[]): Guide[][] {
  const out: Guide[][] = new Array(rows.length)
  // more[d]: scanning bottom-up, a later sibling at depth d comes before the parent level closes.
  const more: boolean[] = []
  for (let i = rows.length - 1; i >= 0; i--) {
    const d = rows[i].depth
    const guides: Guide[] = []
    for (let c = 1; c < d; c++) guides.push(more[c] ? 'line' : 'none')
    if (d > 0) guides.push(more[d] ? 'tee' : 'elbow')
    out[i] = guides
    more.length = d + 1 // deeper levels belonged to this row's subtree
    more[d] = true
  }
  return out
}

/** The slice [start, end) of `total` rows a window of `size` rows shows at `offset`, clamped. */
export function rowWindow(total: number, offset: number, size: number): { start: number; end: number } {
  const start = Math.max(0, Math.min(Math.floor(offset), Math.max(0, total - size)))
  return { start, end: Math.min(total, start + size) }
}

/** The largest useful offset. */
export const maxOffset = (total: number, size: number) => Math.max(0, total - size)

/** An offset that shows row `index`, moving the window as little as possible. */
export function revealOffset(offset: number, index: number, size: number): number {
  if (index < offset) return index
  if (index >= offset + size) return index - size + 1
  return offset
}

/**
 * The same node in another run of the same domain: the same id, kind and IR element. A live NPC replans often and its
 * runs usually decompose alike, so a view keeps its folds and selection across them where the node is the same.
 */
export function sameNode(a: PlanRun, b: PlanRun, id: number): boolean {
  const x = a.nodes[id]
  const y = b.nodes[id]
  return x !== undefined && y !== undefined && x.kind === y.kind && x.ref === y.ref && x.impl === y.impl && x.parent === y.parent
}

/** A branch whose condition held but whose tasks failed (the boards' "abandoned"). */
const abandoned = (run: PlanRun, n: DebugNode) => n.kind === 'branch' && n.children.some(c => run.nodes[c].kind === 'task')

/** A row's status: its result, a choice row's own (only the committed candidate succeeds). */
export function rowStatus(run: PlanRun, row: Pick<ViewRow, 'node' | 'ok'>): Status {
  const n = run.nodes[row.node]
  if (!n.started) return 'untried'
  if (row.ok === null) return 'running'
  if (row.ok) return 'chosen'
  return abandoned(run, n) ? 'abandoned' : 'failed'
}

/** A value as the domain writes it (floats in their shortest form, not rounded to one decimal). */
export const atomText = (a: Atom): string => literalText(a)

/** The value a node shows for a variable: what it bound (After) once it succeeded, else what it started with. */
function valueOf(n: DebugNode, name: string): Atom | undefined {
  const pick = (bs: readonly Binding[]) => bs.find(b => b.name === name)?.value
  return (n.completed && n.succeeded ? pick(n.after) : undefined) ?? pick(n.before) ?? pick(n.after)
}

/** How text is painted: rich text for the scene's UI, or plain and unclipped for a terminal (npm run htn:run). */
export interface Paint {
  color(hex: string, text: string): string
  clip(s: string, n: number): string
}

export const RICH: Paint = { color: colored, clip }
export const PLAIN: Paint = { color: (_hex, text) => text, clip: s => s }

/** Title tokens as rich text; `?x` reads `?x=value` with `values` when the node knows it. */
export function tokensRich(tokens: readonly TitleToken[], n: DebugNode | null, values: boolean, dim: boolean, paint: Paint = RICH): string {
  let out = ''
  for (const t of tokens) {
    if (out !== '' && t.space) out += ' '
    out += paint.color(dim ? STATUS_HEX.untried : TOKEN_HEX[t.kind], t.text)
    if (values && n && t.kind === 'var') {
      const v = valueOf(n, t.text.slice(1))
      if (v !== undefined) out += paint.color(dim ? STATUS_HEX.untried : HEX.value, '=' + paint.clip(atomText(v), 40))
    }
  }
  return out
}

/** The title of a node: its tokens, or for a plan / method / branch / axiom scope its name and arguments. */
export function titleRich(run: PlanRun, graph: DomainGraph, id: number, values: boolean, paint: Paint = RICH): string {
  const n = run.nodes[id]
  const dim = !n.started
  const tint = (hex: string) => (dim ? STATUS_HEX.untried : hex)
  switch (n.kind) {
    case 'plan':
      return paint.color(tint(HEX.dim), 'plan ') + paint.color(tint(HEX.method), `(${graph.methods[n.ref]?.name ?? '?'}${run.args.map(a => ' ' + atomText(a)).join('')})`)
    case 'method': {
      const m = graph.methods[n.ref]
      const params = (m?.params ?? []).map(p => {
        const v = values ? valueOf(n, p.slice(1)) : undefined
        return ' ' + paint.color(tint(TOKEN_HEX.var), p) + (v !== undefined ? paint.color(tint(HEX.value), '=' + paint.clip(atomText(v), 40)) : '')
      })
      return paint.color(tint(HEX.method), `(${m?.name ?? '?'}`) + params.join('') + paint.color(tint(HEX.method), ')')
    }
    case 'branch':
      return paint.color(tint(HEX.branch), graph.branches[n.ref]?.name ?? n.name) + paint.color(tint(HEX.faint), '  branch')
    case 'axiom':
      if (n.impl) return paint.color(tint(HEX.dim), `axiom ${graph.axioms[n.ref]?.name ?? n.name}`)
      return tokensRich(n.tokens, n, values, dim, paint)
    default:
      return tokensRich(n.tokens, n, values, dim, paint)
  }
}

/** A fact node's name: the head token (its title is `(name args...)`). */
function factName(n: DebugNode): string {
  const head = n.tokens.find(t => t.kind === 'result')
  return head ? head.text : n.name.replace(/^\(/, '').split(' ')[0]
}

const rowText = (name: string, row: readonly Atom[]) => `(${[name, ...row.map(atomText)].join(' ')})`

/** A failed fact's rows inline: `no rows`, or `checked 3: (at a b) (at c d) …`. */
export function checkedRich(n: DebugNode, inline = 2, paint: Paint = RICH): string {
  if (n.kind !== 'fact' || !n.completed || n.succeeded || n.rowCount === undefined) return ''
  if (n.rowCount === 0) return paint.color(STATUS_HEX.failed, 'no rows')
  const name = factName(n)
  const shown = (n.rows ?? []).slice(0, inline).map(r => rowText(name, r))
  const more = n.rowCount > shown.length ? ' …' : ''
  return paint.color(STATUS_HEX.failed, `checked ${n.rowCount}: `) + paint.color(HEX.dim, paint.clip(shown.join(' '), 90) + more)
}

export interface RowTextOptions {
  /** `?x=value` in titles. */
  values: boolean
  /** Default RICH. */
  paint?: Paint
  /** A failed fact's rows shown inline (default 2; the recorder keeps RecorderOptions.rows). */
  inlineRows?: number
}

/** One line of the tree: glyph, choice index, title, retry ×N, the failed fact's rows. */
export function rowRich(run: PlanRun, graph: DomainGraph, row: ViewRow, opts: RowTextOptions): string {
  const n = run.nodes[row.node]
  const paint = opts.paint ?? RICH
  const status = rowStatus(run, row)
  let s = paint.color(STATUS_HEX[status], GLYPH[status]) + '  '
  if (row.choice >= 0) s += paint.color(HEX.dim, `${row.choice + 1}/${row.choices ?? '?'} `)
  s += titleRich(run, graph, row.node, opts.values, paint)
  if (row.retries > 1) s += '  ' + paint.color(STATUS_HEX.retry, `${GLYPH.retry} ×${row.retries}`)
  const checked = checkedRich(n, opts.inlineRows, paint)
  if (checked) s += '   ' + checked
  return s
}

// ---- watch -----------------------------------------------------------------------------------------

export interface WatchVar {
  name: string
  before: string
  after: string
  changed: boolean
}

export interface Watch {
  title: string
  kind: string
  result: 'Success' | 'Failure' | 'Running' | 'Not reached'
  status: Status
  source: string
  constants: { name: string; value: string }[]
  vars: WatchVar[]
  /** A failed fact: the rows it was checked against, and how many its table had. */
  rows?: string[]
  rowCount?: number
}

export const UNBOUND = '‹unbound›'

/**
 * The watch of one node (upstream RenderWatch): result, source, constants, variables Before / After by name.
 * `ok`: a choice row's own result (ViewRow.ok).
 */
export function watchOf(run: PlanRun, graph: DomainGraph, id: number, ok?: boolean | null): Watch {
  const n = run.nodes[id]
  const own = ok === undefined ? (n.completed ? n.succeeded : null) : ok
  const status = rowStatus(run, { node: id, ok: own })
  const result = !n.started ? 'Not reached' : own === null ? 'Running' : own ? 'Success' : 'Failure'
  const names: string[] = []
  for (const b of [...n.before, ...n.after]) if (!names.includes(b.name)) names.push(b.name)
  names.sort()
  const fmt = (bs: readonly Binding[], name: string) => {
    const v = bs.find(b => b.name === name)?.value
    return v === undefined ? UNBOUND : atomText(v)
  }
  const vars = names.map(name => {
    const before = fmt(n.before, name)
    const after = fmt(n.after, name)
    return { name, before, after, changed: before !== after }
  })
  const w: Watch = {
    title: titleRich(run, graph, id, false),
    kind: n.impl ? 'axiom scope' : n.kind,
    result,
    status,
    source: n.source ? `${n.source.file}:${n.source.line}` : '',
    constants: n.tokens.filter(t => t.kind === 'const').map(t => ({ name: t.text, value: t.value ?? '' })),
    vars
  }
  if (n.kind === 'fact' && n.rowCount !== undefined) {
    const name = factName(n)
    w.rows = (n.rows ?? []).map(r => rowText(name, r))
    w.rowCount = n.rowCount
  }
  return w
}
