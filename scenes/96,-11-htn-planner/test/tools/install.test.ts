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
function snapshot(dir: string): Record<string, string> {
  const files: Record<string, string> = {}
  const walk = (folder: string) => {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue
      const file = path.join(folder, entry.name)
      const rel = path.relative(dir, file).replace(/\\/g, '/')
      if (entry.isSymbolicLink()) files[rel] = 'link:' + fs.readlinkSync(file)
      else if (entry.isDirectory()) { files[rel + '/'] = ''; walk(file) }
      else files[rel] = fs.readFileSync(file).toString('base64')
    }
  }
  walk(dir)
  return files
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
    assert.ok(fs.existsSync(path.join(dir, 'reference/htn/assets/stalker/SOURCES.md')))
    assert.ok(!fs.existsSync(path.join(dir, 'reference/htn/assets/stalker/stalker.glb')), 'reference copy has no heavy legacy assets')
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
    assert.equal(recipes.length, 5)
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

test('the demonstration deployment excludes development data while retaining licences and including demo audio but excluding the legacy model', async () => {
  const files = await published(ROOT)
  assert.ok(!files.some(p => /^(benchmarks|tools|test|scripts|reference|docs)\/|^htn-lint\.json$|^tsconfig\./.test(p)), files.join('\n'))
  assert.equal(files.filter(p => /^assets\/stalker\/.*\.ogg$/.test(p)).length, 11, 'the demo keeps its footsteps and voice')
  assert.ok(!files.some(p => p.endsWith('.glb')), 'no legacy model')
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

// A pre-existing authoring config must not leave the newly copied starter outside generation.
test('starter joins an existing config, regenerates edits, and preserves other domains/settings on repeat update', { timeout: 30000 }, () => {
  const dir = fixture()
  try {
    const own = path.join(dir, 'src/npc/custom')
    fs.mkdirSync(own, { recursive: true })
    for (const name of ['guard.domain', 'guard_kit.domain', 'guard.htn.ts']) {
      fs.copyFileSync(path.join(ROOT, 'src/examples/guard', name), path.join(own, name))
    }
    const custom = { source: 'src/npc/custom/guard.domain', output: 'src/npc/custom/guard.htn.ts', exportName: 'myGuardDomain', note: 'keep this entry' }
    const configPath = path.join(dir, 'htn.config.json')
    fs.writeFileSync(configPath, JSON.stringify({ domains: [custom], creator: { note: 'keep my settings' } }, null, 2) + '\n')
    ok(install(dir, '--starter'))
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    assert.equal(config.domains.length, 2, 'the starter must be registered alongside the existing domain')
    assert.deepEqual(config.domains[0], custom)
    assert.deepEqual(config.creator, { note: 'keep my settings' })
    const starter = { source: 'src/npc/guard/guard.domain', output: 'src/npc/guard/guard.htn.ts', exportName: 'guardDomain' }
    assert.deepEqual(config.domains[1], starter)
    const guard = path.join(dir, starter.source)
    const output = path.join(dir, starter.output)
    const before = fs.readFileSync(output, 'utf8')
    fs.writeFileSync(guard, fs.readFileSync(guard, 'utf8').replace('(patrol_pause 1.0)', '(patrol_pause 4.0)'))
    ok(node(dir, 'tools/htn-authoring/generate.mjs'))
    assert.notEqual(fs.readFileSync(output, 'utf8'), before, 'the real generator compiles a semantic starter edit')
    assert.match(fs.readFileSync(path.join(dir, custom.output), 'utf8'), /export const myGuardDomain/)
    const configText = fs.readFileSync(configPath, 'utf8')
    const sourceText = fs.readFileSync(guard, 'utf8')
    ok(install(dir, '--starter', '--update'))
    assert.equal(fs.readFileSync(configPath, 'utf8'), configText, 'repeat update is byte-stable and adds no duplicate entry')
    assert.equal(fs.readFileSync(guard, 'utf8'), sourceText, 'game-owned starter edits survive update')
    assert.ok(!fs.existsSync(path.join(dir, 'scripts/htn-compile.mjs')), 'fresh setup needs no legacy compiler shim')
    assert.ok(!fs.existsSync(path.join(dir, 'scripts/htn-notices.mjs')), 'fresh setup has one canonical notice generator')
  } finally { clean(dir) }
})

test('starter config conflicts and malformed entries fail before any game files change', { timeout: 30000 }, () => {
  const configs = [
    '{ invalid json',
    JSON.stringify({ domains: 'not an array' }),
    JSON.stringify({ domains: [{ source: 'src/npc/guard/guard.domain', output: 'src/elsewhere.htn.ts' }] }),
    JSON.stringify({ domains: [{ source: 'src/other.domain', output: 'src/npc/guard/guard.htn.ts' }] }),
    JSON.stringify({ domains: [{ source: '../outside.domain', output: 'src/other.htn.ts' }] })
  ]
  for (const config of configs) {
    const dir = fixture()
    try {
      fs.writeFileSync(path.join(dir, 'htn.config.json'), config)
      const packageBefore = fs.readFileSync(path.join(dir, 'package.json'), 'utf8')
      const result = install(dir, '--starter')
      assert.equal(result.status, 1, 'invalid or conflicting config must not report successful installation')
      assert.match(result.stderr, /htn.config.json|starter.*conflict|conflict.*starter/i)
      assert.equal(fs.readFileSync(path.join(dir, 'htn.config.json'), 'utf8'), config)
      assert.equal(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'), packageBefore)
      assert.ok(!fs.existsSync(path.join(dir, 'src/htn-planner')), 'preflight must not partially install the runtime')
      assert.ok(!fs.existsSync(path.join(dir, 'src/npc/guard')), 'preflight must not partially install the starter')
    } finally { clean(dir) }
  }
})

test('an existing compatible starter mapping is reused without changing its custom export or config text', { timeout: 30000 }, () => {
  const dir = fixture()
  try {
    const config = JSON.stringify({ domains: [{ source: './src/npc/guard/guard.domain', output: 'src/npc/guard/guard.htn.ts', exportName: 'myStarter' }], owner: 'my game' }, null, 2) + '\n'
    fs.writeFileSync(path.join(dir, 'htn.config.json'), config)
    ok(install(dir, '--starter'))
    assert.equal(fs.readFileSync(path.join(dir, 'htn.config.json'), 'utf8'), config)
    const output = path.join(dir, 'src/npc/guard/guard.htn.ts')
    assert.match(fs.readFileSync(output, 'utf8'), /export const myStarter/, 'new precompiled starter honours the accepted export immediately')
    fs.appendFileSync(output, '\n// Game-owned output adaptation\n')
    const ownedOutput = fs.readFileSync(output, 'utf8')
    fs.writeFileSync(path.join(dir, 'src/index.ts'), "import { myStarter } from './npc/guard/guard.htn'; export function main() { void myStarter }\n")
    ok(node(dir, path.join(ROOT, 'node_modules/typescript/bin/tsc'), '--noEmit'))
    ok(install(dir, '--starter', '--update'))
    assert.equal(fs.readFileSync(output, 'utf8'), ownedOutput, 'installer preserves an explicitly mapped game-owned output byte for byte')
    ok(node(dir, 'tools/htn-authoring/generate.mjs'))
    assert.match(fs.readFileSync(output, 'utf8'), /export const myStarter/)
    ok(node(dir, path.join(ROOT, 'node_modules/typescript/bin/tsc'), '--noEmit'))
    assert.equal(fs.readFileSync(path.join(dir, 'htn.config.json'), 'utf8'), config)
  } finally { clean(dir) }
})

test('fresh starter copies its whole folder and preserves custom starter/support files on update', { timeout: 30000 }, () => {
  const dir = fixture(), archive = fixture()
  try {
    const source = path.join(archive, 'download')
    for (const folder of ['src/htn-planner', 'src/examples/guard', 'tools/htn-authoring', 'scripts']) {
      fs.cpSync(path.join(ROOT, folder), path.join(source, folder), { recursive: true })
    }
    const extra = path.join(source, 'src/examples/guard/support/lesson.json')
    fs.mkdirSync(path.dirname(extra), { recursive: true })
    fs.writeFileSync(extra, '{"example":"whole folder"}\n')
    const installer = path.join(source, 'scripts/htn-install.mjs')
    ok(node(ROOT, installer, dir, '--starter'))
    const copied = path.join(dir, 'src/npc/guard/support/lesson.json')
    assert.equal(fs.readFileSync(copied, 'utf8'), '{"example":"whole folder"}\n')
    fs.writeFileSync(copied, '{"example":"my adaptation"}\n')
    ok(node(ROOT, installer, dir, '--starter', '--update'))
    assert.equal(fs.readFileSync(copied, 'utf8'), '{"example":"my adaptation"}\n')
  } finally { clean(dir); clean(archive) }
})


test('an empty domains array receives its first starter target', { timeout: 30000 }, () => {
  const dir = fixture()
  try {
    fs.writeFileSync(path.join(dir, 'htn.config.json'), JSON.stringify({ domains: [], keep: 'my setting' }))
    ok(install(dir, '--starter'))
    const config = JSON.parse(fs.readFileSync(path.join(dir, 'htn.config.json'), 'utf8'))
    assert.equal(config.domains.length, 1)
    assert.equal(config.keep, 'my setting')
    ok(node(dir, 'tools/htn-authoring/generate.mjs'))
  } finally { clean(dir) }
})

test('legacy entrypoints are copied only for existing npm aliases or direct hooks and unrelated scripts are preserved', { timeout: 30000 }, () => {
  const dir = fixture()
  try {
    const pkgPath = path.join(dir, 'package.json')
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
    pkg.scripts.prebuild = 'node scripts/htn-notices.mjs && node -e ""'
    pkg.scripts.custom = 'node scripts/my-game.mjs'
    fs.mkdirSync(path.join(dir, 'scripts'))
    fs.writeFileSync(path.join(dir, 'scripts/my-game.mjs'), '// Game-owned script\n')
    fs.writeFileSync(pkgPath, JSON.stringify(pkg))
    ok(install(dir))
    const after = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
    assert.equal(after.scripts.custom, pkg.scripts.custom)
    assert.ok(after.scripts.prebuild.endsWith(pkg.scripts.prebuild), 'existing direct hook remains usable')
    assert.equal(fs.readFileSync(path.join(dir, 'scripts/my-game.mjs'), 'utf8'), '// Game-owned script\n')
    assert.ok(fs.existsSync(path.join(dir, 'scripts/htn-notices.mjs')), 'existing direct notice hook gets its compatibility entry')
    assert.ok(!fs.existsSync(path.join(dir, 'scripts/htn-compile.mjs')), 'unrequested legacy compiler is not copied')
    ok(node(dir, 'scripts/htn-notices.mjs', '--check'))
    ok(node(dir, 'tools/htn-authoring/notices.mjs', '--check'))
  } finally { clean(dir) }
})


test('starter reuses a directory-junction mapping by physical identity without duplicating or changing its export', { timeout: 30000 }, () => {
  const dir = fixture()
  try {
    const real = path.join(dir, 'src/npc/ai')
    fs.mkdirSync(path.join(dir, 'src/npc'))
    fs.mkdirSync(real)
    fs.symlinkSync(real, path.join(dir, 'src/npc/guard'), 'junction')
    const config = JSON.stringify({ domains: [{ source: 'src/npc/ai/guard.domain', output: 'src/npc/ai/guard.htn.ts', exportName: 'aliasedGuard' }], keep: true }, null, 2) + '\n'
    fs.writeFileSync(path.join(dir, 'htn.config.json'), config)
    ok(install(dir, '--starter'))
    assert.equal(fs.readFileSync(path.join(dir, 'htn.config.json'), 'utf8'), config)
    const output = path.join(real, 'guard.htn.ts')
    const first = fs.readFileSync(output, 'utf8')
    assert.match(first, /export const aliasedGuard/)
    assert.ok(first.includes('../../htn-planner/htn/ir'), 'fresh generated starter import follows both accepted aliases')
    fs.writeFileSync(path.join(dir, 'src/index.ts'), "import { aliasedGuard } from './npc/guard/guard.htn'; export function main() { void aliasedGuard }\n")
    ok(node(dir, path.join(ROOT, 'node_modules/typescript/bin/tsc'), '--noEmit'))
    const domain = path.join(real, 'guard.domain')
    fs.writeFileSync(domain, fs.readFileSync(domain, 'utf8').replace('(patrol_pause 1.0)', '(patrol_pause 4.0)'))
    ok(node(dir, 'tools/htn-authoring/generate.mjs'))
    const generated = fs.readFileSync(output, 'utf8')
    assert.notEqual(generated, first)
    assert.match(generated, /export const aliasedGuard/, 'generation cannot flip the accepted export through a duplicate lexical alias')
    assert.equal(fs.readFileSync(path.join(dir, 'htn.config.json'), 'utf8'), config)
    ok(node(dir, path.join(ROOT, 'node_modules/typescript/bin/tsc'), '--noEmit'))
  } finally { clean(dir) }
})

test('starter rejects physical output collisions through an internal directory junction before writes', { timeout: 30000 }, () => {
  const dir = fixture()
  try {
    const real = path.join(dir, 'src/npc/ai')
    fs.mkdirSync(path.join(dir, 'src/npc'))
    fs.mkdirSync(real)
    fs.symlinkSync(real, path.join(dir, 'src/npc/guard'), 'junction')
    const config = JSON.stringify({ domains: [{ source: 'src/other.domain', output: 'src/npc/ai/guard.htn.ts' }] })
    fs.writeFileSync(path.join(dir, 'htn.config.json'), config)
    const result = install(dir, '--starter')
    assert.equal(result.status, 1)
    assert.match(result.stderr, /Starter config conflict/)
    assert.equal(fs.readFileSync(path.join(dir, 'htn.config.json'), 'utf8'), config)
    assert.deepEqual(fs.readdirSync(real), [])
    assert.ok(!fs.existsSync(path.join(dir, 'src/htn-planner')))
  } finally { clean(dir) }
})

test('starter rejects an existing directory used as a generated file before writes', { timeout: 30000 }, () => {
  const dir = fixture()
  try {
    fs.mkdirSync(path.join(dir, 'src/custom.htn.ts'))
    const config = JSON.stringify({ domains: [{ source: 'src/custom.domain', output: 'src/custom.htn.ts' }] })
    fs.writeFileSync(path.join(dir, 'htn.config.json'), config)
    const result = install(dir, '--starter')
    assert.equal(result.status, 1)
    assert.match(result.stderr, /htn.config.json.*regular file/)
    assert.equal(fs.readFileSync(path.join(dir, 'htn.config.json'), 'utf8'), config)
    assert.ok(!fs.existsSync(path.join(dir, 'src/htn-planner')))
  } finally { clean(dir) }
})


test('starter rejects depth-changing output aliases in either direction, including its default layout, before writes', { timeout: 30000 }, () => {
  for (const layout of ['default-alias', 'mapped-alias', 'default-alias-no-config']) {
    const dir = fixture()
    try {
      const reverse = layout === 'mapped-alias'
      const real = path.join(dir, reverse ? 'src/npc/guard' : 'src/ai')
      const alias = path.join(dir, reverse ? 'src/ai' : 'src/npc/guard')
      fs.mkdirSync(real, { recursive: true })
      fs.mkdirSync(path.dirname(alias), { recursive: true })
      fs.symlinkSync(real, alias, 'junction')
      const config = JSON.stringify({ domains: [{ source: 'src/ai/guard.domain', output: 'src/ai/guard.htn.ts', exportName: 'myGuard' }] })
      if (layout !== 'default-alias-no-config') fs.writeFileSync(path.join(dir, 'htn.config.json'), config)
      const result = install(dir, '--starter')
      assert.equal(result.status, 1, layout + ' must fail before copying a broken starter')
      assert.match(result.stderr, /ambiguous output aliases change relative imports/)
      assert.deepEqual(fs.readdirSync(real), [])
      assert.ok(!fs.existsSync(path.join(dir, 'src/htn-planner')))
      if (layout === 'default-alias-no-config') assert.ok(!fs.existsSync(path.join(dir, 'htn.config.json')))
      else assert.equal(fs.readFileSync(path.join(dir, 'htn.config.json'), 'utf8'), config)
    } finally { clean(dir) }
  }
})

// Regression: registering an unmapped owned starter makes the next lifecycle hook
// replace its custom export and hand edits, even when installation itself skips copying it.
test('unmapped game-owned starters conflict before any writes instead of breaking the next generation', { timeout: 30000 }, () => {

  for (const config of [{ domains: [], owner: 'my game' }, null]) {
    const dir = fixture()
    try {
      ok(install(dir))
      const guard = path.join(dir, 'src/npc/guard')
      fs.mkdirSync(guard, { recursive: true })
      for (const name of ['guard.domain', 'guard_kit.domain']) fs.copyFileSync(path.join(ROOT, 'src/examples/guard', name), path.join(guard, name))
      ok(node(dir, 'tools/htn-authoring/compiler.cjs', 'src/npc/guard/guard.domain', 'src/npc/guard/guard.htn.ts', 'myOwnedGuard'))
      const output = path.join(guard, 'guard.htn.ts')
      fs.appendFileSync(output, '\n// Game-owned adaptation: keep this hand edit.\n')
      fs.writeFileSync(path.join(dir, 'src/index.ts'), "import { myOwnedGuard } from './npc/guard/guard.htn'; export function main() { void myOwnedGuard }\n")
      ok(node(dir, path.join(ROOT, 'node_modules/typescript/bin/tsc'), '--noEmit'))
      if (config) fs.writeFileSync(path.join(dir, 'htn.config.json'), JSON.stringify(config))
      const before = snapshot(dir)
      for (const flags of [[], ['--update']]) {
        const result = install(dir, '--starter', ...flags)
        if (result.status === 0) {
          ok(node(dir, 'tools/htn-authoring/generate.mjs'))
          const consumer = node(dir, path.join(ROOT, 'node_modules/typescript/bin/tsc'), '--noEmit')
          assert.equal(consumer.status, 0, 'next generation broke the real custom-export consumer: ' + consumer.stdout + consumer.stderr)
          assert.equal(fs.readFileSync(output).toString('base64'), before['src/npc/guard/guard.htn.ts'], 'next generation destroyed game-owned hand edits')
        }
        assert.equal(result.status, 1, 'unmapped owned starter requires an explicit mapping before --starter')
        assert.match(result.stderr, /existing.*starter.*no.*mapping|unmapped.*starter/i)
        assert.deepEqual(snapshot(dir), before, 'conflict must leave every existing file and directory unchanged')
      }
    } finally { clean(dir) }
  }
})

test('starter config merge preserves existing JSON indentation, line endings and trailing newline', { timeout: 30000 }, () => {
  for (const style of [{ indent: '\t', newline: '\r\n', trailing: true }, { indent: '    ', newline: '\n', trailing: false }, { indent: undefined, newline: '\n', trailing: false }]) {
    const dir = fixture()
    try {
      const before = JSON.stringify({ domains: [], owner: { keep: true } }, null, style.indent).replace(/\n/g, style.newline) + (style.trailing ? style.newline : '')
      fs.writeFileSync(path.join(dir, 'htn.config.json'), before)
      ok(install(dir, '--starter'))
      const expected = JSON.stringify({ domains: [{ source: 'src/npc/guard/guard.domain', output: 'src/npc/guard/guard.htn.ts', exportName: 'guardDomain' }], owner: { keep: true } }, null, style.indent).replace(/\n/g, style.newline) + (style.trailing ? style.newline : '')
      assert.equal(fs.readFileSync(path.join(dir, 'htn.config.json'), 'utf8'), expected)
      ok(node(dir, 'tools/htn-authoring/generate.mjs'))
      ok(install(dir, '--starter', '--update'))
      assert.equal(fs.readFileSync(path.join(dir, 'htn.config.json'), 'utf8'), expected, 'repeat registration remains byte-stable')
    } finally { clean(dir) }
  }
})


test('every configured install mode rejects invalid config before writes even without starter', { timeout: 30000 }, () => {
  const target = { source: 'src/custom.domain', output: 'src/custom.htn.ts', exportName: 'myDomain' }
  const invalid = [
    '{invalid', 'null', '[]', '{}', JSON.stringify({ domains: [] }),
    JSON.stringify({ domains: [null] }), JSON.stringify({ domains: [[]] }),
    JSON.stringify({ domains: [{ ...target, source: '../outside.domain' }] }),
    JSON.stringify({ domains: [{ ...target, source: '/absolute.domain' }] }),
    JSON.stringify({ domains: [{ ...target, source: 'src/custom.txt' }] }),
    JSON.stringify({ domains: [{ ...target, output: 'src/custom.js' }] }),
    JSON.stringify({ domains: [{ ...target, exportName: 'bad-name' }] }),
    JSON.stringify({ domains: [target, { ...target, output: './src/custom.htn.ts' }] })
  ]
  const cases = invalid.map(config => ({ config, flags: [] as string[] }))
  for (const flags of [['--update'], ['--testing'], ['--benchmark'], ['--reference']]) cases.push({ config: '{invalid', flags })
  for (const { config, flags } of cases) {
    const dir = fixture()
    try {
      fs.writeFileSync(path.join(dir, 'htn.config.json'), config)
      const before = snapshot(dir)
      const result = install(dir, ...flags)
      assert.equal(result.status, 1, 'invalid config must fail before hooks/files are installed: ' + config + ' ' + flags)
      assert.match(result.stderr, /htn.config.json|source|output|exportName|domains/i)
      assert.deepEqual(snapshot(dir), before, 'all consumer files and directories must remain unchanged')
    } finally { clean(dir) }
  }
})

test('configured install validates regular files and physical output collisions without starter', { timeout: 30000 }, () => {
  for (const kind of ['directory', 'collision', 'escape']) {
    const dir = fixture(), outside = fixture()
    try {
      let domains = [{ source: 'src/main.domain', output: 'src/main.htn.ts' }]
      if (kind === 'directory') fs.mkdirSync(path.join(dir, 'src/main.htn.ts'))
      else {
        const real = kind === 'escape' ? path.join(outside, 'src') : path.join(dir, 'src/real')
        fs.mkdirSync(real, { recursive: true })
        fs.symlinkSync(real, path.join(dir, 'src/alias'), 'junction')
        domains = [{ source: 'src/main.domain', output: 'src/alias/main.htn.ts' }]
        if (kind === 'collision') domains.push({ source: 'src/other.domain', output: 'src/real/main.htn.ts' })
      }
      fs.writeFileSync(path.join(dir, 'htn.config.json'), JSON.stringify({ domains }))
      const before = snapshot(dir), foreign = snapshot(outside)
      const result = install(dir)
      assert.equal(result.status, 1, kind + ' must fail at config preflight')
      assert.match(result.stderr, /regular file|Duplicate generated output|link.*outside|escapes/i)
      assert.deepEqual(snapshot(dir), before)
      assert.deepEqual(snapshot(outside), foreign)
    } finally { clean(dir); clean(outside) }
  }
})

test('package and deployment ignores keep their existing JSON and newline style through install/update', { timeout: 30000 }, () => {
  for (const style of [{ indent: '\t', newline: '\r\n', trailing: true }, { indent: '    ', newline: '\n', trailing: false }, { indent: undefined, newline: '\n', trailing: false }]) {
    const dir = fixture()
    try {
      const file = path.join(dir, 'package.json')
      const pkg = JSON.parse(fs.readFileSync(file, 'utf8'))
      pkg.creator = { keep: 'my settings' }
      pkg.scripts.custom = 'node my-game.mjs'
      const format = (value: unknown) => JSON.stringify(value, null, style.indent).replace(/\n/g, style.newline) + (style.trailing ? style.newline : '')
      fs.writeFileSync(file, format(pkg))
      const ignored = '# My game exclusions' + style.newline + 'assets/private/' + (style.trailing ? style.newline : '')
      fs.writeFileSync(path.join(dir, '.dclignore'), ignored)
      ok(install(dir))
      const after = JSON.parse(fs.readFileSync(file, 'utf8'))
      assert.equal(fs.readFileSync(file, 'utf8'), format(after), 'package.json keeps indentation, EOL and final newline style')
      assert.deepEqual(after.creator, pkg.creator)
      assert.equal(after.scripts.custom, pkg.scripts.custom)
      assert.ok(after.scripts.prebuild.endsWith(pkg.scripts.prebuild), 'existing lifecycle command remains')
      const ignoreAfter = fs.readFileSync(path.join(dir, '.dclignore'), 'utf8')
      const prefix = ignored + (style.trailing ? '' : style.newline)
      assert.ok(ignoreAfter.startsWith(prefix), 'keep old comments/patterns and append using existing EOL')
      assert.ok(ignoreAfter.includes(style.newline + 'htn.config.json' + style.newline))
      if (style.newline === '\r\n') assert.ok(!ignoreAfter.replace(/\r\n/g, '').includes('\n'), 'no mixed LF in CRLF ignore file')
      ok(install(dir, '--update'))
      assert.equal(fs.readFileSync(file, 'utf8'), format(after))
      assert.equal(fs.readFileSync(path.join(dir, '.dclignore'), 'utf8'), ignoreAfter, 'idempotent ignore append')
    } finally { clean(dir) }
  }
})


test('valid configured install does not compile or evaluate game-owned sources during preflight', { timeout: 30000 }, () => {
  const dir = fixture()
  try {
    const config = JSON.stringify({ domains: [{ source: 'src/custom.domain', output: 'src/custom.htn.ts', exportName: 'myDomain' }], owner: 'keep' })
    fs.writeFileSync(path.join(dir, 'htn.config.json'), config)
    fs.writeFileSync(path.join(dir, 'src/custom.domain'), 'not yet a valid domain')
    fs.writeFileSync(path.join(dir, 'src/custom.htn.ts'), '// Keep my last output\n')
    ok(install(dir))
    assert.equal(fs.readFileSync(path.join(dir, 'htn.config.json'), 'utf8'), config)
    assert.equal(fs.readFileSync(path.join(dir, 'src/custom.htn.ts'), 'utf8'), '// Keep my last output\n')
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
    assert.ok(pkg.scripts.prebuild.startsWith('npm run htn:generate'))
    const failed = node(dir, 'tools/htn-authoring/generate.mjs')
    assert.equal(failed.status, 1, 'compilation, not config preflight, reports invalid domain text')
    assert.match(failed.stderr, /Compilation failed/)
    assert.equal(fs.readFileSync(path.join(dir, 'src/custom.htn.ts'), 'utf8'), '// Keep my last output\n')
  } finally { clean(dir) }
})
