// The shared launcher is tested as an actual ESM entry, not bundled into the test.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

const ROOT = process.env.HTN_REPO_ROOT ?? process.cwd()
const helper = pathToFileURL(path.join(ROOT, 'scripts/run-bundled.mjs')).href

function probe(
  dir: string, name: string, contents: string,
  options: Record<string, unknown> = {}, buildOptions: Record<string, unknown> = {}
) {
  const build = { stdin: { contents, loader: 'ts' }, logLevel: 'silent', ...buildOptions }
  const script = `
    import { runBundled } from ${JSON.stringify(helper)};
    const result = await runBundled(${JSON.stringify(name)}, ${JSON.stringify(build)}, ${JSON.stringify(options)});
    console.log(JSON.stringify({
      status: result.status, stdout: result.stdout, stderr: result.stderr,
      error: result.error?.code, signal: result.signal
    }));`
  const env = { ...process.env }
  delete env.NODE_TEST_CONTEXT
  return spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: dir, env, encoding: 'utf8', windowsHide: true
  })
}

function temporary(run: (dir: string) => void) {
  const dir = mkdtempSync(path.join(tmpdir(), 'htn-launcher-test-'))
  try {
    run(dir)
  } finally {
    assert.equal(path.dirname(dir), tmpdir())
    assert.ok(path.basename(dir).startsWith('htn-launcher-test-'))
    rmSync(dir, { recursive: true, force: true })
  }
}

const bundles = (name: string) => readdirSync(tmpdir()).filter(n => n.startsWith(`htn-${name}-`))

test('bundled CLI forwards args, Node flags, cwd, env, output and exit code, then removes its file', () => {
  temporary(dir => {
    const contents = `
      console.log(JSON.stringify({
        file: process.argv[1], args: process.argv.slice(2), cwd: process.cwd(),
        flag: process.env.HTN_PROBE, gc: typeof global.gc
      }));
      console.error('child-stderr');
      process.exitCode = 7;`
    const result = probe(dir, 'launcher-contract', contents, {
      args: ['a b', '--json'], nodeArgs: ['--expose-gc'], cwd: dir,
      env: { HTN_PROBE: 'kept' }, stdio: 'pipe', encoding: 'utf8'
    })
    assert.equal(result.status, 0, result.stderr)
    const child = JSON.parse(result.stdout)
    const output = JSON.parse(child.stdout)
    assert.equal(child.status, 7)
    assert.match(child.stderr, /child-stderr/)
    assert.deepEqual(output.args, ['a b', '--json'])
    assert.equal(output.cwd, dir)
    assert.equal(output.flag, 'kept')
    assert.equal(output.gc, 'function')
    assert.ok(!existsSync(output.file))
    assert.ok(!existsSync(path.dirname(output.file)))
  })
})

test('bundled CLI cleans temporary files after a child throw', () => {
  temporary(dir => {
    const contents = "console.log(process.argv[1]); throw new Error('child failed')"
    const result = probe(dir, 'launcher-throw', contents, { stdio: 'pipe', encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    const child = JSON.parse(result.stdout)
    assert.equal(child.status, 1)
    assert.match(child.stderr, /child failed/)
    assert.ok(!existsSync(path.dirname(child.stdout.trim())))
  })
})

test('bundled CLI cleans up spawn failures and timeout without changing their status/error', () => {
  temporary(dir => {
    const cases = [
      ['launcher-spawn', { cwd: path.join(dir, 'missing') }],
      ['launcher-timeout', { timeout: 500 }]
    ] as const
    for (const [name, options] of cases) {
      const before = bundles(name)
      const result = probe(dir, name, 'setInterval(()=>{},1000)', {
        ...options, stdio: 'pipe', encoding: 'utf8'
      })
      assert.equal(result.status, 0, result.stderr)
      const child = JSON.parse(result.stdout)
      assert.equal(child.status, null)
      assert.equal(child.error, name === 'launcher-spawn' ? 'ENOENT' : 'ETIMEDOUT')
      assert.deepEqual(bundles(name), before)
    }
  })
})

test('bundled CLI rejects compile errors without leaking a temporary directory', () => {
  temporary(dir => {
    const before = bundles('launcher-build')
    const result = probe(dir, 'launcher-build', 'const = broken', { stdio: 'pipe', encoding: 'utf8' })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /Build failed|Expected/)
    assert.deepEqual(bundles('launcher-build'), before)
  })
})

test('bundled ESM CLI runs imports and top-level await, then removes its module and directory', () => {
  temporary(dir => {
    const result = probe(dir, 'launcher-esm', `
      import { extname } from 'node:path';
      console.log(JSON.stringify({ file: process.argv[1], extension: extname(process.argv[1]),
        value: await Promise.resolve(42) }));`,
      { stdio: 'pipe', encoding: 'utf8' }, { format: 'esm' })
    assert.equal(result.status, 0, result.stderr)
    const child = JSON.parse(result.stdout)
    assert.equal(child.status, 0, child.stderr)
    const output = JSON.parse(child.stdout)
    assert.equal(output.extension, '.mjs')
    assert.equal(output.value, 42)
    assert.ok(!existsSync(output.file))
    assert.ok(!existsSync(path.dirname(output.file)))
  })
})
