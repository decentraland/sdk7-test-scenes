// The station board as text: the planner panel (domain, why it replanned, the branch tree of the current plan with
// what each condition says and what it bound, the plan with the running step) and the auto-test panel (the tester's
// checks). TextShape rich text: <color>, <b>, <size> render in the explorer; ✓ ▶ ● ○ · × have glyphs (✗ does not).
// Pure, so tests can read the boards too.
import { branchAttempts, formatBound, formatCond, formatTask, rootMethod } from '../htn-planner'
import type { DebugNode, DomainIR, PlanRun } from '../htn-planner'
import type { CheckResult, LevelSim } from './sim'

const DEFAULT_PALETTE = ['#7be37b', '#56d8e6', '#ffe066', '#c78bff', '#ffb14a', '#7c9cff', '#ff8ad8', '#ff6b5e']
const GREY = '#8a8a8a'
const DIM = '#707070'
const HEAD = '#9fd3ff'
const MAX_COND = 34
const MAX_STEPS = 6
/** Other NPCs listed by name on the board (a crowd has more). */
const MAX_OTHERS = 5

/** Colour of a branch: the level's choice, else by position in its method. */
export function branchColor(level: LevelSim, branch: string, index: number): string {
  return level.branchColors[branch] ?? DEFAULT_PALETTE[index % DEFAULT_PALETTE.length]
}

/** RGB 0..1 of a #rrggbb colour, for the NPC body. */
export function hexRgb(hex: string): { r: number; g: number; b: number } {
  const n = parseInt(hex.slice(1), 16)
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 }
}

const c = (color: string, text: string) => `<color=${color}>${text}</color>`
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)
const pad = (s: string, n: number) => (s.length >= n ? s : s + ' '.repeat(n - s.length))

function methodLines(level: LevelSim, d: DomainIR, run: PlanRun, node: DebugNode, indent: string, out: string[], depth: number): void {
  const m = d.methods[node.ref]
  const width = Math.max(...m.branches.map(b => b.name.length)) + 1
  const outcome = new Map(branchAttempts(run, node, level.trace.graph).map(a => [a.branch, a]))
  m.branches.forEach((b, i) => {
    const at = outcome.get(i)
    const cond = clip(formatCond(d, b.cond, b.vars), MAX_COND)
    if (!at) {
      out.push(indent + c(DIM, `·  ${pad(b.name, width)} ${cond}`))
      return
    }
    if (at.outcome === 'no_match') {
      out.push(indent + c(GREY, `×  ${pad(b.name, width)} ${cond}`))
      return
    }
    const color = at.outcome === 'chosen' ? branchColor(level, b.name, i) : '#ff9a3c'
    const mark = at.outcome === 'chosen' ? '✓' : '×'
    const tail = at.outcome === 'abandoned' ? '  (its steps failed: next branch)' : ''
    out.push(indent + c(color, `<b>${mark}  ${pad(b.name, width)}</b> ${cond}${tail}`))
    const bound = formatBound(at.node.after, m.params)
    if (bound) out.push(indent + '     ' + c(color, clip(bound, 60)))
    if (depth < 3) {
      for (const child of at.children) {
        const cm = d.methods[child.ref]
        out.push(indent + '     ' + c(HEAD, `↳ ${formatTask(cm.name, child.before.map(x => x.value))}`))
        methodLines(level, d, run, child, indent + '       ', out, depth + 1)
      }
    }
  })
}

/** The planner panel. */
export function plannerText(level: LevelSim): string {
  const d = level.trace.domain
  const run = level.chosenRun
  const agent = level.agent
  const out: string[] = []
  out.push(`<b>HTN PLANNER</b>   domain ${c(HEAD, d.name)}   ${c(GREY, level.info.source)}`)
  if (level.crew.length > 1) {
    const others = level.crew.filter((_m, i) => i !== level.focus).map(m => `${m.id}: ${level.chosenOf(m) || '-'}`)
    if (others.length > MAX_OTHERS) others.splice(MAX_OTHERS, others.length - MAX_OTHERS, `… +${others.length - MAX_OTHERS} more`)
    out.push(`NPC ${c(HEAD, `<b>${level.crew[level.focus].id}</b>`)} (${level.focus + 1}/${level.crew.length})   ${c(GREY, others.join('   '))}`)
  }
  out.push(...level.boardNotes())
  const ago = (level.time - level.lastReplanAt).toFixed(1)
  const kept = level.lastReplanKept ? ', running plan kept' : ''
  out.push(c(GREY, `plans made: ${level.replans}, last ${ago} s ago   status: ${agent.lastPlanStatus || '-'}${kept}`))
  out.push(c(GREY, `why: ${clip(agent.lastReplanReason || '-', 64)}`))
  const m = agent.metrics
  const frames = m.callFrameCapacity > 0 ? `   frames: peak ${m.maxPeakCallFrames} of ${m.callFrameCapacity}` : ''
  out.push(c(GREY, `planner: last ${m.lastPlanMs.toFixed(1)} ms, max ${m.maxPlanMs.toFixed(1)} ms, total ${m.totalPlanMs.toFixed(0)} ms   steps done: ${m.tasksCompleted}${frames}`))
  const budget = level.planBudget
  if (budget) {
    const s = budget.stats
    const limit = Number.isFinite(budget.maxPlansPerFrame) ? `${budget.maxPlansPerFrame} plans/frame` : `${budget.planBudgetMs} ms/frame`
    out.push(c(GREY, `budget ${limit}: ${s.deferred} waits, longest ${s.maxWaitFrames} frames, most ${s.maxRunsInFrame} in a frame   this NPC: ${m.budgetDeferred} waits, longest ${m.budgetMaxWaitFrames}`))
  }
  if (m.checksMade > 0) {
    const member = level.crew[level.focus]
    const last = member.lastRejected ? `   last: ${c('#ff9a3c', clip(member.lastRejected, 28))} ${(level.time - member.lastRejectedAt).toFixed(1)} s ago` : ''
    out.push(c(GREY, `running step checked: ${m.checksMade} times, rejected ${member.rejections}${last}`))
  }
  out.push('')
  const root = rootMethod(run)
  if (run && root) {
    const m = d.methods[root.ref]
    const how = run.deferred ? `  (expanded from &${m.name} just now)` : ''
    out.push(`<b>BRANCHES of (${m.name})</b>${c(GREY, '  top to bottom, first match wins' + how)}`)
    methodLines(level, d, run, root, '', out, 0)
  } else out.push(c(GREY, '(no plan yet)'))
  out.push('')
  out.push('<b>PLAN</b>' + c(GREY, '  ✓ done   ▶ running   & = decided when reached'))
  for (const s of level.doneSteps.slice(-2)) out.push(c(GREY, `✓ ${s}`))
  const steps = agent.runner.steps
  steps.slice(0, MAX_STEPS).forEach((s, i) => {
    const text = formatTask(s.name, s.args)
    if (i === 0 && s.kind === 'primitive') out.push(c('#ffe066', `<b>▶ ${text}</b>`))
    else out.push(s.kind === 'deferred' ? c('#c78bff', `  ${text}`) : `  ${text}`)
  })
  if (steps.length > MAX_STEPS) out.push(c(GREY, `  … +${steps.length - MAX_STEPS} more`))
  if (steps.length === 0) out.push(c(GREY, '  (replanning)'))
  return out.join('\n')
}

function checkLine(ch: CheckResult, current: boolean): string {
  switch (ch.state) {
    case 'pass':
      return c('#7be37b', `✓ ${ch.label}`) + c(GREY, `  ${ch.seconds.toFixed(1)} s`)
    case 'fail':
      return c('#ff6b5e', `<b>× ${ch.label}</b>`) + c('#ff6b5e', `  not within ${ch.seconds.toFixed(0)} s`)
    case 'waiting':
      return c('#ffe066', `${current ? '●' : '○'} ${ch.label}`) + c(GREY, current ? '  waiting…' : '')
    default:
      return c(DIM, `○ ${ch.label}`)
  }
}

/** The auto-test panel. */
export function testerText(level: LevelSim): string {
  const passed = level.checks.filter(ch => ch.state === 'pass').length
  const failed = level.checks.filter(ch => ch.state === 'fail').length
  const out: string[] = []
  const state = level.testerPaused ? c('#ffb14a', 'PAUSED') : c('#7be37b', 'running')
  out.push(`<b>AUTO-TEST</b>   round ${level.round}   ${state}`)
  out.push(c(GREY, `the ${c('#56a8ff', 'Tester bot')} plays the visitor;`))
  out.push(c(GREY, `${passed} passed, ${failed} failed (last result of each)`))
  out.push(c('#56a8ff', `Tester: "${clip(level.testerSay, 34)}"`))
  out.push('')
  const step = level.currentStep
  for (const ch of level.checks) out.push(checkLine(ch, step?.kind === 'expect' && step.label === ch.label))
  return out.join('\n')
}

/** Overall verdict: every check has passed at least once and none failed in its last run. */
export function allPassing(level: LevelSim): boolean {
  return level.checks.every(ch => ch.state !== 'fail') && level.checks.some(ch => ch.state === 'pass')
}
