// Inline suppressions in .domain comments (rule ids space- or comma-separated; none = every rule; text after `--`
// is the reason, and should be there):
//   // htn-lint-disable-next-line unconditional-not-last -- backtracking demo
//        the next line that is not blank or a comment (a branch's `(name`, a method's `(:method`)
//   // htn-lint-disable max-branches flat-root -- known bad example, kept for the comparison
//   // htn-lint-enable max-branches
//        a range: from the comment to the matching enable (or the end of the file)
// Compile diagnostics cannot be suppressed. An unknown rule id is a `bad-suppression` warning.

export interface Suppressions {
  covers(rule: string, line: number): boolean
  bad: { line: number; col: number; id: string }[]
}

const DIRECTIVE = /\/\/\s*htn-lint-(disable-next-line|disable|enable)\b([^\n]*)/

export function parseSuppressions(text: string, knownRules: ReadonlySet<string>): Suppressions {
  const lines = text.split(/\r?\n/)
  const next: { line: number; rules: Set<string> | null }[] = []
  const ranges: { from: number; to: number; rules: Set<string> | null }[] = []
  const open: { from: number; rules: Set<string> | null }[] = []
  const bad: Suppressions['bad'] = []
  lines.forEach((raw, i) => {
    const m = DIRECTIVE.exec(raw)
    if (!m) return
    const line = i + 1
    const spec = m[2].split('--')[0].trim()
    const ids = spec ? spec.split(/[\s,]+/).filter(Boolean) : []
    const col = (m.index ?? 0) + 1
    for (const id of ids) if (!knownRules.has(id)) bad.push({ line, col, id })
    const rules = ids.length ? new Set(ids) : null
    if (m[1] === 'disable-next-line') {
      let target = i + 1
      while (target < lines.length && (/^\s*$/.test(lines[target]) || /^\s*\/\//.test(lines[target]))) target++
      next.push({ line: target + 1, rules })
    } else if (m[1] === 'disable') open.push({ from: line, rules })
    else {
      // enable: close the ranges it names (all of them when it names none)
      for (let k = open.length - 1; k >= 0; k--) {
        const o = open[k]
        const closes = !rules || (o.rules !== null && [...o.rules].every(r => rules.has(r)))
        if (closes) {
          ranges.push({ from: o.from, to: line, rules: o.rules })
          open.splice(k, 1)
        }
      }
    }
  })
  for (const o of open) ranges.push({ from: o.from, to: Number.MAX_SAFE_INTEGER, rules: o.rules })
  const has = (rules: Set<string> | null, rule: string) => rules === null || rules.has(rule)
  return {
    covers: (rule, line) => next.some(n => n.line === line && has(n.rules, rule)) || ranges.some(r => line >= r.from && line <= r.to && has(r.rules, rule)),
    bad
  }
}
