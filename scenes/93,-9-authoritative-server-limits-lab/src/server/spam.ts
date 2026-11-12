import { Entity, engine } from '@dcl/sdk/ecs'
import { ENTITY_BATCH } from '../shared/config'
import { RunnerState, SpamMarker } from '../shared/schemas'

// ---------------------------------------------------------------------------
// Entity-spam controller (test #9, maxLiveEntities).
//
// The entities are created SERVER-SIDE ONLY — deliberately NOT synced. This is a
// server limit (maxLiveEntities is enforced when the scene's isolate creates an
// entity), so server-local entities count toward it just the same. Syncing tens
// of thousands of entities to clients instead floods their CRDT/engine and locks
// the browser UI — which is exactly what happened the first time this shipped.
// Clients observe the run through the (synced) RunnerState counter, not the
// entities themselves.
//
// Both spawn and cleanup run in BATCHES across engine ticks. A single synchronous
// loop over 100k entities would trip the sync-execution timeout and kill the
// isolate — the wrong limit.
// ---------------------------------------------------------------------------

const CLEANUP_BATCH = 2000

type Mode = 'idle' | 'spawning' | 'cleaning'

let stateEntity: Entity
let mode: Mode = 'idle'
let target = 0
let created = 0
let done: (() => void) | null = null
const spamEntities: Entity[] = []

export function initSpam(entity: Entity): void {
  stateEntity = entity
}

// Begin spawning up to `to` entities; resolves once the target is reached.
export function startSpam(to: number): Promise<void> {
  target = to
  created = 0
  mode = 'spawning'
  return new Promise<void>((resolve) => {
    done = resolve
  })
}

// Ask the spam system to despawn everything over the next few ticks.
export function requestCleanup(): void {
  if (spamEntities.length > 0) mode = 'cleaning'
}

function publishCounts(): void {
  const rs = RunnerState.getMutableOrNull(stateEntity)
  if (rs) {
    rs.createdEntities = created
    rs.liveEntities = spamEntities.length
  }
}

export function spamSystem(): void {
  if (mode === 'spawning') {
    const remaining = target - created
    if (remaining <= 0) {
      mode = 'idle'
      const finish = done
      done = null
      if (finish) finish()
      return
    }
    const batch = Math.min(ENTITY_BATCH, remaining)
    for (let i = 0; i < batch; i++) {
      const e = engine.addEntity()
      SpamMarker.create(e, { n: created + i })
      spamEntities.push(e)
    }
    created += batch
    publishCounts()
    return
  }

  if (mode === 'cleaning') {
    let n = 0
    while (n < CLEANUP_BATCH && spamEntities.length > 0) {
      engine.removeEntity(spamEntities.pop()!)
      n++
    }
    if (spamEntities.length === 0) {
      mode = 'idle'
      created = 0
    }
    publishCounts()
  }
}
