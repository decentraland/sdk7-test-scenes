import { CSV_HEADER, rowIds, utf8Length } from './csv'

// Keys named like files: owners find them in the storage UI.
export const CURRENT_PART_KEY = 'scene-feedback-csv-head' // the number of the part being written
const PART_MAX_BYTES = 400 * 1024 // Storage caps one value at 512 KB

// Storage as a flush uses it: scene Storage with fresh reads on the server, a fake in tests
export type PartStore = {
  get<T>(key: string): Promise<T | null>
  set(key: string, value: unknown): Promise<boolean>
}

export type BatchWrite = {
  part: number
  // rows of the batch not yet in the part
  written: number
  csv: string
  readBytes: number
  rolledOver: 'Columns changed' | 'Part full' | null
}

export function partKey(index: number): string {
  return `scene-feedback-${index}.csv`
}

// Re-read the part, append the rows it lacks (by id), write the whole part back.
export async function writeBatch(store: PartStore, batch: [string, string][], knownPart: number): Promise<BatchWrite> {
  const storedPart = (await store.get<number>(CURRENT_PART_KEY)) ?? 1
  let part = Math.max(knownPart, storedPart)

  let csv = (await store.get<string>(partKey(part))) ?? CSV_HEADER
  const readBytes = utf8Length(csv)
  const stored = rowIds(csv)
  const rows = batch.filter(([id]) => !stored.has(id)).map(([, row]) => row)
  const appended = rows.length > 0 ? `${csv}\n${rows.join('\n')}` : csv

  // never append to a part with other columns (older code)
  const otherColumns = csv.split('\n', 1)[0] !== CSV_HEADER
  const full = utf8Length(appended) > PART_MAX_BYTES && csv !== CSV_HEADER
  let rolledOver: BatchWrite['rolledOver'] = null
  if (rows.length > 0 && (otherColumns || full)) {
    const nextPart = part + 1
    if (!(await store.set(CURRENT_PART_KEY, nextPart))) throw new Error('could not advance the part index')
    part = nextPart
    csv = `${CSV_HEADER}\n${rows.join('\n')}`
    rolledOver = otherColumns ? 'Columns changed' : 'Part full'
  } else {
    csv = appended
  }

  // all already stored (a retry after a lost write result): nothing to rewrite
  if (rows.length > 0 && !(await store.set(partKey(part), csv))) throw new Error('Storage.set returned false')
  return { part, written: rows.length, csv, readBytes, rolledOver }
}
