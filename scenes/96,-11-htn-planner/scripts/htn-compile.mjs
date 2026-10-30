// Compatibility entry for the compact Node-only authoring compiler.
// Usage: npm run htn:compile -- <file.domain> <out.ts> [exportName] [--ir-import <specifier>]
//        npm run htn:compile -- --check <file.domain|file.worldstate>...
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const compiler = fileURLToPath(new URL('../tools/htn-authoring/compiler.cjs', import.meta.url))
const result = spawnSync(process.execPath, [compiler, ...process.argv.slice(2)], {
  stdio: 'inherit',
  windowsHide: true,
  env: { ...process.env, HTN_REPO_ROOT: root }
})
if (result.error) console.error(`htn:compile: ${result.error.message}`)
process.exitCode = result.status ?? 1
