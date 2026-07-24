import { Entity, engine, timers } from '@dcl/sdk/ecs'
import { syncEntity } from '@dcl/sdk/network'
import { HEARTBEAT_MS } from '../shared/config'
import { room } from '../shared/messages'
import {
  CommsTally,
  emptyResults,
  LastWords,
  RunnerState,
  ServerHeartbeat,
  TestResults
} from '../shared/schemas'
import { initRunner, runTest } from './runner'
import { initSpam, requestCleanup, spamSystem } from './spam'

let stateEntity: Entity
let heartbeatEntity: Entity

export async function startServer(): Promise<void> {
  console.log('[SERVER] Limits Lab server starting…')

  // The single server-owned state entity. ONLY the server calls syncEntity() in
  // an authoritative scene; clients receive the sync. Components share one entity
  // but are split by change rate (see schemas.ts).
  stateEntity = engine.addEntity()
  TestResults.create(stateEntity, emptyResults())
  RunnerState.create(stateEntity, { busy: false, currentTestIndex: -1, liveEntities: 0, createdEntities: 0 })
  CommsTally.create(stateEntity, {
    testIndex: -1,
    sentByServer: 0,
    reportedReceivedTotal: 0,
    clientsReporting: 0,
    inboundReceivedByServer: 0,
    inboundSentByClient: 0
  })
  LastWords.create(stateEntity, { testIndex: -1, message: '', writtenAt: 0 })
  syncEntity(stateEntity, [
    TestResults.componentId,
    RunnerState.componentId,
    CommsTally.componentId,
    LastWords.componentId
  ])

  // Heartbeat on its own entity. Pulse immediately so the first client to connect
  // after a (re)boot detects liveness without waiting a full interval — this is
  // also how clients notice the server coming back after a destructive test.
  heartbeatEntity = engine.addEntity()
  ServerHeartbeat.create(heartbeatEntity, { beatAt: Date.now() })
  syncEntity(heartbeatEntity, [ServerHeartbeat.componentId])

  initSpam(stateEntity)
  initRunner({
    stateEntity,
    beatNow: () => {
      ServerHeartbeat.getMutable(heartbeatEntity).beatAt = Date.now()
    },
    delay: (ms: number) => new Promise<void>((resolve) => timers.setTimeout(resolve, ms))
  })

  registerMessageHandlers()
  engine.addSystem(heartbeatSystem)
  engine.addSystem(spamSystem)

  console.log('[SERVER] Ready. Waiting for test requests.')
}

function registerMessageHandlers(): void {
  // Client → server: run a test. The runner guards the busy flag; if it's busy,
  // tell only the requester.
  room.onMessage('runTest', (data, context) => {
    if (!context) return
    const accepted = runTest(data.testIndex, data.param)
    if (!accepted) {
      room.send('notice', { text: 'Runner busy — one test at a time.' }, { to: [context.from] })
    }
  })

  // Client → server: despawn all entity-spam entities (batched over ticks).
  room.onMessage('cleanup', () => requestCleanup())

  // Client → server: how many burst messages a client received (#7).
  room.onMessage('reportCommsTally', (data) => {
    if (data.testIndex !== 7) return
    const t = CommsTally.getMutable(stateEntity)
    t.reportedReceivedTotal += data.received
    t.clientsReporting += 1
  })

  // Client → server: a flood ping (#8). Counted only while test #8 is running.
  room.onMessage('floodPing', () => {
    if (RunnerState.get(stateEntity).currentTestIndex !== 8) return
    CommsTally.getMutable(stateEntity).inboundReceivedByServer += 1
  })

  // Client → server: how many flood pings a client claims it sent (#8).
  room.onMessage('reportFloodSent', (data) => {
    if (data.testIndex !== 8) return
    CommsTally.getMutable(stateEntity).inboundSentByClient += data.sent
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
