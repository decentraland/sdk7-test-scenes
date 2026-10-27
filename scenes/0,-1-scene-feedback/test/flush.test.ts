import { describe, expect, it } from 'vitest'
import { CSV_HEADER, rowIds } from '../src/scene-feedback/lib/server/csv'
import { PartStore, partKey, writeBatch } from '../src/scene-feedback/lib/server/parts'

// Scene Storage in memory. Every call yields first, like a network round trip, so two flushes
// started together interleave their reads and writes.
class FakeStorage implements PartStore {
  // every value each key was set to, in order
  readonly history = new Map<string, unknown[]>()
  // H2: reads come back this many writes behind
  lag = 0
  // H3: the next read of these keys comes back null although they exist
  readonly nullOnce = new Set<string>()

  async get<T>(key: string): Promise<T | null> {
    await Promise.resolve()
    const versions = this.history.get(key)
    if (!versions) return null
    if (this.nullOnce.delete(key)) return null
    return versions[Math.max(0, versions.length - 1 - this.lag)] as T
  }

  async set(key: string, value: unknown): Promise<boolean> {
    await Promise.resolve()
    this.history.set(key, [...(this.history.get(key) ?? []), value])
    return true
  }

  // ids in the latest value of every part
  storedIds(): Set<string> {
    const ids = new Set<string>()
    for (const [key, versions] of this.history) {
      if (!key.endsWith('.csv')) continue
      for (const id of rowIds(versions[versions.length - 1] as string)) ids.add(id)
    }
    ids.delete(CSV_HEADER.slice(0, CSV_HEADER.indexOf(',')))
    return ids
  }
}

const row = (id: string): [string, string] => [id, `${id},2026-10-27 12:00:00,abc,coinSpotting`]

// one server flushing its pending rows, as flush() does
async function flush(store: FakeStorage, ...ids: string[]): Promise<void> {
  await writeBatch(store, ids.map(row), 1)
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
  })

  it('H1: two server instances flush at the same time (old and new during a redeploy)', async () => {
    const store = new FakeStorage()
    await flush(store, 'a1', 'a2', 'a3')
    // each instance holds its own pending rows; both read the part before either writes
    await Promise.all([flush(store, 'old1'), flush(store, 'new1')])
    expect(lost(store, ['a1', 'a2', 'a3', 'old1', 'new1'])).toEqual([])
  })

  it('H2: a fresh read comes back one write behind', async () => {
    const store = new FakeStorage()
    await flush(store, 'a1')
    await flush(store, 'a2', 'a3')
    store.lag = 1
    await flush(store, 'b1')
    expect(lost(store, ['a1', 'a2', 'a3', 'b1'])).toEqual([])
  })

  it('H3: a read of the part comes back null although it exists', async () => {
    const store = new FakeStorage()
    await flush(store, 'a1', 'a2', 'a3')
    store.nullOnce.add(partKey(1))
    await flush(store, 'b1')
    expect(lost(store, ['a1', 'a2', 'a3', 'b1'])).toEqual([])
  })
})
