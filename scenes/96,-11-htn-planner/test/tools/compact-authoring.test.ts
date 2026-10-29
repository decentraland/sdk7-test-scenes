// The public copy interface: three whole folders, editable sources, no loose compiler internals.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const ROOT = process.env.HTN_REPO_ROOT ?? process.cwd()
const requireFromScene = createRequire(path.join(ROOT, 'package.json'))
const { getPublishableFiles } = requireFromScene('@dcl/sdk-commands/dist/logic/project-files')

function run(cwd: string, script: string, ...args: string[]) {
  const env = { ...process.env }
  delete env.NODE_TEST_CONTEXT
  delete env.HTN_REPO_ROOT
  return spawnSync(process.execPath, [script, ...args], { cwd, env, encoding: 'utf8', windowsHide: true })
}
function ok(result: ReturnType<typeof run>) { assert.equal(result.status, 0, result.stdout + result.stderr) }
function remove(dir: string) {
  assert.equal(path.dirname(dir), os.tmpdir())
  assert.ok(path.basename(dir).startsWith('htn-compact-'))
  fs.rmSync(dir, { recursive: true, force: true }) // A dependency junction is removed, not followed.
}
function copy(from: string, to: string, dir: string) {
  const destination = path.join(dir, to)
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.cpSync(path.join(ROOT, from), destination, { recursive: true })
}

test('three copied folders compile changed domain/includes without compiler sources or dependencies, then build and publish only runtime', { timeout: 120000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'htn-compact-copy-'))
  try {
    copy('src/htn-planner', 'src/htn-planner', dir)
    copy('tools/htn-authoring', 'tools/htn-authoring', dir)
    copy('src/examples/guard', 'src/npc/guard', dir)
    assert.ok(!fs.existsSync(path.join(dir, 'tools/htn')))
    assert.ok(!fs.existsSync(path.join(dir, 'node_modules')))
    const compiler = 'tools/htn-authoring/compiler.cjs'
    const source = 'src/npc/guard/guard.domain', output = 'src/npc/guard/guard.htn.ts'
    const include = path.join(dir, 'src/npc/guard/guard_kit.domain')
    const original = fs.readFileSync(path.join(dir, output), 'utf8')
    fs.writeFileSync(path.join(dir, source), fs.readFileSync(path.join(dir, source), 'utf8').replace('(:domain Guard ', '(:domain MyGuard '))
    fs.writeFileSync(include, fs.readFileSync(include, 'utf8').replace('(!move_to ?inp_position walk)', '(!move_to ?inp_position hurry)'))
    ok(run(dir, compiler, '--check', source))
    ok(run(dir, compiler, source, output, 'guardDomain'))
    const edited = fs.readFileSync(path.join(dir, output), 'utf8')
    assert.notEqual(edited, original)
    assert.match(edited, /MyGuard/)
    assert.ok(!fs.existsSync(path.join(dir, 'node_modules')), 'compilation needs Node builtins only')
    fs.writeFileSync(include, '(:domain Broken')
    const failed = run(dir, compiler, source, output, 'guardDomain')
    assert.notEqual(failed.status, 0)
    assert.match(failed.stderr, /error|unterminated|expected|not written/i)
    assert.equal(fs.readFileSync(path.join(dir, output), 'utf8'), edited, 'a failed explicit compile leaves the last good output intact')
    fs.copyFileSync(path.join(ROOT, 'src/examples/guard/guard_kit.domain'), include)
    ok(run(dir, compiler, source, output, 'guardDomain'))
    fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(dir, 'node_modules'), 'junction')
    fs.copyFileSync(path.join(ROOT, 'tsconfig.json'), path.join(dir, 'tsconfig.json'))
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'htn-compact-consumer', version: '1.0.0', private: true, scripts: { 'htn:compile': 'node tools/htn-authoring/compiler.cjs', 'htn:notices': 'node tools/htn-authoring/notices.mjs', prebuild: 'node -e ""' }, devDependencies: { '@dcl/sdk': '7.30.1', '@dcl/js-runtime': '7.30.1' } }))
    fs.writeFileSync(path.join(dir, 'scene.json'), JSON.stringify({ ecs7: true, runtimeVersion: '7', main: 'bin/index.js', display: { title: 'Compact consumer' }, scene: { base: '0,0', parcels: ['0,0'] } }))
    fs.writeFileSync(path.join(dir, '.dclignore'), 'src\ntools\nnode_modules\n*.md\n*.domain\n*.worldstate\ntsconfig.json\npackage-lock.json\n')
    const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8')
    const entry = /```ts\r?\n([\s\S]*?)```/.exec(readme)?.[1]
    assert.ok(entry)
    fs.writeFileSync(path.join(dir, 'src/index.ts'), entry)
    ok(run(dir, 'tools/htn-authoring/notices.mjs'))
    ok(run(dir, 'tools/htn-authoring/notices.mjs', '--check'))
    const sdk = path.join(ROOT, 'node_modules/@dcl/sdk-commands')
    const pkg = JSON.parse(fs.readFileSync(path.join(sdk, 'package.json'), 'utf8'))
    ok(run(dir, path.join(sdk, pkg.bin['sdk-commands']), 'build', '--production', '--skip-install'))
    const files: string[] = (await getPublishableFiles({ fs: fs.promises }, dir)).map((p: string) => p.replace(/\\/g, '/'))
    assert.ok(files.includes('htn-notices.txt'))
    assert.ok(files.includes('bin/index.js'))
    assert.ok(!files.some(p => /^(src|tools|scripts|test|reference)\//.test(p)), files.join('\n'))
    const customized = fs.readFileSync(path.join(dir, source), 'utf8')
    ok(run(ROOT, path.join(ROOT, 'scripts/htn-install.mjs'), dir, '--starter', '--update'))
    const updated = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
    assert.equal(updated.scripts['htn:compile'], 'node tools/htn-authoring/compiler.cjs')
    assert.equal(updated.scripts['htn:notices'], 'node tools/htn-authoring/notices.mjs')
    assert.equal(updated.scripts.prebuild, 'npm run htn:notices && node -e ""')
    assert.equal(fs.readFileSync(path.join(dir, source), 'utf8'), customized)
    ok(run(dir, 'scripts/htn-compile.mjs', '--check', source))
    assert.ok(!fs.existsSync(path.join(dir, 'AGENTS.md')))
    assert.ok(!fs.existsSync(path.join(dir, 'CLAUDE.md')))
  } finally { remove(dir) }
})

test('prepared compiler is reproducible in a different checkout path and stale content fails its CI check', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'htn-compact-source-'))
  try {
    copy('src/htn-planner', 'src/htn-planner', dir)
    copy('tools/htn', 'tools/htn', dir)
    copy('tools/htn-authoring', 'tools/htn-authoring', dir)
    for (const name of ['htn-authoring', 'htn-notices']) copy(`scripts/${name}.mjs`, `scripts/${name}.mjs`, dir)
    fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(dir, 'node_modules'), 'junction')
    ok(run(dir, 'scripts/htn-authoring.mjs', '--check'))
    fs.appendFileSync(path.join(dir, 'tools/htn-authoring/compiler.cjs'), '\n// stale consumer artifact\n')
    const stale = run(dir, 'scripts/htn-authoring.mjs', '--check')
    assert.notEqual(stale.status, 0)
    assert.match(stale.stderr, /Stale tools\/htn-authoring\/compiler\.cjs/)
    ok(run(dir, 'scripts/htn-authoring.mjs'))
    ok(run(dir, 'scripts/htn-authoring.mjs', '--check'))
  } finally { remove(dir) }
})
