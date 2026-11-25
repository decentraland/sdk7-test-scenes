import { Worker } from 'node:worker_threads'
import type { TraversalBackend } from '../sdk-detour-probe/traversal-routing'
import type { TileJob, TilePatch } from './revision-tile-worker'

type WorkerReply = { ready: true } | { id: number; patch: TilePatch } | { id: number; error: string }
type PendingJob = {
  job: TileJob
  resolve: (patch: TilePatch) => void
  reject: (error: Error) => void
}

export function createRevisionWorkers(backend: TraversalBackend) {
  const queue: PendingJob[] = []
  let nextId = 0
  let closed = false
  let failure: Error | undefined
  const bootstrap = `
    const { workerData } = require('node:worker_threads');
    import(workerData.loader).then(({ register }) => {
      register();
      return import(workerData.entry);
    }).catch((error) => { setImmediate(() => { throw error }); });
  `
  const slots = Array.from({ length: 4 }, () => {
    const worker = new Worker(bootstrap, {
      eval: true, execArgv: [],
      workerData: { backend, loader: import.meta.resolve('tsx/esm/api'), entry: new URL('./revision-tile-worker.ts', import.meta.url).href }
    })
    return { worker, ready: false, current: undefined as PendingJob | undefined }
  })
  function rejectWork(error: Error) {
    failure = error
    for (const { current } of slots) current?.reject(error)
    for (const item of queue.splice(0)) item.reject(error)
  }
  function dispatch() {
    if (closed || failure) return
    for (const slot of slots) {
      if (!slot.ready || slot.current || !queue.length) continue
      slot.current = queue.shift()!
      slot.worker.postMessage(slot.current.job)
    }
  }
  for (const slot of slots) {
    slot.worker.on('message', (reply: WorkerReply) => {
      if ('ready' in reply) slot.ready = true
      else {
        const current = slot.current
        if (!current || current.job.id !== reply.id) {
          rejectWork(new Error('Revision worker returned an unexpected tile.'))
          return
        }
        slot.current = undefined
        if ('error' in reply) current.reject(new Error(reply.error))
        else current.resolve(reply.patch)
      }
      dispatch()
    })
    slot.worker.on('error', rejectWork)
    slot.worker.on('exit', (code) => {
      if (!closed) rejectWork(new Error('Revision worker exited before shutdown with code ' + code))
    })
  }
  return {
    build(input: Omit<TileJob, 'id' | 'progress'>, gate?: Promise<unknown>) {
      const progress = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)
      const flag = new Int32Array(progress)
      const job: TileJob = { ...input, progress, id: nextId++ }
      const result = Promise.resolve(gate).then(() => new Promise<TilePatch>((resolve, reject) => {
        if (closed || failure) reject(failure ?? new Error('Revision worker pool is closed.'))
        else {
          queue.push({ job, resolve, reject })
          dispatch()
        }
      }))
      return { result, state: () => Atomics.load(flag, 0) }
    },
    async dispose() {
      closed = true
      rejectWork(new Error('Revision worker pool stopped.'))
      await Promise.all(slots.map(({ worker }) => worker.terminate()))
    }
  }
}
