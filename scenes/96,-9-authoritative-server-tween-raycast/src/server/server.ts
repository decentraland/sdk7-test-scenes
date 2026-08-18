import { Entity, engine } from '@dcl/sdk/ecs'
import { syncEntity } from '@dcl/sdk/network'
import { HEARTBEAT_MS } from '../shared/config'
import { harnessSystem } from '../shared/harness'
import { room } from '../shared/messages'
import { ResultSink, Summary, runAll, runSingle } from '../shared/runner'
import {
  LiveRig,
  ServerCapabilities,
  ServerHeartbeat,
  ServerResults,
  Support,
  TestStatus,
  emptyResults
} from '../shared/schemas'
import { TESTS, testByIndex } from '../shared/tests'
import { initRig, rigSystem } from './rig'

let stateEntity: Entity
let heartbeatEntity: Entity

export async function startServer(): Promise<void> {
  console.log('[SERVER] Tween & Raycast capability harness starting…')

  // The single server-owned state entity. ONLY the server calls syncEntity() in an
  // authoritative scene; clients receive the sync. The three components share one
  // entity but are split by change rate (see schemas.ts).
  stateEntity = engine.addEntity()
  ServerResults.create(stateEntity, emptyResults())
  ServerCapabilities.create(stateEntity, {
    tween: Support.Unknown,
    raycast: Support.Unknown,
    tweenPassed: 0,
    tweenTotal: 0,
    raycastPassed: 0,
    raycastTotal: 0,
    running: false,
    currentIndex: -1,
    completedAt: 0
  })
  LiveRig.create(stateEntity)
  syncEntity(stateEntity, [ServerResults.componentId, ServerCapabilities.componentId, LiveRig.componentId])

  // Heartbeat on its own entity. Pulse immediately so the first client to connect
  // after a cold start detects liveness without waiting a full interval. It matters
  // more here than in most scenes: a stale CRDT snapshot and a server with no tween
  // system look identical (a frozen platform), and only the heartbeat separates them.
  heartbeatEntity = engine.addEntity()
  ServerHeartbeat.create(heartbeatEntity, { beatAt: Date.now() })
  syncEntity(heartbeatEntity, [ServerHeartbeat.componentId])

  // harnessSystem drives every await in the suite; rigSystem runs the live demo.
  engine.addSystem(harnessSystem)
  engine.addSystem(heartbeatSystem)
  initRig(stateEntity)
  engine.addSystem(rigSystem)

  registerMessageHandlers()

  // Auto-run once at boot so an operator who just walks in gets the verdict without
  // touching the panel — and so `npm run server-logs` carries it even with nobody
  // in the scene. Detached: startServer() must return so the engine starts ticking,
  // and the suite needs those ticks to make progress.
  void runAll(sink)

  console.log(`[SERVER] Ready. Running ${TESTS.length} capability tests…`)
}

// Where a server-side run reports to: straight into the synced components, row by
// row, so clients watch the table fill live instead of waiting for the whole run.
const sink: ResultSink = {
  begin(index: number): void {
    const results = ServerResults.getMutable(stateEntity)
    results.status[index] = TestStatus.Running
    results.detail[index] = ''
  },

  finish(index: number, status: TestStatus, detail: string, durationMs: number): void {
    const results = ServerResults.getMutable(stateEntity)
    results.status[index] = status
    results.detail[index] = detail
    results.durationMs[index] = durationMs

    const test = testByIndex(index)
    const glyph = status === TestStatus.Pass ? 'PASS' : 'FAIL'
    console.log(`[SERVER] ${glyph} #${index} ${test?.name ?? '?'} (${durationMs}ms) — ${detail}`)
  },

  setRunning(running: boolean, currentIndex: number): void {
    const capabilities = ServerCapabilities.getMutable(stateEntity)
    capabilities.running = running
    capabilities.currentIndex = currentIndex
  },

  publishSummary(summary: Summary): void {
    const capabilities = ServerCapabilities.getMutable(stateEntity)
    capabilities.tween = summary.tween
    capabilities.raycast = summary.raycast
    capabilities.tweenPassed = summary.tweenPassed
    capabilities.tweenTotal = summary.tweenTotal
    capabilities.raycastPassed = summary.raycastPassed
    capabilities.raycastTotal = summary.raycastTotal
    capabilities.completedAt = Date.now()
  },

  statuses(): TestStatus[] {
    return [...ServerResults.get(stateEntity).status]
  },

  log(line: string): void {
    console.log(`[SERVER] ${line}`)
  }
}

function registerMessageHandlers(): void {
  // Client → server: re-run everything. The runner's own busy guard is the
  // authority; a rejected request is reported back to that one client only.
  room.onMessage('runServerSuite', (_data, context) => {
    if (!context) return
    const from = context.from
    void runAll(sink).then((accepted) => {
      if (!accepted) room.send('notice', { text: 'A server run is already in flight.' }, { to: [from] })
    })
  })

  // Client → server: re-run a single row.
  room.onMessage('runServerTest', (data, context) => {
    if (!context) return
    const from = context.from
    if (!testByIndex(data.index)) return
    void runSingle(data.index, sink).then((accepted) => {
      if (!accepted) room.send('notice', { text: 'A server run is already in flight.' }, { to: [from] })
    })
  })
}

// --- Heartbeat -----------------------------------------------------------------

let heartbeatAcc = 0
function heartbeatSystem(dt: number): void {
  heartbeatAcc += dt
  if (heartbeatAcc < HEARTBEAT_MS / 1000) return
  heartbeatAcc = 0
  ServerHeartbeat.getMutable(heartbeatEntity).beatAt = Date.now()
}
