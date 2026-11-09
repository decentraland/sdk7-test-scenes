// The side panel: the run shown (agent, time, status, planning ms; previous / next run), why it was planned and how
// its plan differs from the one it replaced, the plan strip at the cursor, the world it planned against, and the
// node selected in the figure.
import type { SessionRun } from '../../../src/htn-planner/debug/session'
import type { DomainGraph } from '../../../src/htn-planner/htn/domain-graph'
import type { DebugNode } from '../../../src/htn-planner/htn/trace'
import { bindingsText, stepText, valueText } from '../model/format'
import { nodeLabel } from '../model/plan-tree'
import { planStrip } from '../model/plan-strip'
import type { StepState } from '../model/plan-strip'
import type { AgentInfo } from '../model/session-index'
import { runTime } from '../model/session-index'
import { planDiff } from '../model/timeline'
import type { ReplanMarker } from '../model/timeline'
import { worldView } from '../model/world-view'
import type { WorldRow } from '../model/world-view'
import { h } from './dom'
import type { State, Store } from './state'

const STEP_GLYPH: Record<StepState, string> = { done: '✓', running: '▶', upcoming: '·', failed: '×', cut: '✂' }

function section(title: string, ...body: (Node | string | null | false)[]): HTMLElement {
  return h('section', { class: 'panel' }, h('h3', { text: title }), ...body)
}

/** The ◆ that made this run (the one opened, else the newest of its agent at the run's time). */
export function markerFor(st: State, agent: string, run: SessionRun | undefined): ReplanMarker | null {
  if (st.marker && st.marker.run === run?.seq) return st.marker
  const tr = st.timeline?.tracks.find(t => t.agent === agent)
  if (!tr || !run) return null
  let found: ReplanMarker | null = null
  for (const m of tr.markers) if (m.run === run.seq) found = m
  return found
}

export function renderSide(el: HTMLElement, st: State, store: Store, agent: AgentInfo | undefined, run: SessionRun | undefined): void {
  el.replaceChildren()
  if (!agent || !st.index) return
  if (!run) {
    el.append(section('Run', h('p', { class: 'muted', text: `${agent.id} has no run in this session.` })))
    return
  }
  const i = agent.runs.indexOf(run)
  const go = (r: SessionRun | undefined) => r && store.set({ runSeq: r.seq, cursor: runTime(r), marker: null, selected: null })
  const status = run.status ?? 'running'
  el.append(
    section(
      'Run',
      h(
        'div',
        { class: 'runhead' },
        h('button', { class: 'nav', title: 'previous run of this agent', disabled: i <= 0, onclick: () => go(agent.runs[i - 1]) }, '‹'),
        h(
          'div',
          { class: 'runtitle' },
          h('b', { text: `${agent.id} · run ${run.seq}` }),
          h('span', { class: `status ${status === 'succeeded' ? 'ok' : 'bad'}`, text: status === 'succeeded' ? '✓ plan found' : `× ${status}` }),
          h('div', { class: 'muted', text: `${st.index.timed ? `t = ${runTime(run).toFixed(2)} s · ` : ''}${run.deferred ? 'a deferred step expanded · ' : ''}${run.nodes.length} trace nodes · ${run.ms.toFixed(2)} ms (recorded)` })
        ),
        h('button', { class: 'nav', title: 'next run of this agent', disabled: i >= agent.runs.length - 1, onclick: () => go(agent.runs[i + 1]) }, '›')
      )
    )
  )
  // Why, and the plan diff.
  const m = markerFor(st, agent.id, run)
  if (m) {
    const diff = m.previous ? planDiff(m.previous, m.plan) : null
    el.append(
      section(
        'Why it planned',
        h('p', { class: 'why' }, h('span', { class: m.kind === 'fail' ? 'bad' : '', text: m.kind === 'fail' ? '× ' : '◆ ' }), m.why),
        m.changes ? h('p', { class: 'muted', text: `facts changed: ${m.changes}` }) : null,
        m.upkeep ? h('p', { class: 'muted', text: `upkeep first (reasoning): ${m.upkeep.map(stepText).join(', ')}` }) : null,
        h('p', { class: 'muted', text: `${m.outcome}${m.count > 1 ? ` · ×${m.count} until ${m.until.toFixed(2)} s` : ''}` }),
        diff && diff.length
          ? h(
              'ol',
              { class: 'diff' },
              ...diff.map(r => h('li', { class: r.kind, title: r.kind === 'kept' ? 'kept from the plan it replaced' : r.kind === 'dropped' ? 'dropped from the plan it replaced' : 'new in this plan' }, h('span', { class: 'mark', text: r.kind === 'kept' ? '=' : r.kind === 'dropped' ? '−' : '+' }), stepText(r.step)))
            )
          : null
      )
    )
  }
  // Plan strip.
  const strip = planStrip(run, agent.events, st.cursor)
  el.append(
    section(
      'Plan',
      strip.length === 0
        ? h('p', { class: 'muted', text: run.status === 'succeeded' ? 'empty plan' : 'no plan' })
        : h('ol', { class: 'strip' }, ...strip.map(sp => h('li', { class: sp.state, title: sp.start !== undefined ? `${sp.state} · ${sp.start.toFixed(2)}${sp.end !== undefined ? `–${sp.end.toFixed(2)}` : ''} s` : sp.state }, h('span', { class: 'mark', text: STEP_GLYPH[sp.state] }), sp.label, sp.deferred ? h('i', { class: 'muted', text: '  deferred' }) : null)))
    )
  )
  // World.
  const w = worldView(st.index.session, agent.id, run.world, run, agent.graph)
  if (w) {
    const tables = w.tables.filter(t => st.worldFilter === 'all' || (st.worldFilter === 'changed' ? t.changed : t.read !== ''))
    const filter = (f: State['worldFilter'], label: string) => h('button', { class: `chip ${st.worldFilter === f ? 'on' : ''}`, onclick: () => store.set({ worldFilter: f }) }, label)
    el.append(
      section(
        'World',
        h('div', { class: 'filters' }, filter('all', 'all'), filter('changed', 'changed'), filter('read', 'read by the planner'), h('span', { class: 'muted small', text: w.previous === null ? ' first world' : ` vs the world before` })),
        h(
          'table',
          { class: 'world' },
          ...tables.flatMap(t => {
            const rows: (WorldRow & { empty?: true })[] = t.rows.length ? t.rows : [{ args: [], mark: '', read: '', empty: true }]
            return rows.map((r, k) =>
              h(
                'tr',
                { class: `${r.mark === '-' ? 'removed' : ''} ${r.mark === '+' ? 'added' : ''} ${r.mark === '~' ? 'changed' : ''}` },
                h('td', { class: 'mark', text: r.mark === '-' ? '−' : r.mark }),
                h('td', { class: 'read', title: r.read === 'plan' ? 'the chosen plan rests on this row' : '', text: r.read === 'plan' ? '●' : k === 0 && t.read === 'queried' ? '○' : k === 0 && t.read === 'plan' && !t.rows.length ? '●' : '' }),
                h('td', { class: 'fact', text: k === 0 ? t.name : '' }),
                h('td', { class: 'args' }, r.empty ? h('i', { class: 'muted', text: 'no rows' }) : r.args.join(', '), r.was ? h('span', { class: 'was', text: `  was ${r.was.join(', ')}` }) : null)
              )
            )
          })
        ),
        h('p', { class: 'legend small' }, '● the chosen plan rests on it  ○ the planner looked  + added  − removed  ~ changed, against the world before')
      )
    )
  }
  // Selected node.
  const sel = st.selected !== null ? run.nodes[st.selected] : undefined
  if (sel) el.append(detail(sel, agent.graph))
}

function detail(n: DebugNode, graph: DomainGraph): HTMLElement {
  const kind = n.impl ? 'axiom body' : n.kind
  let title = nodeLabel(n)
  if (n.kind === 'branch') title = graph.branches[n.ref]?.name ?? n.name
  else if (n.kind === 'method' || n.kind === 'plan') title = graph.methods[n.ref]?.name ?? n.name
  const result = !n.started ? 'not reached' : !n.completed ? 'running' : n.succeeded ? 'succeeded' : 'failed'
  const names = [...new Set([...n.before, ...n.after].map(b => b.name))].sort()
  const val = (bs: typeof n.before, name: string) => {
    const v = bs.find(b => b.name === name)?.value
    return v === undefined ? '–' : valueText(v)
  }
  const pre = n.kind === 'branch' ? graph.branches[n.ref] : undefined
  return section(
    'Selected',
    h('p', {}, h('b', { text: title }), h('span', { class: 'muted', text: `  ${kind} · ${result}` })),
    n.source ? h('p', { class: 'muted small', text: `${n.source.file}:${n.source.line}` }) : null,
    pre && pre.cond >= 0 ? h('p', { class: 'muted small', text: `precondition as written: ${graph.conds[pre.cond]?.title ?? ''}` }) : null,
    names.length
      ? h(
          'table',
          { class: 'watch' },
          h('tr', {}, h('th', { text: 'variable' }), h('th', { text: 'before' }), h('th', { text: 'after' })),
          ...names.map(name => h('tr', { class: val(n.before, name) !== val(n.after, name) ? 'changed' : '' }, h('td', { text: name }), h('td', { text: val(n.before, name) }), h('td', { text: val(n.after, name) })))
        )
      : h('p', { class: 'muted small', text: 'no variables bound here' }),
    n.rowCount !== undefined
      ? h('p', { class: 'small' }, `checked against ${n.rowCount} row${n.rowCount === 1 ? '' : 's'}`, n.rows && n.rows.length ? h('span', { class: 'muted', text: `: ${n.rows.map(r => `(${r.map(valueText).join(', ')})`).join('  ')}` }) : '')
      : null,
    n.kind === 'plan' || n.kind === 'method' ? h('p', { class: 'muted small', text: bindingsText(n.after) }) : null
  )
}
