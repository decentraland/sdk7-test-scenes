// All scene CI checks live here. The .mjs entry bundles this Node-only module.
import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { compileWithModules, formatDiagnostic } from '../tools/htn/compiler'
import { splitDomainFile } from '../tools/htn/loader'
import { parseDomain } from '../tools/htn/parser'

type Output = (text: string) => void
type RunNode = (args: string[], root: string) => number

/** Only actual top-level declarations count; comments, strings and includes are not roots. */
export function sourceRoots(root: string): string[] {
  function walk(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
      .flatMap(entry => {
        const file = path.join(dir, entry.name)
        if (entry.isDirectory()) return walk(file)
        if (!entry.isFile() || !entry.name.endsWith('.domain')) return []
        const split = splitDomainFile(readFileSync(file, 'utf8'))
        if (split.error) throw new Error(`${file}:${split.error.pos.line}: ${split.error.code}: ${split.error.message}`)
        const parsed = parseDomain(split.domainText, 0)
        if (parsed.errors.length) {
          const error = parsed.errors[0]
          throw new Error(`${file}:${error.pos.line}: ${error.code}: ${error.message}`)
        }
        return parsed.domain?.isTopLevel ? [file] : []
      })
  }
  const roots = walk(path.join(root, 'src'))
  if (!roots.length) throw new Error('No top_level_domain declarations found under src')
  return roots
}

/** Compile roots through their includes. Check-method diagnostics fail only the strict pass. */
export function checkRoots(roots: string[], strict: boolean, out: Output, err: Output): number {
  for (const file of roots) {
    const source = readFileSync(file, 'utf8')
    const loaded = compileWithModules(file, source)
    let result = loaded.result
    if (strict) {
      // Includes/base modules can supply the check. Non-top-level/wrong-arity declarations must warn too.
      if (!result.ok) {
        for (const diagnostic of result.diagnostics) err(formatDiagnostic(diagnostic))
        return 4
      }
      if (!loaded.modules.some(module => module.methods.some(method => method.name === 'active_plan'))) continue
      result = compileWithModules(file, source, { checkMethods: ['active_plan'] }).result
    }
    for (const diagnostic of result.diagnostics) err(formatDiagnostic(diagnostic))
    if (!result.ok) return 4
    if (strict && result.diagnostics.some(diagnostic => diagnostic.code.startsWith('check-method-'))) return 1
    out(`htn:ci: '${file}' ${strict ? 'active_plan checked' : 'compiled successfully'}`)
  }
  return 0
}

const runNode: RunNode = (args, root) => {
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit', windowsHide: true })
  if (result.error) console.error(`htn:ci: ${result.error.message}`)
  else if (result.signal) console.error(`htn:ci: child terminated by ${result.signal}`)
  return result.status ?? 1
}

/** Sequential, fail-fast checks; no shell, npm child process or parent-repository dependency. */
export function runCi(root: string, run: RunNode = runNode, out: Output = console.log, err: Output = console.error): number {
  try {
    const requireFromScene = createRequire(path.join(root, 'package.json'))
    const tsc = requireFromScene.resolve('typescript/bin/tsc')
    let roots: string[] = []
    const steps: [string, () => number][] = [
      ['Redistribution notices and SDK publish inclusion', () => run(['scripts/htn-notices.mjs', '--check'], root)],
      ['Prepared authoring files match compiler and notice sources', () => run(['scripts/htn-authoring.mjs', '--check'], root)],
      ['Headless tests and generated modules', () => run(['scripts/run-tests.mjs'], root)],
      ['Scene types', () => run([tsc, '--noEmit'], root)],
      ['Tools and test types', () => run([tsc, '-p', 'tsconfig.tools.json'], root)],
      ['Viewer page types', () => run([tsc, '-p', 'tsconfig.viewer.json'], root)],
      ['Every root domain', () => {
        roots = sourceRoots(root)
        return checkRoots(roots, false, out, err)
      }],
      ['Domain lint (shape warnings are informational)', () => run(['scripts/htn-lint.mjs', 'src'], root)],
      ['active_plan (check-method warnings are errors)', () => checkRoots(roots, true, out, err)]
    ]
    for (const [name, check] of steps) {
      out(`htn:ci: ${name}`)
      const code = check()
      if (code !== 0) {
        err(`htn:ci: ${name} failed (exit ${code})`)
        return code
      }
    }
    return 0
  } catch (error) {
    err(`htn:ci: ${(error as Error).message}`)
    return 1
  }
}
