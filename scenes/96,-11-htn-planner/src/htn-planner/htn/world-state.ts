// Fact database the planner queries. The host owns it and mutates it between
// decompositions; never remove rows while a decomposition is running (upstream rule).
import type { Atom } from './atom'

export type FactRow = readonly Atom[]

export class WorldState {
  private readonly tables = new Map<string, FactRow[]>()
  // `name/arity` keys by name, then arity: rows() builds no string (the planner calls it per fact condition).
  private readonly keys = new Map<string, string[]>()
  private created = 0
  private rev = 0

  /** Rows of `name` with exactly `arity` arguments, in insertion order. Do not mutate. */
  rows(name: string, arity: number): readonly FactRow[] {
    return this.tables.get(this.key(name, arity)) ?? EMPTY
  }

  private key(name: string, arity: number): string {
    let byArity = this.keys.get(name)
    if (byArity === undefined) this.keys.set(name, (byArity = []))
    let k = arity < byArity.length ? byArity[arity] : undefined
    if (k === undefined) {
      k = key(name, arity)
      while (byArity.length < arity) byArity.push(undefined as unknown as string)
      byArity[arity] = k
    }
    return k
  }

  add(name: string, ...args: Atom[]): void {
    const k = this.key(name, args.length)
    const table = this.tables.get(k)
    if (table) table.push(args)
    else this.newTable(k, [args])
    this.rev++
  }

  /** Replace every `name/args.length` row with this single row. */
  set(name: string, ...args: Atom[]): void {
    const k = this.key(name, args.length)
    if (this.tables.has(k)) this.tables.set(k, [args])
    else this.newTable(k, [args])
    this.rev++
  }

  /** Remove every row of `name/arity`. */
  clear(name: string, arity: number): void {
    if (this.tables.delete(this.key(name, arity))) this.rev++
  }

  /** Remove rows of `name/arity` for which `predicate` holds. Returns how many were removed. */
  removeWhere(name: string, arity: number, predicate: (row: FactRow) => boolean): number {
    const table = this.tables.get(this.key(name, arity))
    if (!table) return 0
    const kept = table.filter(row => !predicate(row))
    this.tables.set(this.key(name, arity), kept)
    if (kept.length !== table.length) this.rev++
    return table.length - kept.length
  }

  clearAll(): void {
    if (this.tables.size > 0) this.rev++
    this.tables.clear()
  }

  /** Every `name/arity` table with at least one row. Debugging aid. */
  tableKeys(): string[] {
    return [...this.tables].filter(([, rows]) => rows.length > 0).map(([k]) => k)
  }

  /** Grows on every change of the facts: a debugger snapshots the world once per revision (snapshotWorld). */
  get revision(): number {
    return this.rev
  }

  /** Grows by one whenever a `name/arity` table is created: dev checks rescan tableKeys() only then. */
  get tablesCreated(): number {
    return this.created
  }

  private newTable(k: string, rows: FactRow[]): void {
    this.tables.set(k, rows)
    this.created++
  }
}

/** The facts at one revision: every non-empty `name/arity` table, rows in insertion order (shared, never mutated). */
export interface WorldSnapshot {
  revision: number
  tables: Record<string, readonly FactRow[]>
}

/** Copy of the world's tables for a debugger. Rows are shared: the world replaces rows, it never mutates one. */
export function snapshotWorld(world: WorldState): WorldSnapshot {
  const tables: Record<string, readonly FactRow[]> = {}
  for (const k of world.tableKeys()) {
    const slash = k.lastIndexOf('/')
    tables[k] = world.rows(k.slice(0, slash), Number(k.slice(slash + 1))).slice()
  }
  return { revision: world.revision, tables }
}

/** Rows added and removed between two snapshots, per `name/arity` (a changed row is one removed plus one added). */
export interface WorldDiff {
  from: number
  to: number
  added: Record<string, FactRow[]>
  removed: Record<string, FactRow[]>
}

export function worldDiff(a: WorldSnapshot, b: WorldSnapshot): WorldDiff {
  const diff: WorldDiff = { from: a.revision, to: b.revision, added: {}, removed: {} }
  const keys = new Set([...Object.keys(a.tables), ...Object.keys(b.tables)])
  for (const k of keys) {
    const before = a.tables[k] ?? EMPTY
    const after = b.tables[k] ?? EMPTY
    if (before === after) continue
    const count = new Map<string, number>()
    for (const row of before) count.set(rowKey(row), (count.get(rowKey(row)) ?? 0) + 1)
    const added: FactRow[] = []
    for (const row of after) {
      const rk = rowKey(row)
      const n = count.get(rk) ?? 0
      if (n > 0) count.set(rk, n - 1)
      else added.push(row)
    }
    const removed: FactRow[] = []
    for (const row of before) {
      const rk = rowKey(row)
      const n = count.get(rk) ?? 0
      if (n > 0) {
        removed.push(row)
        count.set(rk, n - 1)
      }
    }
    if (added.length > 0) diff.added[k] = added
    if (removed.length > 0) diff.removed[k] = removed
  }
  return diff
}

const rowKey = (row: FactRow) => JSON.stringify(row)

/** Facts as data: [name, row] pairs, e.g. a compiled .worldstate module (npm run htn:compile on a .worldstate). */
export type WorldFacts = readonly (readonly [string, FactRow])[]

/** Add every row of `facts` to `world` (rows keep their order within each fact). */
export function addFacts(world: WorldState, facts: WorldFacts): void {
  for (const [name, row] of facts) world.add(name, ...row)
}

const EMPTY: readonly FactRow[] = []
const key = (name: string, arity: number) => `${name}/${arity}`
