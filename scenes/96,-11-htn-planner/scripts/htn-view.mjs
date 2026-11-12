// npm run htn:view -- <session.json> [--out file.html] [--open]: bundle the session viewer's page
// (tools/viewer/page/main.ts, ELK included) for the browser with esbuild, then run tools/viewer/cli.ts, which writes
// one self-contained HTML page with the session embedded. With --text / --json the CLI prints a report instead and
// the page is not bundled. Exit code: the CLI's (0 written, 2 usage or a bad file).
import { build } from 'esbuild'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')

// The page runs in a browser: the scene SDK must never be pulled in (import the library's modules, not its index).
const noSdk = {
  name: 'no-sdk',
  setup(b) {
    b.onResolve({ filter: /^@dcl\/|^~system\// }, args => ({ errors: [{ text: `the viewer page must not import ${args.path} (from ${args.importer})` }] }))
  }
}

const argv = process.argv.slice(2)
const report = argv.includes('--text') || argv.includes('--json')

const page = report
  ? null
  : await build({
      entryPoints: [join(root, 'tools/viewer/page/main.ts')],
      bundle: true,
      platform: 'browser',
      format: 'iife',
      target: 'es2020',
      minify: true,
      write: false,
      logLevel: 'warning',
      legalComments: 'none',
      plugins: [noSdk]
    })
const cli = await build({
  entryPoints: [join(root, 'tools/viewer/cli.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  write: false,
  logLevel: 'warning'
})
const dir = mkdtempSync(join(tmpdir(), 'htn-view-'))
try {
  const js = join(dir, 'page.js')
  const main = join(dir, 'view.cjs')
  if (page) writeFileSync(js, page.outputFiles[0].contents)
  writeFileSync(main, cli.outputFiles[0].contents)
  const result = spawnSync(process.execPath, [main, ...argv], {
    stdio: 'inherit',
    env: { ...process.env, HTN_REPO_ROOT: root, HTN_VIEWER_JS: js, INIT_CWD: process.env.INIT_CWD ?? process.cwd() }
  })
  process.exitCode = result.status ?? 1
} finally {
  rmSync(dir, { recursive: true, force: true })
}
