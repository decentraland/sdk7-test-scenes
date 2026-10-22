// Plan tab: the run bar (Prev / Next through the recorder's runs, as Decima's Previous / Next Log; "new plan" when the
// host planned since, as upstream's "NPC has replanned"), Normal / Verbose, values; the plan strip (done / running /
// next) and the breadcrumb from the plan's root to the running step; why the shown run was planned (the replan's
// trigger, wait, the facts that changed, whether the plan changed) and whether the facts it rests on still hold in the
// host's world now (re-checked when the panel rebuilds, not every tick); then the decomposition tree and the watch.
import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { committedSteps, crumbs, planStrip, planTexts } from '../plan-path'
import { driftText, replanFor, replanText, runDrift } from '../replan-rows'
import { runTitle, stepRun } from '../runs'
import { sceneClockStep } from '../timing'
import { clip, colored, escapeRich, GLYPH, HEX, STATUS_HEX } from '../theme'
import { HostView } from './data'
import { button, C, label } from './kit'
import { BODY_H, BODY_W } from './layout'
import { hold, set, state, touch } from './state'
import { adoptRun, legend, ROW_H, selectNode, treeBox, watchBox, WhySource } from './tree-view'

const BAR_H = 30
const LINE_H = 24
export const TREE_W = 610
const TREE_H = BODY_H - BAR_H - 4 * LINE_H - 22 - 16

export function planToolbar(v: HostView) {
  const p = v.pick
  const tree = state.plan
  const go = (delta: number) => {
    tree.pinned = stepRun(v.runs, tree.pinned, delta)
    hold()
    touch()
  }
  const run = p.run
  const name = run ? v.graph.methods[run.method]?.name ?? '?' : ''
  const title = run ? runTitle(run, name, sceneClockStep()) : v.host.recorder ? 'no run yet: waiting for the next plan' : 'not recording yet: it records from its next plan'
  const where = p.count > 0 ? `${p.index + 1}/${p.count}` : ''
  const fresh = !p.latest ? colored(STATUS_HEX.running, `  ● ${p.newer} newer`) : ''
  return [
    button('◀ Prev', () => go(-1), false, 'auto', 'prev'),
    button('Next ▶', () => go(+1), false, 'auto', 'next'),
    button(p.latest ? 'following newest' : 'Newest', () => ((tree.pinned = null), touch()), p.latest, 150, 'newest'),
    <UiEntity
      key="title"
      uiTransform={{ width: 360, height: 26, flexShrink: 0, margin: { right: 6 } }}
      uiText={{ value: `${colored(HEX.text, escapeRich(title))} ${colored(HEX.faint, where)}${fresh}`, fontSize: 13, color: C.text, textAlign: 'middle-left', textWrap: 'nowrap' }}
    />,
    button('Normal', () => set({ mode: 'normal' }), state.mode === 'normal', 'auto', 'normal'),
    button('Verbose', () => set({ mode: 'verbose' }), state.mode === 'verbose', 'auto', 'verbose'),
    button(state.values ? '?x=value' : '?x', () => set({ values: !state.values }), state.values, 'auto', 'values')
  ]
}

const STRIP_HEX = { done: STATUS_HEX.chosen, current: STATUS_HEX.running, next: HEX.dim }
const STRIP_GLYPH = { done: GLYPH.chosen, current: GLYPH.running, next: '·' }

function stripLine(v: HostView) {
  const s = v.host.status()
  const strip = planStrip(planTexts(v.pick.run), s.steps, s.current !== '', s.done)
  const items = strip.items
  // Around the current step: two done, the current one and what follows.
  const at = Math.max(0, items.findIndex(i => i.state !== 'done') - 2)
  const shown = items.slice(at, at + 9)
  const text =
    shown.length === 0
      ? colored(HEX.dim, 'no plan running')
      : (at > 0 ? colored(HEX.faint, `… ${at} done  `) : '') +
        shown.map(i => colored(STRIP_HEX[i.state], `${STRIP_GLYPH[i.state]} ${clip(i.text, 34)}`)).join(colored(HEX.faint, '  ›  ')) +
        (items.length > at + shown.length ? colored(HEX.faint, `  … +${items.length - at - shown.length}`) : '')
  const from = strip.fromRun || !v.pick.run || items.length === 0 ? '' : colored(HEX.faint, '   (the running plan, not this run)')
  const ended = strip.fromRun && strip.current < 0 ? colored(HEX.faint, '   (finished)') : ''
  return { text: `${colored(HEX.dim, 'Plan  ')}${text}${from}${ended}`, current: strip.current, fromRun: strip.fromRun }
}

function crumbLine(v: HostView, current: number, fromRun: boolean) {
  const run = v.pick.run
  const out = [label('Path ', 13, C.dim, 'auto', 'ph')]
  if (!run || current < 0) {
    const why = !run ? '' : fromRun ? 'no step running: the plan finished' : 'the running step is not in this run'
    out.push(label(why, 13, C.dim, 'auto', 'none'))
    return out
  }
  const steps = committedSteps(run)
  const step = steps[current]
  if (!step) return out
  const all = crumbs(run, v.graph, step.path)
  const shown = all.length > 10 ? [...all.slice(0, 2), null, ...all.slice(-7)] : all
  shown.forEach((c, i) => {
    if (i > 0) out.push(label('›', 13, C.dim, 'auto', `s${i}`))
    if (c === null) {
      out.push(label('…', 13, C.dim, 'auto', `gap`))
      return
    }
    const hexes = { method: HEX.method, branch: HEX.branch, task: STATUS_HEX.running }
    out.push(
      <UiEntity
        key={`c${i}`}
        uiTransform={{ height: 22, flexShrink: 0, padding: { left: 4, right: 4 }, margin: { right: 2 }, borderRadius: 4 }}
        uiBackground={{ color: c.node === state.plan.selected ? C.selected : C.button }}
        uiText={{ value: colored(hexes[c.kind], clip(c.label, 40)), fontSize: 13, color: C.text, textAlign: 'middle-center', textWrap: 'nowrap' }}
        onMouseDown={() => selectNode(run, state.plan, c.node, Math.floor(TREE_H / ROW_H))}
      />
    )
  })
  return out
}

/** The run's domain and the worlds its recorder kept, for the watch's "why". */
function whySource(v: HostView): WhySource {
  const rec = v.host.recorder
  return { domain: rec?.domain ?? v.host.domain, world: rec ? rev => rec.world(rev) : undefined }
}

/** "Why" (the replan that made the shown run) and "Now" (its facts against the host's world now). */
function whyNowLines(v: HostView): { why: string; now: string } {
  const run = v.pick.run
  const replan = replanFor(v.host.history?.toArray() ?? [], v.runs, run)
  const why = replan
    ? colored(HEX.text, clip(replanText(replan), 170))
    : colored(HEX.dim, !run ? '-' : run.deferred ? 'a deferred step expanded while the plan ran' : v.host.history ? 'no replan event for this run (older than the history)' : clip(v.host.status().reason || '-', 120))
  const drift = run ? runDrift(v.host.recorder?.domain ?? v.host.domain, run, v.host.world) : undefined
  const now = !drift
    ? colored(HEX.dim, run ? 'no plan in this run to check' : '-')
    : drift.items.length === 0
      ? colored(STATUS_HEX.chosen, `${GLYPH.chosen} ${driftText(drift)}`)
      : colored(STATUS_HEX.failed, `${GLYPH.failed} ${clip(driftText(drift), 170)}`)
  return { why: `${colored(HEX.dim, 'Why   ')}${why}`, now: `${colored(HEX.dim, 'Now   ')}${now}` }
}

export function planView(v: HostView) {
  const run = v.pick.run
  adoptRun(state.plan, run ? `${v.host.id}#${run.seq}` : '', run, v.host.id)
  const strip = stripLine(v)
  const whyNow = whyNowLines(v)
  return (
    <UiEntity uiTransform={{ width: BODY_W, height: BODY_H, flexDirection: 'column' }}>
      <UiEntity key="bar" uiTransform={{ flexDirection: 'row', height: BAR_H, alignItems: 'center', flexShrink: 0 }}>
        {planToolbar(v)}
      </UiEntity>
      <UiEntity
        key="strip"
        uiTransform={{ width: BODY_W, height: LINE_H, flexShrink: 0 }}
        uiText={{ value: strip.text, fontSize: 13, color: C.text, textAlign: 'middle-left', textWrap: 'nowrap' }}
      />
      <UiEntity key="crumbs" uiTransform={{ width: BODY_W, height: LINE_H, flexDirection: 'row', alignItems: 'center', flexShrink: 0, overflow: 'hidden' }}>
        {crumbLine(v, strip.current, strip.fromRun)}
      </UiEntity>
      <UiEntity
        key="why"
        uiTransform={{ width: BODY_W, height: LINE_H, flexShrink: 0 }}
        uiText={{ value: whyNow.why, fontSize: 13, color: C.text, textAlign: 'middle-left', textWrap: 'nowrap' }}
      />
      <UiEntity
        key="now"
        uiTransform={{ width: BODY_W, height: LINE_H, flexShrink: 0 }}
        uiText={{ value: whyNow.now, fontSize: 13, color: C.text, textAlign: 'middle-left', textWrap: 'nowrap' }}
      />
      <UiEntity key="body" uiTransform={{ flexDirection: 'row', height: TREE_H, flexShrink: 0, margin: { top: 4 } }}>
        {run ? treeBox(run, v.graph, state.plan, TREE_W, TREE_H) : <UiEntity key="none" uiTransform={{ width: TREE_W, height: TREE_H }} uiBackground={{ color: C.card }} />}
        <UiEntity key="gap" uiTransform={{ width: 10, height: 1 }} />
        {run ? watchBox(run, v.graph, state.plan, BODY_W - TREE_W - 10, TREE_H, whySource(v)) : <UiEntity key="nw" uiTransform={{ width: 1, height: 1 }} />}
      </UiEntity>
      <UiEntity
        key="legend"
        uiTransform={{ width: BODY_W, height: 22, flexShrink: 0, margin: { top: 4 } }}
        uiText={{ value: legend(), fontSize: 12, color: Color4.White(), textAlign: 'middle-left', textWrap: 'nowrap' }}
      />
    </UiEntity>
  )
}
