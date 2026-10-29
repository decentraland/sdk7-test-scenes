// Node-only authoring: generate game-owned domains before build, or watch their exact includes.
import * as fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createHash, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const usage = 'Usage: node tools/htn-authoring/generate.mjs [--config htn.config.json] [--watch]'
const compiler = fileURLToPath(new URL('./compiler.cjs', import.meta.url))
const require = createRequire(import.meta.url)
const key = file => process.platform === 'win32' ? file.toLowerCase() : file
const inside = (root, file) => { const rel = path.relative(root, file); return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel)) }
let dependencyFiles = new Set()
let attemptSnapshot

function checkedPath(root, value, field) {
  if (typeof value !== 'string' || !value.trim() || path.isAbsolute(value)) throw new Error(field + ' must be a nonempty project-relative path')
  const file = path.resolve(root, value)
  if (!inside(root, file)) throw new Error(field + ' escapes the project: ' + value)
  let existing = file
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing)
    if (parent === existing) throw new Error(field + ' has no existing project parent')
    existing = parent
  }
  if (!inside(fs.realpathSync(root), fs.realpathSync(existing))) throw new Error(field + ' follows a link outside the project: ' + value)
  if (fs.existsSync(file) && !fs.lstatSync(file).isFile()) throw new Error(field + ' must be a regular file: ' + value)
  return file
}

function configuration(file) {
  const root = path.dirname(file)
  const config = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (!Array.isArray(config.domains) || config.domains.length === 0) throw new Error('htn.config.json needs a nonempty domains array')
  const outputs = new Set()
  const entries = config.domains.map((entry, i) => {
    if (!entry || typeof entry !== 'object') throw new Error('domains[' + i + '] must be an object')
    const source = checkedPath(root, entry.source, 'source')
    const output = checkedPath(root, entry.output, 'output')
    if (!source.endsWith('.domain') || !output.endsWith('.ts')) throw new Error('Each source must end in .domain and each output in .ts')
    if (outputs.has(key(output))) throw new Error('Duplicate generated output: ' + entry.output)
    outputs.add(key(output))
    if (entry.exportName !== undefined && (typeof entry.exportName !== 'string' || !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(entry.exportName))) throw new Error('Invalid exportName for ' + entry.source)
    return { source, output, exportName: entry.exportName }
  })
  return { root, entries }
}

function dependencies(entries, configFile) {
  const { splitDomainFile } = require(compiler)
  if (typeof splitDomainFile !== 'function') throw new Error('Prepared compiler is missing its include reader; update the authoring folder together')
  const files = new Set([configFile])
  const seen = new Set()
  const visit = file => {
    const resolved = path.resolve(file)
    const canonical = fs.existsSync(resolved) ? fs.realpathSync(resolved) : resolved
    files.add(resolved)
    files.add(canonical)
    if (seen.has(key(canonical))) return
    seen.add(key(canonical))
    let text
    try { text = fs.readFileSync(canonical, 'utf8') } catch { return }
    for (const include of splitDomainFile(text).includes) visit(path.resolve(path.dirname(resolved), include.path))
  }
  // The compiler has a fresh canonical visited set for each top-level load.
  for (const entry of entries) { seen.clear(); visit(entry.source) }
  return files
}

function snapshot(files) {
  const hash = createHash('sha256')
  for (const file of [...files].sort()) {
    hash.update(file)
    try { hash.update(fs.readFileSync(file)) } catch (error) { hash.update(error.code ?? error.message) }
  }
  return hash.digest('hex')
}

function publish(candidates) {
  const changed = candidates.filter(({ output, text }) => {
    try { return fs.readFileSync(output, 'utf8') !== text } catch (error) { if (error.code === 'ENOENT') return true; throw error }
  })
  const staged = [], completed = []
  try {
    for (const candidate of changed) {
      fs.mkdirSync(path.dirname(candidate.output), { recursive: true })
      const temporary = candidate.output + '.htn-stage-' + randomUUID() + '.tmp'
      const previous = fs.existsSync(candidate.output) ? fs.readFileSync(candidate.output) : null
      fs.writeFileSync(temporary, candidate.text)
      staged.push({ ...candidate, temporary, previous })
    }
    for (const item of staged) {
      fs.renameSync(item.temporary, item.output)
      completed.push(item)
    }
  } catch (error) {
    for (const item of completed.reverse()) {
      if (item.previous === null) fs.rmSync(item.output, { force: true })
      else fs.writeFileSync(item.output, item.previous)
    }
    throw error
  } finally {
    for (const item of staged) fs.rmSync(item.temporary, { force: true })
  }
  return changed.length
}

function generate(configFile) {
  dependencyFiles.add(configFile)
  const { root, entries } = configuration(configFile)
  dependencyFiles = dependencies(entries, configFile)
  const before = snapshot(dependencyFiles)
  attemptSnapshot = before
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'htn-generate-'))
  const candidates = []
  try {
    for (const [index, entry] of entries.entries()) {
      const staged = path.join(directory, index + '.ts')
      let irImport = path.relative(path.dirname(entry.output), path.join(root, 'src/htn-planner/htn/ir')).split(path.sep).join('/')
      if (!irImport.startsWith('.')) irImport = './' + irImport
      const args = [compiler, entry.source, staged]
      if (entry.exportName) args.push(entry.exportName)
      args.push('--ir-import', irImport)
      const result = spawnSync(process.execPath, args, { cwd: root, env: { ...process.env, HTN_REPO_ROOT: root }, encoding: 'utf8', windowsHide: true })
      if (result.stderr) process.stderr.write(result.stderr)
      if (result.error || result.status !== 0) throw new Error('Compilation failed for ' + path.relative(root, entry.source) + (result.error ? ': ' + result.error.message : ''))
      candidates.push({ output: entry.output, text: fs.readFileSync(staged, 'utf8') })
    }
    if (snapshot(dependencyFiles) !== before) throw new Error('Domain inputs changed during generation; retry after saving all files')
    const count = publish(candidates)
    console.log('htn:generate: READY (' + entries.length + ' domain(s), ' + count + ' output(s) changed)')
  } finally { fs.rmSync(directory, { recursive: true, force: true }) }
}

function watcherLock(configFile) {
  const lock = path.join(os.tmpdir(), 'htn-watch-' + createHash('sha256').update(key(fs.existsSync(configFile) ? fs.realpathSync(configFile) : configFile)).digest('hex') + '.lock')
  const acquire = () => {
    try { return fs.openSync(lock, 'wx') }
    catch (error) {
      if (error.code !== 'EEXIST') throw error
      const pid = Number(fs.readFileSync(lock, 'utf8'))
      if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('Watcher lock is initializing or invalid: ' + lock)
      try { process.kill(pid, 0) }
      catch (probe) {
        if (probe.code !== 'ESRCH') throw new Error('A watcher already owns this config (PID ' + pid + ')')
        fs.rmSync(lock)
        return fs.openSync(lock, 'wx')
      }
      throw new Error('A watcher already owns this config (PID ' + pid + ')')
    }
  }
  const handle = acquire()
  fs.writeFileSync(handle, String(process.pid))
  fs.closeSync(handle)
  process.once('exit', () => {
    try { if (fs.readFileSync(lock, 'utf8') === String(process.pid)) fs.rmSync(lock) } catch {}
  })
}
async function main() {
  const args = process.argv.slice(2)
  let configFile = path.resolve('htn.config.json'), watch = false
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--watch') watch = true
    else if (args[i] === '--config' && args[i + 1] && !args[i + 1].startsWith('-')) configFile = path.resolve(args[++i])
    else if (args[i] === '--help' || args[i] === '-h') { console.log(usage); return }
    else throw new Error(usage)
  }
  const run = () => {
    attemptSnapshot = undefined
    try { generate(configFile); return true }
    catch (error) {
      console.error('htn:generate: FAILED / STALE — ' + error.message)
      console.error('No new domain output was published. An open preview may still show its last successful build; fix the source before testing or publishing.')
      return false
    }
  }
  if (watch) watcherLock(configFile)
  const success = run()
  if (!watch) { if (!success) process.exitCode = 1; return }
  console.log('htn:generate: watching configured domains and their includes; keep this terminal open')
  let prior = attemptSnapshot ?? snapshot(dependencyFiles)
  const timer = setInterval(() => {
    const next = snapshot(dependencyFiles)
    if (next !== prior) { run(); prior = attemptSnapshot ?? next }
  }, 200)
  const stop = signal => {
    clearInterval(timer)
    console.log('htn:generate: watcher stopped')
    process.exitCode = signal === 'SIGINT' ? 130 : 143
  }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
}

main().catch(error => { console.error('htn:generate: ' + error.message); process.exitCode = 1 })
