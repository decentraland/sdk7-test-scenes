// Run a Node-only TypeScript CLI without leaving compiled files in the scene.
// Callers own argument parsing, error messages and exit-code policy; this owns build/run/cleanup.
import { build } from 'esbuild'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export async function runBundled(
  name,
  buildOptions,
  { args = process.argv.slice(2), nodeArgs = [], ...spawnOptions } = {}
) {
  const bundled = await build({
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    write: false,
    logLevel: 'warning',
    ...buildOptions
  })
  const dir = mkdtempSync(join(tmpdir(), `htn-${name}-`))
  try {
    const extension = buildOptions.format === 'esm' ? 'mjs' : 'cjs'
    const file = join(dir, `${name}.${extension}`)
    writeFileSync(file, bundled.outputFiles[0].contents)
    return spawnSync(process.execPath, [...nodeArgs, file, ...args], {
      stdio: 'inherit',
      windowsHide: true,
      ...spawnOptions
    })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
