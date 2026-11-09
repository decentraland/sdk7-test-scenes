// npm run htn:lint -- <file.domain|dir>... [--json] [--rule <id>]... [--config <file> | --no-config] [--strict]
//                    [--verbose] [--no-metrics] [--list-rules] [--update-baseline]
// Exit: 0 clean or warnings only, 1 errors (or warnings with --strict), 2 usage or a bad config. Run by
// scripts/htn-lint.mjs (bundled with esbuild). The library is tools/lint/lint.ts; the rules docs/htn-lint.md.
import * as fs from 'node:fs'
import * as nodePath from 'node:path'
import { parseConfig } from './config'
import type { LintConfig } from './config'
import { collectFiles, displayPath, lintFiles, reportText } from './lint'
import type { LintReport } from './lint'
import { RULE_CAPS, RULE_IDS, RULES } from './rules'

export const LINT_USAGE = `usage: npm run htn:lint -- <file.domain|dir>... [options]
Lints HTN domains in layers, cheapest first: compile (htn:compile --check), symbols, structure.
A directory lints every top_level_domain file under it (includes are linted through their roots); the roots of one
run are also compared with each other (duplicated-across-domains).
  --json              one JSON object (LintReport, "version" ${1}): findings with rule, severity, file/line/col, message,
                      why, fix; per domain the shape metrics; the summary
  --rule <id>         only this rule (repeatable, or comma-separated); compile errors are always reported
  --config <file>     lint config (JSON); default: htn-lint.json in the scene folder, if present
  --no-config         rule defaults only
  --strict            warnings fail too (exit 1)
  -v, --verbose       text: also each finding's why and related places
  --no-metrics        text: no per-domain metrics lines
  --list-rules        the rules with their layer, default severity and options
  --update-baseline   rewrite ${'test/tools/htn-lint.baseline.json'} (the shipped domains' finding counts)
Exit: 0 clean or warnings only, 1 errors (or warnings with --strict), 2 usage or config error.`

export const EXIT_OK = 0
export const EXIT_FINDINGS = 1
export const EXIT_USAGE = 2

/** The shipped domains the baseline covers, relative to the scene folder. */
export const BASELINE_PATHS = ['src/examples', 'test/fixtures/reference', 'test/htn/fixtures/upstream']
export const BASELINE_FILE = 'test/tools/htn-lint.baseline.json'
export const DEFAULT_CONFIG = 'htn-lint.json'

export interface CliIO {
  out: (text: string) => void
  err: (text: string) => void
  cwd: string // where paths resolve (the caller's folder)
  sceneRoot: string // the scene folder: default config, baseline
}

interface Args {
  paths: string[]
  json: boolean
  rules: string[]
  config?: string
  noConfig: boolean
  strict: boolean
  verbose: boolean
  metrics: boolean
  listRules: boolean
  updateBaseline: boolean
  help: boolean
}

function parseArgs(argv: readonly string[]): Args | { error: string } {
  const a: Args = { paths: [], json: false, rules: [], noConfig: false, strict: false, verbose: false, metrics: true, listRules: false, updateBaseline: false, help: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const value = () => (i + 1 < argv.length && !argv[i + 1].startsWith('--') ? argv[++i] : undefined)
    if (arg === '--json') a.json = true
    else if (arg === '--strict') a.strict = true
    else if (arg === '-v' || arg === '--verbose') a.verbose = true
    else if (arg === '--no-metrics') a.metrics = false
    else if (arg === '--no-config') a.noConfig = true
    else if (arg === '--list-rules') a.listRules = true
    else if (arg === '--update-baseline') a.updateBaseline = true
    else if (arg === '-h' || arg === '--help') a.help = true
    else if (arg === '--rule') {
      const v = value()
      if (!v) return { error: '--rule needs a rule id' }
      a.rules.push(...v.split(',').filter(Boolean))
    } else if (arg === '--config') {
      const v = value()
      if (!v) return { error: '--config needs a file' }
      a.config = v
    } else if (arg.startsWith('-')) return { error: `unknown option ${arg}` }
    else a.paths.push(arg)
  }
  for (const r of a.rules) if (!RULE_IDS.has(r) && r !== 'compile') return { error: `unknown rule '${r}' (npm run htn:lint -- --list-rules)` }
  if (a.config && a.noConfig) return { error: '--config and --no-config together' }
  return a
}

/** Load the config: an explicit file (must exist), else the scene's default if present. */
export function loadConfig(path: string | undefined, noConfig: boolean, io: CliIO): { ok: true; config: LintConfig | null } | { ok: false; error: string } {
  if (noConfig) return { ok: true, config: null }
  const abs = path ? nodePath.resolve(io.cwd, path) : nodePath.join(io.sceneRoot, DEFAULT_CONFIG)
  let text: string
  try {
    text = fs.readFileSync(abs, 'utf8')
  } catch {
    return path ? { ok: false, error: `cannot read config '${path}'` } : { ok: true, config: null }
  }
  return parseConfig(text, nodePath.dirname(abs), displayPath(io.cwd, abs), RULE_IDS, RULE_CAPS)
}

/** Finding counts per file and rule plus the metrics: the baseline's content (deterministic, no timings). */
export function baselineOf(r: LintReport): Record<string, unknown> {
  // Per file (a root, or an include a finding is in): findings by rule, each finding once; a root's metrics.
  const files: Record<string, { domain?: string | null; stoppedAt?: string | null; byRule: Record<string, number>; metrics?: unknown }> = {}
  for (const f of r.files) files[f.file] = { domain: f.domain, stoppedAt: f.stoppedAt, byRule: {}, metrics: f.metrics }
  for (const f of r.findings) {
    const entry = (files[f.file] ??= { byRule: {} })
    entry.byRule[f.rule] = (entry.byRule[f.rule] ?? 0) + 1
  }
  const { ms: _ms, ...summary } = r.summary
  return { version: r.version, paths: BASELINE_PATHS, summary, files }
}

export function runCli(argv: readonly string[], io: CliIO): number {
  const args = parseArgs(argv)
  if ('error' in args) {
    io.err(`htn:lint: ${args.error}`)
    io.err(LINT_USAGE)
    return EXIT_USAGE
  }
  if (args.help) {
    io.out(LINT_USAGE)
    return EXIT_OK
  }
  if (args.listRules) {
    for (const r of RULES)
      io.out(`${r.id}  ${r.layer}  ${r.severity}${r.cap ? ` (at most ${r.cap.max})` : ''}${Object.keys(r.options).length ? `  ${JSON.stringify(r.options)}` : ''}\n  ${r.why}`)
    return EXIT_OK
  }
  const loaded = loadConfig(args.config, args.noConfig, io)
  if (!loaded.ok) {
    io.err(`htn:lint: ${loaded.error}`)
    return EXIT_USAGE
  }
  if (args.updateBaseline) {
    const cwd = io.sceneRoot
    const files = collectFiles(BASELINE_PATHS, cwd)
    if (!files.ok) {
      io.err(`htn:lint: ${files.error}`)
      return EXIT_USAGE
    }
    const report = lintFiles(files.roots, { cwd, config: loaded.config }, files.skipped)
    fs.writeFileSync(nodePath.join(cwd, BASELINE_FILE), JSON.stringify(baselineOf(report), null, 2) + '\n')
    io.out(`htn:lint: wrote ${BASELINE_FILE} (${report.summary.files} domains, ${report.findings.length} findings)`)
    return EXIT_OK
  }
  if (!args.paths.length) {
    io.err('htn:lint: name at least one .domain file or folder')
    io.err(LINT_USAGE)
    return EXIT_USAGE
  }
  const files = collectFiles(args.paths, io.cwd)
  if (!files.ok) {
    io.err(`htn:lint: ${files.error}`)
    return EXIT_USAGE
  }
  const report = lintFiles(files.roots, { cwd: io.cwd, config: loaded.config, only: args.rules.length ? args.rules : null }, files.skipped)
  if (args.json) io.out(JSON.stringify(report))
  else io.out(reportText(report, { verbose: args.verbose, metrics: args.metrics }).replace(/\n$/, ''))
  const s = report.summary
  return s.errors || (args.strict && s.warnings) ? EXIT_FINDINGS : EXIT_OK
}
