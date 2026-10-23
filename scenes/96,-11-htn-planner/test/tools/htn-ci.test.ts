// Independent fixtures for the scene-local CI contract; never read a parent .github folder.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { sourceRoots, checkRoots, runCi } from '../../scripts/htn-ci'

const ROOT = process.env.HTN_REPO_ROOT ?? process.cwd()
const good = '(:domain Good top_level_domain (:method (behave) top_level_method (idle () ())))'
const guarded = '(:method (active_plan) top_level_method (valid (and (running ?step)) ()))'
const fallback = '(:method (active_plan) top_level_method (always () ()))'

function fixture(files: Record<string, string>, check: (root: string) => void) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'htn-ci-test-'))
  try {
    mkdirSync(path.join(root, 'src'))
    writeFileSync(path.join(root, 'package.json'), '{}')
    // Dependencies only; the fixture has no parent repository, workflow, or shared build output.
    symlinkSync(path.join(ROOT, 'node_modules'), path.join(root, 'node_modules'), 'junction')
    for (const [name, text] of Object.entries(files)) {
      const file = path.join(root, 'src', name)
      mkdirSync(path.dirname(file), { recursive: true })
      writeFileSync(file, text)
    }
    check(root)
  } finally {
    assert.equal(path.dirname(root), os.tmpdir())
    assert.ok(path.basename(root).startsWith('htn-ci-test-'))
    rmSync(root, { recursive: true, force: true }) // Removes the junction, never its target.
  }
}

function diagnostics(roots: string[], strict = false) {
  const out: string[] = [], err: string[] = []
  const code = checkRoots(roots, strict, text => out.push(text), text => err.push(text))
  return { code, out: out.join('\n'), err: err.join('\n') }
}

test('CI scanner: nested paths with spaces; sorted roots; comments, strings and include/base modules excluded', () => {
  fixture({
    'z root.domain': '// (:domain Fake top_level_domain)\n' + good,
    'a dir/first.domain': '(:include "../base.domain")\n(:domain\n First\n top_level_domain\n (:method (behave) top_level_method (idle () ())))',
    'base.domain': '// top_level_domain\n(:domain Base base (:method (helper) base (say () ((!say "top_level_domain")))))',
    'other.domain': '(:domain Other (:method (helper) (say () ((!say "(:method (active_plan)) top_level_domain")))))',
    'ignore.txt': good
  }, root => {
    const roots = sourceRoots(root).map(file => path.relative(root, file).split(path.sep).join('/'))
    assert.deepEqual(roots, ['src/a dir/first.domain', 'src/z root.domain'])
    assert.equal(diagnostics(sourceRoots(root)).code, 0)
  })
})

test('CI scanner fails on an empty selection or malformed domain rather than silently checking nothing', () => {
  fixture({ 'base.domain': '(:domain Base base)' }, root => assert.throws(() => sourceRoots(root), /No top_level_domain/))
  fixture({ 'bad.domain': '(:domain Bad top_level_domain' }, root => assert.throws(() => sourceRoots(root), /bad\.domain:1:/))
  fixture({ 'bad.domain': '(:include broken)\n' + good }, root => assert.throws(() => sourceRoots(root), /expected-include-path/))
})

test('CI root compile checks included sources and fails immediately on an invalid root', () => {
  fixture({
    'a.domain': '(:include "broken.domain")\n' + good,
    'broken.domain': '(:domain Broken base (:method (helper) base (oops () ((missing)))))',
    'z.domain': good
  }, root => {
    const result = diagnostics(sourceRoots(root))
    assert.equal(result.code, 4)
    assert.match(result.err, /unknown-method/)
    assert.doesNotMatch(result.out, /z\.domain/)
  })
})

test('CI strict pass: inline/multiline active_plan, inherited methods and wrong arity cannot evade checks', () => {
  const cases: [Record<string, string>, number, RegExp | null][] = [
    [{ 'safe.domain': `(:domain Safe top_level_domain ${guarded})` }, 0, null],
    [{ 'inline.domain': `(:domain Inline top_level_domain ${fallback})` }, 1, /check-method-fallback/],
    [{ 'multiline.domain': `(:domain Multi top_level_domain (:method\n (active_plan)\n top_level_method (always () ())))` }, 1, /check-method-fallback/],
    [{ 'root.domain': '(:include "base.domain")\n(:domain Root top_level_domain (:method (behave) top_level_method (yes () ((active_plan)))))', 'base.domain': '(:domain Base base (:method (active_plan) base (always () ())))' }, 1, /check-method-unknown/],
    [{ 'arity.domain': '(:domain Arity top_level_domain (:method (active_plan ?inp_x) top_level_method (yes () ())))' }, 1, /check-method-unknown/],
    [{ 'private.domain': '(:domain Private top_level_domain (:method (behave) top_level_method (yes () ((active_plan)))) (:method (active_plan) (yes () ())))' }, 1, /check-method-unknown/],
    [{ 'absent.domain': '(:domain Absent top_level_domain (:method (behave) top_level_method (yes () ((!say "check-method-fallback (:method (active_plan))")))))' }, 0, null]
  ]
  for (const [files, expected, warning] of cases) fixture(files, root => {
    const roots = sourceRoots(root)
    const ordinary = diagnostics(roots)
    assert.equal(ordinary.code, 0, JSON.stringify(files) + '\n' + ordinary.err)
    const result = diagnostics(roots, true)
    assert.equal(result.code, expected, JSON.stringify(files) + '\n' + result.err)
    if (warning) assert.match(result.err, warning)
  })
})

test('CI sequence preserves every external check and uses scene cwd and the resolved TypeScript CLI', () => {
  fixture({ 'root.domain': good }, root => {
    const calls: string[][] = [], stages: string[] = []
    const code = runCi(root, (args, cwd) => { assert.equal(cwd, root); calls.push(args); return 0 }, text => stages.push(text), assert.fail)
    assert.equal(code, 0)
    assert.deepEqual(calls.map(args => [args[0].endsWith(path.join('typescript', 'bin', 'tsc')) ? 'tsc' : args[0], ...args.slice(1)]), [
      ['scripts/htn-notices.mjs', '--check'], ['scripts/run-tests.mjs'], ['tsc', '--noEmit'],
      ['tsc', '-p', 'tsconfig.tools.json'], ['tsc', '-p', 'tsconfig.viewer.json'], ['scripts/htn-lint.mjs', 'src']
    ])
    assert.ok(stages.findIndex(line => line.includes('compiled successfully')) < stages.findIndex(line => line.includes('Domain lint')))
    assert.match(stages[stages.length - 1], /active_plan/)
  })
})

test('CI fail-fast forwards each external failure and never starts later checks', () => {
  fixture({ 'root.domain': good }, root => {
    for (let failAt = 0; failAt < 6; failAt++) {
      const calls: string[][] = [], err: string[] = []
      const code = runCi(root, args => { calls.push(args); return calls.length === failAt + 1 ? 17 : 0 }, () => {}, text => err.push(text))
      assert.equal(code, 17)
      assert.equal(calls.length, failAt + 1)
      assert.match(err.join('\n'), /failed \(exit 17\)/)
    }
  })
})

test('CI root errors stop before lint, and strict warnings fail even when every subprocess passes', () => {
  fixture({ 'bad.domain': '(:domain Bad top_level_domain (:method (behave) top_level_method (oops () ((missing)))))' }, root => {
    const calls: string[][] = []
    assert.equal(runCi(root, args => { calls.push(args); return 0 }, () => {}, () => {}), 4)
    assert.equal(calls.length, 5)
  })
  fixture({ 'unsafe.domain': `(:domain Unsafe top_level_domain ${fallback})` }, root => {
    const err: string[] = []
    assert.equal(runCi(root, () => 0, () => {}, text => err.push(text)), 1)
    assert.match(err.join('\n'), /check-method-fallback/)
  })
})
