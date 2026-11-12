// The decomposition tree as rows to draw: upstream's Normal and Verbose projections of the debugger nodes, as a
// pure function, so the in-scene UI and the 3D board share one reading. Port of urosidoki/htn_planner aec08fa
// HTNDemo/src/UI/HTNGeneratedDebuggerView.h (the ImGui view; only its projection rules, not the drawing):
// - Normal shows started nodes only, Verbose every node (:275-278);
// - a fact that succeeded more than once under one parent becomes numbered choice rows; the events after each
//   success belong to that candidate until the next visit of the fact; only the last candidate is committed, and
//   only if the parent succeeded (:318-381);
// - other repeated visits of one condition keep the latest node and count attempts: "retry xN", or the number of
//   choices a single path below exposes (:383-404, :446-488, :755-761);
// - an axiom call site shows its axiom scope's children directly (:409-444);
// - branches, axioms and choice rows with children are collapsible; by default branches on the execution path,
//   choice rows that were committed and (Verbose) nodes leading to a success are open (:547-551, :651-686);
// - while a committed choice row is expanded, the other candidates of that group are not listed (:776-804).
import type { DebugNode, PlanRun } from './trace'

export type ViewMode = 'normal' | 'verbose'

/** What the user toggled; anything missing takes upstream's default (the execution path expanded). */
export interface ViewState {
  /** Open/closed per collapsible row (node id). */
  open?: ReadonlyMap<number, boolean>
  /** Per parent row (node id): the choice row expanded with its candidates' events, or -1 for none (list them all). */
  choice?: ReadonlyMap<number, number>
}

export interface ViewRow {
  node: number
  depth: number
  /** Choice index among a fact's successful matches (upstream ChoiceIndex), -1 when not a choice row. */
  choice: number
  /** For a choice row: how many candidates its group has (ours, so a view can say "1 of 2"). */
  choices?: number
  /** For a choice row: the row whose candidates it belongs to (key of ViewState.choice). */
  choiceParent?: number
  /** The result to show: a choice row's own (only the committed candidate succeeds), else the node's; null: none yet. */
  ok: boolean | null
  /** Upstream's retry count: Normal shows "retry xN" when > 1. */
  retries: number
  collapsible: boolean
  open: boolean
  /** Has rows below it (shown when open, or always when not collapsible). */
  parent: boolean
}

interface Visible {
  id: number
  attempts: number
  choice: number
  choiceOk: boolean
  projected: number[]
  choices: number
}

/** A projection parent: a bare node holding a candidate's events (upstream's default-constructed Node, :629-631). */
interface Holder {
  kind: string
  impl?: true
  completed: boolean
  succeeded: boolean
  tokens: readonly unknown[]
  children: readonly number[]
}

const sameNode = (a: DebugNode, b: DebugNode) => a.kind === b.kind && a.ref === b.ref && a.impl === b.impl
const isScope = (n: DebugNode) => n.kind === 'axiom' && n.tokens.length === 0
const visit = (id: number): Visible => ({ id, attempts: 1, choice: -1, choiceOk: false, projected: [], choices: 0 })

class Projection {
  constructor(
    readonly nodes: readonly DebugNode[],
    readonly mode: ViewMode
  ) {}

  shown(n: DebugNode): boolean {
    return this.mode === 'verbose' || n.started
  }

  /** Upstream BuildVisibleChildren. */
  children(parent: Holder): Visible[] {
    const started = parent.children.filter(id => this.shown(this.nodes[id]))
    if (this.mode === 'verbose') return this.flatten(parent, started.map(visit))
    const out: Visible[] = []
    for (let i = 0; i < started.length; i++) {
      const child = this.nodes[started[i]]
      if (child.kind === 'fact') {
        const occurrences: number[] = []
        let successes = 0
        for (let j = i; j < started.length; j++) {
          const candidate = this.nodes[started[j]]
          if (!sameNode(child, candidate)) continue
          occurrences.push(j)
          if (candidate.completed && candidate.succeeded) successes++
        }
        if (successes > 1) {
          let index = 0
          occurrences.forEach((position, o) => {
            const attempt = this.nodes[started[position]]
            if (!attempt.completed || !attempt.succeeded) return
            const end = o + 1 < occurrences.length ? occurrences[o + 1] : started.length
            const v = visit(started[position])
            v.choice = index++
            v.choices = successes
            v.choiceOk = index === successes && parent.completed && parent.succeeded
            v.projected = started.slice(position + 1, end)
            out.push(v)
          })
          break // everything from the first visit on belongs to one of the candidates
        }
      }
      const existing = out.find(v => sameNode(this.nodes[v.id], child))
      if (existing) {
        existing.id = started[i]
        existing.attempts++
        continue
      }
      out.push(visit(started[i]))
    }
    return this.flatten(parent, out)
  }

  /** Upstream FlattenAxiomImplementationChildren: an axiom call site lists its scope's children itself. */
  flatten(parent: Holder, children: Visible[]): Visible[] {
    if (parent.kind !== 'axiom' || parent.tokens.length === 0) return children
    const out: Visible[] = []
    for (const v of children) {
      const n = this.nodes[v.id]
      if (isScope(n)) out.push(...this.children(n))
      else out.push(v)
    }
    return out
  }

  /** Upstream FindVisibleChoiceCount: choices one single path below exposes. */
  choiceCount(n: DebugNode): number {
    if (this.mode === 'verbose') return 0
    const kids = this.children(n)
    const direct = kids.filter(k => k.choice >= 0).length
    if (direct > 1) return direct
    if (kids.length === 1 && kids[0].choice < 0) return this.choiceCount(this.nodes[kids[0].id])
    return 0
  }

  retries(n: DebugNode, attempts: number): number {
    if (attempts <= 1 || this.mode === 'verbose') return attempts
    const choices = this.choiceCount(n)
    return choices > 1 ? choices : attempts
  }

  /** Upstream ContainsSuccessfulPath. */
  reachesSuccess(n: DebugNode): boolean {
    if (n.kind === 'branch' && n.completed && !n.succeeded) return false
    if (n.completed && n.succeeded) return true
    return n.children.some(c => this.reachesSuccess(this.nodes[c]))
  }
}

/**
 * The rows of a run in upstream's Normal (default) or Verbose projection, top to bottom. `state` holds what the user
 * toggled; without it the execution path is expanded as upstream does after a fresh run.
 */
export function viewRows(run: PlanRun, mode: ViewMode = 'normal', state: ViewState = {}): ViewRow[] {
  const nodes = run.nodes
  if (nodes.length === 0) return []
  const p = new Projection(nodes, mode)
  const normal = mode === 'normal'
  const rows: ViewRow[] = []
  const render = (v: Visible, depth: number, choiceParent: number) => {
    const n = nodes[v.id]
    if (!p.shown(n)) return
    const holder: Holder = normal && v.projected.length > 0 ? { kind: '', completed: false, succeeded: false, tokens: [], children: v.projected } : n
    const kids = p.children(holder)
    const isChoice = normal && v.choice >= 0
    const collapsible = kids.length > 0 && (n.kind === 'branch' || n.kind === 'axiom' || isChoice)
    let open = true
    if (collapsible) {
      let byDefault: boolean
      if (isChoice) byDefault = v.choiceOk
      else if (normal && n.kind === 'axiom') byDefault = false
      else if (n.kind === 'branch') byDefault = !n.completed || n.succeeded
      else byDefault = p.reachesSuccess(n)
      open = state.open?.get(n.id) ?? byDefault
    }
    const row: ViewRow = {
      node: n.id,
      depth,
      choice: isChoice ? v.choice : -1,
      ok: isChoice ? v.choiceOk : n.completed ? n.succeeded : null,
      retries: p.retries(n, v.attempts),
      collapsible,
      open,
      parent: kids.length > 0
    }
    if (isChoice) {
      row.choices = v.choices
      row.choiceParent = choiceParent
    }
    rows.push(row)
    if (kids.length === 0 || (collapsible && !open)) return
    const grouped = normal && kids.filter(k => k.choice >= 0).length > 1
    let expanded = -1
    if (grouped) {
      const chosen = state.choice?.get(n.id)
      expanded = chosen ?? kids.find(k => k.choice >= 0 && k.choiceOk)?.id ?? -1
    }
    for (const k of kids) {
      if (grouped && expanded >= 0 && k.choice >= 0 && k.id !== expanded) continue
      render(k, depth + 1, grouped ? n.id : -1)
    }
  }
  for (const n of nodes) if (n.parent < 0) render(visit(n.id), 0, -1)
  return rows
}
