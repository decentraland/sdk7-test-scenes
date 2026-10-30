// htn:lint: compile, symbol and structure checks, cheapest first. Public reference: docs/htn-lint.md.
import * as fs from 'node:fs'
import * as nodePath from 'node:path'
import { compileWithModules } from '../htn/compiler'
import type { Diagnostic } from '../htn/diagnostics'
import { bookkeepingMatcher, effectiveConfig } from './config'
import type { EffectiveConfig, LintConfig, Severity } from './config'
import { domainMetrics, duplicatedTails } from './metrics'
import type { DomainMetrics } from './metrics'
import { buildModel } from './model'
import { RULE_IDS, RULES, ruleDefaults } from './rules'
import type { Layer, Place, RawFinding } from './rules'
import type { CorpusDomain } from './corpus'
import type { Loc } from '../htn/diagnostics'
import { parseSuppressions } from './suppress'
import type { Suppressions } from './suppress'

export const LINT_REPORT_VERSION = 1

export interface Location {
  file: string
  line: number
  col: number
  endLine: number
  endCol: number
  domain?: string
  method?: string // name/arity
  branch?: string
}

export interface Finding extends Location {
  rule: string // a rule id, or compile/<diagnostic code>
  layer: Layer | 'meta'
  severity: Severity
  message: string // what was found
  why: string // why it matters, with where the evidence is
  fix: string // a concrete suggested fix
  related?: Location[]
  data?: Record<string, unknown>
}

export interface FileResult {
  file: string
  domain: string | null
  includes: string[]
  layers: Layer[] // the layers that ran
  stoppedAt: Layer | null // the layer whose errors stopped the rest
  metrics: DomainMetrics | null // null when the domain did not compile
  counts: { errors: number; warnings: number; infos: number; suppressed: number }
}

export interface LintReport {
  version: number
  tool: 'htn-lint'
  config: string | null
  rules: string[] | null // the --rule filter
  files: FileResult[]
  skipped: { file: string; reason: string }[]
  findings: Finding[]
  summary: { files: number; errors: number; warnings: number; infos: number; suppressed: number; ms: number }
}

export interface LintOptions {
  cwd: string
  config: LintConfig | null
  /** Run only these rules (ids); compile errors are always reported, they stop the other layers. */
  only?: string[] | null
  readFile?: (path: string) => string
}

const COMPILE_WHY = 'The domain must parse, validate and link before its shape means anything.'
const COMPILE_FIX: Record<string, string> = {
  'unknown-method': 'declare the method (name and arity must match), fix the call\'s spelling or argument count, or include the file that declares it',
  'unknown-axiom': 'declare the axiom with (:axiom ...) (name and arity must match), fix the spelling, or include the file that declares it',
  'unknown-constant': 'declare it in a (:constants ...) group, or write the literal value',
  'arity-mismatch': 'call it with as many arguments as its declaration has parameters',
  'duplicate-signature': 'rename one of the two, or mark the first `base` and the second `overrides <Domain>`',
  'unknown-variable': 'bind the variable in the branch condition before a task uses it, or make it a method parameter',
  'no-top-level-method': 'mark the entry method `top_level_method`',
  'root-not-top-level': 'mark the root domain `top_level_domain`, or lint the file that includes this one',
  'discard-consumed': 'name the variable normally (?moves, not ?any_moves): a ?any_ discard is never bound',
  'arithmetic-argument': 'assign the expression first, (= ?value (+ ?x 1)), then use ?value'
}

const slash = (p: string) => p.split(nodePath.sep).join('/')
export const displayPath = (cwd: string, abs: string) => slash(nodePath.relative(cwd, abs)) || slash(abs)

function compileFinding(d: Diagnostic, cwd: string): Finding {
  return {
    rule: `compile/${d.code}`,
    layer: 'compile',
    severity: d.severity,
    file: displayPath(cwd, nodePath.resolve(cwd, d.file)),
    line: d.line,
    col: d.col,
    endLine: d.endLine,
    endCol: d.endCol,
    message: d.message,
    why: COMPILE_WHY,
    fix: COMPILE_FIX[d.code] ?? 'fix it as the message says (npm run htn:compile -- --check <file> reports the same)'
  }
}

/** What the rules over the whole run (runCorpus) need of one root domain that reached its structure layer. */
export interface CorpusEntry extends CorpusDomain {
  rules: EffectiveConfig['rules']
  place(p: Place): Location
  suppressed(rule: string, loc: Loc): boolean
}

/** Lint one root domain file (absolute path). `corpus`: set when the structure layer ran (no error stopped it). */
export function lintFile(abs: string, opts: LintOptions): { result: FileResult; findings: Finding[]; corpus?: CorpusEntry } {
  const readFile = opts.readFile ?? ((p: string) => fs.readFileSync(p, 'utf8'))
  const config: EffectiveConfig = effectiveConfig(ruleDefaults(), opts.config, abs)
  const only = opts.only ? new Set(opts.only) : null
  const file = displayPath(opts.cwd, abs)
  const texts = new Map<string, string>()
  const read = (p: string) => {
    const text = readFile(p)
    texts.set(slash(nodePath.resolve(p)), text)
    return text
  }
  const result: FileResult = { file, domain: null, includes: [], layers: ['compile'], stoppedAt: null, metrics: null, counts: { errors: 0, warnings: 0, infos: 0, suppressed: 0 } }
  const findings: Finding[] = []
  const finish = () => {
    for (const f of findings) {
      if (f.severity === 'error') result.counts.errors++
      else if (f.severity === 'warning') result.counts.warnings++
      else result.counts.infos++
    }
    return { result, findings }
  }

  let source: string
  try {
    source = read(abs)
  } catch (e) {
    findings.push({ ...compileFinding({ severity: 'error', recovery: 'fatal', code: 'file-not-found', message: `Could not read domain '${file}'`, file: abs, line: 1, col: 1, endLine: 1, endCol: 1 }, opts.cwd) })
    result.stoppedAt = 'compile'
    return finish()
  }
  const compiled = compileWithModules(abs, source, { readFile: read, checkMethods: config.checkMethods })
  for (const d of compiled.result.diagnostics) if (d.severity === 'error' || !only || only.has('compile')) findings.push(compileFinding(d, opts.cwd))
  if (compiled.modules.length) {
    const root = compiled.modules[compiled.modules.length - 1]
    result.domain = root.name
    result.includes = compiled.files.slice(0, -1).map(f => displayPath(opts.cwd, nodePath.resolve(f)))
  }
  if (!compiled.result.ok) {
    result.stoppedAt = 'compile'
    return finish()
  }

  const model = buildModel(compiled.modules, compiled.files)
  const bookkeeping = bookkeepingMatcher(config)
  const tails = duplicatedTails(model, 2)
  result.metrics = domainMetrics(model, bookkeeping, tails.filter(g => g.heads.length >= 3))
  const suppressions = new Map<string, Suppressions>()
  const suppressionsOf = (absFile: string) => {
    const key = slash(absFile)
    let s = suppressions.get(key)
    if (!s) {
      s = parseSuppressions(texts.get(key) ?? '', RULE_IDS)
      suppressions.set(key, s)
      for (const b of s.bad)
        findings.push({
          rule: 'bad-suppression',
          layer: 'meta',
          severity: 'warning',
          file: displayPath(opts.cwd, absFile),
          line: b.line,
          col: b.col,
          endLine: b.line,
          endCol: b.col,
          message: `htn-lint comment names unknown rule '${b.id}'`,
          why: 'A suppression that names no rule suppresses nothing and hides the intent.',
          fix: `use a rule id from docs/htn-lint.md (${[...RULE_IDS].slice(0, 4).join(', ')}, ...)`
        })
    }
    return s
  }
  const absOf = (fileIndex: number) => nodePath.resolve(compiled.files[fileIndex] ?? abs)
  compiled.files.forEach((_, i) => suppressionsOf(absOf(i))) // every file's directives: a bad one is reported anyway
  const place = (p: Place): Location => ({
    file: displayPath(opts.cwd, absOf(p.loc.file)),
    line: p.loc.line,
    col: p.loc.col,
    endLine: p.loc.endLine ?? p.loc.line,
    endCol: p.loc.endCol ?? p.loc.col,
    ...(p.method ? { domain: p.method.module.name, method: p.method.sig } : {}),
    ...(p.branch !== undefined ? { branch: p.branch } : {})
  })
  for (const layer of ['symbols', 'structure'] as const) {
    result.layers.push(layer)
    let errors = 0
    for (const rule of RULES) {
      if (rule.layer !== layer || !rule.run) continue
      const rc = config.rules[rule.id]
      if (rc.severity === 'off' || (only && !only.has(rule.id))) continue
      const raw: RawFinding[] = rule.run({ model, config, options: rc.options, bookkeeping, tails, source: i => texts.get(slash(absOf(i))) ?? '' })
      for (const r of raw) {
        if (suppressionsOf(absOf(r.loc.file)).covers(rule.id, r.loc.line)) {
          result.counts.suppressed++
          continue
        }
        const f: Finding = {
          rule: rule.id,
          layer,
          severity: rc.severity,
          ...place(r),
          message: r.message,
          why: rule.why,
          fix: r.fix,
          ...(r.related?.length ? { related: r.related.map(place) } : {}),
          ...(r.data ? { data: r.data } : {})
        }
        findings.push(f)
        if (f.severity === 'error') errors++
      }
    }
    if (errors) {
      result.stoppedAt = layer
      break
    }
  }
  if (result.stoppedAt) return finish()
  const corpus: CorpusEntry = { model, absOf, place, rules: config.rules, suppressed: (rule, loc) => suppressionsOf(absOf(loc.file)).covers(rule, loc.line) }
  return { ...finish(), corpus }
}

const SKIP_DIRS = new Set(['node_modules', '.git', '.test-build', 'bin'])

function walk(dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = nodePath.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(p, out)
    } else if (entry.name.endsWith('.domain')) out.push(p)
  }
}

/** Does the source (comments stripped) declare a top_level_domain? A directory lints only those as roots. */
export function isRootDomain(text: string): boolean {
  return /\(\s*:domain\s+[^\s()]+[^()]*\btop_level_domain\b/.test(text.replace(/\/\/[^\n]*/g, ''))
}

/** The root files a list of file / directory arguments names; a missing path is an error result. */
export function collectFiles(paths: string[], cwd: string): { ok: true; roots: string[]; skipped: { file: string; reason: string }[] } | { ok: false; error: string } {
  const roots: string[] = []
  const skipped: { file: string; reason: string }[] = []
  for (const p of paths) {
    const abs = nodePath.resolve(cwd, p)
    let stat: fs.Stats
    try {
      stat = fs.statSync(abs)
    } catch {
      return { ok: false, error: `no such file or directory: ${p}` }
    }
    if (!stat.isDirectory()) {
      roots.push(abs)
      continue
    }
    const found: string[] = []
    walk(abs, found)
    for (const f of found) {
      let text = ''
      try {
        text = fs.readFileSync(f, 'utf8')
      } catch {
        // unreadable: linting it reports file-not-found
      }
      if (isRootDomain(text) || !text) roots.push(f)
      else skipped.push({ file: displayPath(cwd, f), reason: 'not a top_level_domain (an include): linted through the roots that include it' })
    }
  }
  return { ok: true, roots: [...new Set(roots)], skipped }
}

/**
 * The rules over the whole run (duplicated-across-domains): over every root whose structure layer ran and for which
 * the rule is not off. Severity and suppressions are those of the root a finding is reported in; options come from
 * the config's top level. Each finding is counted in that root's `counts`.
 */
function lintCorpus(entries: { entry: CorpusEntry; result: FileResult }[], opts: LintOptions): Finding[] {
  const out: Finding[] = []
  const only = opts.only ? new Set(opts.only) : null
  const top = effectiveConfig(ruleDefaults(), opts.config ? { ...opts.config, overrides: [] } : null, '')
  for (const rule of RULES) {
    if (!rule.runCorpus || (only && !only.has(rule.id))) continue
    const part = entries.filter(e => e.entry.rules[rule.id].severity !== 'off')
    if (part.length < 2) continue
    for (const r of rule.runCorpus(part.map(e => e.entry), top.rules[rule.id].options)) {
      const home = part[r.at ?? 0]
      if (home.entry.suppressed(rule.id, r.loc)) {
        home.result.counts.suppressed++
        continue
      }
      const severity = home.entry.rules[rule.id].severity as Severity
      const placeIn = (p: Place) => part[p.at ?? 0].entry.place(p)
      out.push({
        rule: rule.id,
        layer: rule.layer,
        severity,
        ...placeIn(r),
        message: r.message,
        why: rule.why,
        fix: r.fix,
        ...(r.related?.length ? { related: r.related.map(placeIn) } : {}),
        ...(r.data ? { data: r.data } : {})
      })
      if (severity === 'error') home.result.counts.errors++
      else if (severity === 'warning') home.result.counts.warnings++
      else home.result.counts.infos++
    }
  }
  const kindOrder = (f: Finding) => (f.data?.kind === 'method' ? 0 : 1)
  return out.sort((a, b) => kindOrder(a) - kindOrder(b) || a.file.localeCompare(b.file) || a.line - b.line || a.col - b.col)
}

/** Lint root files; a finding in an include shared by several roots is reported once (summary counts). */
export function lintFiles(roots: string[], opts: LintOptions, skipped: { file: string; reason: string }[] = []): LintReport {
  const start = performance.now()
  const files: FileResult[] = []
  const findings: Finding[] = []
  const corpus: { entry: CorpusEntry; result: FileResult }[] = []
  const seen = new Set<string>()
  for (const abs of roots) {
    const r = lintFile(abs, opts)
    files.push(r.result)
    if (r.corpus) corpus.push({ entry: r.corpus, result: r.result })
    for (const f of r.findings) {
      const key = [f.rule, f.file, f.line, f.col, f.endLine, f.endCol, f.message].join('|')
      if (seen.has(key)) continue
      seen.add(key)
      findings.push(f)
    }
  }
  findings.push(...lintCorpus(corpus, opts))
  const count = (s: Severity) => findings.filter(f => f.severity === s).length
  return {
    version: LINT_REPORT_VERSION,
    tool: 'htn-lint',
    config: opts.config?.source ?? null,
    rules: opts.only ?? null,
    files,
    skipped,
    findings,
    summary: {
      files: files.length,
      errors: count('error'),
      warnings: count('warning'),
      infos: count('info'),
      suppressed: files.reduce((n, f) => n + f.counts.suppressed, 0),
      ms: Math.round(performance.now() - start)
    }
  }
}

const pct = (x: number) => `${Math.round(x * 100)}%`

/** One line of shape metrics, using the public definitions in docs/htn-lint.md. */
export function metricsLine(m: DomainMetrics): string {
  return [
    `methods ${m.methods} (top ${m.topMethods})`,
    `branches ${m.branches} (top ${m.topBranches}; per method avg ${m.branchesPerMethod.avg}, max ${m.branchesPerMethod.max})`,
    `depth ${m.depth}`,
    `1-step ${m.oneStepBranches} (${pct(m.oneStepShare)}; top ${m.oneStepTopBranches})`,
    `primitive-only top ${m.primitiveOnlyTopBranches} (${pct(m.primitiveOnlyTopShare)})`,
    `bookkeeping ${m.bookkeepingOccurrences}/${m.primitiveOccurrences} prims (${pct(m.bookkeepingShare)}; top branches ${m.bookkeepingTopBranches})`,
    `duplicated tails ${m.duplicatedTails}${m.duplicatedTails ? ` (longest ${m.longestDuplicatedTail})` : ''}`
  ].join(', ')
}

const where = (l: Location) => (l.method ? ` ${l.domain}::${l.method}${l.branch !== undefined ? `.${l.branch}` : ''}` : '')

/** Compact text: per finding `file:line:col: severity rule [where]: message`, then `  fix:` (and `  why:` with verbose). */
export function reportText(r: LintReport, opts: { verbose?: boolean; metrics?: boolean } = {}): string {
  const out: string[] = []
  for (const f of r.findings) {
    out.push(`${f.file}:${f.line}:${f.col}: ${f.severity} ${f.rule}${where(f)}: ${f.message}`)
    if (opts.verbose) out.push(`  why: ${f.why}`)
    out.push(`  fix: ${f.fix}`)
    if (opts.verbose) for (const rel of f.related ?? []) out.push(`  see: ${rel.file}:${rel.line}:${rel.col}${where(rel)}`)
  }
  if (opts.metrics !== false)
    for (const f of r.files) {
      const head = `${f.domain ?? '?'} (${f.file})`
      out.push(f.metrics ? `${head}: ${metricsLine(f.metrics)}` : `${head}: no metrics (stopped at ${f.stoppedAt})`)
    }
  const s = r.summary
  out.push(`htn:lint: ${s.files} domain(s), ${s.errors} error(s), ${s.warnings} warning(s), ${s.infos} info(s)${s.suppressed ? `, ${s.suppressed} suppressed` : ''}, ${s.ms} ms`)
  return out.join('\n') + '\n'
}
