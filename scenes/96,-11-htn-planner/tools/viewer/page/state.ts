// The page's one state: the session, the selected agent and the time cursor (they drive every view), the run shown,
// the replan marker opened, the figure's mode, tab, folds, focus and selection. set() re-renders.
import type { ViewMode } from '../../../src/htn-planner/htn/trace-view'
import type { SessionIndex } from '../model/session-index'
import type { ReplanMarker, TimelineModel } from '../model/timeline'

export interface State {
  index: SessionIndex | null
  timeline: TimelineModel | null
  /** Where the session came from (file name). */
  source: string
  agent: string
  cursor: number
  /** A run picked by hand (prev / next, a ◆); null: the run at the cursor. */
  runSeq: number | null
  marker: ReplanMarker | null
  mode: ViewMode
  tab: 'tree' | 'map'
  /** Domain map: the method in focus (null: the run's root task), or the whole domain. */
  mapFocus: number | null
  mapWhole: boolean
  /** Tree folds by figure key, for the run shown (cleared when the run changes). */
  folds: Map<string, boolean>
  foldsRun: string
  /** The run node selected for the detail panel. */
  selected: number | null
  zoom: number
  playing: boolean
  worldFilter: 'all' | 'changed' | 'read'
  error: string | null
}

export function initialState(): State {
  return {
    index: null,
    timeline: null,
    source: '',
    agent: '',
    cursor: 0,
    runSeq: null,
    marker: null,
    mode: 'normal',
    tab: 'tree',
    mapFocus: null,
    mapWhole: false,
    folds: new Map(),
    foldsRun: '',
    selected: null,
    zoom: 1,
    playing: false,
    worldFilter: 'all',
    error: null
  }
}

type Listener = (s: State) => void

export class Store {
  state: State = initialState()
  private listeners: Listener[] = []

  on(l: Listener): void {
    this.listeners.push(l)
  }

  set(patch: Partial<State>): void {
    this.state = { ...this.state, ...patch }
    for (const l of this.listeners) l(this.state)
  }
}
