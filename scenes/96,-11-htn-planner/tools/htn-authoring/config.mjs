// Shared Node-only config preflight; no compiler loads or domain evaluation.
import * as fs from 'node:fs'
import path from 'node:path'

const inside = (root, file) => { const rel = path.relative(root, file); return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel)) }

// Resolve existing directory aliases while keeping the tail of future generated paths.
export function pathIdentity(file) {
  let existing = file
  const tail = []
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing)
    if (parent === existing) throw new Error('Path has no existing project parent: ' + file)
    tail.unshift(path.basename(existing))
    existing = parent
  }
  const physical = path.join(fs.realpathSync(existing), ...tail)
  return process.platform === 'win32' ? physical.toLowerCase() : physical
}

export function checkedPath(root, value, field) {
  if (typeof value !== 'string' || !value.trim() || path.isAbsolute(value)) throw new Error(field + ' must be a nonempty project-relative path')
  const file = path.resolve(root, value)
  if (!inside(root, file)) throw new Error(field + ' escapes the project: ' + value)
  if (!inside(pathIdentity(root), pathIdentity(file))) throw new Error(field + ' follows a link outside the project: ' + value)
  let stat
  try { stat = fs.lstatSync(file) } catch (error) { if (error.code !== 'ENOENT') throw error }
  if (stat && !stat.isFile()) throw new Error(field + ' must be a regular file: ' + value)
  return file
}

export function configuration(file, { allowEmpty = false } = {}) {
  const root = path.dirname(file)
  let config
  try { config = JSON.parse(fs.readFileSync(file, 'utf8')) }
  catch (error) { throw new Error('Invalid htn.config.json: ' + error.message) }
  if (!config || typeof config !== 'object' || Array.isArray(config) || !Array.isArray(config.domains) || (!allowEmpty && config.domains.length === 0)) throw new Error('htn.config.json needs a ' + (allowEmpty ? '' : 'nonempty ') + 'domains array')
  const outputs = new Set()
  const entries = config.domains.map((entry, i) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('domains[' + i + '] must be an object')
    const source = checkedPath(root, entry.source, 'htn.config.json source')
    const output = checkedPath(root, entry.output, 'htn.config.json output')
    if (!source.endsWith('.domain') || !output.endsWith('.ts')) throw new Error('Each source must end in .domain and each output in .ts')
    const identity = pathIdentity(output)
    if (outputs.has(identity)) throw new Error('Duplicate generated output: ' + entry.output)
    outputs.add(identity)
    if (entry.exportName !== undefined && (typeof entry.exportName !== 'string' || !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(entry.exportName))) throw new Error('Invalid exportName for ' + entry.source)
    return { source, output, exportName: entry.exportName }
  })
  return { root, entries, config }
}
