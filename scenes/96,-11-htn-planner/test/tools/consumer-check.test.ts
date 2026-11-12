// Independent consumer: no catalogue or copied demo source is available to these commands.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { parseSession } from '../../src/htn-planner/debug/session'

const ROOT = process.env.HTN_REPO_ROOT ?? process.cwd()
const requireFromScene = createRequire(path.join(ROOT, 'package.json'))
const { build }: typeof import('esbuild') = requireFromScene('esbuild')
const { getPublishableFiles } = requireFromScene('@dcl/sdk-commands/dist/logic/project-files')
function node(cwd: string, script: string, ...args: string[]) {
  const env: NodeJS.ProcessEnv = { ...process.env, INIT_CWD: path.join(ROOT, 'intentionally-wrong-parent') }
  delete env.NODE_TEST_CONTEXT
  return spawnSync(process.execPath, [script, ...args], { cwd, env, encoding: 'utf8', windowsHide: true })
}
const ok = (r: ReturnType<typeof node>) => assert.equal(r.status, 0, r.stdout + r.stderr)

test('portable custom scenarios and shared host survive standalone installation and publish no support', { timeout: 120000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'htn-consumer checks-'))
  try {
    fs.mkdirSync(path.join(dir, 'src'))
    fs.mkdirSync(path.join(dir, 'test'))
    fs.writeFileSync(path.join(dir, 'test/runtime-dialogue.txt'), 'Creator-owned runtime dialogue\n')
    fs.writeFileSync(path.join(dir, 'scene.json'), JSON.stringify({ runtimeVersion: '7', ecs7: true, main: 'bin/index.js', display: { title: 'Checks consumer' }, scene: { base: '0,0', parcels: ['0,0'] } }))
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'check-consumer', version: '1.0.0', devDependencies: { '@dcl/sdk': '7.30.1', '@dcl/js-runtime': '7.30.1' } }))
    fs.writeFileSync(path.join(dir, 'src/index.ts'), 'export function main() {}\n')
    fs.copyFileSync(path.join(ROOT, 'tsconfig.json'), path.join(dir, 'tsconfig.json'))
    fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(dir, 'node_modules'), 'junction')
    ok(node(ROOT, path.join(ROOT, 'scripts/htn-install.mjs'), dir))
    assert.ok(!fs.existsSync(path.join(dir, 'src/htn-testing')))
    assert.ok(!fs.existsSync(path.join(dir, 'tools/consumer')))
    assert.ok(!fs.existsSync(path.join(dir, 'scripts/htn-check.mjs')))
    assert.ok(!fs.existsSync(path.join(dir, 'scripts/run-bundled.mjs')), 'minimal install needs no source CLI launcher')
    const minimalPublished: string[] = await getPublishableFiles({ fs: fs.promises }, dir)
    assert.ok(minimalPublished.map(p => p.replace(/\\/g, '/')).includes('test/runtime-dialogue.txt'), 'minimal install preserves creator-owned test/ runtime assets')
    ok(node(ROOT, path.join(ROOT, 'scripts/htn-install.mjs'), dir, '--testing'))
    assert.ok(fs.existsSync(path.join(dir, 'scripts/run-bundled.mjs')), 'optional CLI launcher is copied with testing')
    assert.ok(!fs.existsSync(path.join(dir, 'reference')), 'standalone checks require no reference catalogue')
    assert.ok(!fs.existsSync(path.join(dir, 'src/examples')))
    assert.ok(!fs.existsSync(path.join(dir, 'tools/htn/canon.ts')))
    const cases = path.join(dir, 'htn-tests/fixtures/consumer')
    fs.cpSync(path.join(ROOT, 'test/fixtures/consumer'), cases, { recursive: true })
    const manifest = 'htn-tests/fixtures/consumer/jobs.tests.ts'
    const report = node(dir, 'scripts/htn-check.mjs', manifest, '--json', '--seed', '23', '--session', '../../../htn-reports')
    ok(report)
    const data = JSON.parse(report.stdout)
    assert.equal(data.seed, 23)
    assert.equal(data.results.length, 7)
    assert.ok(data.results.every((r: { matches: boolean }) => r.matches))
    assert.equal(data.results.find((r: { name: string }) => r.name === 'invalid setup').status, 'invalid_world')
    const story = data.results.at(-1)
    assert.ok(story.trace.includes('a: fail !finish a'))
    assert.ok(story.trace.includes('a: owner: (none)'))
    const session = parseSession(fs.readFileSync(story.session, 'utf8'))
    assert.equal(new Set(session.runs.map(r => r.agent)).size, 2)
    assert.ok(session.timeline.some(e => e.event.type === 'step_end' && e.event.status === 'failed'))
    const text = node(dir, 'scripts/htn-check.mjs', manifest, '--case', 'shared host interruption failure and cleanup')
    ok(text)
    assert.match(text.stdout, /a: switch: !flee a/)
    const again = node(dir, 'scripts/htn-check.mjs', manifest, '--json', '--seed', '23')
    ok(again)
    assert.deepEqual(JSON.parse(again.stdout).results.map((r: { plan?: string[]; trace?: string[] }) => r.plan ?? r.trace), data.results.map((r: { plan?: string[]; trace?: string[] }) => r.plan ?? r.trace))
    const entry = path.join(cases, 'jobs.tests.ts')
    const original = fs.readFileSync(entry, 'utf8')
    fs.writeFileSync(entry, original.replace("plan: ['!claim a', '!finish a']", "plan: ['!wrong a']"))
    const wrong = node(dir, 'scripts/htn-check.mjs', manifest, '--json')
    assert.equal(wrong.status, 1, wrong.stdout + wrong.stderr)
    assert.equal(JSON.parse(wrong.stdout).status, 'failed')
    fs.writeFileSync(entry, original.replace("name: 'positive', world: 'free.worldstate'", "name: 'positive', world: 'invalid.worldstate'"))
    const invalid = node(dir, 'scripts/htn-check.mjs', manifest, '--case', 'positive', '--json')
    assert.equal(invalid.status, 3, invalid.stdout + invalid.stderr)
    assert.equal(JSON.parse(invalid.stdout).results[0].status, 'invalid_world')
    fs.writeFileSync(entry, original.replace("method: 'job'", "method: 'unknown'"))
    const noPlan = node(dir, 'scripts/htn-check.mjs', manifest, '--case', 'positive', '--json')
    assert.equal(noPlan.status, 1)
    assert.equal(JSON.parse(noPlan.stdout).results[0].status, 'invalid_call')
    fs.writeFileSync(entry, original)
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
    assert.equal(pkg.scripts['htn:check'], 'node scripts/htn-check.mjs')
    ok(node(dir, 'tools/htn-authoring/compiler.cjs', 'htn-tests/fixtures/consumer/jobs.domain', 'src/jobs.htn.ts', 'jobsDomain'))
    fs.writeFileSync(path.join(dir, 'src/index.ts'), "import { jobsDomain } from './jobs.htn'; import { decompose } from './htn-planner/htn/planner'; import { WorldState } from './htn-planner/htn/world-state'; import { sym } from './htn-planner/htn/atom'; export function main() { decompose(jobsDomain, new WorldState(), 'job', [sym('a')]) }\n")
    const sdk = path.join(ROOT, 'node_modules/@dcl/sdk-commands')
    const sdkPkg = JSON.parse(fs.readFileSync(path.join(sdk, 'package.json'), 'utf8'))
    ok(node(dir, path.join(sdk, sdkPkg.bin['sdk-commands']), 'build', '--production', '--skip-install'))
    const bundle = await build({ entryPoints: [path.join(dir, 'src/index.ts')], absWorkingDir: dir, bundle: true, write: false, platform: 'browser', format: 'cjs', target: 'es2020', treeShaking: true, metafile: true, external: ['~system/*'], logLevel: 'silent' })
    const used = Object.values(bundle.metafile!.outputs).flatMap(o => Object.entries(o.inputs).filter(([, v]) => v.bytesInOutput > 0).map(([p]) => p.replace(/\\/g, '/')))
    assert.ok(!used.some(p => /(^|\/)(tools|test|scripts)\/|htn-testing/.test(p)), used.join('\n'))
    const published: string[] = (await getPublishableFiles({ fs: fs.promises }, dir)).map((s: string) => s.replace(/\\/g, '/'))
    assert.ok(!published.some(p => /^(src|tools|scripts|reference|htn-reports|htn-tests)\//.test(p)), published.join('\n'))
    assert.ok(published.includes('htn-notices.txt'))
    assert.ok(published.includes('test/runtime-dialogue.txt'), 'optional helpers also preserve creator-owned test/ runtime assets')
    assert.equal(fs.readFileSync(path.join(dir, 'test/runtime-dialogue.txt'), 'utf8'), 'Creator-owned runtime dialogue\n')
    // A reference snapshot may be independently removed; the installed check command still runs.
    fs.mkdirSync(path.join(dir, 'reference/htn'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'reference/htn/removable.txt'), 'unused')
    const reference = path.join(dir, 'reference/htn')
    assert.ok(fs.realpathSync(reference).startsWith(fs.realpathSync(dir) + path.sep))
    fs.rmSync(reference, { recursive: true })
    ok(node(dir, 'scripts/htn-check.mjs', manifest))
  } finally {
    assert.equal(path.dirname(dir), os.tmpdir())
    assert.ok(path.basename(dir).startsWith('htn-consumer checks-'))
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('benchmark-only install runs independently and excludes its launcher from publication', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'htn-benchmark-install-'))
  try {
    const scene = { runtimeVersion: '7', ecs7: true, main: 'bin/index.js', scene: { base: '0,0', parcels: ['0,0'] } }
    fs.writeFileSync(path.join(dir, 'scene.json'), JSON.stringify(scene))
    const pkg = { name: 'measure-consumer', version: '1.0.0' }
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg))
    fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(dir, 'node_modules'), 'junction')
    ok(node(ROOT, path.join(ROOT, 'scripts/htn-install.mjs'), dir, '--benchmark'))
    assert.ok(fs.existsSync(path.join(dir, 'scripts/run-bundled.mjs')))
    assert.ok(!fs.existsSync(path.join(dir, 'scripts/htn-check.mjs')))
    assert.ok(!fs.existsSync(path.join(dir, 'reference')))
    const result = node(
      dir, 'scripts/htn-measure.mjs', 'tools/consumer/example/jobs.measure.ts',
      '--scenario', 'ordinary', '--samples', '2', '--warmup', '0', '--repeats', '1', '--json', '-'
    )
    ok(result)
    const report = JSON.parse(result.stdout)
    assert.equal(report.scenarios.length, 1)
    assert.equal(report.scenarios[0].status, 'succeeded')
    const files: string[] = await getPublishableFiles({ fs: fs.promises }, dir)
    assert.ok(!files.some(file => file.replace(/\\/g, '/') === 'scripts/run-bundled.mjs'))
  } finally {
    assert.equal(path.dirname(dir), os.tmpdir())
    assert.ok(path.basename(dir).startsWith('htn-benchmark-install-'))
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
