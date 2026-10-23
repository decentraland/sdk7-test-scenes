// Repository-only release measurement driver. Every row/repeat has its own Node process/JIT.
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { WORKLOADS, PERF_DEFAULTS, distribution, measureWorkload, type PerfRow, type WorkloadName } from './bench/execution'

const args = process.argv.slice(2)
const usage = 'Usage: npm run htn:perf -- [--json FILE] [--repeats 1..5] [--samples 1..1000] [--warmup 1..1000] [--batch 1..64] [--case NAME]\n' + WORKLOADS.join(', ')
const root = process.env.HTN_REPO_ROOT ?? process.cwd()
function main() {
  if (args.includes('--help')) { console.log(usage); return }
  const options = { ...PERF_DEFAULTS }
  let repeats = 3, output: string | undefined, selected: WorkloadName | undefined, worker: WorkloadName | undefined
  for (let i = 0; i < args.length; i++) {
    const flag = args[i], value = args[++i]
    if (!value) throw new Error(usage)
    if (flag === '--json') output = path.resolve(value)
    else if (flag === '--case' || flag === '--worker') {
      if (!(WORKLOADS as readonly string[]).includes(value)) throw new Error('unknown workload ' + value)
      if (flag === '--case') selected = value as WorkloadName
      else worker = value as WorkloadName
    } else {
      const n = Number(value)
      const max = flag === '--repeats' ? 5 : flag === '--batch' ? 64 : 1000
      if (!Number.isInteger(n) || n < 1 || n > max) throw new Error('invalid ' + flag)
      if (flag === '--repeats') repeats = n
      else if (flag === '--samples') options.samples = n
      else if (flag === '--warmup') options.warmup = n
      else if (flag === '--batch') options.batch = n
      else throw new Error('unknown option ' + flag)
    }
  }
  if (worker) { console.log(JSON.stringify(measureWorkload(worker, options))); return }
  const git = (argv: string[]) => {
    const r = spawnSync('git', ['-C', root, ...argv], { encoding: 'utf8', windowsHide: true })
    return r.status === 0 ? r.stdout.trim() : null
  }
  const implementation = createHash('sha256')
  for (const folder of ['src/htn-planner', 'src/examples/upstream/generated', 'src/examples/guard', 'scripts/bench']) {
    const visit = (dir: string) => {
      for (const item of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        const file = path.join(dir, item.name)
        if (item.isDirectory()) visit(file)
        else { implementation.update(path.relative(root, file).replace(/\\/g, '/')); implementation.update(fs.readFileSync(file)) }
      }
    }
    visit(path.join(root, folder))
  }
  implementation.update(fs.readFileSync(path.join(root, 'scripts/htn-perf.ts')))
  implementation.update(fs.readFileSync(path.join(root, 'scripts/htn-perf.mjs')))
  const rows: { name: WorkloadName; repeats: PerfRow[]; cold: ReturnType<typeof distribution>; warm: ReturnType<typeof distribution> }[] = []
  const deadline = Date.now() + 90000
  for (const name of selected ? [selected] : WORKLOADS) {
    const runs: PerfRow[] = []
    for (let repeat = 0; repeat < repeats; repeat++) {
      const remaining = deadline - Date.now()
      if (remaining <= 0) throw new Error('90-second report limit reached; select one --case or reduce samples/batch')
      const child = spawnSync(process.execPath, [process.argv[1], '--worker', name, '--samples', String(options.samples), '--warmup', String(options.warmup), '--batch', String(options.batch)], {
        encoding: 'utf8', windowsHide: true, timeout: Math.min(15000, remaining), maxBuffer: 8 * 1024 * 1024
      })
      if (child.error || child.status !== 0) throw new Error(name + ': ' + (child.error?.message ?? child.stderr))
      runs.push(JSON.parse(child.stdout) as PerfRow)
    }
    // Median of repeat percentiles; preserve all raw samples instead of pooling JIT populations.
    const median = (values: number[]) => distribution(values).p50
    const warm = { p50: median(runs.map(r => r.warm.p50)), p95: median(runs.map(r => r.warm.p95)), p99: median(runs.map(r => r.warm.p99)), max: median(runs.map(r => r.warm.max)), mean: median(runs.map(r => r.warm.mean)) }
    rows.push({ name, repeats: runs, cold: distribution(runs.map(r => r.coldUs)), warm })
  }
  const report = { kind: 'htn-release-cpu', version: 1, created: new Date().toISOString(),
    source: { commit: git(['rev-parse', 'HEAD']), dirty: git(['status', '--porcelain', '--', '.']) !== '', implementation: implementation.digest('hex') },
    machine: { node: process.version, v8: process.versions.v8, platform: process.platform, arch: process.arch, os: os.release(), cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length },
    config: { ...options, repeats, trace: false, stats: false, history: false, timer: 'performance.now wall elapsed; not process.cpuUsage', timeoutMs: 90000 },
    units: 'microseconds per operation; warm percentiles of batch means, median across repeats; cold one operation per fresh process', rows }
  if (output) { fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n') }
  console.log('HTN Node elapsed CPU-work measurements (us/operation; warm batch means; no Explorer/FPS claim)')
  console.log('workload                  cold median       warm p50       warm p95       warm p99')
  for (const r of rows) console.log(r.name.padEnd(25) + [r.cold.p50, r.warm.p50, r.warm.p95, r.warm.p99].map(v => v.toFixed(3).padStart(15)).join(''))
  if (output) console.log('Raw report: ' + output)
}
try { main() } catch (error) { console.error((error as Error).message); process.exitCode = 2 }