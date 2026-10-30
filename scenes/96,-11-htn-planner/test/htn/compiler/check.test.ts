// `npm run htn:compile -- --check <file>...`: upstream `HTNTranslator --check <domain-file>` (HTNTranslator/src/main.cpp:80-97):
// load, link and validate, print every diagnostic, write nothing; exit 4 on errors, 0 with a success line.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as nodePath from 'node:path'
import { FIXTURES, REPO_ROOT } from './helpers'

const script = nodePath.join(REPO_ROOT, 'scripts', 'htn-compile.mjs')
const check = (...files: string[]) => spawnSync(process.execPath, [script, '--check', ...files], { encoding: 'utf8', cwd: REPO_ROOT })
const good = nodePath.join(FIXTURES, 'Domains', 'include_demo.domain')
const bad = nodePath.join(FIXTURES, 'HTNDiagnosticTests', 'DiagnosticSemanticErrors.domain')

test('--check: a valid domain and its includes, nothing written, exit 0', { timeout: 120000 }, () => {
  const before = fs.readdirSync(nodePath.dirname(good)).sort()
  const r = check(good)
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /include_demo\.domain' compiled successfully \([2-9] linked source file\(s\)\)/)
  assert.equal(r.stderr, '')
  assert.deepEqual(fs.readdirSync(nodePath.dirname(good)).sort(), before)
})

test('--check: every diagnostic, then the error count; exit 4 (upstream main.cpp:92)', { timeout: 120000 }, () => {
  const r = check(bad)
  assert.equal(r.status, 4)
  const lines = r.stderr.trim().split('\n')
  assert.equal(lines.filter(l => / error unknown-/.test(l)).length, 3, r.stderr)
  assert.match(lines[lines.length - 1], /check failed for '.*DiagnosticSemanticErrors\.domain' with 3 error\(s\)/)
})

test('--check: several files, world states too; one failure fails the run', { timeout: 120000 }, () => {
  const world = nodePath.join(FIXTURES, 'WorldStates', 'Test', 'human.worldstate')
  const ok = check(good, world)
  assert.equal(ok.status, 0, ok.stderr)
  assert.match(ok.stdout, /human\.worldstate' parsed successfully/)
  const mixed = check(good, bad)
  assert.equal(mixed.status, 4)
  assert.match(mixed.stdout, /include_demo\.domain' compiled successfully/)
  assert.match(mixed.stderr, /check failed for '.*DiagnosticSemanticErrors\.domain'/)
  assert.match(mixed.stderr, /htn:compile: 1 of 2 file\(s\) failed the check/)
})

test('--check: a missing file fails; no file is a usage error', { timeout: 120000 }, () => {
  const missing = check(nodePath.join(FIXTURES, 'Domains', 'no_such.domain'))
  assert.equal(missing.status, 4)
  assert.match(missing.stderr, /file-not-found/)
  const usage = check()
  assert.equal(usage.status, 2)
  assert.match(usage.stderr, /--check/)
})
