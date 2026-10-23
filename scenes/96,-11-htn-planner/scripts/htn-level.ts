// One playground level headless from a terminal: npm run htn:level -- <level id|number> [--seed N|a-b|a,b] [--seconds S]
// [--dt 1/30] [--rounds N] [--json] [--verbose] [--session <file>] [--metrics] [--ablate <name|all>] [--variant <name|all>]
// [--stagger S] | --list.
// Several seeds or --ablate all: a line per run and a table of the metrics' means (docs/htn-level-metrics.md). The level's tester script runs on a fixed dt from a seed;
// the checks print with their sim times, then a line per NPC. Exit 0 all checks passed, 1 a check failed or the time
// ran out, 2 usage. Bundled and run by scripts/htn-level.mjs; the logic is src/playground/headless.ts (tested there).
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { LEVELS } from '../src/playgrounds'
import { DEFAULT_SEED } from '../src/htn-planner'
import {
  findLevel,
  formatLevelList,
  formatLevelRun,
  formatLevelSet,
  LEVEL_USAGE,
  levelRunExitCode,
  levelSession,
  levelSetExitCode,
  parseLevelArgs,
  runLevel,
  runLevelSet
} from '../src/playground/headless'
// The domain variants a level can run on (--variant): 'flat', the frozen before shape of the stalker and the guard.
import '../test/fixtures/reference/variant'

const args = parseLevelArgs(process.argv.slice(2))
if ('error' in args) {
  console.error(`htn:level: ${args.error}\n${LEVEL_USAGE}`)
  process.exit(2)
}
if (args.list) {
  console.log(formatLevelList(LEVELS))
  process.exit(0)
}
const found = findLevel(LEVELS, args.level)
if (!found) {
  console.error(`htn:level: unknown level "${args.level}"; the levels:\n${formatLevelList(LEVELS)}\n${LEVEL_USAGE}`)
  process.exit(2)
}
const names = found.make().ablations().map(a => a.name)
if (args.ablate !== undefined && args.ablate !== 'all' && !names.includes(args.ablate)) {
  console.error(`htn:level: level ${args.level} has no ablation "${args.ablate}"; its ablations: ${names.join(', ') || 'none'}`)
  process.exit(2)
}
const variantNames = found.make().variants().map(v => v.name)
if (args.variant !== undefined && args.variant !== 'all' && !variantNames.includes(args.variant)) {
  console.error(`htn:level: level ${args.level} has no domain variant "${args.variant}"; its variants: ${variantNames.join(', ') || 'none'}`)
  process.exit(2)
}
if (args.seeds !== undefined || args.ablate === 'all' || args.variant === 'all') {
  if (args.session !== undefined) {
    console.error('htn:level: --session records one run: one seed, one ablation')
    process.exit(2)
  }
  const set = runLevelSet(found.make, {
    seeds: args.seeds ?? [args.seed ?? DEFAULT_SEED],
    ablations: args.ablate === 'all' ? [null, ...names] : [args.ablate ?? null],
    domainVariants: args.variant === 'all' ? [null, ...variantNames] : [args.variant ?? null],
    rounds: args.rounds,
    seconds: args.seconds,
    dt: args.dt,
    stagger: args.stagger
  })
  console.log(args.json ? JSON.stringify(set, null, 2) : formatLevelSet(set))
  process.exit(levelSetExitCode(set))
}
const level = found.make()
const record = args.session !== undefined
const metrics = args.metrics === true || args.json
const result = runLevel(level, { seed: args.seed, seconds: args.seconds, dt: args.dt, rounds: args.rounds, verbose: args.verbose, record, ablation: args.ablate, variant: args.variant, stagger: args.stagger, metrics })
console.log(args.json ? JSON.stringify(result, null, 2) : formatLevelRun(result))
if (args.session !== undefined) {
  // npm runs scripts in the scene folder; a relative path is the caller's (INIT_CWD), as htn:run reads it.
  const file = resolve(process.env.INIT_CWD ?? process.cwd(), args.session)
  try {
    writeFileSync(file, JSON.stringify(levelSession(level)))
  } catch (e) {
    console.error(`htn:level: cannot write session '${args.session}': ${(e as Error).message}`)
    process.exit(2)
  }
  if (!args.json) console.log(`session: ${file}`)
}
process.exit(levelRunExitCode(result))
