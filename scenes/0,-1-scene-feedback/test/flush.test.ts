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

  async get<T>(key: string): Promise<T | null> {
    await Promise.resolve()
    if (this.missOnce.delete(key)) return null
    return (this.seen().get(key) as T) ?? null
  }

  async set(key: string, value: unknown): Promise<boolean> {
    await Promise.resolve()
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
      .map(([key, value]) => ({ key, value }))
  }

  csvKeys(): string[] {
    return [...this.values.keys()].filter((key) => key.endsWith('.csv'))
  }

  // ids in every CSV key now in the store
  storedIds(): Set<string> {
    const ids = new Set<string>()
    for (const key of this.csvKeys()) {
      for (const line of (this.values.get(key) as string).split('\n').slice(1)) ids.add(line.slice(0, line.indexOf(',')))
    }
    return ids
  }

  private seen(): Map<string, unknown> {
    return this.snapshots[Math.max(0, this.snapshots.length - 1 - this.lag)]
  }
}

const row = (id: string, filler = ''): [string, string] => [id, `${id},2026-10-27 12:00:00,abc,coinSpotting${filler}`]

// one server flushing its pending rows, as flush() does
async function flush(store: FakeStorage, ...ids: string[]): Promise<void> {
  await writeBatch(store, ids.map((id) => row(id)), 1)
}

function lost(store: FakeStorage, ids: string[]): string[] {
  const stored = store.storedIds()
  return ids.filter((id) => !stored.has(id))
}

describe('flush keeps every row it has stored', () => {
  it('control: one server, Storage reads back what it wrote', async () => {
    const store = new FakeStorage()
    await flush(store, 'a1')
    await flush(store, 'a2', 'a3')
    await flush(store, 'b1')
    expect(lost(store, ['a1', 'a2', 'a3', 'b1'])).toEqual([])
    expect(store.csvKeys()).toHaveLength(1)
  })

  it('H1: two server instances flush at the same time (old and new during a redeploy)', async () => {
    const store = new FakeStorage()
    await flush(store, 'a1', 'a2', 'a3')
    // each instance holds its own pending rows; both read the part before either writes
    await Promise.all([flush(store, 'old1'), flush(store, 'new1')])
    expect(lost(store, ['a1', 'a2', 'a3', 'old1', 'new1'])).toEqual([])
    // they did race: each wrote its own version
    expect(store.csvKeys()).toHaveLength(2)
    // the next flush merges the two versions back into one
    await flush(store, 'c1')
    expect(lost(store, ['a1', 'a2', 'a3', 'old1', 'new1', 'c1'])).toEqual([])
    expect(store.csvKeys()).toHaveLength(1)
  })

  it('H2: reads come back one write behind', async () => {
    const store = new FakeStorage()
    await flush(store, 'a1')
    await flush(store, 'a2', 'a3')
    store.lag = 1
    await flush(store, 'b1')
    expect(lost(store, ['a1', 'a2', 'a3', 'b1'])).toEqual([])
    store.lag = 0
    await flush(store, 'c1')
    expect(store.csvKeys()).toHaveLength(1)
  })

  it('H3: a read misses the stored part although it exists', async () => {
    const store = new FakeStorage()
    await flush(store, 'a1', 'a2', 'a3')
    for (const key of store.csvKeys()) store.missOnce.add(key)
    await flush(store, 'b1')
    expect(lost(store, ['a1', 'a2', 'a3', 'b1'])).toEqual([])
    await flush(store, 'c1')
    expect(store.csvKeys()).toHaveLength(1)
  })
})

describe('parts', () => {
  it('merges a part written by the old code in place, then deletes it', async () => {
    const store = new FakeStorage()
    await store.set(CURRENT_PART_KEY, 1)
    await store.set(legacyPartKey(1), [CSV_HEADER, row('old1')[1], row('old2')[1]].join('\n'))
    await flush(store, 'b1')
    expect(lost(store, ['old1', 'old2', 'b1'])).toEqual([])
    expect(store.csvKeys()).toHaveLength(1)
    expect(store.values.has(legacyPartKey(1))).toBe(false)
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
  })

  it('rolls over to the next part when the open one is full', async () => {
    const store = new FakeStorage()
    const big = 'x'.repeat(250 * 1024)
    await writeBatch(store, [row('a1', big)], 1)
    const result = await writeBatch(store, [row('b1', big)], 1)
    expect(result.part).toBe(2)
    expect(result.rolledOver).toBe(true)
    expect(lost(store, ['a1', 'b1'])).toEqual([])
  })
})
