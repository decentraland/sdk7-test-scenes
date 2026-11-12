// Install the reusable HTN module into an existing SDK7 scene; examples stay optional.
import * as fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { checkedPath, configuration, pathIdentity } from '../tools/htn-authoring/config.mjs'

const source = fileURLToPath(new URL('../', import.meta.url))
const repository = 'https://github.com/decentraland/sdk7-test-scenes'
const scenePath = 'scenes/96,-11-htn-planner'
const usage = 'Usage: node scripts/htn-install.mjs <SDK7 scene> [--starter] [--reference] [--testing] [--benchmark] [--update]'
const args = process.argv.slice(2)
if (args.length === 1 && args[0] === '--help') {
  console.log(usage + '\n--starter: add a game-owned guard; --reference: removable source examples/assets; --testing: portable game-owned scenario/story checks; --benchmark: portable measurements; --update: replace installed module files, keeping game files.')
} else {
  main().catch(error => { console.error(error.message); process.exitCode = 1 })
}

async function read(file) {
  try { return await fs.readFile(file) } catch (error) { if (error.code === 'ENOENT') return null; throw error }
}

const newline = text => /\r\n|\n/.exec(text)?.[0] ?? '\n'
function stringifyJson(value, previous = null) {
  const indent = previous === null ? '  ' : /^[ \t]+(?=")/m.exec(previous)?.[0]
  const trailing = previous === null ? '\n' : /(?:\r?\n)+$/.exec(previous)?.[0] ?? ''
  return JSON.stringify(value, null, indent).replace(/\n/g, newline(previous ?? '')) + trailing
}

async function main() {
  if (!args[0] || args[0].startsWith('--') || args.slice(1).some(a => !['--starter', '--reference', '--testing', '--benchmark', '--update'].includes(a))) throw new Error(usage)
  const target = await fs.realpath(path.resolve(args[0]))
  const sourceReal = await fs.realpath(source)
  const inside = (base, file) => { const rel = path.relative(base, file); return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel)) }
  if (inside(sourceReal, target) || inside(target, sourceReal)) throw new Error('Choose a separate scene, outside this source checkout.')
  const scene = JSON.parse(await fs.readFile(path.join(target, 'scene.json'), 'utf8'))
  if (scene.runtimeVersion !== '7') throw new Error('Target must be an SDK7 scene (runtimeVersion: "7").')
  const packageText = await fs.readFile(path.join(target, 'package.json'), 'utf8')
  const pkg = JSON.parse(packageText)
  const configPath = path.join(target, 'htn.config.json')
  const existingConfig = await read(configPath)
  const configured = existingConfig === null ? null : configuration(configPath, { allowEmpty: args.includes('--starter') })
  const noticeStat = await fs.lstat(path.join(target, 'htn-notices.txt')).catch(error => { if (error.code !== 'ENOENT') throw error; return null })
  if (noticeStat && !noticeStat.isFile()) throw new Error('Notice destination must be a regular file, not a link: htn-notices.txt')
  const planned = new Map()
  const add = (name, data, update = args.includes('--update')) => planned.set(name, { data: Buffer.from(data), update })
  async function tree(from, to, copy = (dest, data) => add(dest, data)) {
    for (const entry of await fs.readdir(from, { withFileTypes: true })) {
      const src = path.join(from, entry.name), dest = path.posix.join(to, entry.name)
      if (entry.isDirectory()) await tree(src, dest, copy)
      else if (entry.isFile()) await copy(dest, await fs.readFile(src))
      else throw new Error('Unsupported reference entry: ' + src)
    }
  }
  await tree(path.join(source, 'src/htn-planner'), 'src/htn-planner')
  // Normal authoring uses the prepared folder, not the compiler's internal source-file closure.
  await tree(path.join(source, 'tools/htn-authoring'), 'tools/htn-authoring')
  if (args.includes('--testing') || args.includes('--benchmark')) {
    // Optional source-based checks/measurements import compiler internals; the starter does not.
    for (const name of ['ast', 'check-methods', 'cli', 'compiler', 'diagnostics', 'emit', 'lexer', 'linker', 'loader', 'parser', 'reachability', 'validator', 'worldstate']) {
      const rel = 'tools/htn/' + name + '.ts'
      add(rel, await fs.readFile(path.join(source, rel)))
    }
    for (const name of ['LICENSE', 'LICENSE.htn_planner']) add('tools/htn/' + name, await fs.readFile(path.join(source, 'tools/htn', name)))
  }
  // Fresh installs use the prepared entrypoints. Only existing npm commands need legacy shims.
  const existingScripts = Object.values(pkg.scripts ?? {}).filter(command => typeof command === 'string').map(command => command.replace(/\\/g, '/'))
  for (const name of ['htn-compile', 'htn-notices']) {
    if (existingScripts.some(command => command.includes('scripts/' + name + '.mjs'))) {
      add('scripts/' + name + '.mjs', await fs.readFile(path.join(source, 'scripts', name + '.mjs')))
    }
  }
  if (args.includes('--testing') || args.includes('--benchmark')) {
    add('scripts/run-bundled.mjs', await fs.readFile(path.join(source, 'scripts/run-bundled.mjs')))
    await tree(path.join(source, 'src/htn-testing'), 'src/htn-testing')
    for (const name of ['manifest', 'load']) add('tools/consumer/' + name + '.ts', await fs.readFile(path.join(source, 'tools/consumer', name + '.ts')))
    add('tools/htn/world-invariants.ts', await fs.readFile(path.join(source, 'tools/htn/world-invariants.ts')))
  }
  if (args.includes('--testing')) {
    for (const name of ['check']) add('tools/consumer/' + name + '.ts', await fs.readFile(path.join(source, 'tools/consumer', name + '.ts')))
    add('scripts/htn-check.mjs', await fs.readFile(path.join(source, 'scripts/htn-check.mjs')))
    add('docs/consumer-testing.md', await fs.readFile(path.join(source, 'docs/consumer-testing.md')))
  }
  if (args.includes('--benchmark')) {
    await tree(path.join(source, 'tools/consumer/example'), 'tools/consumer/example')
    add('tools/consumer/bench.ts', await fs.readFile(path.join(source, 'tools/consumer/bench.ts')))
    for (const name of ['compare', 'alloc']) add('scripts/bench/' + name + '.ts', await fs.readFile(path.join(source, 'scripts/bench', name + '.ts')))
    add('scripts/htn-measure.mjs', await fs.readFile(path.join(source, 'scripts/htn-measure.mjs')))
    add('docs/consumer-benchmark.md', await fs.readFile(path.join(source, 'docs/consumer-benchmark.md')))
  }
  const gitRoot = spawnSync('git', ['-C', source, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', windowsHide: true })
  let ownCheckout = false
  if (gitRoot.status === 0) {
    const top = await fs.realpath(gitRoot.stdout.trim())
    ownCheckout = path.relative(top, sourceReal).split(path.sep).join('/') === scenePath
  }
  const revision = ownCheckout ? spawnSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }) : null
  const ref = revision?.status === 0 && /^[a-f0-9]{40}$/.test(revision.stdout.trim()) ? revision.stdout.trim() : null
  const dirty = ref ? spawnSync('git', ['-C', source, 'status', '--porcelain', '--', '.'], { encoding: 'utf8', windowsHide: true }) : null
  add('src/htn-planner/SOURCE.json', JSON.stringify({ repository, ref, pinned: ref !== null, url: `${repository}/tree/${ref ?? 'main'}/${scenePath}`, localChanges: dirty?.status === 0 ? dirty.stdout.trim() !== '' : null }, null, 2) + '\n')
  if (args.includes('--starter')) {
    const template = await fs.readFile(path.join(source, 'tools/htn-authoring/htn.config.example.json'))
    const starter = JSON.parse(template).domains[0]
    let exportName = starter.exportName
    let sourceLabel = starter.source
    const canonical = (value, field, extension) => {
      const file = checkedPath(target, value, field)
      if (!file.endsWith(extension)) throw new Error('Invalid htn.config.json ' + field + ': expected a ' + extension + ' path.')
      return pathIdentity(file)
    }
    const starterSource = canonical(starter.source, 'starter source', '.domain')
    const starterOutput = canonical(starter.output, 'starter output', '.ts')

    const importFrom = (output, library) => {
      const rel = path.relative(path.dirname(output), library).split(path.sep).join('/')
      return rel.startsWith('.') ? rel : './' + rel
    }
    const logicalLibrary = path.join(target, 'src/htn-planner/htn/ir')
    const physicalLibrary = canonical('src/htn-planner/htn/ir.ts', 'library module', '.ts').slice(0, -3)
    const irImport = importFrom(path.resolve(target, starter.output), logicalLibrary)
    const aliasConflict = () => new Error('Starter config conflict in htn.config.json: ambiguous output aliases change relative imports. Use an unaliased starter layout, or install without --starter.')
    if (importFrom(starterOutput, physicalLibrary) !== irImport) throw aliasConflict()

    let mapped
    if (existingConfig === null) add('htn.config.json', template, false)
    else {
      const { config, entries } = configured
      for (const [i, entry] of config.domains.entries()) {
        const entrySource = pathIdentity(entries[i].source)
        const entryOutput = pathIdentity(entries[i].output)
        if (entrySource === starterSource) {
          if (entryOutput !== starterOutput || mapped) throw new Error('Starter config conflict in htn.config.json: guard source already has a different or repeated output. Keep your mapping and install without --starter, or resolve it first.')
          mapped = entry
        } else if (entryOutput === starterOutput) throw new Error('Starter config conflict in htn.config.json: guard output belongs to another source. Resolve it before installing --starter.')
      }
      if (mapped) {
        if (importFrom(path.resolve(target, mapped.output), logicalLibrary) !== irImport) throw aliasConflict()
        exportName = mapped.exportName ?? exportName
        sourceLabel = mapped.source
      }
      else {
        config.domains.push(starter)
        add('htn.config.json', stringifyJson(config, existingConfig.toString()), true)
      }
    }
    const required = ['guard.domain', 'guard_kit.domain', 'guard.htn.ts']
    const present = await Promise.all(required.map(name => read(path.join(target, 'src/npc/guard', name))))
    if (present.some(file => file !== null) && present.some(file => file === null)) throw new Error('Partial starter in src/npc/guard: complete your existing behaviour before installing --starter. No starter files were changed.')
    if (present.some(file => file !== null) && !mapped) throw new Error('Existing game-owned starter has no matching htn.config.json mapping. Add its source, output and exportName explicitly, or install without --starter. No files were changed.')
    // Copy the whole example folder, but never replace a game-owned starter or its support files.
    await tree(path.join(source, 'src/examples/guard'), 'src/npc/guard', async (dest, data) => {
      if (await read(path.join(target, dest)) !== null) return
      if (dest === 'src/npc/guard/guard.htn.ts') {
        data = Buffer.from(data.toString()
          .replace('// Source: src/examples/guard/guard.domain', '// Source: ' + sourceLabel)
          .replace('../../htn-planner/htn/ir', irImport)
          .replace('export const ' + starter.exportName + ':', 'export const ' + exportName + ':'))
      }
      add(dest, data, false)
    })
  }
  const configuredGeneration = existingConfig !== null || args.includes('--starter')
  if (args.includes('--reference')) {
    for (const name of ['src', 'assets', 'tools', 'scripts', 'test', 'benchmarks', 'docs']) await tree(path.join(source, name), 'reference/htn/' + name)
    add('reference/htn/README.md', await fs.readFile(path.join(source, 'REFERENCE.md')))
    add('reference/htn/DEMO.md', await fs.readFile(path.join(source, 'DEMO.md')))
    add('reference/htn/SOURCE.json', planned.get('src/htn-planner/SOURCE.json').data)
  }
  pkg.scripts ??= {}
  const optionalScripts = { ...(args.includes('--testing') ? { 'htn:check': 'node scripts/htn-check.mjs' } : {}), ...(args.includes('--benchmark') ? { 'htn:measure': 'node scripts/htn-measure.mjs' } : {}) }
  const legacyScripts = { 'htn:compile': 'node scripts/htn-compile.mjs', 'htn:notices': 'node scripts/htn-notices.mjs' }
  for (const [name, command] of Object.entries({ ...optionalScripts, 'htn:compile': 'node tools/htn-authoring/compiler.cjs', 'htn:notices': 'node tools/htn-authoring/notices.mjs', 'htn:generate': 'node tools/htn-authoring/generate.mjs', 'htn:watch': 'node tools/htn-authoring/generate.mjs --watch' })) {
    const previous = pkg.scripts[name]
    if (previous && previous !== command && previous !== legacyScripts[name]) throw new Error('Conflicting npm script: ' + name + '. Resolve it before installing.')
    pkg.scripts[name] ??= command // Keep known older entrypoints as well as current manual-copy commands.
  }
  for (const hook of ['prestart', 'prebuild', 'predeploy']) {
    if (hook === 'prestart' && !configuredGeneration) continue
    if (hook !== 'prestart' && !pkg.scripts[hook]?.includes('npm run htn:notices')) pkg.scripts[hook] = 'npm run htn:notices' + (pkg.scripts[hook] ? ' && ' + pkg.scripts[hook] : '')
    if (configuredGeneration && !pkg.scripts[hook]?.includes('npm run htn:generate')) pkg.scripts[hook] = 'npm run htn:generate' + (pkg.scripts[hook] ? ' && ' + pkg.scripts[hook] : '')
  }
  add('package.json', stringifyJson(pkg, packageText), true)
  const ignored = (await read(path.join(target, '.dclignore')))?.toString() ?? ''
  const patterns = ['htn.config.json', 'src/htn-planner', 'tools/htn', 'tools/htn-authoring', 'scripts/htn-compile.mjs', 'scripts/htn-notices.mjs', 'reference/htn', 'src/npc/guard/*.domain', 'src/htn-testing', 'tools/consumer', 'scripts/htn-check.mjs', 'scripts/htn-measure.mjs', 'scripts/run-bundled.mjs', 'scripts/bench', 'htn-tests', 'htn-reports', 'docs/consumer-testing.md', 'docs/consumer-benchmark.md']
  const existing = new Set(ignored.split(/\r?\n/).map(s => s.trim().replace(/\/$/, '')))
  const extra = patterns.filter(p => !existing.has(p))
  const eol = newline(ignored)
  add('.dclignore', ignored + (extra.length ? (ignored && !ignored.endsWith('\n') ? eol : '') + extra.map(p => p + eol).join('') : ''), true)
  // Preflight every destination before any writes. A symlink must not redirect a write outside the target scene.
  for (const [name, item] of planned) {
    const destination = path.join(target, name)
    let parent = path.dirname(destination)
    while (true) {
      try { if (!inside(target, await fs.realpath(parent))) throw new Error('Destination escapes the scene: ' + name); break }
      catch (error) { if (error.code !== 'ENOENT') throw error; parent = path.dirname(parent) }
    }
    const stat = await fs.lstat(destination).catch(error => { if (error.code !== 'ENOENT') throw error; return null })
    if (stat?.isSymbolicLink()) throw new Error('Destination is a link: ' + name)
    const current = await read(destination)
    if (current !== null && !current.equals(item.data) && !item.update) throw new Error('Different installed file: ' + name + '. Review it; use --update to replace module files. Game starter files stay yours.')
  }
  if (await read(path.join(target, 'htn-notices.txt')) !== null && await read(path.join(target, 'src/htn-planner/LICENSE')) === null) throw new Error('htn-notices.txt already exists without an HTN installation; resolve the name before installing.')
  for (const [name, { data }] of planned) {
    const destination = path.join(target, name)
    await fs.mkdir(path.dirname(destination), { recursive: true })
    await fs.writeFile(destination, data)
  }
  const notice = spawnSync(process.execPath, ['tools/htn-authoring/notices.mjs'], { cwd: target, stdio: 'inherit', windowsHide: true })
  if (notice.status !== 0) throw new Error('Notice generation failed; review the output above.')
  console.log(`HTN installed in ${target}. Read src/htn-planner/README.md and merge its main() example into your entrypoint.`)
  if (args.includes('--reference')) console.log('reference/htn is removable reference material, excluded from deployment. Keep your TypeScript include scoped to src/.')
}
