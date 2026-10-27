import { CSV_HEADER, utf8Length } from './csv'

// A flush never rewrites a key. It writes the open part as a new version: every version it read,
// merged by row id, plus its new rows. Once the new version reads back, it deletes the versions it
// read, and only those. Two servers flushing at once, or a read that misses a version, leave an extra
// version for the next flush to merge, never a lost row.
// Keys named like files: owners find them in the storage UI.
export const CURRENT_PART_KEY = 'scene-feedback-csv-head' // the part being written; a hint, a server may be behind
const PART_MAX_BYTES = 400 * 1024 // Storage caps one value at 512 KB

// Storage as a flush uses it: scene Storage with fresh reads on the server, a fake in tests
export type PartStore = {
  get<T>(key: string): Promise<T | null>
  set(key: string, value: unknown): Promise<boolean>
  delete(key: string): Promise<boolean>
  // every key starting with prefix, with its value
  list(prefix: string): Promise<{ key: string; value: unknown }[]>
}

export type BatchWrite = {
  part: number
  // the new version, null if nothing needed writing
  key: string | null
  // rows of the batch not yet in the part
  written: number
  bytes: number
  // versions merged into the new one
  merged: number
  rolledOver: boolean
}

type Version = { key: string; csv: string }

// "scene-feedback-1-20261027-130512-k3fz.csv": part, then UTC time of the flush, so versions sort by age
function versionKey(part: number, now: number): string {
  const stamp = new Date(now).toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-')
  const tail = Math.floor(Math.random() * 36 ** 4).toString(36).padStart(4, '0')
  return `scene-feedback-${part}-${stamp}-${tail}.csv`
}

// before versions: one key per part, rewritten in place. Merged like a version, never deleted: it is
// the one key another writer (an instance still on the old code) can change, and Storage may serve
// an old value of it for an hour, so no read proves the merge holds all its rows.
export function legacyPartKey(part: number): string {
  return `scene-feedback-${part}.csv`
}

// past this many versions of one part, read-backs keep failing: every flush then copies the whole part again
const MANY_VERSIONS = 3

export async function writeBatch(
  store: PartStore,
  batch: [string, string][],
  knownPart: number,
  now = Date.now()
): Promise<BatchWrite> {
  let part = Math.max(knownPart, (await store.get<number>(CURRENT_PART_KEY)) ?? 1)
  let rolledOver = false
  for (;;) {
    const versions = await readVersions(store, part)
    // a part with other columns (older code) is left as it is
    const ours = versions.filter((v) => v.csv.split('\n', 1)[0] === CSV_HEADER)
    const otherColumns = ours.length < versions.length
    // the old-format file stays for good: it is no race to merge
    const versionCount = ours.filter((v) => v.key !== legacyPartKey(part)).length
    if (versionCount > MANY_VERSIONS) {
      console.log(`[SERVER] Part ${part} has ${versionCount} versions: new versions do not read back, old ones are kept`)
    }
    const rows = mergeRows(ours)
    const added = batch.filter(([id]) => !rows.has(id))
    const merged = [CSV_HEADER, ...rows.values()].join('\n')
    const csv = [merged, ...added.map(([, row]) => row)].join('\n')
    const full = utf8Length(csv) > PART_MAX_BYTES && rows.size > 0

    if (added.length > 0 && (otherColumns || full)) {
      // versions left by a race are merged before the part closes: no flush comes back to it
      if (versionCount > 1 && utf8Length(merged) <= PART_MAX_BYTES) {
        await writeVersion(store, part, merged, ours, now)
      }
      part++
      rolledOver = true
      // a lost hint only makes the next flush walk here again
      await store.set(CURRENT_PART_KEY, part)
      continue
    }
    // all stored, in one version (a retry after a lost write result), or too big to merge
    if (added.length === 0 && (versionCount <= 1 || full)) {
      return { part, key: null, written: 0, bytes: utf8Length(csv), merged: 0, rolledOver }
    }

    const key = await writeVersion(store, part, csv, ours, now)
    return { part, key, written: added.length, bytes: utf8Length(csv), merged: versionCount, rolledOver }
  }
}

// Writes csv as a new version of the part. Until it reads back, the versions it replaces stay: the next
// flush merges them all again.
async function writeVersion(
  store: PartStore,
  part: number,
  csv: string,
  replaces: Version[],
  now: number
): Promise<string> {
  const key = versionKey(part, now)
  if (!(await store.set(key, csv))) throw new Error('Storage.set returned false')
  if ((await store.get<string>(key)) !== csv) return key
  for (const version of replaces) {
    if (version.key === legacyPartKey(part)) continue
    try {
      await store.delete(version.key)
    } catch (e) {
      console.log(`[SERVER] Could not delete ${version.key}, the next flush merges it again:`, e)
    }
  }
  return key
}

// the legacy key first, then versions oldest first
async function readVersions(store: PartStore, part: number): Promise<Version[]> {
  const legacy = (await store.list(legacyPartKey(part))).filter((e) => e.key === legacyPartKey(part))
  const versions = (await store.list(`scene-feedback-${part}-`)).sort((a, b) => (a.key < b.key ? -1 : 1))
  const all: Version[] = []
  for (const { key, value } of [...legacy, ...versions]) if (typeof value === 'string') all.push({ key, csv: value })
  return all
}

// id → row, first seen wins. Ids are [A-Za-z0-9-] and fields have no newlines: a row's id is everything
// before its first comma.
function mergeRows(versions: Version[]): Map<string, string> {
  const rows = new Map<string, string>()
  for (const { csv } of versions) {
    for (const line of csv.split('\n').slice(1)) {
      const id = line.slice(0, line.indexOf(','))
      if (id && !rows.has(id)) rows.set(id, line)
    }
  }
  return rows
}
