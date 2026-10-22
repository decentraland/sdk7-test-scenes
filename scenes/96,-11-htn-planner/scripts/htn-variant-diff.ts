// Behaviour diff of a level's NPCs on two domain variants (src/playground/variants.ts): the same level, seed and
// visitor, once on the level's own (live) domains and once on the variant, and where their behaviour first differs.
// The variant today: 'flat', the frozen before shape of the stalker and the guard (test/fixtures/reference): the
// second half of proving a restructure, after the decision-equivalence test (docs/htn-guidance.md, Domain design).
// Usage (scene folder): node scripts/htn-variant-diff.mjs [--variant flat] [--levels 5,6,7,12] [--seeds 1-50]
//                       [--seconds 120] [--verbose] [--trace <seed>]
// The tester's script is paused; a "monkey" drives it instead, from the level's seeded rng (fork 'monkey'): it walks
// to random points of the pad, makes random noises (a stone, a footstep, a landing) and, on level 12, switches its
// light. Same seed, same monkey on both runs (it never reads the NPCs). Per run it compares each NPC's steps:
//   body: the steps that are not bookkeeping (metrics.ts isBookkeeping), with their arguments and start times;
//   all: every step except the upkeep primitives (!forget, !forget_noise, !unfocus), which one side may run as
//        upkeep instead of plan steps.
// It prints, per level, how many runs have identical body steps (and identical times), the first divergence of the
// others, and outcome counts (catches, notices, give-ups, despawns) per variant. Exit 0. Built for the experiment in
// docs/htn-level-metrics.md, Domain variants; not part of npm test. --trace <seed>: for that seed,
// both runs' steps and replans (trigger, plan, kept, upkeep) from 3 s before the first divergence, side by side.
import { formatTask, Rng, v3 } from '../src/htn-planner'
import type { GuardEvent, NoiseEvent } from '../src/htn-planner'
import { LEVELS } from '../src/playgrounds'
import { isBookkeeping } from '../src/playground/metrics'
import { findLevel, parseSeeds } from '../src/playground/headless'
import type { CrewMember, LevelSim } from '../src/playground/sim'
import { AmbushLevel } from '../src/playground/levels/ambush'
import { FLAT_VARIANT } from '../test/fixtures/reference/variant'

interface Step {
  t: number
  npc: string
  text: string
}

interface RunLog {
  steps: Step[]
  /** Steps and replans as lines, for --trace. */
  lines: Step[]
  counts: Record<string, number>
  upkeep: number
}

const UPKEEP = new Set(['!forget', '!forget_noise', '!unfocus'])
const NOISE_KINDS = [
  { kind: 'impact', radius: [6, 14] },
  { kind: 'steps', radius: [3, 8] },
  { kind: 'land', radius: [5, 10] }
] as const

function args(argv: string[]) {
  const out = { variant: FLAT_VARIANT, levels: ['5', '6', '7', '8', '12'], seeds: [] as number[], seconds: 120, verbose: false, trace: -1 }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--variant') out.variant = argv[++i]
    else if (a === '--levels') out.levels = argv[++i].split(',')
    else if (a === '--seeds') {
      const s = parseSeeds(argv[++i])
      if (typeof s === 'string') {
        console.error(s)
        process.exit(2)
      }
      out.seeds = s
    } else if (a === '--seconds') out.seconds = Number(argv[++i])
    else if (a === '--verbose') out.verbose = true
    else if (a === '--trace') out.trace = Number(argv[++i])
  }
  if (out.seeds.length === 0) out.seeds = Array.from({ length: 30 }, (_, i) => i + 1)
  return out
}

/** One run of `make()` with the monkey, on `variant` (null: the level's own domains). */
function run(make: () => LevelSim, seed: number, seconds: number, variant: string | null): RunLog {
  const level = make()
  level.variant = variant
  const log: RunLog = { steps: [], lines: [], counts: {}, upkeep: 0 }
  const count = (k: string) => (log.counts[k] = (log.counts[k] ?? 0) + 1)
  level.observer = (e: GuardEvent, m: CrewMember) => {
    const t = Math.round(level.time * 1000) / 1000
    if (e.type === 'step') {
      log.steps.push({ t, npc: m.id, text: formatTask(e.name, e.args) })
      log.lines.push({ t, npc: m.id, text: `step ${formatTask(e.name, e.args)}` })
    } else if (e.type === 'step_end' && e.status !== 'done') {
      count(`steps ${e.status}`)
      log.lines.push({ t, npc: m.id, text: `  ${e.status} ${e.name}` })
    } else if (e.type === 'replan') {
      log.upkeep += e.upkeep?.length ?? 0
      count(e.kept ? 'replans kept' : 'new plans')
      if (e.plan.length > 0 && e.plan.every(isBookkeeping)) count('bookkeeping-only plans')
      const up = e.upkeep ? ` upkeep [${e.upkeep.join(', ')}]` : ''
      log.lines.push({ t, npc: m.id, text: `replan ${e.trigger ?? ''}${e.kept ? ' KEPT' : ''}${up} -> ${e.plan.join(', ')}` })
    } else if (e.type === 'catch') count('catches')
    else if (e.type === 'signal') count(e.name)
  }
  level.init(seed)
  level.testerPaused = true
  const rng: Rng = level.rng.fork('monkey')
  let goal = v3(rng.range(-12, 12), 0, rng.range(-11, 11))
  let nextNoise = rng.range(1, 5)
  let nextLight = rng.range(3, 10)
  const dt = 1 / 30
  const extra: NoiseEvent[] = []
  while (level.time < seconds - 1e-9) {
    const p = level.tester.position
    const dx = goal.x - p.x
    const dz = goal.z - p.z
    const d = Math.hypot(dx, dz)
    if (d < 0.2 || rng.next() < dt / 6) goal = v3(rng.range(-12, 12), 0, rng.range(-11, 11))
    else {
      const step = Math.min(d, 2.2 * dt)
      level.teleportTester(v3(p.x + (dx / d) * step, 0, p.z + (dz / d) * step))
    }
    if (level.time >= nextNoise) {
      const n = NOISE_KINDS[rng.int(NOISE_KINDS.length)]
      const at = rng.next() < 0.6 ? v3(p.x, 0.2, p.z) : v3(rng.range(-12, 12), 0.2, rng.range(-11, 11))
      level.noise(n.kind, at, rng.range(n.radius[0], n.radius[1]))
      nextNoise = level.time + rng.range(1, 8)
    }
    if (level instanceof AmbushLevel && level.time >= nextLight) {
      level.testerLight = rng.next() < 0.5 ? 'lit' : 'dark'
      nextLight = level.time + rng.range(3, 12)
    }
    level.update(dt, extra)
  }
  return log
}

const body = (s: Step[]) => s.filter(x => !isBookkeeping(x.text.split(' ')[0]))
const noUpkeep = (s: Step[]) => s.filter(x => !UPKEEP.has(x.text.split(' ')[0]))
const key = (s: Step, withTime: boolean) => `${s.npc} ${s.text}${withTime ? ` @${s.t.toFixed(3)}` : ''}`

function firstDiff(a: Step[], b: Step[], withTime: boolean): number {
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) if (key(a[i], withTime) !== key(b[i], withTime)) return i
  return a.length === b.length ? -1 : n
}

const opts = args(process.argv.slice(2))
for (const id of opts.levels) {
  const found = findLevel(LEVELS, id)
  if (!found) {
    console.error(`no level ${id}`)
    continue
  }
  const title = found.make().info
  let sameBody = 0
  let sameBodyTimed = 0
  let sameAll = 0
  const totals: Record<string, [number, number]> = {}
  const upkeep = [0, 0]
  const diffs: string[] = []
  for (const seed of opts.seeds) {
    const a = run(found.make, seed, opts.seconds, null)
    const b = run(found.make, seed, opts.seconds, opts.variant)
    upkeep[0] += a.upkeep
    upkeep[1] += b.upkeep
    for (const k of new Set([...Object.keys(a.counts), ...Object.keys(b.counts)])) {
      const t = (totals[k] = totals[k] ?? [0, 0])
      t[0] += a.counts[k] ?? 0
      t[1] += b.counts[k] ?? 0
    }
    const [ba, bb] = [body(a.steps), body(b.steps)]
    const i = firstDiff(ba, bb, false)
    if (i < 0) sameBody++
    if (firstDiff(ba, bb, true) < 0) sameBodyTimed++
    if (firstDiff(noUpkeep(a.steps), noUpkeep(b.steps), true) < 0) sameAll++
    if (i >= 0) {
      const show = (s: Step | undefined) => (s ? `${s.t.toFixed(2)} ${s.npc} ${s.text}` : '(end)')
      diffs.push(`  seed ${seed}: body step ${i}: live ${show(ba[i])} | ${opts.variant} ${show(bb[i])}; before: ${ba.slice(Math.max(0, i - 3), i).map(s => s.text).join(', ')}`)
    } else if (opts.verbose && firstDiff(ba, bb, true) >= 0) {
      const j = firstDiff(ba, bb, true)
      diffs.push(`  seed ${seed}: same body steps, time differs at step ${j}: ${ba[j].t} vs ${bb[j].t} ${ba[j].text}`)
    }
  }
  const n = opts.seeds.length
  console.log(`level ${title.number} ${title.id}: ${n} seeds x ${opts.seconds} s, monkey visitor; ${opts.variant} vs live`)
  console.log(`  identical body steps: ${sameBody}/${n}; with identical start times: ${sameBodyTimed}/${n}; all steps but upkeep, timed: ${sameAll}/${n}; upkeep steps (live / ${opts.variant}): ${upkeep[0]}/${upkeep[1]}`)
  console.log(`  outcomes (live / ${opts.variant}): ${Object.entries(totals).map(([k, [x, y]]) => `${k} ${x}/${y}`).join(', ') || 'none'}`)
  for (const d of diffs.slice(0, opts.verbose ? diffs.length : 8)) console.log(d)
  if (opts.trace >= 0) {
    const a = run(found.make, opts.trace, opts.seconds, null)
    const b = run(found.make, opts.trace, opts.seconds, opts.variant)
    const [ba, bb] = [body(a.steps), body(b.steps)]
    const i = firstDiff(ba, bb, true)
    const from = i < 0 ? 0 : Math.min(ba[i]?.t ?? Infinity, bb[i]?.t ?? Infinity) - 3
    const to = from + 6
    const show = (log: RunLog, label: string) => {
      console.log(`  -- ${label}, seed ${opts.trace}, ${from.toFixed(2)}..${to.toFixed(2)} s`)
      for (const l of log.lines) if (l.t >= from && l.t <= to) console.log(`    ${l.t.toFixed(2)} ${l.npc} ${l.text}`)
    }
    show(a, 'live')
    show(b, opts.variant)
  }
  if (!opts.verbose && diffs.length > 8) console.log(`  ... ${diffs.length - 8} more (--verbose)`)
}
