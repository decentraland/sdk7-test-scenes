// Debugger UI state. Every user change goes through `set` (or a helper here), which bumps the UI version; the panel
// rebuilds its element tree only when the UI version or the data version (a new run, a new event of the selected
// host, throttled) moved, so a still panel costs React-ECS a bailout instead of a full diff.
import type { PlanRun, ViewMode } from '../../htn-planner'
import type { OverlayLevel } from '../overlay'
import type { RunnerResult } from '../runner'

export type Tab = 'plan' | 'world' | 'domain' | 'history' | 'map' | 'runner'

/** A decomposition tree view: which run, what is folded, what is selected, where it is scrolled. */
export interface TreeUi {
  /** A run seq to stay on; null follows the newest (Plan tab only). */
  pinned: number | null
  /** The run (host and seq) the fold state belongs to: a new run starts with upstream's default expansion. */
  runKey: string
  /** That run, to carry folds and the selection over to the next run of the same host. */
  run: PlanRun | null
  open: Map<number, boolean>
  choice: Map<number, number>
  selected: number | null
  offset: number
}

export const newTree = (): TreeUi => ({ pinned: null, runKey: '', run: null, open: new Map(), choice: new Map(), selected: null, offset: 0 })

export interface RunnerUi {
  domain: number
  method: number
  world: number
  mode: number
  domainOffset: number
  worldOffset: number
  result: RunnerResult | null
  /** What the result was run with, for its title. */
  ran: string
  /** Runs so far: each run is a new tree run (folds carry over within a domain). */
  count: number
  tree: TreeUi
}

export interface DebuggerState {
  open: boolean
  tab: Tab
  /** The selected host's id. */
  host: string | null
  /** Locked: the selection stays; unlocked: it follows the host nearest to the player. */
  locked: boolean
  mode: ViewMode
  /** `?x=value` in the tree. */
  values: boolean
  plan: TreeUi
  worldChangedOnly: boolean
  worldOffset: number
  /** Domain tab: around one method (null: the run's root, else the first top-level) or the whole domain. */
  domainFull: boolean
  focus: number | null
  /** The domain the focus belongs to (another host's domain resets it). */
  focusDomain: string
  zoom: number
  historyOffset: number
  hideHeard: boolean
  runner: RunnerUi
  /** The in-world overlay above every NPC (overlay.ts): off, step, full. */
  overlay: OverlayLevel
  /** Hosts set apart from `overlay` (hover one and press 1); cleared when `overlay` changes. */
  overlayHosts: Map<string, OverlayLevel>
}

export const state: DebuggerState = {
  open: false,
  tab: 'plan',
  host: null,
  locked: false,
  mode: 'normal',
  values: true,
  plan: newTree(),
  worldChangedOnly: false,
  worldOffset: 0,
  domainFull: false,
  focus: null,
  focusDomain: '',
  zoom: 1,
  historyOffset: 0,
  hideHeard: true,
  runner: { domain: 0, method: 0, world: 0, mode: 0, domainOffset: 0, worldOffset: 0, result: null, ran: '', count: 0, tree: newTree() },
  overlay: 'off',
  overlayHosts: new Map()
}

let version = 0
export const uiVersion = () => version

/** Apply a change and ask for a rebuild. */
export function set(patch: Partial<DebuggerState>) {
  Object.assign(state, patch)
  version++
}

/**
 * The user is reading the shown host (selected a row, folded one, stepped through runs): stop following the nearest
 * host, or the selection would jump to another NPC under the cursor.
 */
export function hold() {
  if (state.host !== null) state.locked = true
}

/** Ask for a rebuild after changing nested state in place. */
export function touch() {
  version++
}

/** Select a host: its newest run, scrolled to the top. */
export function selectHost(id: string | null, locked = state.locked) {
  if (id === state.host && locked === state.locked) return
  const other = id !== state.host
  set({ host: id, locked })
  if (other) {
    state.plan = newTree()
    state.worldOffset = 0
    state.historyOffset = 0
  }
}

/** Fold or unfold a row of a tree. */
export function toggleOpen(tree: TreeUi, node: number, open: boolean) {
  tree.open = new Map(tree.open)
  tree.open.set(node, !open)
  touch()
}

/** A choice row: expand this candidate (its group's other candidates hide), or list them all again. */
export function toggleChoice(tree: TreeUi, parent: number, node: number, expanded: boolean) {
  tree.choice = new Map(tree.choice)
  tree.choice.set(parent, expanded ? -1 : node)
  touch()
}

/** Everyone's overlay level; hosts set apart go back to it. */
export function setOverlay(level: OverlayLevel) {
  set({ overlay: level, overlayHosts: new Map() })
}
