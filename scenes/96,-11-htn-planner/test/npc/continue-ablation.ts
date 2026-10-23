// The continue ablation (docs/htn-level-metrics.md, "Continue branches"): one guard, two visitors that keep crossing
// each other's path, so which of them is nearer flips again and again. The guard plans with
// test/fixtures/continue/guard_continue.domain (guard_tiered plus one continue branch above its chase) with
// GuardAgentOptions.continueTask on or off; off, nothing publishes `(running ...)` and the continue branch never
// holds, so the guard is guard_tiered as it is. Headless, deterministic (no clock read for the outcome numbers), no SDK.
//
// The visitors run around a circle (CONTINUE_SCENARIOS: 7 m, 2.6 m/s, slower than the chase's 3.4 m/s), in opposite directions,
// from phases drawn from the seed; a caught visitor is put on the opposite side of the circle and runs on. The guard
// patrols across the circle. Target rows come nearest first (perception sorts them), so guard_tiered chases the
// nearest visitor and re-targets whenever the other one gets nearer.
import * as nodePath from 'node:path'
import type { DomainIR } from '../../src/htn-planner/htn/ir'
import { PlanRunner } from '../../src/htn-planner/htn/planner'
import { atomName, type GuardEvent } from '../../src/htn-planner/npc/actions'
import { GuardAgent } from '../../src/htn-planner/npc/agent'
import { CLEAR_LINE_OF_SIGHT, type TargetSample } from '../../src/htn-planner/npc/perception'
import { v3 } from '../../src/htn-planner/npc/vec'
import { compileDomainFile, formatDiagnostic } from '../../tools/htn/compiler'

const ROOT = process.env.HTN_REPO_ROOT ?? process.cwd()

export const CONTINUE_FIXTURE = 'test/fixtures/continue/guard_continue.domain'

/** The fixture domain, compiled once; null with the compiler's messages when it does not compile. */
export function continueDomain(): { ir: DomainIR | null; errors: string[] } {
  const r = compileDomainFile(nodePath.join(ROOT, CONTINUE_FIXTURE))
  return r.ok ? { ir: r.ir, errors: [] } : { ir: null, errors: r.diagnostics.map(formatDiagnostic) }
}

export interface ContinueRun {
  seed: number
  seconds: number
  catches: number
  /** A chase cancelled and a chase of the other visitor started in its place (no catch between). */
  retargets: number
  /** Retargets back to the visitor chased before the last one (A -> B -> A). */
  flipFlops: number
  /** s from the first chase step of an episode (after the start or a catch) to its catch. */
  catchTimes: number[]
  /** Replans that adopted a new plan, all replans, replans the continue branch kept. */
  newPlans: number
  replans: number
  continued: number
  /** Planner calls: decisions, candidates, empty-plan passes and upkeep passes (metrics.plansMade + reasoningMade). */
  plannerCalls: number
}

const DT = 1 / 30

/** The visitors' circle (m) and speed (m/s); the guard's sight range (m) and cone (degrees). */
export interface ContinueScenario {
  name: string
  radius: number
  speed: number
  range: number
  fovDeg: number
}

/**
 * `cone`: the guard's usual 110° cone, so the visitor it does not face is often out of sight (re-targets, and
 * flip-flops back to the first one); `all_around`: a 360° cone, both always in sight (re-targets on every crossing).
 */
export const CONTINUE_SCENARIOS: readonly ContinueScenario[] = [
  { name: 'cone', radius: 7, speed: 2.6, range: 18, fovDeg: 110 },
  { name: 'all_around', radius: 7, speed: 2.6, range: 18, fovDeg: 360 }
]

export function runContinueSim(domain: DomainIR, opts: { continueTask?: string; seed: number; seconds?: number; scenario?: ContinueScenario }): ContinueRun {
  const seconds = opts.seconds ?? 60
  const sc = opts.scenario ?? CONTINUE_SCENARIOS[0]
  const radius = sc.radius
  const omega = sc.speed / radius
  // Phases from the seed (a fixed LCG, no Math.random): A runs counter-clockwise, B clockwise.
  let rng = (opts.seed * 2654435761) >>> 0
  const next = () => ((rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0) / 2 ** 32) * 2 * Math.PI
  const phase: Record<string, number> = { A: next(), B: next() }
  const dir: Record<string, number> = { A: 1, B: -1 }
  const run: ContinueRun = { seed: opts.seed, seconds, catches: 0, retargets: 0, flipFlops: 0, catchTimes: [], newPlans: 0, replans: 0, continued: 0, plannerCalls: 0 }
  let time = 0
  let chased: string | null = null
  let before: string | null = null
  let lastChaseEnd = ''
  let episodeStart: number | null = null
  const onEvent = (e: GuardEvent) => {
    if (e.type === 'replan') {
      run.replans++
      if (e.status === 'succeeded' && !e.kept) run.newPlans++
    } else if (e.type === 'step' && e.name === '!chase') {
      const target = atomName(e.args[0]) ?? ''
      if (episodeStart === null) episodeStart = time
      if (lastChaseEnd === 'cancelled' && chased !== null && target !== chased) {
        run.retargets++
        if (target === before) run.flipFlops++
      }
      if (target !== chased) {
        before = chased
        chased = target
      }
    } else if (e.type === 'step_end' && e.name === '!chase') lastChaseEnd = e.status
    else if (e.type === 'catch') {
      run.catches++
      if (episodeStart !== null) run.catchTimes.push(time - episodeStart)
      episodeStart = null
      chased = before = null
      lastChaseEnd = ''
      phase[e.target] += Math.PI // the caught visitor reappears across the circle
    }
  }
  const agent = new GuardAgent({
    id: 'guard',
    planner: world => new PlanRunner(domain, world),
    lineOfSight: CLEAR_LINE_OF_SIGHT,
    start: { position: v3(0, 0, -10), yaw: 0 },
    route: [v3(0, 0, -10), v3(0, 0, 10)],
    perception: { range: sc.range, fovDeg: sc.fovDeg },
    reasoning: 'reasoning',
    continueTask: opts.continueTask,
    onEvent
  })
  const samples: TargetSample[] = [
    { id: 'A', position: v3(0, 0, 0) },
    { id: 'B', position: v3(0, 0, 0) }
  ]
  for (let t = 0; t < seconds - 1e-9; t += DT) {
    time += DT
    for (const s of samples) {
      phase[s.id] += dir[s.id] * omega * DT
      s.position = v3(Math.cos(phase[s.id]) * radius, 0, Math.sin(phase[s.id]) * radius)
    }
    agent.tick(DT, samples)
  }
  run.continued = agent.metrics.continued
  run.plannerCalls = agent.metrics.plansMade + agent.metrics.reasoningMade
  return run
}

export interface ContinueSummary {
  label: string
  runs: number
  retargetsPerMin: number
  flipFlopsPerMin: number
  catchesPerMin: number
  /** Mean over the catches of every run; null when none. */
  catchS: number | null
  newPlansPerMin: number
  replansPerMin: number
  continuedPerMin: number
  plannerCallsPerMin: number
}

export function summarize(label: string, runs: readonly ContinueRun[]): ContinueSummary {
  const minutes = runs.reduce((a, r) => a + r.seconds, 0) / 60
  const sum = (f: (r: ContinueRun) => number) => runs.reduce((a, r) => a + f(r), 0)
  const times = runs.flatMap(r => r.catchTimes)
  return {
    label,
    runs: runs.length,
    retargetsPerMin: sum(r => r.retargets) / minutes,
    flipFlopsPerMin: sum(r => r.flipFlops) / minutes,
    catchesPerMin: sum(r => r.catches) / minutes,
    catchS: times.length ? times.reduce((a, b) => a + b, 0) / times.length : null,
    newPlansPerMin: sum(r => r.newPlans) / minutes,
    replansPerMin: sum(r => r.replans) / minutes,
    continuedPerMin: sum(r => r.continued) / minutes,
    plannerCallsPerMin: sum(r => r.plannerCalls) / minutes
  }
}

const COLUMNS: [keyof ContinueSummary, string][] = [
  ['retargetsPerMin', 'retargets/min'],
  ['flipFlopsPerMin', 'flip-flops/min'],
  ['catchesPerMin', 'catches/min'],
  ['catchS', 'catch_s'],
  ['newPlansPerMin', 'new plans/min'],
  ['replansPerMin', 'replans/min'],
  ['continuedPerMin', 'continued/min'],
  ['plannerCallsPerMin', 'planner calls/min']
]

/** A markdown table, one column per summary (3 significant digits). */
export function formatSummaries(summaries: readonly ContinueSummary[]): string {
  const num = (v: unknown) => (typeof v === 'number' ? String(Number(v.toPrecision(3))) : '-')
  const lines = [`| metric | ${summaries.map(s => s.label).join(' | ')} |`, `|---|${summaries.map(() => '---').join('|')}|`]
  for (const [key, name] of COLUMNS) lines.push(`| \`${name}\` | ${summaries.map(s => num(s[key])).join(' | ')} |`)
  return lines.join('\n')
}
