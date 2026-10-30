// htn:lint configuration: per-rule severity and options, the host's bookkeeping primitives, check methods, the host's
// primitive list, and per-path overrides. A JSON file (the scene's `htn-lint.json` by default, `--config <file>`):
//   {
//     "rules": { "max-branches": { "top": 8 }, "no-fallback": "off" },   // "off" | severity | { severity?, ...options }
//     "bookkeeping": ["!forget", "!set_waypoint"],                         // merged over layers; see bookkeepingMatcher
//     "checkMethods": ["active_plan"],                                     // validators: no fallback by design
//     "primitives": ["!move_to", "!wait"],                                 // enables unknown-primitive
//     "overrides": [{ "files": ["test/fixtures/**"], "rules": { ... }, ... }]  // later entries win
//   }
// Paths in `files` are globs relative to the config file's folder (`*`, `**`, `?`). Nothing here throws: a bad file
// is an error result.
import * as nodePath from 'node:path'

export type Severity = 'error' | 'warning' | 'info'
export type RuleSetting = 'off' | Severity | ({ severity?: 'off' | Severity } & Record<string, unknown>)

export interface ConfigLayer {
  rules?: Record<string, RuleSetting>
  bookkeeping?: string[]
  checkMethods?: string[]
  primitives?: string[] | null
}

export interface LintConfig extends ConfigLayer {
  overrides?: (ConfigLayer & { files: string[] })[]
  /** Folder the override globs are relative to (the config file's folder). */
  baseDir?: string
  /** Display path of the file it came from; null for the defaults. */
  source?: string | null
}

/** One rule as configured for one file: its severity ('off' = not run) and options (defaults merged in). */
export interface RuleConfig {
  severity: 'off' | Severity
  options: Record<string, unknown>
}

export interface EffectiveConfig {
  rules: Record<string, RuleConfig>
  bookkeeping: string[]
  checkMethods: string[]
  primitives: string[] | null
}

/**
 * The fallback for primitives the host has not classified: memory / focus bookkeeping by name. The original inventory list
 * ("Method") minus the names that are actions elsewhere: `!set_*` (upstream AAACombatNPC's `!set_cautious_stance`),
 * `!clear_*` (its `!clear_cover`, `!clear_weapon_jam`) and `!watch` (a verb of looking; the stalker's `!watch` is a
 * perception switch, so the stalker declares it). Declare bookkeeping in the config instead of relying on this.
 */
export const FALLBACK_BOOKKEEPING = ['!forget*', '!remember*', '!unfocus', '!refocus']

/**
 * Is this primitive bookkeeping (belief / state upkeep, not an action)? Declared names (`bookkeeping`, merged over
 * the config's layers) are; a host that declares both its `primitives` and its `bookkeeping` has classified every
 * one of its primitives, so the others are actions; anything else falls back to FALLBACK_BOOKKEEPING by name.
 */
export function bookkeepingMatcher(config: Pick<EffectiveConfig, 'bookkeeping' | 'primitives'>): (head: string) => boolean {
  const declared = nameMatcher(config.bookkeeping)
  const classified = config.primitives && config.bookkeeping.length ? nameMatcher(config.primitives) : () => false
  const fallback = nameMatcher(FALLBACK_BOOKKEEPING)
  return head => declared(head) || (!classified(head) && fallback(head))
}

const SEVERITIES = new Set(['off', 'error', 'warning', 'info'])
const RANK: Record<string, number> = { off: 0, info: 1, warning: 2, error: 3 }

/** Per rule id, the highest severity a config may give it and why (max-branches: a smell, never an error). */
export type SeverityCaps = Readonly<Record<string, { max: Severity; why: string }>>

/** A glob over names or paths: `*` any run without '/', `**` any run, `?` one character. Case-sensitive. */
export function globRegex(glob: string): RegExp {
  let re = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*' && glob[i + 1] === '*') {
      i++
      if (glob[i + 1] === '/') {
        i++
        re += '(?:.*/)?'
      } else re += '.*'
    } else if (c === '*') re += '[^/]*'
    else if (c === '?') re += '[^/]'
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${re}$`)
}

export function nameMatcher(patterns: readonly string[]): (name: string) => boolean {
  const res = patterns.map(globRegex)
  return name => res.some(r => r.test(name))
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isStringList = (v: unknown): v is string[] => Array.isArray(v) && v.every(s => typeof s === 'string')

function checkLayer(layer: Record<string, unknown>, where: string, knownRules: ReadonlySet<string>, caps: SeverityCaps): string | null {
  for (const key of Object.keys(layer)) {
    if (!['rules', 'bookkeeping', 'checkMethods', 'primitives', 'overrides', 'files'].includes(key)) return `${where}: unknown key '${key}'`
  }
  if (layer.rules !== undefined) {
    if (!isRecord(layer.rules)) return `${where}.rules: expected an object`
    for (const [id, setting] of Object.entries(layer.rules)) {
      if (!knownRules.has(id)) return `${where}.rules: unknown rule '${id}'`
      if (typeof setting === 'string') {
        if (!SEVERITIES.has(setting)) return `${where}.rules.${id}: expected off, error, warning or info`
      } else if (isRecord(setting)) {
        if (setting.severity !== undefined && !SEVERITIES.has(String(setting.severity))) return `${where}.rules.${id}.severity: expected off, error, warning or info`
      } else return `${where}.rules.${id}: expected a severity or an object`
      const severity = typeof setting === 'string' ? setting : String(setting.severity ?? 'off')
      const cap = caps[id]
      if (cap && RANK[severity] > RANK[cap.max]) return `${where}.rules.${id}: at most '${cap.max}' (${cap.why})`
    }
  }
  if (layer.bookkeeping !== undefined && !isStringList(layer.bookkeeping)) return `${where}.bookkeeping: expected a list of primitive names (globs allowed)`
  if (layer.checkMethods !== undefined && !isStringList(layer.checkMethods)) return `${where}.checkMethods: expected a list of method names`
  if (layer.primitives !== undefined && layer.primitives !== null && !isStringList(layer.primitives)) return `${where}.primitives: expected a list of primitive names or null`
  return null
}

/** Parse a config file's text. `baseDir`: its folder; `source`: its display path; `caps`: per rule, its highest severity. */
export function parseConfig(text: string, baseDir: string, source: string, knownRules: ReadonlySet<string>, caps: SeverityCaps = {}): { ok: true; config: LintConfig } | { ok: false; error: string } {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (e) {
    return { ok: false, error: `${source}: not JSON (${(e as Error).message})` }
  }
  if (!isRecord(raw)) return { ok: false, error: `${source}: expected an object` }
  const top = checkLayer(raw, source, knownRules, caps)
  if (top) return { ok: false, error: top }
  if (raw.files !== undefined) return { ok: false, error: `${source}: 'files' belongs in an overrides entry` }
  if (raw.overrides !== undefined) {
    if (!Array.isArray(raw.overrides)) return { ok: false, error: `${source}.overrides: expected a list` }
    for (let i = 0; i < raw.overrides.length; i++) {
      const o: unknown = raw.overrides[i]
      const where = `${source}.overrides[${i}]`
      if (!isRecord(o)) return { ok: false, error: `${where}: expected an object` }
      if (!isStringList(o.files) || o.files.length === 0) return { ok: false, error: `${where}.files: expected a non-empty list of globs` }
      if (o.overrides !== undefined) return { ok: false, error: `${where}: overrides do not nest` }
      const bad = checkLayer(o, where, knownRules, caps)
      if (bad) return { ok: false, error: bad }
    }
  }
  return { ok: true, config: { ...(raw as LintConfig), baseDir, source } }
}

function applyLayer(into: EffectiveConfig, layer: ConfigLayer): void {
  for (const [id, setting] of Object.entries(layer.rules ?? {})) {
    const current = into.rules[id]
    if (!current) continue
    if (typeof setting === 'string') into.rules[id] = { severity: setting as RuleConfig['severity'], options: current.options }
    else {
      const { severity, ...options } = setting
      into.rules[id] = { severity: (severity as RuleConfig['severity']) ?? current.severity, options: { ...current.options, ...options } }
    }
  }
  if (layer.bookkeeping) into.bookkeeping = [...new Set([...into.bookkeeping, ...layer.bookkeeping])]
  if (layer.checkMethods) into.checkMethods = [...layer.checkMethods]
  if (layer.primitives !== undefined) into.primitives = layer.primitives === null ? null : [...layer.primitives]
}

/** The configuration for one file: rule defaults, then the config's top level, then every override matching it. */
export function effectiveConfig(defaults: Record<string, RuleConfig>, config: LintConfig | null, absFile: string): EffectiveConfig {
  const out: EffectiveConfig = {
    rules: Object.fromEntries(Object.entries(defaults).map(([id, r]) => [id, { severity: r.severity, options: { ...r.options } }])),
    bookkeeping: [],
    checkMethods: [],
    primitives: null
  }
  if (!config) return out
  applyLayer(out, config)
  const rel = nodePath.relative(config.baseDir ?? process.cwd(), absFile).split(nodePath.sep).join('/')
  for (const o of config.overrides ?? []) if (o.files.some(g => globRegex(g).test(rel))) applyLayer(out, o)
  return out
}
