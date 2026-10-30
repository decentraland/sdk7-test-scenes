// npm run htn:golden [-- --export-only | --driver-output <file>]: regenerate the upstream golden plans (E4).
// 1. Writes test/fixtures/upstream-golden/manifest.tsv and worlds/*.worldstate from the gallery and lab scenarios
//    (tools/upstream-golden/cases.ts).
// 2. Builds upstream urosidoki/htn_planner and the driver and plans every case (tools/upstream-golden/build.sh --run):
//    on Windows through WSL (HTN_WSL_DISTRO, default Ubuntu-24.04), elsewhere with the local bash. Needs g++, gcc, git.
// 3. Writes one <station>.golden.txt per station and prints where our planner differs.
// --export-only stops after 1; --driver-output reads a saved driver output instead of running 2.
import { spawnSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { GOLDEN_DIR, goldenBlock, goldenCases, goldenFile, goldenHeader, manifestLine, MANIFEST_COLUMNS, UPSTREAM_COMMIT } from './cases'

const root = process.env.HTN_REPO_ROOT ?? process.cwd()
const argv = process.argv.slice(2)
const exportOnly = argv.includes('--export-only')
const savedOutput = argv.includes('--driver-output') ? argv[argv.indexOf('--driver-output') + 1] : undefined

const { cases, uncovered } = goldenCases(root)
const dir = join(root, GOLDEN_DIR)
rmSync(join(dir, 'worlds'), { recursive: true, force: true })
mkdirSync(join(dir, 'worlds'), { recursive: true })
for (const c of cases) if (c.worldstate.startsWith('scene:')) writeFileSync(join(root, c.worldstate.slice(6)), c.worldText)
const manifest = join(dir, 'manifest.tsv')
writeFileSync(
  manifest,
  [
    `# Golden-plan cases for urosidoki/htn_planner@${UPSTREAM_COMMIT}, written by npm run htn:golden.`,
    `# ${MANIFEST_COLUMNS.join('\t')}`,
    ...cases.map(manifestLine),
    ''
  ].join('\n')
)
console.log(`${cases.length} cases, ${uncovered.length} scenarios not covered:`)
const reasons = new Map<string, number>()
for (const u of uncovered) reasons.set(u.reason, (reasons.get(u.reason) ?? 0) + 1)
for (const [reason, n] of [...reasons].sort((a, b) => b[1] - a[1])) console.log(`  ${n} × ${reason}`)
if (exportOnly) process.exit(0)

/** A Windows path as WSL sees it (C:\a\b → /mnt/c/a/b). */
const wslPath = (p: string) => p.replace(/^([A-Za-z]):/, (_, d: string) => `/mnt/${d.toLowerCase()}`).replace(/\\/g, '/')

let output: string
if (savedOutput) output = readFileSync(savedOutput, 'utf8')
else {
  const script = join(root, 'tools/upstream-golden/build.sh')
  const windows = process.platform === 'win32'
  const command = windows ? 'wsl' : 'bash'
  const quote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`
  const args = windows
    ? ['-d', process.env.HTN_WSL_DISTRO ?? 'Ubuntu-24.04', '--', 'bash', '-lc', `bash ${quote(wslPath(script))} ${quote(wslPath(manifest))} --run`]
    : [script, manifest, '--run']
  const r = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'inherit'] })
  if (r.status !== 0) {
    console.error(`upstream build or run failed (exit ${r.status})`)
    process.exit(1)
  }
  output = r.stdout.replace(/\0/g, '')
}

const blocks = new Map<string, string[]>()
let current: string[] | null = null
for (const line of output.split(/\r?\n/)) {
  if (line.startsWith('=== ')) blocks.set(line.slice(4), (current = []))
  // Upstream's Debug logging (HTN_ENABLE_LOGGING) prints to stdout during planning, before the status line.
  else if (current && line !== '') current.push(current.some(l => l.startsWith('status: ')) || line.startsWith('status: ') ? line : `# upstream log: ${line}`)
}

const byStation = new Map<string, string[]>()
const missing: string[] = []
const differ: string[] = []
for (const c of cases) {
  const lines = blocks.get(c.id)
  if (!lines) {
    missing.push(c.id)
    continue
  }
  const station = byStation.get(c.station) ?? []
  station.push(goldenBlock(c, lines))
  byStation.set(c.station, station)
  const ours = c.ours()
  const theirs = lines.filter(l => !l.startsWith('# upstream log: '))
  const mine = [`status: ${ours.status}`, ...ours.steps, ...ours.calltermErrors.map(e => `# callterm error: ${e}`)]
  if (JSON.stringify(mine) !== JSON.stringify(theirs)) differ.push(c.id)
}
for (const f of readdirSync(dir)) if (f.endsWith('.golden.txt')) rmSync(join(dir, f))
for (const [station, text] of byStation) writeFileSync(join(root, goldenFile(station)), goldenHeader(station) + '\n' + text.join('\n'))
console.log(`wrote ${byStation.size} golden files; ${cases.length - missing.length - differ.length} match our planner, ${differ.length} differ`)
for (const id of differ) console.log(`  differs: ${id}`)
if (missing.length) {
  console.error(`no driver output for: ${missing.join(', ')}`)
  process.exit(1)
}
