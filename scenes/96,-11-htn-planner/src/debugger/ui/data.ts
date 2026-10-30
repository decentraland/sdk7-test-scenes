// What the tabs read about the selected host: its runs, the one shown (newest, or pinned with Prev / Next), the
// domain graph of that run's recorder, and the world before it.
import { domainGraph } from '../../htn-planner'
import type { DomainGraph, PlanRun, WorldSnapshot } from '../../htn-planner'
import type { DebugHost } from '../registry'
import { hostRuns, pickRun, RunPick } from '../runs'

export interface HostView {
  host: DebugHost
  runs: PlanRun[]
  pick: RunPick
  graph: DomainGraph
}

export function hostView(host: DebugHost, pinned: number | null): HostView {
  const runs = hostRuns(host.recorder)
  return { host, runs, pick: pickRun(runs, pinned), graph: host.recorder?.graph ?? domainGraph(host.domain) }
}

/** The world a run planned against, and the world of the nearest earlier run that planned against another one. */
export function runWorlds(v: HostView): { now?: WorldSnapshot; before?: WorldSnapshot; beforeRun?: PlanRun } {
  const run = v.pick.run
  const rec = v.host.recorder
  if (!run || !rec) return {}
  const now = rec.world(run.world)
  for (let i = v.pick.index - 1; i >= 0; i--) {
    const r = v.runs[i]
    if (r.world === run.world) continue
    const before = rec.world(r.world)
    if (before) return { now, before, beforeRun: r }
  }
  return { now }
}

/** A short key of a host's data, to rebuild the panel only when it changed. */
export function dataKey(host: DebugHost | undefined): string {
  if (!host) return '-'
  const rec = host.recorder
  const last = rec ? Math.max(rec.lastPlan?.seq ?? 0, rec.lastDeferred?.seq ?? 0) : -1
  const s = host.status()
  return `${host.id}|${last}|${host.history?.total ?? 0}|${host.metrics?.plansMade ?? 0}|${s.current}|${s.steps.length}|${s.lastStatus}`
}
