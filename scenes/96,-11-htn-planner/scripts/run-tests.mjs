// Headless tests: bundle each test/**/*.test.ts with esbuild (resolves @dcl/sdk/ecs for Node)
// and run them with node:test. Usage: node scripts/run-tests.mjs [substring filter...]
import { build } from 'esbuild'
import { spawnSync } from 'node:child_process'
import { readdirSync, rmSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const root = join(import.meta.dirname, '..')
const outdir = join(root, '.test-build')
const filters = process.argv.slice(2)

function findTests(dir) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === 'fixtures' ? [] : findTests(path)
    return name.endsWith('.test.ts') ? [path] : []
  })
}

const tests = findTests(join(root, 'test')).filter(p => filters.every(f => p.split(sep).join('/').includes(f)))
if (tests.length === 0) {
  console.error('No tests matched', filters)
  process.exit(1)
}

// The SDK's platform module (pulled in by @dcl/sdk/react-ecs) calls the Explorer's ~system APIs when loaded: in Node
// they are stubs whose calls never settle, so scene UI modules can be built in tests (test/debugger/panel.test.ts).
const systemStub = {
  name: 'system-stub',
  setup(b) {
    b.onResolve({ filter: /^~system\// }, args => ({ path: args.path, namespace: 'system-stub' }))
    b.onLoad({ filter: /.*/, namespace: 'system-stub' }, () => ({
      contents: ['subscribe', 'getExplorerInformation', 'getRealm', 'getUserData', 'getPlayerData', 'sendBatch', 'crdtGetState', 'crdtSendToRenderer']
        .map(name => `export const ${name} = () => new Promise(() => {})`)
        .join(';'),
      loader: 'js'
    }))
  }
}

rmSync(outdir, { recursive: true, force: true })
await build({
  plugins: [systemStub],
  entryPoints: tests,
  outdir,
  outbase: root,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  sourcemap: 'inline',
  outExtension: { '.js': '.cjs' },
  logLevel: 'warning',
  jsx: 'transform',
  jsxFactory: 'ReactEcs.createElement',
  // Fixtures are read at runtime relative to the scene root.
  define: { 'process.env.HTN_REPO_ROOT': JSON.stringify(root) }
})

const built = tests.map(p => join(outdir, relative(root, p)).replace(/\.ts$/, '.cjs'))
const result = spawnSync(process.execPath, ['--test', '--enable-source-maps', ...built], { stdio: 'inherit', cwd: root })
process.exit(result.status ?? 1)
