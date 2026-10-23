// The world view of the session viewer: the facts a run planned against, table by table, marked against the agent's
// world before it (+ added, − removed, ~ changed: a row replaced by one that differs only in its later values, as
// `set` does), and which facts the planner read: the rows the run's chosen path rests on (●) and the tables it
// queried at all (○). Fresco / Mr.Jones colour preconditions the same way; Dovetail lays facts out as rows. Pure.
import type { Atom } from '../../../src/htn-planner/htn/atom'
import type { DomainGraph } from '../../../src/htn-planner/htn/domain-graph'
import type { DebugSession } from '../../../src/htn-planner/debug/session'
import type { DebugNode, PlanRun } from '../../../src/htn-planner/htn/trace'
import { worldDiff } from '../../../src/htn-planner/htn/world-state'
import type { FactRow, WorldSnapshot } from '../../../src/htn-planner/htn/world-state'
import { branchAttempts } from '../../../src/htn-planner/htn/trace'
import { valueText } from './format'

export type RowMark = '' | '+' | '-' | '~'
export type ReadMark = '' | 'plan' | 'queried'

export interface WorldRow {
  args: string[]
  mark: RowMark
  /** `~`: the row it replaced. */
  was?: string[]
  /** plan: the run's chosen path matched this row. */
  read: ReadMark
}

export interface WorldTable {
  /** `name/arity`. */
  key: string
  name: string
  rows: WorldRow[]
  /** Any row added, removed or changed. */
  changed: boolean
  /** plan: the chosen path read it (a row, or a `not` that it stays empty); queried: the planner looked. */
  read: ReadMark
}

export interface WorldView {
  revision: number
  /** The agent's world before it, or null (its first). */
  previous: number | null
  tables: WorldTable[]
}

const numberish = (s: string) => /^-?\d+(\.\d+)?$/.test(s)
/** Two cells read alike: the same text, or the same number (`2` and `2.0`). */
const same = (a: string, b: string) => a === b || (numberish(a) && numberish(b) && Math.abs(Number(a) - Number(b)) < 1e-6)

/** The cells of a fact node's title (`(name a ?b)`), with what it bound substituted: null for a still unbound one. */
function factCells(n: DebugNode): (string | null)[] {
  const out: (string | null)[] = []
  const toks = n.tokens.length ? n.tokens : []
  const values = new Map<string, Atom>()
  for (const b of n.succeeded ? n.after : n.before) values.set(b.name, b.value)
  let depth = 0
  for (const t of toks) {
    if (t.text === '(') {
      depth++
      continue
    }
    if (t.text === ')') {
      depth--
      continue
    }
    if (depth !== 1 || t.kind === 'result') continue
    if (t.kind === 'var') {
      const v = values.get(t.text.slice(1))
      out.push(v === undefined ? null : valueText(v))
    } else if (t.kind === 'const') out.push(t.value ?? null)
    else out.push(t.text.replace(/^"|"$/g, ''))
  }
  return out
}

/** The fact nodes (and `not` facts) the run's chosen path rests on: per chosen branch, its condition's last success. */
function chosenFacts(run: PlanRun, graph: DomainGraph): DebugNode[] {
  const out: DebugNode[] = []
  const nodes = run.nodes
  const committed = (ids: readonly number[]) => {
    const last = new Map<string, DebugNode>()
    for (const id of ids) {
      const n = nodes[id]
      if (n && n.started && n.completed && n.succeeded) last.set(`${n.kind}|${n.ref}|${n.impl ? 1 : 0}`, n)
    }
    return [...last.values()]
  }
  const cond = (n: DebugNode) => {
    if (n.kind === 'fact') out.push(n)
    else if (n.kind === 'not') {
      for (const c of n.children) if (nodes[c]?.kind === 'fact') out.push(nodes[c])
    } else if (n.kind === 'and' || n.kind === 'or' || n.kind === 'alt' || n.kind === 'axiom') committed(n.children).forEach(cond)
  }
  const method = (m: DebugNode) => {
    let chosen: DebugNode | undefined
    for (const a of branchAttempts(run, m, graph)) if (a.outcome === 'chosen') chosen = a.node
    if (!chosen) return
    const kids = chosen.children.map(id => nodes[id]).filter((k): k is DebugNode => !!k)
    let at = -1
    kids.forEach((k, i) => {
      if (k.kind !== 'task' && k.succeeded) at = i
    })
    if (at >= 0) cond(kids[at])
    for (const t of kids.slice(at + 1)) if (t.kind === 'task' && t.succeeded) committed(t.children).forEach(c => c.kind === 'method' && method(c))
  }
  const plan = nodes[0]
  if (plan?.succeeded) committed(plan.children).forEach(c => c.kind === 'method' && method(c))
  return out
}

const rowCells = (row: FactRow) => row.map(valueText)

/** Pair rows removed and added in one table that share their leading cells: a change (~), not a remove and an add. */
function pairChanges(removed: string[][], added: string[][]): { was: string[]; now: string[] }[] {
  const pairs: { was: string[]; now: string[] }[] = []
  const free = removed.slice()
  for (const now of added) {
    let best = -1
    let bestLen = 0
    free.forEach((was, i) => {
      if (was.length !== now.length) return
      let k = 0
      while (k < now.length - 1 && was[k] === now[k]) k++
      // A single-cell row, or rows that agree on all but their later cells.
      const len = now.length === 1 ? 1 : k
      if (len > bestLen) {
        best = i
        bestLen = len
      }
    })
    if (best >= 0) pairs.push({ was: free.splice(best, 1)[0], now })
  }
  return pairs
}

/** The world `revision` of `agent`, marked against the one before and with what `run` read (when given). */
export function worldView(session: DebugSession, agent: string, revision: number, run: PlanRun | null, graph: DomainGraph): WorldView | null {
  const mine = session.worlds.filter(w => w.agent === agent).sort((a, b) => a.revision - b.revision)
  const at = mine.find(w => w.revision === revision)
  if (!at) return null
  let prev: WorldSnapshot | null = null
  for (const w of mine) if (w.revision < revision) prev = w
  const diff = prev ? worldDiff(prev, at) : null
  const queried = new Set<string>()
  const planRead = new Map<string, (string | null)[][]>()
  const planTables = new Set<string>()
  if (run) {
    for (const n of run.nodes) if (n.kind === 'fact' && n.started) queried.add(graph.conds[n.ref]?.fact ?? '')
    try {
      for (const n of chosenFacts(run, graph)) {
        const key = graph.conds[n.ref]?.fact
        if (!key) continue
        planTables.add(key)
        if (n.succeeded) {
          const list = planRead.get(key) ?? []
          list.push(factCells(n))
          planRead.set(key, list)
        }
      }
    } catch {
      // a malformed run: no plan marks
    }
  }
  const keys = new Set([...Object.keys(at.tables), ...(diff ? Object.keys(diff.removed) : []), ...planTables, ...queried])
  keys.delete('')
  const tables: WorldTable[] = []
  for (const key of [...keys].sort()) {
    const slash = key.lastIndexOf('/')
    const name = slash > 0 ? key.slice(0, slash) : key
    const now = (at.tables[key] ?? []).map(rowCells)
    const added = (diff?.added[key] ?? []).map(rowCells)
    const removed = (diff?.removed[key] ?? []).map(rowCells)
    const changes = pairChanges(removed, added)
    const changedNow = new Map(changes.map(c => [c.now, c.was]))
    const reads = planRead.get(key) ?? []
    const isRead = (cells: string[]) => reads.some(r => r.length === cells.length && r.every((c, i) => c === null || same(c, cells[i])))
    const rows: WorldRow[] = []
    const addedLeft = added.filter(a => !changedNow.has(a))
    for (const cells of now) {
      const i = addedLeft.findIndex(a => a.length === cells.length && a.every((c, k) => c === cells[k]))
      const changedFrom = [...changedNow.entries()].find(([n]) => n.length === cells.length && n.every((c, k) => c === cells[k]))
      const row: WorldRow = { args: cells, mark: '', read: isRead(cells) ? 'plan' : '' }
      if (changedFrom) {
        row.mark = '~'
        row.was = changedFrom[1]
        changedNow.delete(changedFrom[0])
      } else if (i >= 0) {
        row.mark = '+'
        addedLeft.splice(i, 1)
      }
      rows.push(row)
    }
    const paired = new Set(changes.map(c => c.was))
    for (const cells of removed) if (!paired.has(cells)) rows.push({ args: cells, mark: '-', read: '' })
    const read: ReadMark = planTables.has(key) ? 'plan' : queried.has(key) ? 'queried' : ''
    tables.push({ key, name, rows, changed: rows.some(r => r.mark !== ''), read })
  }
  return { revision, previous: prev ? prev.revision : null, tables }
}
