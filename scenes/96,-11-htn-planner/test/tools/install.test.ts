// Consumer contract: installation, authoring, optional references, deletion and actual SDK publication.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const INSTRUCTIONS = { 'AGENTS.md': '# My game\nKeep my rules.\n', 'CLAUDE.md': '# My Claude rules\r\nKeep these too.\r\n' }
const ROOT = process.env.HTN_REPO_ROOT ?? process.cwd()
const requireFromScene = createRequire(path.join(ROOT, 'package.json'))
const { build }: typeof import('esbuild') = requireFromScene('esbuild')
const { getPublishableFiles } = requireFromScene('@dcl/sdk-commands/dist/logic/project-files')

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'htn-install-test-'))
  fs.mkdirSync(path.join(dir, 'src'))
  fs.writeFileSync(path.join(dir, 'scene.json'), JSON.stringify({ ecs7: true, runtimeVersion: '7', main: 'bin/index.js', display: { title: 'HTN consumer' }, scene: { base: '0,0', parcels: ['0,0'] } }))
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'htn-consumer', version: '1.0.0', private: true, scripts: { prebuild: 'node -e ""' }, devDependencies: { '@dcl/sdk': '7.30.1', '@dcl/js-runtime': '7.30.1' } }))
  fs.copyFileSync(path.join(ROOT, 'tsconfig.json'), path.join(dir, 'tsconfig.json'))
  fs.writeFileSync(path.join(dir, 'src/index.ts'), 'export const existingGame = true\n')
  for (const [name, content] of Object.entries(INSTRUCTIONS)) fs.writeFileSync(path.join(dir, name), content)
  fs.writeFileSync(path.join(dir, 'third-party-notices.txt'), 'Unrelated game notices\n')
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(dir, 'node_modules'), 'junction')
  return dir
}
function clean(dir: string) {
  assert.equal(path.dirname(dir), os.tmpdir())
  assert.ok(path.basename(dir).startsWith('htn-install-test-'))
  fs.rmSync(dir, { recursive: true, force: true }) // Node removes the dependency link, not its target.
}
function node(cwd: string, script: string, ...args: string[]) {
  const env = { ...process.env }
  delete env.NODE_TEST_CONTEXT
  return spawnSync(process.execPath, [script, ...args], { cwd, env, encoding: 'utf8', windowsHide: true })
}
function install(dir: string, ...flags: string[]) {
  return node(ROOT, path.join(ROOT, 'scripts/htn-install.mjs'), dir, ...flags)
}
function ok(result: ReturnType<typeof node>) {
  assert.equal(result.status, 0, result.stdout + result.stderr)
}
function sdkBuild(dir: string) {
  const sdk = path.join(ROOT, 'node_modules/@dcl/sdk-commands')
  const pkg = JSON.parse(fs.readFileSync(path.join(sdk, 'package.json'), 'utf8'))
  ok(node(dir, path.join(sdk, pkg.bin['sdk-commands']), 'build', '--production', '--skip-install'))
}
async function published(dir: string): Promise<string[]> {
  return (await getPublishableFiles({ fs: fs.promises }, dir)).map((s: string) => s.replace(/\\/g, '/')).sort()
}

test('creator install compiles README/HOW-TO recipes and publishes only runtime before and after reference deletion', { timeout: 120000 }, async () => {
  const dir = fixture()
  try {
    const initial = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
    initial.scripts['htn:compile'] = 'node scripts/htn-compile.mjs'
    initial.scripts['htn:notices'] = 'node scripts/htn-notices.mjs'
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(initial))
    ok(install(dir, '--starter', '--reference'))
    assert.equal(fs.readFileSync(path.join(dir, 'src/index.ts'), 'utf8'), 'export const existingGame = true\n')
    for (const [name, content] of Object.entries(INSTRUCTIONS)) assert.equal(fs.readFileSync(path.join(dir, name), 'utf8'), content)
    assert.equal(fs.readFileSync(path.join(dir, 'third-party-notices.txt'), 'utf8'), 'Unrelated game notices\n')
    assert.ok(fs.existsSync(path.join(dir, 'reference/htn/assets/stalker/stalker.glb')))
    assert.ok(!fs.existsSync(path.join(dir, 'src/examples')))
    assert.ok(!fs.existsSync(path.join(dir, 'tools/htn/run.ts')), 'compiler install excludes the demo runner')
    assert.ok(fs.existsSync(path.join(dir, 'tools/htn-authoring/compiler.cjs')))
    assert.ok(!fs.existsSync(path.join(dir, 'tools/htn/compiler.ts')), 'ordinary authoring needs no loose compiler source closure')
    assert.ok(fs.readFileSync(path.join(dir, 'reference/htn/docs/htn-guidance.md'), 'utf8').includes('../src/htn-planner/htn/README.md'))
    const source = JSON.parse(fs.readFileSync(path.join(dir, 'src/htn-planner/SOURCE.json'), 'utf8'))
    assert.match(source.ref, /^[a-f0-9]{40}$/)
    assert.equal(source.pinned, true)
    assert.ok(source.url.includes('/tree/' + source.ref + '/'), 'Git installs keep exact source provenance')
    assert.match(source.url, /^https:\/\/github\.com\/decentraland\/sdk7-test-scenes\/tree\//)
    const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8')
    const entry = /```ts\r?\n([\s\S]*?)```/.exec(readme)?.[1]
    assert.ok(entry)
    fs.writeFileSync(path.join(dir, 'src/index.ts'), entry)
    const howTo = fs.readFileSync(path.join(dir, 'src/htn-planner/HOW-TO.md'), 'utf8')
    const recipes = Array.from(howTo.matchAll(/```ts\r?\n([\s\S]*?)```/g))
    assert.equal(recipes.length, 4)
    recipes.forEach((match, i) => fs.writeFileSync(path.join(dir, `src/recipe-${i}.ts`), match[1]))
    const generated = fs.readFileSync(path.join(dir, 'src/npc/guard/guard.htn.ts'), 'utf8')
    ok(node(dir, 'scripts/htn-compile.mjs', 'src/npc/guard/guard.domain', 'src/npc/guard/guard.htn.ts', 'guardDomain'))
    assert.equal(fs.readFileSync(path.join(dir, 'src/npc/guard/guard.htn.ts'), 'utf8').replace(/\r\n/g, '\n'), generated.replace(/\r\n/g, '\n'))
    sdkBuild(dir)
    const bundle = await build({ entryPoints: [path.join(dir, 'src/index.ts')], absWorkingDir: dir, bundle: true, write: false, platform: 'browser', format: 'cjs', target: 'es2020', treeShaking: true, metafile: true, external: ['~system/*'], logLevel: 'silent' })
    const used = Object.values(bundle.metafile!.outputs).flatMap(o => Object.entries(o.inputs).filter(([, v]) => v.bytesInOutput > 0).map(([p]) => p.replace(/\\/g, '/')))
    assert.ok(!used.some(p => /(^|\/)(reference|test|tools|scripts)\/|src\/(debugger|playground|examples)\//.test(p)), used.join('\n'))
    const before = await published(dir)
    assert.ok(!before.some(p => /^(reference|src|scripts|tools|test|benchmarks)\//.test(p)), before.join('\n'))
    assert.ok(before.includes('htn-notices.txt'))
    assert.ok(before.includes('third-party-notices.txt'), 'existing game notices are preserved')
    ok(node(dir, 'scripts/htn-notices.mjs', '--check'))
    const reference = path.join(dir, 'reference/htn')
    assert.ok(fs.realpathSync(reference).startsWith(fs.realpathSync(dir) + path.sep))
    fs.rmSync(reference, { recursive: true, force: true })
    sdkBuild(dir)
    ok(node(dir, 'scripts/htn-compile.mjs', '--check', 'src/npc/guard/guard.domain'))
    ok(node(dir, 'scripts/htn-notices.mjs', '--check'))
    assert.deepEqual(await published(dir), before)
    const generationConfig = path.join(dir, 'htn.config.json')
    const ownConfig = JSON.parse(fs.readFileSync(generationConfig, 'utf8'))
    ownConfig.creatorNote = 'My own generation settings'
    const ownConfigText = JSON.stringify(ownConfig, null, 2) + '\n'
    fs.writeFileSync(generationConfig, ownConfigText)
    const gameDomain = path.join(dir, 'src/npc/guard/guard.domain')
    fs.appendFileSync(gameDomain, '\n// My game adaptation\n')
    ok(install(dir, '--starter', '--update'))
    assert.ok(fs.readFileSync(gameDomain, 'utf8').endsWith('// My game adaptation\n'))
    assert.equal(fs.readFileSync(generationConfig, 'utf8'), ownConfigText)
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
    assert.equal(pkg.scripts.prebuild, 'npm run htn:generate && npm run htn:notices && node -e ""')
    assert.equal(pkg.scripts['htn:compile'], 'node scripts/htn-compile.mjs', 'known legacy compile alias stays usable')
    assert.equal(pkg.scripts['htn:notices'], 'node scripts/htn-notices.mjs', 'known legacy notice alias stays usable')
    for (const [name, content] of Object.entries(INSTRUCTIONS)) assert.equal(fs.readFileSync(path.join(dir, name), 'utf8'), content)
    assert.ok(!fs.existsSync(path.join(dir, 'reference/htn')), 'update does not restore deleted optional references')
  } finally { clean(dir) }
})

test('minimal install needs no starter/reference or agent instructions and rejects different files before changing the game', { timeout: 30000 }, () => {
  const dir = fixture()
  try {
    for (const name of Object.keys(INSTRUCTIONS)) fs.unlinkSync(path.join(dir, name))
    ok(install(dir))
    for (const name of Object.keys(INSTRUCTIONS)) assert.ok(!fs.existsSync(path.join(dir, name)), name + ' must not be created')
    ok(install(dir, '--update'))
    for (const name of Object.keys(INSTRUCTIONS)) assert.ok(!fs.existsSync(path.join(dir, name)), name + ' must not be created by update')
    assert.ok(!fs.existsSync(path.join(dir, 'reference')))
    assert.ok(!fs.existsSync(path.join(dir, 'src/npc')))
    const partial = path.join(dir, 'src/npc/guard')
    fs.mkdirSync(partial, { recursive: true })
    fs.writeFileSync(path.join(partial, 'guard.domain'), '// My existing behaviour')
    const incomplete = install(dir, '--starter')
    assert.equal(incomplete.status, 1)
    assert.match(incomplete.stderr, /Partial starter/)
    assert.ok(!fs.existsSync(path.join(partial, 'guard.htn.ts')), 'never mix an existing domain with an unrelated generated starter')
    assert.equal(fs.readFileSync(path.join(partial, 'guard.domain'), 'utf8'), '// My existing behaviour')
    fs.unlinkSync(path.join(partial, 'guard.domain'))
    fs.rmdirSync(partial)
    fs.rmdirSync(path.join(dir, 'src/npc'))
    fs.appendFileSync(path.join(dir, 'src/htn-planner/index.ts'), '\n// A local library change\n')
    const pkg = fs.readFileSync(path.join(dir, 'package.json'), 'utf8')
    const result = install(dir, '--starter')
    assert.equal(result.status, 1)
    assert.match(result.stderr, /Different installed file/)
    assert.equal(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'), pkg)
    assert.ok(!fs.existsSync(path.join(dir, 'src/npc')), 'preflight makes no partial starter writes')
  } finally { clean(dir) }
})

test('the demonstration deployment excludes development data while retaining active demo assets and licences', async () => {
  const files = await published(ROOT)
  assert.ok(!files.some(p => /^(benchmarks|tools|test|scripts|reference|docs)\/|^htn-lint\.json$|^tsconfig\./.test(p)), files.join('\n'))
  assert.ok(files.includes('assets/stalker/stalker.glb'), 'full demo intentionally uses this model')
  assert.ok(files.includes('htn-notices.txt'))
})


test('notice symlinks and dangling links are rejected before writes, including during update', { timeout: 30000 }, t => {
  const dir = fixture(), outside = fixture()
  try {
    ok(install(dir))
    const notice = path.join(dir, 'htn-notices.txt')
    const foreign = path.join(outside, 'foreign.txt')
    fs.writeFileSync(foreign, 'Keep outside content')
    fs.unlinkSync(notice)
    try { fs.symlinkSync(foreign, notice, 'file') } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') { t.skip('Creating a file symlink requires Windows Developer Mode or privilege'); return }
      throw error
    }
    const before = fs.readFileSync(path.join(dir, 'package.json'), 'utf8')
    let result = install(dir, '--update')
    assert.equal(result.status, 1)
    assert.match(result.stderr, /Notice destination must be a regular file/)
    assert.equal(fs.readFileSync(foreign, 'utf8'), 'Keep outside content')
    assert.equal(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'), before)
    fs.unlinkSync(notice)
    fs.symlinkSync(path.join(outside, 'absent.txt'), notice, 'file')
    result = install(dir, '--update')
    assert.equal(result.status, 1)
    assert.match(result.stderr, /Notice destination must be a regular file/)
    assert.ok(!fs.existsSync(path.join(outside, 'absent.txt')))
  } finally { clean(dir); clean(outside) }
})

test('a scene-only ZIP installs full references and records unpinned provenance without a parent repository', { timeout: 30000 }, () => {
  const dir = fixture(), archive = fixture()
  try {
    const source = path.join(archive, 'download')
    for (const folder of ['src', 'tools', 'scripts', 'assets', 'test', 'benchmarks', 'docs']) {
      fs.cpSync(path.join(ROOT, folder), path.join(source, folder), { recursive: true })
    }
    for (const file of ['DEMO.md', 'REFERENCE.md']) fs.copyFileSync(path.join(ROOT, file), path.join(source, file))
    assert.ok(!fs.existsSync(path.join(archive, 'docs')), 'no repository-level docs in the standalone fixture')
    ok(node(ROOT, path.join(source, 'scripts/htn-install.mjs'), dir, '--reference'))
    assert.ok(fs.existsSync(path.join(dir, 'reference/htn/docs/htn-guidance.md')))
    const provenance = JSON.parse(fs.readFileSync(path.join(dir, 'src/htn-planner/SOURCE.json'), 'utf8'))
    assert.equal(provenance.pinned, false)
    assert.equal(provenance.ref, null)
    assert.equal(provenance.localChanges, null)
    assert.equal(provenance.url, 'https://github.com/decentraland/sdk7-test-scenes/tree/main/scenes/96,-11-htn-planner', 'archive fallback survives PR branch deletion')
  } finally { clean(dir); clean(archive) }
})

test('installed npm lifecycle generates domains before start/build/deploy and blocks each on compiler errors', { timeout: 30000 }, () => {
  const dir = fixture()
  try {
    ok(install(dir, '--starter'))
    const pkgPath = path.join(dir, 'package.json')
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
    fs.writeFileSync(path.join(dir, 'lifecycle.cjs'), "require('node:fs').writeFileSync('lifecycle-ran', 'yes')")
    for (const script of ['start', 'build', 'deploy']) pkg.scripts[script] = 'node lifecycle.cjs'
    fs.writeFileSync(pkgPath, JSON.stringify(pkg))
    const npm = (script: string) => spawnSync(process.platform === 'win32' ? (process.env.ComSpec ?? 'cmd.exe') : 'npm', process.platform === 'win32' ? ['/d', '/s', '/c', 'npm run ' + script] : ['run', script], { cwd: dir, encoding: 'utf8', windowsHide: true })
    const source = path.join(dir, 'src/npc/guard/guard.domain')
    const original = fs.readFileSync(source, 'utf8')
    const output = path.join(dir, 'src/npc/guard/guard.htn.ts')
    const first = fs.readFileSync(output, 'utf8')
    fs.writeFileSync(source, original.replace('(patrol_pause 1.0)', '(patrol_pause 4.0)'))
    ok(npm('build'))
    assert.notEqual(fs.readFileSync(output, 'utf8'), first, 'npm build generates before running the existing game command')
    for (const script of ['start', 'build', 'deploy']) {
      fs.rmSync(path.join(dir, 'lifecycle-ran'), { force: true })
      fs.writeFileSync(source, '(:domain invalid')
      const failed = npm(script)
      assert.notEqual(failed.status, 0)
      assert.match(failed.stdout + failed.stderr, /FAILED \/ STALE/)
      assert.ok(!fs.existsSync(path.join(dir, 'lifecycle-ran')), script + ' must not start on old generated data')
    }
    fs.writeFileSync(source, original)
    ok(npm('start'))
    assert.equal(fs.readFileSync(path.join(dir, 'lifecycle-ran'), 'utf8'), 'yes')
  } finally { clean(dir) }
})