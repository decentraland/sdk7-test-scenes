import { Storage } from '@dcl/sdk/server'
import {
  ENDPOINTS,
  FETCH_BURST,
  FLOOD_DURATION_MS,
  HOSTCALL_BURST,
  SEND_BURST,
  WS_BURST,
  WS_OVERSIZE_BYTES
} from '../../shared/config'
import { room } from '../../shared/messages'
import { CommsTally, RunnerState } from '../../shared/schemas'
import { startSpam } from '../spam'
import { errMsg, RunnerCtx, TestFn, TestOutcome } from '../types'

// ---------------------------------------------------------------------------
// The 10 SAFE tests. Each pushes one hammurabi-headless limit that the server
// can survive: either it throws (and we catch it) or it silently sheds work
// (and we measure the shortfall). Pass = the limit fired.
// ---------------------------------------------------------------------------

// #0 — maxConcurrentFetches = 32. Fire more fetches than the pool allows; the
// excess reject synchronously with "too many concurrent requests".
const fetchConcurrency: TestFn = async () => {
  const settled = await Promise.allSettled(Array.from({ length: FETCH_BURST }, () => fetch(ENDPOINTS.fetchOk)))
  const rejected = settled.filter((r) => r.status === 'rejected') as PromiseRejectedResult[]
  const forCap = rejected.filter((r) => /too many concurrent/i.test(errMsg(r.reason))).length
  return {
    pass: forCap > 0,
    detail: `${rejected.length}/${FETCH_BURST} rejected, ${forCap} for the concurrency cap`
  }
}

// #1 — fetchTimeoutMs = 15000. Fetch an endpoint that never answers in time.
const fetchTimeout: TestFn = async () => {
  try {
    await fetch(ENDPOINTS.fetchDelay)
    return { pass: false, detail: 'returned before the timeout (endpoint too fast?)' }
  } catch (e) {
    const m = errMsg(e)
    return { pass: /timeout/i.test(m), detail: m }
  }
}

// #2 — maxFetchRedirects = 5. Fetch a URL that redirects more times than allowed.
const fetchRedirects: TestFn = async () => {
  try {
    await fetch(ENDPOINTS.fetchRedirects)
    return { pass: false, detail: 'followed all redirects without error' }
  } catch (e) {
    const m = errMsg(e)
    return { pass: /redirect/i.test(m), detail: m }
  }
}

// #3 — maxBodyBytes = 10 MB. Read a body bigger than the buffer cap. The cap can
// fire during fetch() (Content-Length) or while reading the body — cover both.
const fetchBodySize: TestFn = async () => {
  try {
    const res = await fetch(ENDPOINTS.fetchBigBody)
    await res.text()
    return { pass: false, detail: 'read the whole body without hitting the cap' }
  } catch (e) {
    const m = errMsg(e)
    return { pass: /exceed|too large|body/i.test(m), detail: m }
  }
}

// #4 — maxWsMessageBytes = 1 MB. Send an oversized frame on an open socket.
const wsMessageSize: TestFn = async (ctx) => {
  // NOTE: the scene cannot catch this limit as a thrown error. In the isolate
  // bridge the scene's ws.send() is wired with `applyIgnored`, so when the host
  // rejects an oversized frame (maxWsMessageBytes) the throw is swallowed — send()
  // returns normally and no onerror fires. From the scene's side it is a SILENT
  // DROP. So we detect it observably instead: send the oversized frame (dropped
  // locally) immediately followed by a small sentinel. Because sends are ordered,
  // an un-dropped oversized frame would echo back BEFORE the sentinel. If only the
  // sentinel echoes, the big frame was dropped by the cap.
  const OVERSIZE = 'x'.repeat(WS_OVERSIZE_BYTES)
  const SENTINEL = 'limitslab-sentinel'
  const BIG_ECHO_THRESHOLD = 100_000

  return new Promise<TestOutcome>((resolve) => {
    let settled = false
    let opened = false
    const ws = new WebSocket(ENDPOINTS.wsEcho)
    const finish = (pass: boolean, detail: string) => {
      if (settled) return
      settled = true
      try {
        ws.close()
      } catch {
        // ignore
      }
      resolve({ pass, detail })
    }
    ws.onopen = () => {
      opened = true
      ws.send(OVERSIZE) // expected to be dropped locally by the cap
      ws.send(SENTINEL) // small — should echo back
    }
    ws.onmessage = (ev) => {
      const data = typeof ev.data === 'string' ? ev.data : ''
      if (data.length >= BIG_ECHO_THRESHOLD) {
        finish(false, 'oversized frame echoed back — cap did not fire (raised via env?)')
      } else if (data.indexOf(SENTINEL) !== -1) {
        finish(true, 'oversized frame dropped locally; sentinel echoed (cap enforced)')
      }
    }
    ws.onerror = () => {
      if (!opened) finish(false, 'WS endpoint error before open (repoint ENDPOINTS.wsEcho?)')
    }
    ws.onclose = () => {
      if (!opened) finish(false, 'WS closed before opening (unreachable or handshake timeout)')
    }
    // Backstop above the 15 s handshake timeout so a stuck connection still resolves.
    void ctx.delay(18000).then(() => finish(false, 'no sentinel echo within 18 s'))
  })
}

// #5 — maxOpenSockets = 32. Construct more sockets than the scene may hold; the
// constructor past the cap throws synchronously.
const wsOpenSockets: TestFn = async () => {
  const sockets: WebSocket[] = []
  let threw = ''
  try {
    for (let i = 0; i < WS_BURST; i++) sockets.push(new WebSocket(ENDPOINTS.wsEcho))
  } catch (e) {
    threw = errMsg(e)
  }
  for (const s of sockets) {
    try {
      s.close()
    } catch {
      // ignore
    }
  }
  return {
    pass: /too many open connections/i.test(threw),
    detail: threw || `opened all ${WS_BURST} sockets without error`
  }
}

// #6 — maxInflightHostCalls = 40. fetch trips its own 32-cap first, so burst a
// NON-fetch host call instead. Storage.get crosses the host boundary cleanly.
const inflightHostCalls: TestFn = async () => {
  const settled = await Promise.allSettled(
    Array.from({ length: HOSTCALL_BURST }, (_v, i) => Storage.get(`limitslab-probe-${i}`))
  )
  const rejected = settled.filter((r) => r.status === 'rejected') as PromiseRejectedResult[]
  const forCap = rejected.filter((r) => /too many concurrent host calls/i.test(errMsg(r.reason))).length
  return {
    pass: forCap > 0,
    detail: `${rejected.length}/${HOSTCALL_BURST} rejected, ${forCap} for the host-call cap`
  }
}

// #7 — maxSendMessages = 512 (+ maxCommsMessageBytes = 30 KB). Emit far more
// messages than one sendBinary turn allows; the room batches them into a single
// host call per frame, so the excess is dropped. Clients tally what arrives and
// report back; a received total below what the server sent proves the drop.
const sendBinaryBurst: TestFn = async (ctx) => {
  const tally = CommsTally.getMutable(ctx.stateEntity)
  tally.testIndex = 7
  tally.sentByServer = SEND_BURST
  tally.reportedReceivedTotal = 0
  tally.clientsReporting = 0

  for (let i = 0; i < SEND_BURST; i++) room.send('commsBurst', { testIndex: 7, seq: i })

  // Give clients time to receive the burst and report their counts.
  await ctx.delay(3500)

  const t = CommsTally.get(ctx.stateEntity)
  if (t.clientsReporting === 0) {
    return { pass: false, detail: `no client reported (open a client). server sent ${SEND_BURST}` }
  }
  const expectedIfNoDrop = SEND_BURST * t.clientsReporting
  const dropped = expectedIfNoDrop - t.reportedReceivedTotal
  return {
    pass: t.reportedReceivedTotal < expectedIfNoDrop,
    detail: `${t.reportedReceivedTotal} recv / ${expectedIfNoDrop} sent across ${t.clientsReporting} client(s) — ~${dropped} dropped`
  }
}

// #8 — maxMessagesPerWindow = 300/s per peer. The CLIENT floods tiny messages;
// the server just counts arrivals during the window (see server.ts floodPing
// handler). Fewer received than the client sent proves inbound rate limiting.
const inboundRateLimit: TestFn = async (ctx) => {
  const tally = CommsTally.getMutable(ctx.stateEntity)
  tally.testIndex = 8
  tally.inboundReceivedByServer = 0
  tally.inboundSentByClient = 0

  // Wait for the client's ~3 s flood plus a buffer for its reportFloodSent.
  await ctx.delay(FLOOD_DURATION_MS + 2000)

  const t = CommsTally.get(ctx.stateEntity)
  if (t.inboundSentByClient === 0) {
    return { pass: false, detail: 'no flood observed (open a client and retry)' }
  }
  return {
    pass: t.inboundReceivedByServer < t.inboundSentByClient,
    detail: `server got ${t.inboundReceivedByServer} of ${t.inboundSentByClient} sent (cap ~300/s)`
  }
}

// #9 — maxLiveEntities = 100000. Spawn entities in batches (spam.ts) to the
// chosen target. This is chiefly an observational stress test: the counts climb
// on all clients and the cap causes silent drops near 100k.
const entitySpam: TestFn = async (ctx, param) => {
  const target = param > 0 ? param : 10000
  await startSpam(target)
  const state = RunnerState.get(ctx.stateEntity)
  return {
    pass: state.createdEntities >= target || state.liveEntities >= 90000,
    detail: `created ${state.createdEntities}, live ${state.liveEntities} (cap ~100000). Use Cleanup to despawn.`
  }
}

export const SAFE_TESTS: Record<string, TestFn> = {
  'fetch-concurrency': fetchConcurrency,
  'fetch-timeout': fetchTimeout,
  'fetch-redirects': fetchRedirects,
  'fetch-body-size': fetchBodySize,
  'ws-message-size': wsMessageSize,
  'ws-open-sockets': wsOpenSockets,
  'inflight-host-calls': inflightHostCalls,
  'send-binary-burst': sendBinaryBurst,
  'inbound-rate-limit': inboundRateLimit,
  'entity-spam': entitySpam
}
