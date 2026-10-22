// CLI: compile a .domain file into a DomainIR TS module, or a .worldstate file into a WorldFacts module.
// Usage (via scripts/htn-compile.mjs / `npm run htn:compile --`):
//   <file.domain|file.worldstate> <out.ts> [exportName] [--ir-import <specifier>] [--check-method <name>]...
//   --check <file.domain|file.worldstate>... [--check-method <name>]...
// --check-method names a top-level method that checks the running plan (GuardAgentOptions.activePlan): its branches
// that accept any running step are warnings (CompileOptions.checkMethods). Warnings never fail a run.
// exportName defaults to `<domainName>Domain` in lowerCamelCase (`<fileName>Facts` for a world state). The
// import specifier defaults to the path of src/htn-planner/htn/ir (or world-state) relative to <out.ts>.
import * as fs from 'node:fs'
import * as nodePath from 'node:path'
import { WorldState } from '../../src/htn-planner/htn/world-state'
import { compileDomainFile, emitDomainModule, emitWorldStateModule, formatDiagnostic, parseWorldState } from './compiler'

const USAGE = [
  'usage: npm run htn:compile -- <file.domain|file.worldstate> <out.ts> [exportName] [--ir-import <specifier>] [--check-method <name>]...',
  '       npm run htn:compile -- --check <file.domain|file.worldstate>... [--check-method <name>]...'
].join('\n')
/** Upstream HTNTranslator exits 4 when a domain does not load (HTNTranslator/src/main.cpp:92, :229). */
const EXIT_CHECK_FAILED = 4

const repoRoot = () => process.env.HTN_REPO_ROOT ?? process.cwd()
const slashes = (path: string) => path.split(nodePath.sep).join('/')

/** lowerCamelCase of a file name: 'AAACombatNPC_high_order' -> 'aaaCombatNPCHighOrder'. */
function camel(name: string): string {
  const words = name.split(/[^A-Za-z0-9]+/).filter(Boolean)
  const lowerFirst = (w: string) => {
    const caps = /^[A-Z]+(?=[A-Z][a-z])/.exec(w)?.[0] ?? (/^[A-Z]+$/.test(w) ? w : w.charAt(0))
    return caps.toLowerCase() + w.slice(caps.length)
  }
  return words.map((w, i) => (i === 0 ? lowerFirst(w) : w.charAt(0).toUpperCase() + w.slice(1))).join('')
}

/** `module` of src/htn-planner/htn relative to the folder of `outPath`, unless given explicitly. */
function importSpecifier(outPath: string, module: string, explicit: string | undefined): string {
  if (explicit !== undefined) return explicit
  const outDir = nodePath.dirname(nodePath.resolve(outPath))
  const specifier = slashes(nodePath.relative(outDir, nodePath.join(repoRoot(), 'src', 'htn-planner', 'htn', module)))
  return specifier.startsWith('.') ? specifier : './' + specifier
}

function write(outPath: string, text: string) {
  fs.mkdirSync(nodePath.dirname(nodePath.resolve(outPath)), { recursive: true })
  fs.writeFileSync(outPath, text)
}

function compileWorldState(statePath: string, outPath: string, exportArg: string | undefined, irImport: string | undefined): number {
  const world = new WorldState()
  try {
    parseWorldState(fs.readFileSync(statePath, 'utf8'), world)
  } catch (e) {
    console.error(`${statePath}: ${(e as Error).message}`)
    return 1
  }
  const exportName = exportArg ?? `${camel(nodePath.basename(statePath, '.worldstate'))}Facts`
  const source = slashes(nodePath.relative(repoRoot(), nodePath.resolve(statePath)))
  let text: string
  try {
    const irImportPath = importSpecifier(outPath, 'world-state', irImport)
    text = emitWorldStateModule(world, exportName, { irImportPath, header: [`Source: ${source}`] })
  } catch (e) {
    console.error(`htn:compile: ${(e as Error).message}`)
    return 2
  }
  write(outPath, text)
  console.log(`htn:compile: wrote ${outPath} (${exportName}: ${world.tableKeys().length} fact tables)`)
  return 0
}

/**
 * Upstream `HTNTranslator --check <domain-file>` (main.cpp:80-97): load, link and validate, print every diagnostic,
 * write nothing. Ours takes several files and .worldstate files too; the exit code is 4 if any of them fails.
 */
function check(paths: string[], checkMethods: string[]): number {
  let failed = 0
  for (const path of paths) {
    if (path.endsWith('.worldstate')) {
      try {
        parseWorldState(fs.readFileSync(path, 'utf8'), new WorldState())
        console.log(`htn:compile: '${path}' parsed successfully`)
      } catch (e) {
        console.error(`${path}: ${(e as Error).message}`)
        console.error(`htn:compile: check failed for '${path}'`)
        failed++
      }
      continue
    }
    const result = compileDomainFile(path, { checkMethods })
    for (const d of result.diagnostics) console.error(formatDiagnostic(d))
    if (!result.ok) {
      const errors = result.diagnostics.filter(d => d.severity === 'error').length
      console.error(`htn:compile: check failed for '${path}' with ${errors} error(s)`)
      failed++
    } else console.log(`htn:compile: '${path}' compiled successfully (${result.files.length} linked source file(s))`)
  }
  if (failed && paths.length > 1) console.error(`htn:compile: ${failed} of ${paths.length} file(s) failed the check`)
  return failed ? EXIT_CHECK_FAILED : 0
}

/** Takes every `--check-method <name>` out of `argv`; null when one has no name. */
function takeCheckMethods(argv: string[]): { rest: string[]; checkMethods: string[] } | null {
  const rest: string[] = []
  const checkMethods: string[] = []
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] !== '--check-method') rest.push(argv[i])
    else if (i + 1 < argv.length && argv[i + 1] && !argv[i + 1].startsWith('-')) checkMethods.push(argv[++i])
    else return null
  }
  return { rest, checkMethods }
}

function main(args: string[]): number {
  const taken = takeCheckMethods(args)
  if (taken === null) {
    console.error(USAGE)
    return 2
  }
  const { rest: argv, checkMethods } = taken
  if (argv[0] === '--check') {
    const paths = argv.slice(1)
    if (paths.length === 0 || paths.some(p => p.startsWith('-'))) {
      console.error(USAGE)
      return 2
    }
    return check(paths, checkMethods)
  }
  const positional: string[] = []
  let irImport: string | undefined
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--ir-import') irImport = argv[++i]
    else if (argv[i] === '-h' || argv[i] === '--help') {
      console.log(USAGE)
      return 0
    } else positional.push(argv[i])
  }
  if (positional.length < 2 || positional.length > 3 || (irImport !== undefined && !irImport)) {
    console.error(USAGE)
    return 2
  }
  const [domainPath, outPath, exportArg] = positional
  if (domainPath.endsWith('.worldstate')) return compileWorldState(domainPath, outPath, exportArg, irImport)
  const result = compileDomainFile(domainPath, { checkMethods })
  for (const d of result.diagnostics) console.error(formatDiagnostic(d))
  if (!result.ok) {
    const errors = result.diagnostics.filter(d => d.severity === 'error').length
    console.error(`htn:compile: ${errors} error(s); ${outPath} not written`)
    return 1
  }
  const ir = result.ir
  const exportName = exportArg ?? `${ir.name.charAt(0).toLowerCase()}${ir.name.slice(1)}Domain`
  const source = slashes(nodePath.relative(repoRoot(), nodePath.resolve(domainPath)))
  let text: string
  try {
    text = emitDomainModule(ir, exportName, { irImportPath: importSpecifier(outPath, 'ir', irImport), header: [`Source: ${source}`] })
  } catch (e) {
    console.error(`htn:compile: ${(e as Error).message}`)
    return 2
  }
  write(outPath, text)
  console.log(`htn:compile: wrote ${outPath} (${exportName}: ${ir.methods.length} methods, ${ir.axioms.length} axioms)`)
  return 0
}

process.exitCode = main(process.argv.slice(2))
