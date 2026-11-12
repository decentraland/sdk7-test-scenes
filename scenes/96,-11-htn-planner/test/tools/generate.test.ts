// Exercise the installed authoring interface, not a mocked compiler or file watcher.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { createRequire } from 'node:module'

const ROOT = process.env.HTN_REPO_ROOT ?? process.cwd()
const requireFromScene = createRequire(path.join(ROOT, 'package.json'))
const { buildSync }: typeof import('esbuild') = requireFromScene('esbuild')
const kit = (wait: number) => `(:domain Kit (:method (work) (step () ((!wait ${wait})))))\n`
const main = '(:include "../shared/kit.domain")\n(:domain Example top_level_domain (:method (behave) top_level_method (run () ((work)))))\n'
const config = { domains: [{ source: 'src/npc/main.domain', output: 'src/npc/main.htn.ts', exportName: 'exampleDomain' }] }

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'htn-generate-test-'))
  for (const name of ['tools/htn-authoring', 'src/npc', 'src/shared']) fs.mkdirSync(path.join(dir, name), { recursive: true })
  for (const name of ['compiler.cjs', 'generate.mjs', 'config.mjs']) fs.copyFileSync(path.join(ROOT, 'tools/htn-authoring', name), path.join(dir, 'tools/htn-authoring', name))
  fs.cpSync(path.join(ROOT, 'src/htn-planner/htn'), path.join(dir, 'src/htn-planner/htn'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'htn.config.json'), JSON.stringify(config))
  fs.writeFileSync(path.join(dir, config.domains[0].source), main)
  fs.writeFileSync(path.join(dir, 'src/shared/kit.domain'), kit(1))
  return dir
}
function clean(dir: string) {
  assert.equal(path.dirname(dir), os.tmpdir())
  assert.ok(path.basename(dir).startsWith('htn-generate-test-'))
  fs.rmSync(dir, { recursive: true, force: true })
}
function generate(dir: string, ...args: string[]) {
  return spawnSync(process.execPath, ['tools/htn-authoring/generate.mjs', ...args], { cwd: dir, encoding: 'utf8', windowsHide: true })
}
function ok(result: ReturnType<typeof generate>) { assert.equal(result.status, 0, result.stdout + result.stderr) }
function text(dir: string) { return fs.readFileSync(path.join(dir, config.domains[0].output), 'utf8') }
function plan(dir: string, modulePath = './npc/main.htn', exportName = 'exampleDomain') {
  const entry = path.join(dir, 'src/probe.ts'), output = path.join(dir, 'probe.cjs')
  fs.writeFileSync(entry, "import { " + exportName + " } from '" + modulePath + "'; import { decompose } from './htn-planner/htn/planner'; import { WorldState } from './htn-planner/htn/world-state'; console.log(JSON.stringify(decompose(" + exportName + ", new WorldState(), 'behave', [])))")
  const result = buildSync({ entryPoints: [entry], outfile: output, bundle: true, platform: 'node', format: 'cjs', metafile: true, logLevel: 'silent' })
  assert.ok(!Object.keys(result.metafile!.inputs).some(p => /tools[\\/]htn-authoring/.test(p)), 'the runtime bundle must not import authoring code')
  const run = spawnSync(process.execPath, [output], { cwd: dir, encoding: 'utf8', windowsHide: true })
  assert.equal(run.status, 0, run.stderr)
  return JSON.parse(run.stdout)
}
async function waitFor(check: () => boolean, detail: () => string) {
  const until = Date.now() + 12000
  while (Date.now() < until) {
    if (check()) return
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  assert.fail(detail())
}
function watch(dir: string) {
  const child = spawn(process.execPath, ['tools/htn-authoring/generate.mjs', '--watch'], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
  let output = ''
  child.stdout!.on('data', chunk => { output += chunk.toString() })
  child.stderr!.on('data', chunk => { output += chunk.toString() })
  return { child, output: () => output }
}
async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return
  const exited = new Promise<void>(resolve => child.once('exit', () => resolve()))
  child.kill('SIGTERM')
  await exited
}

test('prepared generation changes real plans from included sources and leaves unchanged outputs untouched', { timeout: 30000 }, () => {
  const dir = fixture()
  try {
    ok(generate(dir))
    assert.deepEqual(plan(dir), { status: 'succeeded', plan: [{ kind: 'primitive', name: '!wait', args: [{ t: 'int', v: 1 }] }] })
    const before = fs.statSync(path.join(dir, config.domains[0].output)).mtimeMs
    ok(generate(dir))
    assert.equal(fs.statSync(path.join(dir, config.domains[0].output)).mtimeMs, before, 'no output write means no needless SDK hot reload')
    fs.writeFileSync(path.join(dir, 'src/shared/kit.domain'), kit(7))
    ok(generate(dir))
    assert.equal(plan(dir).plan[0].args[0].v, 7)
  } finally { clean(dir) }
})

test('all domain candidates compile before any output is published; bad config and missing sources fail visibly', { timeout: 30000 }, () => {
  const dir = fixture()
  try {
    const second = { source: 'src/npc/other.domain', output: 'src/npc/other.htn.ts', exportName: 'otherDomain' }
    fs.writeFileSync(path.join(dir, second.source), '(:domain Other top_level_domain (:method (behave) top_level_method (run () ((!wait 2)))))')
    fs.writeFileSync(path.join(dir, 'htn.config.json'), JSON.stringify({ domains: [...config.domains, second] }))
    ok(generate(dir))
    const before = text(dir), other = fs.readFileSync(path.join(dir, second.output), 'utf8')
    fs.writeFileSync(path.join(dir, 'src/shared/kit.domain'), kit(9))
    fs.writeFileSync(path.join(dir, second.source), '(:domain broken')
    let failed = generate(dir)
    assert.equal(failed.status, 1)
    assert.match(failed.stderr, /FAILED \/ STALE/)
    assert.equal(text(dir), before)
    assert.equal(fs.readFileSync(path.join(dir, second.output), 'utf8'), other)
    fs.writeFileSync(path.join(dir, 'htn.config.json'), JSON.stringify({ domains: [config.domains[0], config.domains[0]] }))
    failed = generate(dir)
    assert.equal(failed.status, 1)
    assert.match(failed.stderr, /Duplicate generated output/)
    fs.writeFileSync(path.join(dir, 'htn.config.json'), JSON.stringify(config))
    fs.unlinkSync(path.join(dir, config.domains[0].source))
    failed = generate(dir)
    assert.equal(failed.status, 1)
    assert.match(failed.stderr, /Compilation failed/)
    assert.equal(text(dir), before)
  } finally { clean(dir) }
})

test('watch follows external and missing includes, recovers after errors, rejects duplicates and stops cleanly', { timeout: 60000 }, async () => {
  const dir = fixture(), external = fixture()
  const include = path.join(external, 'shared.domain')
  let running: ReturnType<typeof watch> | undefined
  try {
    fs.writeFileSync(include, kit(3))
    const source = '(:include "' + include.replace(/\\/g, '/') + '")\n(:domain Example top_level_domain (:method (behave) top_level_method (run () ((work)))))'
    fs.writeFileSync(path.join(dir, config.domains[0].source), source)
    running = watch(dir)
    await waitFor(() => running!.output().includes('READY'), running.output)
    const before = text(dir)
    const duplicate = generate(dir, '--watch')
    assert.equal(duplicate.status, 1)
    assert.match(duplicate.stderr, /watcher already owns/)
    fs.writeFileSync(include, kit(8))
    await waitFor(() => text(dir) !== before, running.output)
    assert.equal(plan(dir).plan[0].args[0].v, 8)
    const lastGood = text(dir)
    fs.writeFileSync(include, '(:domain invalid')
    await waitFor(() => running!.output().includes('FAILED / STALE'), running.output)
    assert.equal(text(dir), lastGood)
    assert.match(running.output(), /last successful build/)
    fs.unlinkSync(include)
    await waitFor(() => running!.output().includes('Could not read included domain'), running.output)
    fs.writeFileSync(include, kit(11))
    await waitFor(() => text(dir) !== lastGood, running.output)
    assert.equal(plan(dir).plan[0].args[0].v, 11)
    await stop(running.child)
    const afterStop = text(dir)
    fs.writeFileSync(include, kit(12))
    await new Promise(resolve => setTimeout(resolve, 400))
    assert.equal(text(dir), afterStop)
    // A new process can acquire the config, including platforms whose SIGTERM leaves a stale lock file.
    running = watch(dir)
    await waitFor(() => running!.output().includes('READY'), running.output)
    assert.equal(plan(dir).plan[0].args[0].v, 12)
  } finally { if (running) await stop(running.child); clean(dir); clean(external) }
})

test('watch resolves nested junction includes from the same lexical path as the compiler', { timeout: 30000 }, async () => {
  const dir = fixture(), external = fixture()
  let running: ReturnType<typeof watch> | undefined
  try {
    const linked = path.join(external, 'linked')
    fs.mkdirSync(linked)
    fs.writeFileSync(path.join(linked, 'kit.domain'), '(:include "../shared/leaf.domain")\n(:domain Kit (:method (work) (run () ((leaf)))))')
    fs.mkdirSync(path.join(external, 'shared'))
    fs.writeFileSync(path.join(external, 'shared/leaf.domain'), '(:domain Leaf (:method (leaf) (run () ((!wait 99)))))')
    const leaf = path.join(dir, 'src/shared/leaf.domain')
    fs.writeFileSync(leaf, '(:domain Leaf (:method (leaf) (run () ((!wait 4)))))')
    fs.symlinkSync(linked, path.join(dir, 'src/alias'), 'junction')
    fs.writeFileSync(path.join(dir, config.domains[0].source), main.replace('../shared/kit.domain', '../alias/kit.domain'))
    fs.mkdirSync(path.join(dir, 'extra/npc'), { recursive: true })
    fs.mkdirSync(path.join(dir, 'extra/shared'))
    fs.symlinkSync(linked, path.join(dir, 'extra/alias'), 'junction')
    const secondLeaf = path.join(dir, 'extra/shared/leaf.domain')
    fs.writeFileSync(secondLeaf, '(:domain Leaf (:method (leaf) (run () ((!wait 10)))))')
    fs.writeFileSync(path.join(dir, 'extra/npc/other.domain'), main.replace('../shared/kit.domain', '../alias/kit.domain'))
    fs.writeFileSync(path.join(dir, 'htn.config.json'), JSON.stringify({ domains: [...config.domains, { source: 'extra/npc/other.domain', output: 'extra/npc/other.htn.ts', exportName: 'otherDomain' }] }))
    running = watch(dir)
    await waitFor(() => running!.output().includes('READY'), running.output)
    assert.equal(plan(dir).plan[0].args[0].v, 4, 'the compiler follows the lexical include path through the junction')
    const before = text(dir)
    fs.writeFileSync(leaf, '(:domain Leaf (:method (leaf) (run () ((!wait 6)))))')
    await waitFor(() => text(dir) !== before, running.output)
    assert.equal(plan(dir).plan[0].args[0].v, 6)
    assert.equal(plan(dir, '../extra/npc/other.htn', 'otherDomain').plan[0].args[0].v, 10)
    const secondOutput = path.join(dir, 'extra/npc/other.htn.ts')
    const secondBefore = fs.readFileSync(secondOutput, 'utf8')
    fs.writeFileSync(secondLeaf, '(:domain Leaf (:method (leaf) (run () ((!wait 13)))))')
    await waitFor(() => fs.readFileSync(secondOutput, 'utf8') !== secondBefore, running!.output)
    assert.equal(plan(dir, '../extra/npc/other.htn', 'otherDomain').plan[0].args[0].v, 13, 'each top-level domain has its own canonical include set')
  } finally { if (running) await stop(running.child); clean(dir); clean(external) }
})

test('an edit during initial generation retries without another save, but a stable error does not loop', { timeout: 30000 }, async () => {
  const dir = fixture()
  let running: ReturnType<typeof watch> | undefined
  try {
    const compiler = path.join(dir, 'tools/htn-authoring/compiler.cjs')
    fs.renameSync(compiler, path.join(dir, 'tools/htn-authoring/actual.cjs'))
    fs.writeFileSync(compiler, [
      "const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process')",
      "const actual = path.join(__dirname, 'actual.cjs')",
      'module.exports = require(actual)',
      'if (require.main === module) {',
      "fs.appendFileSync(path.join(__dirname, 'attempts'), 'start\\n')",
      'Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500)',
      "const result = cp.spawnSync(process.execPath, [actual, ...process.argv.slice(2)], { stdio: 'inherit' })",
      'process.exitCode = result.status ?? 1',
      '}'
    ].join('\n'))
    running = watch(dir)
    const attempts = path.join(dir, 'tools/htn-authoring/attempts')
    await waitFor(() => fs.existsSync(attempts), running.output)
    fs.writeFileSync(path.join(dir, 'src/shared/kit.domain'), kit(17))
    await waitFor(() => running!.output().includes('READY'), running.output)
    assert.match(running.output(), /inputs changed during generation/)
    assert.equal(plan(dir).plan[0].args[0].v, 17, 'the single already-saved edit is eventually published')
    fs.writeFileSync(path.join(dir, 'src/shared/kit.domain'), '(:domain broken')
    await waitFor(() => running!.output().includes('Compilation failed'), running.output)
    const failedAttempts = fs.readFileSync(attempts, 'utf8')
    await new Promise(resolve => setTimeout(resolve, 900))
    assert.equal(fs.readFileSync(attempts, 'utf8'), failedAttempts, 'a permanent syntax error waits for a real input edit')
  } finally { if (running) await stop(running.child); clean(dir) }
})

test('generation rejects physical output aliases during shared config validation before invoking the compiler', { timeout: 30000 }, () => {
  const dir = fixture()
  try {
    ok(generate(dir))
    const before = text(dir)
    fs.symlinkSync(path.join(dir, 'src/npc'), path.join(dir, 'src/alias'), 'junction')
    fs.writeFileSync(path.join(dir, 'htn.config.json'), JSON.stringify({ domains: [config.domains[0], { source: 'src/alias/main.domain', output: 'src/alias/main.htn.ts' }] }))
    fs.writeFileSync(path.join(dir, 'tools/htn-authoring/compiler.cjs'), "throw new Error('Compiler must not be invoked for an invalid mapping')")
    const failed = generate(dir)
    assert.equal(failed.status, 1)
    assert.match(failed.stderr, /Duplicate generated output/)
    assert.ok(!failed.stderr.includes('Compiler must not be invoked'))
    assert.equal(text(dir), before)
  } finally { clean(dir) }
})
