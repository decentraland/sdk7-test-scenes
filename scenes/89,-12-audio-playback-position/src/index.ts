/**
 * Audio Playback Position Reports Test Scene
 *
 * Exercises the playback-position reports that renderers write into the AudioEvent component while an
 * AudioSource clip plays (protocol decentraland/protocol#488, SDK decentraland/js-sdk-toolchain#1624,
 * design record ADR-318 / decentraland/adr#324, Unity explorer decentraland/unity-explorer#10123).
 * PBAudioEvent gained three OPTIONAL fields:
 *   - tickNumber     scene tick (equals EngineInfo.tickNumber) in which the renderer sampled the position
 *   - currentOffset  clip playback position in seconds at that tick
 *   - clipLength     total clip length in seconds, when known
 * `state` (MediaState) and `timestamp` (a per-entity monotonic counter, NOT a time) are unchanged.
 *
 * Why it matters: a renderer starts a clip 100-250 ms after being asked to (the delay varies per start) and
 * AudioSource.currentTime is a write-only seek, so a scene could never learn where the audio actually is.
 * With tickNumber the scene records its own clock per EngineInfo.tickNumber and computes
 *   lag = clockAtTick(report.tickNumber) - report.currentOffset * 1000
 * Comparing against the clock at the moment the report is PROCESSED would be wrong by the report's transport
 * delay (several ticks); the "naive" line shows that error in-world.
 *
 * API under test (audioEventsSystem from '@dcl/sdk/ecs'):
 *   - registerAudioPlaybackEntity / removeAudioPlaybackEntity: callback on EVERY report, including the
 *     periodic position updates (push API)
 *   - getAudioPlayback(entity): latest report carrying currentOffset, or undefined (pull API)
 *   - registerAudioEventsEntity (pre-existing): still fires ONLY on media-state changes
 *
 * Buttons (front row, left to right):
 *   PLAY          playSound from 0 with the current loop mode; resets the scene clock to 0
 *   SEEK 10s      createOrReplace with currentTime = 10 and playing = true (always emits a PUT, even when
 *                 pressed twice); resets the scene clock to 10 s. The next report shows where the renderer
 *                 actually landed.
 *   STOP          stopSound (scene-initiated)
 *   TOGGLE LOOP   flips AudioSource.loop. With loop ON, currentOffset wraps to 0 while state stays MS_PLAYING
 *                 and the scene clock keeps counting, so lag grows by clipLength per wrap. Toggling re-sends
 *                 the whole component: a renderer that restarts on a same-URL PUT restarts from currentTime,
 *                 and the next report shows exactly that. Toggle before PLAY to see a clean wrap.
 *   PUSH CB       unregisters / re-registers the playback callback (removeAudioPlaybackEntity); while off the
 *                 push counter freezes but the pull panel keeps updating
 *
 * How to read the labels:
 *   CLOCK line    current EngineInfo tick, the scene clock (expected playback position in ms since the last
 *                 PLAY/SEEK), loop mode and AudioSource.playing
 *   PUSH panel    registerAudioPlaybackEntity: callback counts, the last report's state / timestamp /
 *                 tickNumber / currentOffset / clipLength, "audio behind clock by N ms" (correct lag via the
 *                 clock recorded at report.tickNumber), the naive lag computed with the clock at processing
 *                 time and their difference, report cadence (ms since the previous report) and transport
 *                 delay (current tick - report tick)
 *   PULL panel    getAudioPlayback(entity) polled every frame, with getAudioState for contrast
 *   DRIFT line    lag now vs lag at the first position report after PLAY/SEEK
 *   STATE LOG     registerAudioEventsEntity log plus both callback counts: the playback count keeps growing
 *                 while the state count only moves on state changes, so position reports do not trigger it
 *   BEAT cubes    the clip beeps on every whole second (pitch 440 Hz + 40 Hz per second, so a seek is
 *                 audible). The CLOCK cube flashes on each whole second of the scene clock; the AUDIO cube
 *                 flashes on each whole second of (clock - lag). The AUDIO cube should line up with what you
 *                 hear; the CLOCK cube runs early by the lag.
 *   Renderers that never send currentOffset show "no position reports from this renderer" instead of NaN.
 *
 * Until the protocol and SDK PRs merge this scene needs the branch build of @dcl/sdk pinned in package.json,
 * and only the Unity explorer branch produces position reports.
 */

import {
  engine,
  Entity,
  Transform,
  MeshRenderer,
  MeshCollider,
  TextShape,
  Billboard,
  Material,
  AudioSource,
  EngineInfo,
  audioEventsSystem,
  MediaState,
  PBAudioEvent,
  pointerEventsSystem,
  InputAction
} from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'

// 30 s generated tone: a 120 ms beep on every whole second whose pitch rises 40 Hz per second, over a quiet hum.
const CLIP = 'audio/tone-30s.mp3'
const SEEK_TARGET_SECONDS = 10
const TICK_HISTORY = 90 // ticks of scene clock kept for clockAtTick lookups (~3 s at 30 fps)
const NO_REPORTS_AFTER_MS = 3000 // playing this long with AudioEvent state but no position => older renderer
const BEAT_FLASH_MS = 120

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------

function createButton(position: Vector3, color: Color4): Entity {
  const entity = engine.addEntity()
  Transform.create(entity, { position, scale: Vector3.create(1.2, 1.2, 1.2) })
  MeshRenderer.setBox(entity)
  MeshCollider.setBox(entity)
  Material.setPbrMaterial(entity, { albedoColor: color })
  return entity
}

function createLabel(position: Vector3, fontSize = 2, color: Color4 = Color4.White(), text = ''): Entity {
  const entity = engine.addEntity()
  Transform.create(entity, { position })
  TextShape.create(entity, {
    text,
    fontSize,
    textColor: color,
    outlineWidth: 0.1,
    outlineColor: Color4.Black()
  })
  Billboard.create(entity, {})
  return entity
}

// Only touches the mutable component when the text changes, so per-frame refreshes do not emit CRDT traffic.
function setLabel(entity: Entity, text: string): void {
  if (TextShape.get(entity).text === text) return
  TextShape.getMutable(entity).text = text
}

function mediaStateName(state: MediaState): string {
  switch (state) {
    case MediaState.MS_NONE:
      return 'MS_NONE'
    case MediaState.MS_ERROR:
      return 'MS_ERROR'
    case MediaState.MS_LOADING:
      return 'MS_LOADING'
    case MediaState.MS_READY:
      return 'MS_READY'
    case MediaState.MS_PLAYING:
      return 'MS_PLAYING'
    case MediaState.MS_BUFFERING:
      return 'MS_BUFFERING'
    case MediaState.MS_SEEKING:
      return 'MS_SEEKING'
    case MediaState.MS_PAUSED:
      return 'MS_PAUSED'
    default:
      return `UNKNOWN(${state})`
  }
}

function fmtMs(value: number | undefined): string {
  return value === undefined ? 'n/a' : `${Math.round(value)} ms`
}

function fmtSeconds(value: number | undefined): string {
  return value === undefined ? 'n/a' : `${value.toFixed(3)} s`
}

// ---------------------------------------------------------------------------
// Scene clock: the playback position the scene EXPECTS, in ms, as if the renderer had reacted instantly
// to the last PLAY/SEEK. Recorded once per tick under EngineInfo.tickNumber so a report sampled at tick N
// can be compared with the clock at tick N, not with the clock when the report is processed.
// ---------------------------------------------------------------------------

let clockOriginWallMs: number | undefined // Date.now() at the last PLAY/SEEK press; undefined until pressed
let clockOffsetMs = 0 // 0 after PLAY, 10000 after SEEK
let currentTick = -1
const clockByTick = new Map<number, number>() // tickNumber -> scene clock (ms) recorded in that tick

function sceneClockMs(): number | undefined {
  if (clockOriginWallMs === undefined) return undefined
  return Date.now() - clockOriginWallMs + clockOffsetMs
}

function recordSceneClock(): void {
  const tick = EngineInfo.getOrNull(engine.RootEntity)?.tickNumber
  if (tick === undefined) return
  currentTick = tick
  const clock = sceneClockMs()
  if (clock === undefined) return
  clockByTick.set(tick, clock)
  // Map keeps insertion order, so the first key is the oldest tick.
  while (clockByTick.size > TICK_HISTORY) {
    const oldest = clockByTick.keys().next().value
    if (oldest === undefined) break
    clockByTick.delete(oldest)
  }
}

// Higher priority runs first: this tick's clock must be recorded before the SDK's audio-events system
// (default priority) delivers a report that may carry the current tickNumber.
engine.addSystem(recordSceneClock, 200000, 'record-scene-clock')

// ---------------------------------------------------------------------------
// Audio entity
// ---------------------------------------------------------------------------

const audioEntity = engine.addEntity()
Transform.create(audioEntity, { position: Vector3.create(8, 1, 8) })
AudioSource.create(audioEntity, {
  audioClipUrl: CLIP,
  playing: false,
  loop: false
})

// Bookkeeping for the readout only (not ECS state).
let playbackCallbackCount = 0 // registerAudioPlaybackEntity invocations (every report)
let positionReportCount = 0 // ...of which carried currentOffset
let stateCallbackCount = 0 // registerAudioEventsEntity invocations (state changes only)
let lastReportWallMs: number | undefined
let firstLagMs: number | undefined // lag at the first position report after PLAY/SEEK
let lastLagMs: number | undefined
let pushCallbackRegistered = false
const stateLog: string[] = []

// ---------------------------------------------------------------------------
// Readout labels
// ---------------------------------------------------------------------------

const clockLabel = createLabel(Vector3.create(8, 5.6, 7), 2, Color4.Yellow(), 'tick n/a   scene clock not started')
const pushLabel = createLabel(
  Vector3.create(3.5, 3.6, 9),
  1.5,
  Color4.create(0.5, 0.9, 1, 1),
  'registerAudioPlaybackEntity (push API, every report)\n(no report yet)'
)
const pullLabel = createLabel(
  Vector3.create(8.5, 4.2, 9),
  1.5,
  Color4.create(0.6, 1, 0.6, 1),
  'getAudioPlayback (pull API, polled every frame)\n(no report yet)'
)
const driftLabel = createLabel(Vector3.create(8.5, 2.6, 9), 1.5, Color4.create(1, 0.5, 0.2, 1), 'drift: n/a')
const stateLogLabel = createLabel(
  Vector3.create(13, 3.6, 9),
  1.5,
  Color4.create(1, 0.85, 0.5, 1),
  'registerAudioEventsEntity (state changes only)\n(none yet)'
)

function renderStateLog(): void {
  setLabel(
    stateLogLabel,
    [
      'registerAudioEventsEntity (state changes only)',
      `state callbacks ${stateCallbackCount}   playback callbacks ${playbackCallbackCount}`,
      ...(stateLog.length > 0 ? stateLog : ['(none yet)'])
    ].join('\n')
  )
}

function renderDrift(): void {
  if (firstLagMs === undefined || lastLagMs === undefined) {
    setLabel(driftLabel, 'drift: waiting for the first position report after PLAY/SEEK')
    return
  }
  setLabel(
    driftLabel,
    `drift: lag now ${fmtMs(lastLagMs)} vs first report ${fmtMs(firstLagMs)}  ->  ${fmtMs(lastLagMs - firstLagMs)}\n` +
      '(positive = audio falling further behind the clock)'
  )
}

// ---------------------------------------------------------------------------
// Push API: registerAudioPlaybackEntity fires on every report, position updates included
// ---------------------------------------------------------------------------

function onPlaybackReport(report: Readonly<PBAudioEvent>): void {
  playbackCallbackCount++
  if (report.currentOffset !== undefined) positionReportCount++
  const wallNow = Date.now()
  const cadenceMs = lastReportWallMs === undefined ? undefined : wallNow - lastReportWallMs
  lastReportWallMs = wallNow
  renderStateLog()

  const header = [
    'registerAudioPlaybackEntity (push API, every report)',
    `callbacks ${playbackCallbackCount}   (with position ${positionReportCount})`,
    `state ${mediaStateName(report.state)}   timestamp ${report.timestamp}`
  ]

  if (report.currentOffset === undefined) {
    setLabel(
      pushLabel,
      [...header, 'no currentOffset in this report (state-only)', `cadence ${fmtMs(cadenceMs)}`].join('\n')
    )
    return
  }

  const offsetMs = report.currentOffset * 1000
  const clockAtTick = report.tickNumber === undefined ? undefined : clockByTick.get(report.tickNumber)
  const clockNow = sceneClockMs()
  const lagMs = clockAtTick === undefined ? undefined : clockAtTick - offsetMs
  const naiveLagMs = clockNow === undefined ? undefined : clockNow - offsetMs
  const transportTicks = report.tickNumber === undefined ? undefined : currentTick - report.tickNumber

  if (lagMs !== undefined) {
    lastLagMs = lagMs
    if (firstLagMs === undefined) firstLagMs = lagMs
  }

  let lagLine: string
  if (lagMs !== undefined) {
    lagLine = `audio behind clock by ${fmtMs(lagMs)}   (clock at tick ${report.tickNumber}: ${fmtMs(clockAtTick)})`
  } else if (report.tickNumber === undefined) {
    lagLine = 'audio behind clock by: n/a (report has no tickNumber)'
  } else {
    lagLine =
      `audio behind clock by: n/a (tick ${report.tickNumber} not in clock history:\n` +
      `sampled before PLAY/SEEK or older than ${TICK_HISTORY} ticks)`
  }

  const naiveLine =
    lagMs !== undefined && naiveLagMs !== undefined
      ? `naive (clock at processing time) ${fmtMs(naiveLagMs)}   difference ${fmtMs(naiveLagMs - lagMs)}`
      : `naive (clock at processing time) ${fmtMs(naiveLagMs)}`

  const lines = [
    ...header,
    `tickNumber ${report.tickNumber ?? 'n/a'}   currentOffset ${fmtSeconds(report.currentOffset)}   clipLength ${fmtSeconds(
      report.clipLength
    )}`,
    lagLine,
    naiveLine,
    `cadence ${fmtMs(cadenceMs)}   transport delay ${transportTicks === undefined ? 'n/a' : `${transportTicks} ticks`}`
  ]
  if (AudioSource.get(audioEntity).loop) {
    lines.push('loop ON: offset wraps while the clock keeps counting, so lag grows by clipLength per wrap')
  }
  setLabel(pushLabel, lines.join('\n'))
  renderDrift()
}

function setPushCallback(enabled: boolean): void {
  if (enabled) {
    audioEventsSystem.registerAudioPlaybackEntity(audioEntity, onPlaybackReport)
  } else {
    audioEventsSystem.removeAudioPlaybackEntity(audioEntity)
  }
  pushCallbackRegistered = enabled
}

setPushCallback(true)

// ---------------------------------------------------------------------------
// State-change API: registerAudioEventsEntity must NOT fire for position reports that keep the same state
// ---------------------------------------------------------------------------

audioEventsSystem.registerAudioEventsEntity(audioEntity, (event) => {
  stateCallbackCount++
  const position = event.currentOffset === undefined ? '' : `  offset ${fmtSeconds(event.currentOffset)}`
  stateLog.push(`${mediaStateName(event.state)} @ts ${event.timestamp}${position}`)
  if (stateLog.length > 6) stateLog.shift()
  renderStateLog()
})

// ---------------------------------------------------------------------------
// Beat cubes: visual check of clock vs (clock - lag) against the audible beep on every whole second
// ---------------------------------------------------------------------------

type BeatCube = { entity: Entity; color: Color4; lastSecond: number; flashUntil: number; lit: boolean }

function createBeatCube(position: Vector3, color: Color4, text: string): BeatCube {
  const entity = engine.addEntity()
  Transform.create(entity, { position, scale: Vector3.create(0.8, 0.8, 0.8) })
  MeshRenderer.setBox(entity)
  Material.setPbrMaterial(entity, { albedoColor: color })
  createLabel(Vector3.create(position.x, position.y + 1.1, position.z), 1.6, Color4.White(), text)
  return { entity, color, lastSecond: -1, flashUntil: 0, lit: false }
}

function updateBeat(cube: BeatCube, positionMs: number | undefined, wallNow: number): void {
  if (positionMs !== undefined) {
    const second = Math.floor(positionMs / 1000)
    if (second !== cube.lastSecond) {
      cube.lastSecond = second
      cube.flashUntil = wallNow + BEAT_FLASH_MS
    }
  }
  const lit = wallNow < cube.flashUntil
  if (lit === cube.lit) return
  cube.lit = lit
  Material.setPbrMaterial(cube.entity, { albedoColor: lit ? Color4.White() : cube.color })
}

const clockBeat = createBeatCube(
  Vector3.create(1.5, 1, 4),
  Color4.create(0.6, 0.6, 0.1, 1),
  'CLOCK beat\n(scene clock)'
)
const audioBeat = createBeatCube(
  Vector3.create(14.5, 1, 4),
  Color4.create(0.1, 0.5, 0.6, 1),
  'AUDIO beat\n(clock - lag)'
)

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

// Restarts the scene clock at `offsetMs` (0 for PLAY, 10000 for SEEK) and forgets everything measured against
// the previous origin.
function startClock(offsetMs: number): void {
  clockOriginWallMs = Date.now()
  clockOffsetMs = offsetMs
  clockByTick.clear()
  firstLagMs = undefined
  lastLagMs = undefined
  clockBeat.lastSecond = -1
  audioBeat.lastSecond = -1
  recordSceneClock()
  renderDrift()
}

const btnPlay = createButton(Vector3.create(4, 1, 4), Color4.create(0.2, 0.8, 0.2, 1))
createLabel(Vector3.create(4, 2.3, 4), 2, Color4.White(), 'PLAY')
pointerEventsSystem.onPointerDown(
  { entity: btnPlay, opts: { button: InputAction.IA_POINTER, hoverText: 'Play from 0 (resets the scene clock)' } },
  () => {
    AudioSource.playSound(audioEntity, CLIP, true)
    startClock(0)
  }
)

const btnSeek = createButton(Vector3.create(6, 1, 4), Color4.create(0.2, 0.4, 0.9, 1))
createLabel(Vector3.create(6, 2.3, 4), 2, Color4.White(), `SEEK ${SEEK_TARGET_SECONDS}s`)
pointerEventsSystem.onPointerDown(
  {
    entity: btnSeek,
    opts: { button: InputAction.IA_POINTER, hoverText: `Seek to ${SEEK_TARGET_SECONDS}s and play (clock = 10 s)` }
  },
  () => {
    // createOrReplace always emits a PUT, even when playing/currentTime are unchanged (SEEK pressed twice), so
    // the renderer re-seeks every time. Hand-mutating via getMutable would be deduped when nothing changed.
    AudioSource.createOrReplace(audioEntity, {
      ...AudioSource.get(audioEntity),
      playing: true,
      currentTime: SEEK_TARGET_SECONDS
    })
    startClock(SEEK_TARGET_SECONDS * 1000)
  }
)

const btnStop = createButton(Vector3.create(8, 1, 4), Color4.create(0.8, 0.2, 0.2, 1))
createLabel(Vector3.create(8, 2.3, 4), 2, Color4.White(), 'STOP')
pointerEventsSystem.onPointerDown(
  { entity: btnStop, opts: { button: InputAction.IA_POINTER, hoverText: 'Stop (scene-initiated)' } },
  () => {
    AudioSource.stopSound(audioEntity, true)
  }
)

const btnLoop = createButton(Vector3.create(10, 1, 4), Color4.create(0.7, 0.4, 0.9, 1))
createLabel(Vector3.create(10, 2.3, 4), 2, Color4.White(), 'TOGGLE LOOP')
pointerEventsSystem.onPointerDown(
  { entity: btnLoop, opts: { button: InputAction.IA_POINTER, hoverText: 'Toggle AudioSource.loop' } },
  () => {
    const source = AudioSource.getMutable(audioEntity)
    source.loop = !source.loop
  }
)

const btnPushCallback = createButton(Vector3.create(12, 1, 4), Color4.create(0.5, 0.5, 0.5, 1))
const pushCallbackLabel = createLabel(Vector3.create(12, 2.3, 4), 2, Color4.White(), 'PUSH CB: ON')
pointerEventsSystem.onPointerDown(
  {
    entity: btnPushCallback,
    opts: { button: InputAction.IA_POINTER, hoverText: 'registerAudioPlaybackEntity / removeAudioPlaybackEntity' }
  },
  () => {
    setPushCallback(!pushCallbackRegistered)
    setLabel(pushCallbackLabel, `PUSH CB: ${pushCallbackRegistered ? 'ON' : 'OFF'}`)
  }
)

// ---------------------------------------------------------------------------
// Per-frame readout: clock line, pull API, beat cubes
// ---------------------------------------------------------------------------

engine.addSystem(() => {
  const source = AudioSource.get(audioEntity)
  const playing = source.playing ?? false
  const clock = sceneClockMs()
  const wallNow = Date.now()

  setLabel(
    clockLabel,
    `tick ${currentTick}   scene clock ${clock === undefined ? 'not started (press PLAY)' : fmtMs(clock)}   ` +
      `loop ${source.loop ? 'ON' : 'OFF'}   AudioSource.playing=${playing}`
  )

  const playback = audioEventsSystem.getAudioPlayback(audioEntity)
  const state = audioEventsSystem.getAudioState(audioEntity)
  const stateLine =
    state === undefined
      ? 'getAudioState(entity): undefined (no AudioEvent from the renderer yet)'
      : `getAudioState(entity): ${mediaStateName(state.state)} @ts ${state.timestamp}`

  const lines = ['getAudioPlayback (pull API, polled every frame)']
  if (playback === undefined) {
    const sincePressMs = clock === undefined ? undefined : clock - clockOffsetMs
    lines.push('getAudioPlayback(entity): undefined')
    if (clock === undefined) {
      lines.push('press PLAY')
    } else if (sincePressMs !== undefined && sincePressMs > NO_REPORTS_AFTER_MS && stateCallbackCount > 0) {
      lines.push('no position reports from this renderer (older renderer)')
    } else {
      lines.push('waiting for the first position report...')
    }
  } else {
    lines.push(
      `getAudioPlayback(entity): tick ${playback.tickNumber ?? 'n/a'}   offset ${fmtSeconds(playback.currentOffset)}   ` +
        `length ${fmtSeconds(playback.clipLength)}   ${mediaStateName(playback.state)}`
    )
    if (playback.tickNumber !== undefined) {
      lines.push(`report age ${currentTick - playback.tickNumber} ticks (current tick ${currentTick})`)
    }
  }
  lines.push(stateLine)
  setLabel(pullLabel, lines.join('\n'))

  updateBeat(clockBeat, playing ? clock : undefined, wallNow)
  updateBeat(
    audioBeat,
    playing && clock !== undefined && lastLagMs !== undefined ? clock - lastLagMs : undefined,
    wallNow
  )
})

// ---------------------------------------------------------------------------
// Scene setup
// ---------------------------------------------------------------------------

function addGround(): void {
  const ground = engine.addEntity()
  Transform.create(ground, { position: Vector3.create(8, -0.05, 8), scale: Vector3.create(16, 0.1, 16) })
  MeshRenderer.setBox(ground)
  Material.setPbrMaterial(ground, { albedoColor: Color4.create(0.15, 0.15, 0.15, 1) })
}

function addTitle(): void {
  createLabel(
    Vector3.create(8, 7.2, 8),
    2.5,
    Color4.White(),
    'Audio Playback Position Reports Test\n' +
      'PLAY, then compare "audio behind clock" (via tickNumber) with the naive value.\n' +
      'SEEK 10s shows where the renderer lands; TOGGLE LOOP before PLAY shows currentOffset wrapping.'
  )
}

addGround()
addTitle()
