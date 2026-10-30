// Heap allocations of warm code, for the bench's bytes/plan and bytes/frame (upstream reports alloc/plan and
// bytes/plan, both 0 for its C++ planner). V8 has no allocation counter, so: the heap's used size before and after,
// plus what every garbage collection in between freed (node:v8 GCProfiler, one record per GC with the heap before and
// after). Used size only grows by allocation and only shrinks by GC, so the sum is what was allocated on the JS heap.
// With --expose-gc (npm run htn:bench passes it) a full GC first leaves less garbage to collect while measuring.
// Precision: within a few bytes per call over thousands of calls (a 2-field object measures 40 B, a 100-element
// array 848 B); a fixed ~1-20 KB per measurement (the profiler itself) is taken out by an empty run, and a one-off
// (the heap growing) by measuring twice and keeping the smaller. Counts only the V8 heap (not ArrayBuffer contents
// or native memory), and only what really reaches it: allocations the optimizing compiler removes (escape analysis)
// are not counted, which is what the GC sees too.
import * as v8 from 'node:v8'

export interface AllocMeasure {
  /** Bytes allocated on the V8 heap. */
  bytes: number
  /** Garbage collections while measuring, and their total ms (GCProfiler cost). */
  gcCount: number
  gcMs: number
}

interface GcRecord {
  cost: number
  beforeGC: { heapStatistics: { usedHeapSize: number } }
  afterGC: { heapStatistics: { usedHeapSize: number } }
}

const gc = (globalThis as { gc?: () => void }).gc

/** True when the process runs with --expose-gc (a full collection before each measurement). */
export const exposedGc = typeof gc === 'function'

/** Start measuring; stop() returns what was allocated and collected since. */
export function startAllocMeter(): { stop(): AllocMeasure } {
  gc?.()
  const profiler = new v8.GCProfiler()
  profiler.start()
  const start = v8.getHeapStatistics().used_heap_size
  return {
    stop(): AllocMeasure {
      const end = v8.getHeapStatistics().used_heap_size
      const records = profiler.stop().statistics as unknown as GcRecord[]
      let freed = 0
      let us = 0
      for (const r of records) {
        freed += r.beforeGC.heapStatistics.usedHeapSize - r.afterGC.heapStatistics.usedHeapSize
        us += r.cost
      }
      return { bytes: end - start + freed, gcCount: records.length, gcMs: us / 1000 }
    }
  }
}

function run(fn: () => void, calls: number): AllocMeasure {
  const meter = startAllocMeter()
  for (let i = 0; i < calls; i++) fn()
  return meter.stop()
}

const noop = () => {}
let emptyCalls = -1
let emptyBytes = 0

/**
 * Bytes per call of `fn` (warm it first), net of the measurement's own; with the GCs that ran meanwhile. Measured
 * twice, the smaller kept: a one-off (the heap growing, the first collections of a process) only adds bytes.
 */
export function measureAllocation(fn: () => void, calls: number): AllocMeasure & { bytesPerCall: number } {
  if (emptyCalls !== calls) {
    run(noop, calls)
    emptyBytes = run(noop, calls).bytes
    emptyCalls = calls
  }
  const a = run(fn, calls)
  const b = run(fn, calls)
  const m = b.bytes < a.bytes ? b : a
  return { ...m, bytesPerCall: Math.max(0, (m.bytes - emptyBytes) / calls) }
}
