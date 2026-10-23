// Install the reusable HTN module into an existing SDK7 scene; examples stay optional.
import * as fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const source = fileURLToPath(new URL('../', import.meta.url))
const repository = 'https://github.com/decentraland/sdk7-test-scenes'
const scenePath = 'scenes/96,-11-htn-planner'
const usage = 'Usage: node scripts/htn-install.mjs <SDK7 scene> [--starter] [--reference] [--update]'
const args = process.argv.slice(2)
if (args.length === 1 && args[0] === '--help') {
  console.log(usage + '\n--starter: add a game-owned guard; --reference: removable source examples/assets; --update: replace installed module files, keeping game files.')
} else {
  main().catch(error => { console.error(error.message); process.exitCode = 1 })
}

async function read(file) {
  try { return await fs.readFile(file) } catch (error) { if (error.code === 'ENOENT') return null; throw error }
}

async function main() {
  if (!args[0] || args[0].startsWith('--') || args.slice(1).some(a => !['--starter', '--reference', '--update'].includes(a))) throw new Error(usage)
  const target = await fs.realpath(path.resolve(args[0]))
  const sourceReal = await fs.realpath(source)
  const inside = (base, file) => { const rel = path.relative(base, file); return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel)) }
  if (inside(sourceReal, target) || inside(target, sourceReal)) throw new Error('Choose a separate scene, outside this source checkout.')
  const scene = JSON.parse(await fs.readFile(path.join(target, 'scene.json'), 'utf8'))
  if (scene.runtimeVersion !== '7') throw new Error('Target must be an SDK7 scene (runtimeVersion: "7").')
  const pkg = JSON.parse(await fs.readFile(path.join(target, 'package.json'), 'utf8'))
  const noticeStat = await fs.lstat(path.join(target, 'htn-notices.txt')).catch(error => { if (error.code !== 'ENOENT') throw error; return null })
  if (noticeStat && !noticeStat.isFile()) throw new Error('Notice destination must be a regular file, not a link: htn-notices.txt')
  const planned = new Map()
  const add = (name, data, update = args.includes('--update')) => planned.set(name, { data: Buffer.from(data), update })
  async function tree(from, to) {
    for (const entry of await fs.readdir(from, { withFileTypes: true })) {
      const src = path.join(from, entry.name), dest = path.posix.join(to, entry.name)
      if (entry.isDirectory()) await tree(src, dest)
      else if (entry.isFile()) add(dest, await fs.readFile(src))
      else throw new Error('Unsupported reference entry: ' + src)
    }
  }
  await tree(path.join(source, 'src/htn-planner'), 'src/htn-planner')
  // Compiler dependency closure; runner/catalogue/viewer are repository-only tools.
  for (const name of ['ast', 'check-methods', 'cli', 'compiler', 'diagnostics', 'emit', 'lexer', 'linker', 'loader', 'parser', 'validator', 'worldstate']) {
    const rel = 'tools/htn/' + name + '.ts'
    add(rel, await fs.readFile(path.join(source, rel)))
  }
  for (const name of ['LICENSE', 'LICENSE.htn_planner']) add('tools/htn/' + name, await fs.readFile(path.join(source, 'tools/htn', name)))
  for (const name of ['htn-compile', 'htn-notices']) add('scripts/' + name + '.mjs', await fs.readFile(path.join(source, 'scripts', name + '.mjs')))
  const gitRoot = spawnSync('git', ['-C', source, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', windowsHide: true })
  let ownCheckout = false
  if (gitRoot.status === 0) {
    const top = await fs.realpath(gitRoot.stdout.trim())
    ownCheckout = path.relative(top, sourceReal).split(path.sep).join('/') === scenePath
  }
  const revision = ownCheckout ? spawnSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }) : null
  const ref = revision?.status === 0 && /^[a-f0-9]{40}$/.test(revision.stdout.trim()) ? revision.stdout.trim() : null
  const dirty = ref ? spawnSync('git', ['-C', source, 'status', '--porcelain', '--', '.'], { encoding: 'utf8', windowsHide: true }) : null
  add('src/htn-planner/SOURCE.json', JSON.stringify({ repository, ref, pinned: ref !== null, url: `${repository}/tree/${ref ?? 'feat/htn-planner-port'}/${scenePath}`, localChanges: dirty?.status === 0 ? dirty.stdout.trim() !== '' : null }, null, 2) + '\n')
  if (args.includes('--starter')) {
    for (const name of ['guard.domain', 'guard_kit.domain', 'guard.htn.ts']) {
      const rel = 'src/npc/guard/' + name
      // Starter code belongs to the game after installation, including on --update.
      if (await read(path.join(target, rel)) !== null) continue
      const content = (await fs.readFile(path.join(source, 'src/examples/guard', name), 'utf8'))
        .replace('// Source: src/examples/guard/guard.domain', '// Source: src/npc/guard/guard.domain')
      add(rel, content, false)
    }
  }
  if (args.includes('--reference')) {
    for (const name of ['src', 'assets', 'tools', 'scripts', 'test', 'benchmarks']) await tree(path.join(source, name), 'reference/htn/' + name)
    for (const name of ['htn-examples-catalog', 'htn-guidance', 'htn-level-metrics', 'htn-lint', 'htn-world-invariants']) {
      add('reference/htn/docs/' + name + '.md', (await fs.readFile(path.resolve(source, '../../docs', name + '.md'), 'utf8')).replaceAll('../scenes/96,-11-htn-planner/', '../'))
    }
    add('reference/htn/README.md', await fs.readFile(path.join(source, 'REFERENCE.md')))
    add('reference/htn/DEMO.md', await fs.readFile(path.join(source, 'DEMO.md')))
    add('reference/htn/SOURCE.json', planned.get('src/htn-planner/SOURCE.json').data)
  }
  pkg.scripts ??= {}
  for (const [name, command] of Object.entries({ 'htn:compile': 'node scripts/htn-compile.mjs', 'htn:notices': 'node scripts/htn-notices.mjs' })) {
    if (pkg.scripts[name] && pkg.scripts[name] !== command) throw new Error('Conflicting npm script: ' + name + '. Resolve it before installing.')
    pkg.scripts[name] = command
  }
  for (const hook of ['prebuild', 'predeploy']) {
    if (!pkg.scripts[hook]?.includes('npm run htn:notices')) pkg.scripts[hook] = 'npm run htn:notices' + (pkg.scripts[hook] ? ' && ' + pkg.scripts[hook] : '')
  }
  add('package.json', JSON.stringify(pkg, null, 2) + '\n', true)
  const ignored = (await read(path.join(target, '.dclignore')))?.toString() ?? ''
  const patterns = ['src/htn-planner', 'tools/htn', 'scripts/htn-compile.mjs', 'scripts/htn-notices.mjs', 'reference/htn', 'src/npc/guard/*.domain']
  const existing = new Set(ignored.split(/\r?\n/).map(s => s.trim().replace(/\/$/, '')))
  const extra = patterns.filter(p => !existing.has(p))
  add('.dclignore', ignored + (ignored && !ignored.endsWith('\n') ? '\n' : '') + extra.map(p => p + '\n').join(''), true)
  const pointer = '<!-- htn-module:start -->\n## HTN NPC module\nFor HTN integration, custom behaviour or examples, read [the module guide](src/htn-planner/README.md).\n<!-- htn-module:end -->'
  for (const name of ['AGENTS.md', 'CLAUDE.md']) {
    const original = (await read(path.join(target, name)))?.toString() ?? ''
    const block = /<!-- htn-module:start -->[\s\S]*?<!-- htn-module:end -->/
    add(name, block.test(original) ? original.replace(block, pointer) : original.trimEnd() + (original.trim() ? '\n\n' : '') + pointer + '\n', true)
  }
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
  const notice = spawnSync(process.execPath, ['scripts/htn-notices.mjs'], { cwd: target, stdio: 'inherit', windowsHide: true })
  if (notice.status !== 0) throw new Error('Notice generation failed; review the output above.')
  console.log(`HTN installed in ${target}. Read src/htn-planner/README.md and merge its main() example into your entrypoint.`)
  if (args.includes('--reference')) console.log('reference/htn is removable reference material, excluded from deployment. Keep your TypeScript include scoped to src/.')
}
