// Check methods (CompileOptions.checkMethods, `htn:compile -- --check-method <name>`): top-level methods that judge
// the running plan, as GuardAgentOptions.activePlan (upstream docs/USE_CASES.md:32-34). Upstream marks nothing: the
// name is an ordinary top-level method (USE_CASES.md:8-9), so the caller names it. A branch that accepts any running
// step is a warning on that branch: the same rule (acceptingBranches) the agent reports at run time.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as nodePath from 'node:path'
import { acceptingBranches, alwaysHolds } from '../../../src/htn-planner/htn/check-method'
import { compileDomainSource } from '../../../tools/htn/compiler'
import type { CompileResult } from '../../../tools/htn/compiler'
import { formatDiagnostic } from '../../../tools/htn/diagnostics'
import { describe as show, locate, REPO_ROOT } from './helpers'

const domain = (checkBranches: string, extra = '') => `(:domain Sentry top_level_domain
    (:method (behave) top_level_method
        (attack (and (threat ?t)) ((!attack ?t)))
        (idle () ((!idle))))
${extra}
    (:method (active_plan) top_level_method
        (attack_valid (and (running attack ?t) (threat ?t)) ())
${checkBranches}))
`

function compile(source: string, checkMethods?: string[], files: Record<string, string> = {}): CompileResult {
  return compileDomainSource('Sentry.domain', source, {
    checkMethods,
    readFile: path => {
      const name = nodePath.basename(path)
      if (!(name in files)) throw new Error(`no such file ${path}`)
      return files[name]
    }
  })
}

const warnings = (r: CompileResult) => r.diagnostics.filter(d => d.severity === 'warning')

test('a check method with a () branch and no tasks: warning check-method-fallback over the whole branch', () => {
  const branch = '(accept_anything () ())'
  const source = domain(`        ${branch}`)
  const r = compile(source, ['active_plan'])
  assert.ok(r.ok, show(r))
  const w = warnings(r)
  assert.deepEqual(w.map(d => d.code), ['check-method-fallback'], show(r))
  const at = locate(source, branch)
  assert.deepEqual(
    { file: w[0].file, line: w[0].line, col: w[0].col, endLine: w[0].endLine, endCol: w[0].endCol },
    { file: 'Sentry.domain', ...at, endLine: at.line, endCol: at.col + branch.length }
  )
  assert.equal(w[0].recovery, 'recoverable')
  assert.match(w[0].message, /'active_plan'.*'accept_anything'.*accepts any running step/)
})

test('without checkMethods the same domain compiles with no warning: the compiler cannot tell a check by its name', () => {
  const r = compile(domain('        (accept_anything () ())'))
  assert.ok(r.ok, show(r))
  assert.deepEqual(r.diagnostics, [])
})

test('a strict check method compiles with no warning', () => {
  const r = compile(domain('        (idle_valid (and (running idle) (not (threat ?any_t))) ())'), ['active_plan'])
  assert.ok(r.ok, show(r))
  assert.deepEqual(r.diagnostics, [])
})

test('the rule: a condition that always holds and only tasks that cannot fail; every such branch is reported', () => {
  const accepting = [
    '(a () ())',
    '(b (and) ())',
    '(c (and (and) (or (running idle) (and))) ())',
    '(d () ((!log "accepted") (!mark 1 (1 2))))'
  ]
  const strict = [
    '(e (and (not (and))) ())', // never holds
    '(f () ((behave)))', // a compound task can fail
    '(h () ((!log (+ 1 2))))', // an argument computed at plan time (arithmetic, a callterm) may fail
    '(i (or (running idle)) ())'
  ]
  const r = compile(domain([...strict, ...accepting].map(b => `        ${b}`).join('\n')), ['active_plan'])
  assert.ok(r.ok, show(r))
  assert.deepEqual(
    warnings(r).map(d => /branch '(\w+)'/.exec(d.message)?.[1]),
    ['a', 'b', 'c', 'd']
  )
  // The compiler and the agent share the rule: acceptingBranches on the linked method.
  const method = r.ok ? r.ir.methods[r.ir.topLevel.active_plan[0]] : undefined
  assert.deepEqual(acceptingBranches(method!).map(b => b.name), ['a', 'b', 'c', 'd'])
  assert.equal(alwaysHolds(null), true)
  assert.equal(alwaysHolds({ k: 'not', item: { k: 'and', items: [] } }), false)
})

test('a check method that is not a top-level method with no arguments: warning check-method-unknown', () => {
  const source = domain('', '    (:method (helper ?inp_x)\n        (only () ((!x ?inp_x))))\n    (:method (go) top_level_method (b () ((helper 1))))')
  const r = compile(source, ['helper', 'no_such_method'])
  assert.ok(r.ok, show(r))
  const w = warnings(r)
  assert.deepEqual(w.map(d => d.code), ['check-method-unknown', 'check-method-unknown'], show(r))
  // A method by that name: its declaration; none: the start of the root file.
  assert.deepEqual({ line: w[0].line, col: w[0].col }, locate(source, '(:method (helper'))
  assert.match(w[0].message, /'helper' is not a top-level method of domain 'Sentry' with no arguments/)
  assert.deepEqual({ file: w[1].file, line: w[1].line, col: w[1].col }, { file: 'Sentry.domain', line: 1, col: 1 })
})

test('a fallback branch in an include is reported in that file', () => {
  // A check method must be top-level, so it lives in the root; its fallback branch is in the root too. An included
  // module's methods are not top-level (upstream HTNCompilerDomainValidator.cpp:485): a name there is unknown.
  const include = '(:domain Checks\n    (:method (inner_check)\n        (fallback () ())))\n'
  const root = '(:include "Checks.domain")\n' + domain('        (accept_anything () ())')
  const r = compile(root, ['active_plan', 'inner_check'], { 'Checks.domain': include })
  assert.ok(r.ok, show(r))
  assert.deepEqual(
    warnings(r).map(d => [d.code, nodePath.basename(d.file), d.line]),
    [
      ['check-method-fallback', 'Sentry.domain', locate(root, '(accept_anything').line],
      ['check-method-unknown', 'Checks.domain', 2]
    ]
  )
})

test('warnings come after the errors and never on a domain that fails', () => {
  const r = compile(domain('        (accept_anything () ((unknown_method)))'), ['active_plan'])
  assert.equal(r.ok, false)
  assert.ok(r.diagnostics.every(d => d.severity === 'error'), show(r))
})

test('the warning prints in the VS Code problem-matcher format', () => {
  const r = compile(domain('        (accept_anything () ())'), ['active_plan'])
  const pkg = JSON.parse(fs.readFileSync(nodePath.join(REPO_ROOT, 'tools/vscode-htn/package.json'), 'utf8'))
  const re = new RegExp(pkg.contributes.problemMatchers[0].pattern.regexp)
  const m = re.exec(formatDiagnostic(warnings(r)[0]))
  assert.ok(m, formatDiagnostic(warnings(r)[0]))
  assert.equal(m[6], 'warning')
  assert.equal(m[7], 'check-method-fallback')
})

const script = nodePath.join(REPO_ROOT, 'scripts', 'htn-compile.mjs')
const cli = (...args: string[]) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', cwd: REPO_ROOT })

test('CLI --check-method, with --check and when writing a module: the warning on stderr, exit 0', { timeout: 120000 }, () => {
  const dir = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'htn-check-method-'))
  try {
    const file = nodePath.join(dir, 'Sentry.domain')
    fs.writeFileSync(file, domain('        (accept_anything () ())'))
    const checked = cli('--check', file, '--check-method', 'active_plan')
    assert.equal(checked.status, 0, checked.stderr)
    assert.match(checked.stderr, /Sentry\.domain:\d+:9-\d+:\d+: warning check-method-fallback: .*'accept_anything'/)
    assert.match(checked.stdout, /compiled successfully/)
    const plain = cli('--check', file)
    assert.equal(plain.stderr, '')
    const out = nodePath.join(dir, 'sentry.ts')
    const written = cli('--check-method', 'active_plan', file, out)
    assert.equal(written.status, 0, written.stderr)
    assert.match(written.stderr, /warning check-method-fallback/)
    assert.ok(fs.existsSync(out))
    const usage = cli('--check', file, '--check-method')
    assert.equal(usage.status, 2)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
