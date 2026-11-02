#!/usr/bin/env node
/**
 * Generates `src/subscenes/scenes.gen.ts` from the folders in `src/subscenes/`.
 *
 * Why: every worker registers a subscene by adding ONE folder, without editing a
 * shared registry file, so two PRs that add two subscenes never conflict.
 *
 *   src/subscenes/<slug>/
 *     subscene.json   metadata (validated here)
 *     index.ts        mount(ctx) / optional unmount()
 *
 * Usage:
 *   npm run subscenes:gen      rewrite scenes.gen.ts
 *   npm run subscenes:check    exit 1 if scenes.gen.ts is stale (CI / dry run)
 *
 * Runs automatically on prestart / prebuild / predeploy.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCENE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SUBSCENES_DIR = join(SCENE_ROOT, 'src', 'subscenes')
const GENERATED_FILE = join(SUBSCENES_DIR, 'scenes.gen.ts')
const LAYOUT_FILE = join(SCENE_ROOT, 'src', 'hub', 'layout.ts')

const STATUSES = ['pending', 'in-review', 'done']
const ALLOWED_KEYS = ['title', 'issue', 'pr', 'owner', 'status', 'note', 'slot', 'size']
const SLUG_RE = /^_?[a-z0-9][a-z0-9-]*$/
const ISSUE_RE = /^#?(\d+)$/

const errors = []
const warnings = []
const fail = (slug, message) => errors.push(slug === null ? message : `${slug}: ${message}`)

// ---------------------------------------------------------------- layout ----
/** SCENE_SIZE / STAGE_SIZE are read from layout.ts so there is a single source of truth. */
function readLayout() {
  const source = readFileSync(LAYOUT_FILE, 'utf8')
  const pick = (name) => {
    const match = source.match(new RegExp(`export const ${name} = (\\d+)`))
    if (match === null)
      throw new Error(`cannot read ${name} from src/hub/layout.ts (expected "export const ${name} = <number>")`)
    return Number(match[1])
  }
  const sceneSize = pick('SCENE_SIZE')
  const stageSize = pick('STAGE_SIZE')
  if (sceneSize % stageSize !== 0)
    throw new Error(`SCENE_SIZE (${sceneSize}) must be a multiple of STAGE_SIZE (${stageSize})`)
  const grid = sceneSize / stageSize
  return { sceneSize, stageSize, grid, stageCount: grid * grid }
}

// -------------------------------------------------------------- metadata ----
function normalizeRef(slug, field, value, required) {
  if (value === undefined || value === null) {
    if (required) fail(slug, `missing required field "${field}"`)
    return undefined
  }
  const raw = String(value).trim()
  const match = raw.match(ISSUE_RE)
  if (match === null) {
    fail(slug, `"${field}" must be an issue/PR number like "#3062" (got ${JSON.stringify(value)})`)
    return undefined
  }
  return `#${match[1]}`
}

function readMeta(slug, layout) {
  const jsonPath = join(SUBSCENES_DIR, slug, 'subscene.json')
  const indexPath = join(SUBSCENES_DIR, slug, 'index.ts')
  if (!existsSync(jsonPath)) {
    fail(slug, `missing subscene.json (copy src/subscenes/_example/)`)
    return null
  }
  if (!existsSync(indexPath)) {
    fail(slug, `missing index.ts exporting mount(ctx) (copy src/subscenes/_example/)`)
    return null
  }

  let raw
  try {
    raw = JSON.parse(readFileSync(jsonPath, 'utf8'))
  } catch (error) {
    fail(slug, `subscene.json is not valid JSON: ${error.message}`)
    return null
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    fail(slug, 'subscene.json must be an object')
    return null
  }

  for (const key of Object.keys(raw)) {
    if (!ALLOWED_KEYS.includes(key))
      fail(slug, `unknown key "${key}" in subscene.json (allowed: ${ALLOWED_KEYS.join(', ')})`)
  }

  if (typeof raw.title !== 'string' || raw.title.trim() === '')
    fail(slug, '"title" is required and must be a non empty string')
  else if (raw.title.length > 80) fail(slug, '"title" must be 80 characters or less')

  const issue = normalizeRef(slug, 'issue', raw.issue, true)
  const pr = normalizeRef(slug, 'pr', raw.pr, false)

  if (typeof raw.owner !== 'string' || raw.owner.trim() === '') {
    fail(slug, '"owner" is required and must name who registered the subscene (e.g. "sprint28-nametag-2811")')
  }

  const status = raw.status ?? 'pending'
  if (!STATUSES.includes(status))
    fail(slug, `"status" must be one of ${STATUSES.join(', ')} (got ${JSON.stringify(status)})`)

  if (raw.note !== undefined && typeof raw.note !== 'string') fail(slug, '"note" must be a string')

  let slot = null
  if (raw.slot !== undefined) {
    if (!Number.isInteger(raw.slot)) fail(slug, '"slot" must be an integer')
    else if (raw.slot < 0 || raw.slot >= layout.stageCount) {
      fail(slug, `"slot" must be in 0..${layout.stageCount - 1} (got ${raw.slot})`)
    } else slot = raw.slot
  }

  if (raw.size !== undefined) {
    const size = raw.size
    if (typeof size !== 'object' || size === null) fail(slug, '"size" must be { "width": number, "depth": number }')
    else {
      for (const key of Object.keys(size)) {
        if (!['width', 'depth'].includes(key)) fail(slug, `unknown key "size.${key}"`)
      }
      for (const key of ['width', 'depth']) {
        const value = size[key]
        if (typeof value !== 'number' || !(value > 0)) fail(slug, `"size.${key}" must be a positive number`)
        else if (value > layout.stageSize) {
          fail(
            slug,
            `"size.${key}" is ${value}m but a stage is ${layout.stageSize}m: subscenes must fit one stage ` +
              `(ask for a bigger layout in src/hub/layout.ts instead of overflowing your neighbours' stage)`
          )
        }
      }
    }
  }

  const source = readFileSync(indexPath, 'utf8')
  if (!/export\s+(async\s+)?function\s+mount\s*\(/.test(source) && !/export\s+const\s+mount\s*[:=]/.test(source)) {
    fail(slug, 'index.ts must export "mount(ctx: SubsceneContext)"')
  }

  if (errors.some((message) => message.startsWith(`${slug}:`))) return null

  return {
    slug,
    title: raw.title.trim(),
    issue,
    pr,
    owner: raw.owner.trim(),
    status,
    note: raw.note,
    explicitSlot: slot
  }
}

// ------------------------------------------------------------------ main ----
const layout = readLayout()

if (!existsSync(SUBSCENES_DIR)) {
  console.error(`❌ ${SUBSCENES_DIR} does not exist`)
  process.exit(1)
}

const slugs = readdirSync(SUBSCENES_DIR)
  .filter((name) => !name.startsWith('.') && statSync(join(SUBSCENES_DIR, name)).isDirectory())
  .sort()

if (slugs.length === 0) {
  console.error('❌ no subscenes found: at least src/subscenes/_example is expected')
  process.exit(1)
}

for (const slug of slugs) {
  if (!SLUG_RE.test(slug)) {
    fail(
      null,
      `invalid folder name "${slug}" in src/subscenes/: use lowercase letters, digits and dashes, e.g. "skybox-control-3096"`
    )
  }
}

const metas = []
for (const slug of slugs) {
  if (errors.some((message) => message.startsWith(`${slug}:`))) continue
  const meta = readMeta(slug, layout)
  if (meta !== null) metas.push(meta)
}

// one subscene per issue, one subscene per PR
const seenIssues = new Map()
for (const meta of metas) {
  for (const ref of [meta.issue, meta.pr]) {
    if (ref === undefined) continue
    const previous = seenIssues.get(ref)
    if (previous !== undefined)
      fail(meta.slug, `${ref} is already registered by "${previous}": one subscene per issue/PR`)
    else seenIssues.set(ref, meta.slug)
  }
}

// slots: explicit ones are honored, the rest get the first free slot of their page
const pageCount = Math.ceil(metas.length / layout.stageCount) || 1
for (let page = 0; page < pageCount; page++) {
  const inPage = metas.slice(page * layout.stageCount, (page + 1) * layout.stageCount)
  const used = new Map()
  for (const meta of inPage) {
    if (meta.explicitSlot === null) continue
    const previous = used.get(meta.explicitSlot)
    if (previous !== undefined) {
      fail(
        meta.slug,
        `slot ${meta.explicitSlot} is already taken by "${previous.slug}" in the same page: ` +
          `two subscenes would sit on the same 16x16m stage`
      )
      continue
    }
    used.set(meta.explicitSlot, meta)
  }
  for (const meta of inPage) {
    if (meta.explicitSlot !== null) {
      meta.slot = meta.explicitSlot
      continue
    }
    let slot = 0
    while (used.has(slot)) slot++
    if (slot >= layout.stageCount) {
      fail(meta.slug, `no free stage slot left on page ${page} (${layout.stageCount} stages per page)`)
      continue
    }
    used.set(slot, meta)
    meta.slot = slot
  }
  for (const meta of inPage) meta.page = page
}

if (errors.length > 0) {
  console.error('\n❌ subscene registry is invalid:\n')
  for (const message of errors) console.error(`   • ${message}`)
  console.error('')
  process.exit(1)
}

// -------------------------------------------------------------- emit file ----
const sorted = [...metas].sort((a, b) => a.slug.localeCompare(b.slug))
const imports = sorted.map((meta, index) => `import * as sub${index} from './${meta.slug}'`).join('\n')

const quote = (value) => `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`

const entries = sorted
  .map((meta, index) => {
    const fields = [
      `title: ${quote(meta.title)}`,
      `issue: ${quote(meta.issue)}`,
      meta.pr === undefined ? null : `pr: ${quote(meta.pr)}`,
      `owner: ${quote(meta.owner)}`,
      `status: ${quote(meta.status)}`,
      meta.note === undefined ? null : `note: ${quote(meta.note)}`,
      `slot: ${meta.slot}`,
      `page: ${meta.page}`
    ].filter((field) => field !== null)
    return [
      '  {',
      `    slug: ${quote(meta.slug)},`,
      '    meta: {',
      fields.map((field, position) => `      ${field}${position === fields.length - 1 ? '' : ','}`).join('\n'),
      '    },',
      `    module: sub${index}`,
      '  }'
    ].join('\n')
  })
  .join(',\n')

const header = `// AUTO-GENERATED FILE - DO NOT EDIT.
//
// Source of truth: src/subscenes/<slug>/subscene.json + src/subscenes/<slug>/index.ts
// Regenerate with: npm run subscenes:gen   (also runs on prestart / prebuild / predeploy)
//
// Layout: ${layout.sceneSize}x${layout.sceneSize}m scene, ${layout.grid}x${layout.grid} grid of ${layout.stageSize}x${layout.stageSize}m stages,
// ${layout.stageCount} subscenes per page. Slots come from subscene.json ("slot") or are auto-assigned.
`

const content = `${header}import type { SubsceneEntry } from '../hub/types'
${imports}

export const subsceneEntries: SubsceneEntry[] = [
${entries}
]
`

const stale = !existsSync(GENERATED_FILE) || readFileSync(GENERATED_FILE, 'utf8') !== content
const check = process.argv.includes('--check')

if (check) {
  if (stale) {
    console.error('❌ src/subscenes/scenes.gen.ts is out of date: run "npm run subscenes:gen" and commit the result')
    process.exit(1)
  }
} else if (stale) {
  writeFileSync(GENERATED_FILE, content)
  console.log('✅ src/subscenes/scenes.gen.ts updated')
} else {
  console.log('✅ src/subscenes/scenes.gen.ts is up to date')
}

for (const warning of warnings) console.warn(`⚠️  ${warning}`)
console.log(`   ${sorted.length} subscene(s):`)
for (const meta of sorted) {
  const refs = meta.pr === undefined ? meta.issue : `${meta.issue} / ${meta.pr}`
  console.log(
    `   • ${meta.slug} — ${refs} "${meta.title}" [${meta.status}] page ${meta.page} slot ${meta.slot} ` +
      `(stage center x=${(meta.slot % layout.grid) * layout.stageSize + layout.stageSize / 2} ` +
      `z=${Math.floor(meta.slot / layout.grid) * layout.stageSize + layout.stageSize / 2})`
  )
}
