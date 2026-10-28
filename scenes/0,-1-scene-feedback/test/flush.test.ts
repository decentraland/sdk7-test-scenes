import { describe, expect, it } from 'vitest'
import { CSV_HEADER } from '../src/scene-feedback/lib/server/csv'
import { CURRENT_PART_KEY, PartStore, legacyPartKey, writeBatch } from '../src/scene-feedback/lib/server/parts'

// Scene Storage in memory. Every call yields first, like a network round trip, so two flushes
// started together interleave their reads and writes.
class FakeStorage implements PartStore {
  values = new Map<string, unknown>()
  // the whole store after each write or delete, oldest first
  private readonly snapshots: Map<string, unknown>[] = [new Map()]
  // H2: reads see the store as it was this many writes ago
  lag = 0
  // H3: the next read misses these keys although they exist
  readonly missOnce = new Set<string>()
  // runs before the next write lands, e.g. another server writing in between
  beforeSet?: (key: string) => Promise<void>
  // H2, stuck: reads of these keys return this old value, as a live World's Storage did for 1.5 hours
  readonly stuck = new Map<string, unknown>()

  async get<T>(key: string): Promise<T | null> {
    await Promise.resolve()
    if (this.missOnce.delete(key)) return null
    if (this.stuck.has(key)) return this.stuck.get(key) as T
    return (this.seen().get(key) as T) ?? null
  }

  async set(key: string, value: unknown): Promise<boolean> {
    await Promise.resolve()
    if (this.beforeSet) await this.beforeSet(key)
    this.values.set(key, value)
    this.snapshots.push(new Map(this.values))
    return true
  }

  async delete(key: string): Promise<boolean> {
    await Promise.resolve()
    const had = this.values.delete(key)
    this.snapshots.push(new Map(this.values))
    return had
  }

  async list(prefix: string): Promise<{ key: string; value: unknown }[]> {
    await Promise.resolve()
    return [...this.seen()]
      .filter(([key]) => key.startsWith(prefix) && !this.missOnce.delete(key))
      .map(([key, value]) => ({ key, value: this.stuck.has(key) ? this.stuck.get(key) : value }))
  }

  csvKeys(): string[] {
    return [...this.values.keys()].filter((key) => key.endsWith('.csv'))
  }

  // ids in every CSV key now in the store
  storedIds(): Set<string> {
    const ids = new Set<string>()
    for (const key of this.csvKeys()) for (const id of idsOf(this.values.get(key) as string)) ids.add(id)
    return ids
  }

  private seen(): Map<string, unknown> {
    return this.snapshots[Math.max(0, this.snapshots.length - 1 - this.lag)]
  }
}

const row = (id: string, filler = ''): [string, string] => [id, `${id},2026-10-27 12:00:00,abc,coinSpotting${filler}`]
const MINUTE = 60_000

// one server: each call flushes its pending rows, as flush() does
function server(store: FakeStorage) {
  return (ids: string[], now = Date.now()) => writeBatch(store, ids.map((id) => row(id)), 1, now)
}

async function flush(store: FakeStorage, ...ids: string[]): Promise<void> {
  await server(store)(ids)
}

function lost(store: FakeStorage, ids: string[]): string[] {
  const stored = store.storedIds()
  return ids.filter((id) => !stored.has(id))
}

// row ids of a CSV, as mergeRows reads them: everything before the first comma, blank ids skipped
function idsOf(csv: string): string[] {
  return csv
    .split('\n')
    .slice(1)
    .map((line) => line.slice(0, line.indexOf(',')))
    .filter((id) => id)
}

// ids that appear more than once within one CSV key
function repeated(store: FakeStorage): string[] {
  const ids: string[] = []
  for (const key of store.csvKeys()) {
    const seen = new Set<string>()
    for (const id of idsOf(store.values.get(key) as string)) {
      if (seen.has(id)) ids.push(id)
      seen.add(id)
    }
  }
  return ids
}

describe('flush keeps every row it has stored', () => {
  it('control: one server, Storage reads back what it wrote', async () => {
    const store = new FakeStorage()
    await flush(store, 'a1')
    await flush(store, 'a2', 'a3')
    await flush(store, 'b1')
    expect(lost(store, ['a1', 'a2', 'a3', 'b1'])).toEqual([])
    expect(repeated(store)).toEqual([])
    expect(store.csvKeys()).toHaveLength(1)
  })

  it('H1: two server instances flush at the same time (old and new during a redeploy)', async () => {
    const store = new FakeStorage()
    await flush(store, 'a1', 'a2', 'a3')
    // each instance holds its own pending rows; both read the part before either writes
    await Promise.all([flush(store, 'old1'), flush(store, 'new1')])
    expect(lost(store, ['a1', 'a2', 'a3', 'old1', 'new1'])).toEqual([])
    expect(repeated(store)).toEqual([])
    // they did race: each wrote its own version
    expect(store.csvKeys()).toHaveLength(2)
    // the next flush merges the two versions back into one
    await flush(store, 'c1')
    expect(lost(store, ['a1', 'a2', 'a3', 'old1', 'new1', 'c1'])).toEqual([])
    expect(repeated(store)).toEqual([])
    expect(store.csvKeys()).toHaveLength(1)
  })

  it('H1 on the old-format part: an instance still on the old code appends to it during the redeploy', async () => {
    const store = new FakeStorage()
    const flushAt = server(store)
    const t0 = Date.now()
    await store.set(legacyPartKey(1), [CSV_HEADER, row('l1')[1]].join('\n'))
    // between the new instance listing the part and writing its version
    store.beforeSet = async (key) => {
      if (!key.startsWith('scene-feedback-1-')) return
      store.beforeSet = undefined
      const legacy = await store.get<string>(legacyPartKey(1))
      await store.set(legacyPartKey(1), `${legacy}\n${row('o1')[1]}`)
    }
    await flushAt(['n1'], t0)
    await flushAt(['n2'], t0 + 11 * MINUTE)
    expect(lost(store, ['l1', 'o1', 'n1', 'n2'])).toEqual([])
    expect(repeated(store)).toEqual([])
    expect(store.values.has(legacyPartKey(1))).toBe(true)
  })

  it('H2: reads come back one write behind', async () => {
    const store = new FakeStorage()
    await flush(store, 'a1')
    await flush(store, 'a2', 'a3')
    store.lag = 1
    await flush(store, 'b1')
    expect(lost(store, ['a1', 'a2', 'a3', 'b1'])).toEqual([])
    expect(repeated(store)).toEqual([])
    store.lag = 0
    await flush(store, 'c1')
    expect(store.csvKeys()).toHaveLength(1)
  })

  it('H2 stuck: reads of the old-format part return an old value for an hour', async () => {
    const store = new FakeStorage()
    const flushAt = server(store)
    const t0 = Date.now()
    const stale = [CSV_HEADER, row('l1')[1]].join('\n')
    // an instance still on the old code appended o1; Storage keeps serving the value before it
    await store.set(legacyPartKey(1), `${stale}\n${row('o1')[1]}`)
    store.stuck.set(legacyPartKey(1), stale)
    const ids: string[] = []
    for (let minute = 0; minute <= 60; minute += 10) {
      ids.push(`n${minute}`)
      await flushAt([`n${minute}`], t0 + minute * MINUTE)
    }
    expect(lost(store, ['l1', 'o1', ...ids])).toEqual([])
    expect(repeated(store)).toEqual([])
  })

  it('H2 stuck: listing stays several writes behind for many flushes', async () => {
    const store = new FakeStorage()
    const ids: string[] = []
    await flush(store, 'a1')
    store.lag = 2
    for (let i = 0; i < 6; i++) {
      ids.push(`b${i}`)
      await flush(store, `b${i}`)
    }
    expect(lost(store, ['a1', ...ids])).toEqual([])
    expect(repeated(store)).toEqual([])
    store.lag = 0
    await flush(store, 'c1')
    expect(lost(store, ['a1', ...ids, 'c1'])).toEqual([])
    expect(repeated(store)).toEqual([])
    expect(store.csvKeys()).toHaveLength(1)
  })

  it('H3: a read misses the stored part although it exists', async () => {
    const store = new FakeStorage()
    await flush(store, 'a1', 'a2', 'a3')
    for (const key of store.csvKeys()) store.missOnce.add(key)
    await flush(store, 'b1')
    expect(lost(store, ['a1', 'a2', 'a3', 'b1'])).toEqual([])
    expect(repeated(store)).toEqual([])
    await flush(store, 'c1')
    expect(store.csvKeys()).toHaveLength(1)
  })
})

describe('parts', () => {
  it('merges a part written by the old code in place, and keeps it', async () => {
    const store = new FakeStorage()
    const flushAt = server(store)
    const t0 = Date.now()
    await store.set(CURRENT_PART_KEY, 1)
    await store.set(legacyPartKey(1), [CSV_HEADER, row('old1')[1], row('old2')[1]].join('\n'))
    await flushAt(['b1'], t0)
    await flushAt(['b2'], t0 + 11 * MINUTE)
    expect(lost(store, ['old1', 'old2', 'b1', 'b2'])).toEqual([])
    expect(repeated(store)).toEqual([])
    // the old file and one version holding all its rows
    expect(store.values.has(legacyPartKey(1))).toBe(true)
    expect(store.csvKeys()).toHaveLength(2)
  })

  it('writes nothing for a retry whose rows a part with an old-format file already holds', async () => {
    const store = new FakeStorage()
    await store.set(legacyPartKey(1), [CSV_HEADER, row('l1')[1]].join('\n'))
    await flush(store, 'a1')
    const keys = store.csvKeys()
    const result = await writeBatch(store, [row('a1')], 1)
    expect(result.key).toBeNull()
    expect(store.csvKeys()).toEqual(keys)
  })

  it('writes each id once when a batch resends rows the old-format file or a version holds', async () => {
    const store = new FakeStorage()
    const flushAt = server(store)
    await store.set(legacyPartKey(1), [CSV_HEADER, row('l1')[1], row('l2')[1]].join('\n'))
    // l2 must be in the first batch: no version exists yet, so the old file is its only copy
    await flushAt(['l2', 'a1'])
    expect(repeated(store)).toEqual([])
    expect(lost(store, ['l1', 'l2', 'a1'])).toEqual([])
    // a lost write result: the batch comes again with a new row, its other rows now in the version
    await flushAt(['a1', 'l2', 'a2'])
    expect(repeated(store)).toEqual([])
    await flushAt(['a3'])
    expect(lost(store, ['l1', 'l2', 'a1', 'a2', 'a3'])).toEqual([])
    expect(repeated(store)).toEqual([])
  })

  it('rolls a part with an old-format file over without copying it again', async () => {
    const store = new FakeStorage()
    const big = 'x'.repeat(250 * 1024)
    await store.set(legacyPartKey(1), [CSV_HEADER, row('l1')[1]].join('\n'))
    await writeBatch(store, [row('a1', big)], 1)
    const written: string[] = []
    store.beforeSet = async (key) => {
      written.push(key)
    }
    const result = await writeBatch(store, [row('b1', big)], 1)
    expect(result.part).toBe(2)
    expect(written.filter((key) => key.startsWith('scene-feedback-1-'))).toEqual([])
    expect(lost(store, ['l1', 'a1', 'b1'])).toEqual([])
    expect(repeated(store)).toEqual([])
  })

  it('leaves a part with other columns as it is and writes the next one', async () => {
    const store = new FakeStorage()
    const old = 'id,timeUtc,question\nx1,2026-09-30 12:00:00,q'
    await store.set(legacyPartKey(1), old)
    await flush(store, 'b1')
    expect(store.values.get(legacyPartKey(1))).toBe(old)
    expect(store.values.get(CURRENT_PART_KEY)).toBe(2)
    expect(store.csvKeys().filter((key) => key.startsWith('scene-feedback-2-'))).toHaveLength(1)
    expect(lost(store, ['b1'])).toEqual([])
    expect(repeated(store)).toEqual([])
  })

  it('rolls over to the next part when the open one is full', async () => {
    const store = new FakeStorage()
    const big = 'x'.repeat(250 * 1024)
    await writeBatch(store, [row('a1', big)], 1)
    const result = await writeBatch(store, [row('b1', big)], 1)
    expect(result.part).toBe(2)
    expect(result.rolledOver).toBe(true)
    expect(lost(store, ['a1', 'b1'])).toEqual([])
    expect(repeated(store)).toEqual([])
  })

  it('merges versions left by a race before the part rolls over', async () => {
    const store = new FakeStorage()
    await Promise.all([flush(store, 'a1'), flush(store, 'a2')])
    expect(store.csvKeys()).toHaveLength(2)
    const result = await writeBatch(store, [row('b1', 'x'.repeat(450 * 1024))], 1)
    expect(result.part).toBe(2)
    expect(store.csvKeys().filter((key) => key.startsWith('scene-feedback-1-'))).toHaveLength(1)
    expect(lost(store, ['a1', 'a2', 'b1'])).toEqual([])
    expect(repeated(store)).toEqual([])
  })
})
