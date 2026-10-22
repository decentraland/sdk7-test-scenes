// The World tab's rows: the facts of the world a run planned against, grouped by fact (`name/arity`), each row
// marked against the world of the run before it: + added, − removed, ~ changed (a row replaced by one with the same
// leading values and another last value), = the same. Upstream HTNWorldStateView lists the live world flat; the
// diff and the grouping are ours. Pure, no SDK.
import type { FactRow, WorldSnapshot } from '../htn-planner'
import { atomText } from './tree-rows'

export type Mark = '+' | '-' | '~' | '='

export interface FactLine {
  kind: 'fact'
  key: string
  mark: Mark
  /** The row's values, space separated. */
  values: string
  /** A `~` row: the values it had. */
  was?: string
}

export interface GroupLine {
  kind: 'group'
  key: string
  name: string
  arity: number
  rows: number
  added: number
  removed: number
  changed: number
}

export type WorldLine = GroupLine | FactLine

export interface WorldCounts {
  facts: number
  rows: number
  added: number
  removed: number
  changed: number
}

export interface WorldView {
  lines: WorldLine[]
  counts: WorldCounts
}

export interface WorldViewOptions {
  /** Only the groups and rows with a change. */
  changedOnly?: boolean
  /** Only facts whose name contains this text. */
  filter?: string
}

const text = (row: FactRow) => row.map(atomText).join('  ')
/** Rows with the same leading values replace each other (`~`); a one-value fact has one row per world. */
const lead = (row: FactRow) => (row.length <= 1 ? '' : JSON.stringify(row.slice(0, -1)))

/** The facts of `world` against `before` (none: no marks), grouped by fact name. */
export function worldView(world: WorldSnapshot | undefined, before: WorldSnapshot | undefined, opts: WorldViewOptions = {}): WorldView {
  const counts: WorldCounts = { facts: 0, rows: 0, added: 0, removed: 0, changed: 0 }
  const lines: WorldLine[] = []
  if (!world) return { lines, counts }
  const keys = new Set(Object.keys(world.tables))
  if (before) for (const k of Object.keys(before.tables)) keys.add(k)
  const sorted = [...keys].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  const filter = opts.filter?.toLowerCase() ?? ''
  for (const key of sorted) {
    const slash = key.lastIndexOf('/')
    const name = key.slice(0, slash)
    if (filter && !name.toLowerCase().includes(filter)) continue
    const now = world.tables[key] ?? []
    const was = before ? before.tables[key] ?? [] : now
    const facts = diffRows(key, was, now, before !== undefined)
    const group: GroupLine = { kind: 'group', key, name, arity: Number(key.slice(slash + 1)), rows: now.length, added: 0, removed: 0, changed: 0 }
    for (const f of facts) {
      if (f.mark === '+') group.added++
      else if (f.mark === '-') group.removed++
      else if (f.mark === '~') group.changed++
    }
    counts.facts += now.length > 0 ? 1 : 0
    counts.rows += now.length
    counts.added += group.added
    counts.removed += group.removed
    counts.changed += group.changed
    const changed = group.added + group.removed + group.changed > 0
    if (opts.changedOnly && !changed) continue
    lines.push(group)
    for (const f of facts) if (!opts.changedOnly || f.mark !== '=') lines.push(f)
  }
  return { lines, counts }
}

function diffRows(key: string, before: readonly FactRow[], after: readonly FactRow[], marks: boolean): FactLine[] {
  if (!marks || before === after) return after.map(r => ({ kind: 'fact', key, mark: '=', values: text(r) }))
  // Same rows first (multiset), then pair what is left by leading values.
  const left = new Map<string, FactRow[]>()
  for (const r of before) {
    const k = JSON.stringify(r)
    const list = left.get(k)
    if (list) list.push(r)
    else left.set(k, [r])
  }
  const fresh: FactRow[] = []
  const out: (FactLine | null)[] = after.map(r => {
    const list = left.get(JSON.stringify(r))
    if (list && list.length > 0) {
      list.pop()
      return { kind: 'fact', key, mark: '=', values: text(r) }
    }
    fresh.push(r)
    return null
  })
  const gone: FactRow[] = []
  for (const list of left.values()) gone.push(...list)
  const byLead = new Map<string, FactRow[]>()
  for (const r of gone) {
    const k = lead(r)
    const list = byLead.get(k)
    if (list) list.push(r)
    else byLead.set(k, [r])
  }
  let f = 0
  for (let i = 0; i < out.length; i++) {
    if (out[i] !== null) continue
    const r = fresh[f++]
    const match = byLead.get(lead(r))
    const old = match && match.length > 0 ? match.shift() : undefined
    out[i] = old ? { kind: 'fact', key, mark: '~', values: text(r), was: text(old) } : { kind: 'fact', key, mark: '+', values: text(r) }
  }
  const lines = out as FactLine[]
  for (const list of byLead.values()) for (const r of list) lines.push({ kind: 'fact', key, mark: '-', values: text(r) })
  return lines
}
