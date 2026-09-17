/**
 * Audio Playback Position Reports
 *
 * One idea, made visible: a renderer starts a clip 100-250 ms after being asked to, so a scene that trusts its own
 * clock runs early against the sound. Renderers now report the clip position into the AudioEvent component while
 * a clip plays (protocol decentraland/protocol#488, SDK decentraland/js-sdk-toolchain#1624, ADR-318
 * decentraland/adr#324, Unity explorer decentraland/unity-explorer#10123), and a scene can correct itself.
 *
 * PBAudioEvent gained three OPTIONAL fields:
 *   - tickNumber     scene tick (equals EngineInfo.tickNumber) in which the renderer sampled the position
 *   - currentOffset  clip playback position in seconds at that tick
 *   - clipLength     total clip length in seconds, when known
 * `state` (MediaState) and `timestamp` (a per-entity monotonic counter, NOT a time) are unchanged.
 *
 * THE DEMO: three cubes behind the buttons, and a clip that beeps on every whole second.
 *   CLOCK  flashes on each whole second of the scene clock (what the scene assumes the audio is doing)
 *   AUDIO  flashes on each whole second of (clock - lag), lag measured through tickNumber
 *   NAIVE  flashes on each whole second of (clock - naive lag), naive lag measured at processing time
 * Press PLAY and listen. AUDIO lines up with the beeps. CLOCK runs early by the start delay. NAIVE is off by
 * the report's transport delay: a report says where the clip was at tick N but reaches the scene a few ticks
 * later, so comparing it with the clock at processing time is wrong by exactly that gap. That gap is why the
 * field is a tick and not a timestamp: the scene keeps its own clock per EngineInfo.tickNumber and looks the
 * report's tick up:
 *   lag = clockAtTick(report.tickNumber) - report.currentOffset * 1000
 *
 * Buttons: PLAY (from 0, clock -> 0), SEEK 10s (currentTime = 10, clock -> 10 s; the next report shows where the
 * renderer actually landed), STOP. Corner buttons cover the rest of the API: LOOP toggles AudioSource.loop (the
 * offset wraps while the clock keeps counting), PUSH CB unregisters and re-registers the playback callback.
 *
 * API under test (audioEventsSystem from '@dcl/sdk/ecs'):
 *   - registerAudioPlaybackEntity / removeAudioPlaybackEntity: callback on EVERY report, position updates
 *     included (drives the readout)
 *   - getAudioPlayback(entity): latest report carrying currentOffset, or undefined (polled, shown in the side panel)
 *   - registerAudioEventsEntity (pre-existing): still fires ONLY on media-state changes (side panel counts both
 *     callbacks so the difference is visible)
 * Renderers that never send a position show "no position reports from this renderer" and only CLOCK flashes.
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
// Helpers
// ---------------------------------------------------------------------------
function createButton(position: Vector3, color: Color4, scale = 1.2): Entity {
  const entity = engine.addEntity()
  Transform.create(entity, { position, scale: Vector3.create(scale, scale, scale) })
  MeshRenderer.setBox(entity)
  MeshCollider.setBox(entity)
  Material.setPbrMaterial(entity, { albedoColor: color })
  return entity
}

function createLabel(position: Vector3, fontSize = 2, color: Color4 = Color4.White(), text = ''): Entity {
  const entity = engine.addEntity()
  Transform.create(entity, { position })
  TextShape.create(entity, { text, fontSize, textColor: color, outlineWidth: 0.1, outlineColor: Color4.Black() })
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

const fmtMs = (value: number | undefined) => (value === undefined ? 'n/a' : `${Math.round(value)} ms`)
const fmtSeconds = (value: number | undefined) => (value === undefined ? 'n/a' : `${value.toFixed(2)} s`)

// ---------------------------------------------------------------------------
// Scene clock: the position the scene EXPECTS, in ms, as if the renderer had reacted instantly to the last
// PLAY/SEEK. Recorded once per tick under EngineInfo.tickNumber so a report sampled at tick N is compared with
// the clock at tick N, not with the clock when the report is processed.
// ---------------------------------------------------------------------------
let clockOriginWallMs: number | undefined // Date.now() at the last PLAY/SEEK; undefined until pressed
let clockOffsetMs = 0 // 0 after PLAY, 10000 after SEEK
let currentTick = -1
const clockByTick = new Map<number, number>()

function sceneClockMs(): number | undefined {
  return clockOriginWallMs === undefined ? undefined : Date.now() - clockOriginWallMs + clockOffsetMs
}

function recordSceneClock(): void {
  const tick = EngineInfo.getOrNull(engine.RootEntity)?.tickNumber
  if (tick === undefined) return
  currentTick = tick
  const clock = sceneClockMs()
  if (clock === undefined) return
  clockByTick.set(tick, clock)
  while (clockByTick.size > TICK_HISTORY) {
    const oldest = clockByTick.keys().next().value
    if (oldest === undefined) break
    clockByTick.delete(oldest)
  }
}
// Higher priority runs first: this tick's clock must exist before the SDK's audio-events system (default
// priority) delivers a report that may carry the current tickNumber.
engine.addSystem(recordSceneClock, 200000, 'record-scene-clock')

// ---------------------------------------------------------------------------
// Audio entity and measurements
// ---------------------------------------------------------------------------
const audioEntity = engine.addEntity()
Transform.create(audioEntity, { position: Vector3.create(8, 1, 8) })
AudioSource.create(audioEntity, { audioClipUrl: CLIP, playing: false, loop: false })

let lagMs: number | undefined // clockAtTick(report.tickNumber) - offset: the correct figure
let naiveLagMs: number | undefined // clock at processing time - offset: wrong by the transport delay
let firstLagMs: number | undefined
let lastReportWallMs: number | undefined
let playbackCallbackCount = 0
let positionReportCount = 0
let stateCallbackCount = 0
let pushCallbackRegistered = false
const stateLog: string[] = []

// ---------------------------------------------------------------------------
// The demo: three beat cubes, centre stage
// ---------------------------------------------------------------------------
type BeatCube = { entity: Entity; color: Color4; lastSecond: number; flashUntil: number; lit: boolean }

function createBeatCube(position: Vector3, color: Color4, caption: string): BeatCube {
  const entity = engine.addEntity()
  Transform.create(entity, { position, scale: Vector3.create(2.2, 2.2, 2.2) })
  MeshRenderer.setBox(entity)
  Material.setPbrMaterial(entity, { albedoColor: color })
  createLabel(Vector3.create(position.x, position.y + 1.9, position.z), 2.2, Color4.White(), caption)
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
  Vector3.create(4, 2.6, 9),
  Color4.create(0.75, 0.6, 0.1, 1),
  'CLOCK\nwhat the scene assumes'
)
const audioBeat = createBeatCube(
  Vector3.create(8, 2.6, 9),
  Color4.create(0.1, 0.6, 0.7, 1),
  'AUDIO\nclock - lag (via tickNumber)'
)
const naiveBeat = createBeatCube(
  Vector3.create(12, 2.6, 9),
  Color4.create(0.7, 0.25, 0.25, 1),
  'NAIVE\nclock - lag (at processing time)'
)

// ---------------------------------------------------------------------------
// Readouts: one headline under the cubes, one compact panel, one side panel for the rest of the API
// ---------------------------------------------------------------------------
const headline = createLabel(
  Vector3.create(8, 6.4, 9),
  2.6,
  Color4.Yellow(),
  'Press PLAY, then listen: which cube flashes with the beep?'
)
const panel = createLabel(Vector3.create(8, 5.1, 9), 1.6, Color4.create(0.85, 0.95, 1, 1), '')
const sidePanel = createLabel(Vector3.create(14.6, 4.6, 6), 1.3, Color4.create(1, 0.85, 0.5, 1), '')

function renderPanel(): void {
  const clock = sceneClockMs()
  if (clock === undefined) {
    setLabel(panel, 'scene clock: not started')
    return
  }
  const lines = [`scene clock ${fmtMs(clock)}   tick ${currentTick}`]
  if (lagMs === undefined) {
    const sincePress = clock - clockOffsetMs
    lines.push(
      sincePress > NO_REPORTS_AFTER_MS && stateCallbackCount > 0
        ? 'no position reports from this renderer (only CLOCK flashes)'
        : 'waiting for the first position report...'
    )
  } else {
    lines.push(`audio behind clock by ${fmtMs(lagMs)}   (correct: clock looked up at the report's tick)`)
    lines.push(`naive figure ${fmtMs(naiveLagMs)}   (clock at processing time; off by the transport delay)`)
    if (firstLagMs !== undefined) lines.push(`drift since first report ${fmtMs(lagMs - firstLagMs)}`)
  }
  setLabel(panel, lines.join('\n'))
}

function renderSidePanel(playback: PBAudioEvent | undefined, state: PBAudioEvent | undefined): void {
  const lines = ['audioEventsSystem']
  lines.push(`playback callbacks ${playbackCallbackCount} (${positionReportCount} with position)`)
  lines.push(`state callbacks ${stateCallbackCount}   push callback ${pushCallbackRegistered ? 'ON' : 'OFF'}`)
  lines.push(
    playback === undefined
      ? 'getAudioPlayback: undefined'
      : `getAudioPlayback: tick ${playback.tickNumber ?? 'n/a'}  offset ${fmtSeconds(playback.currentOffset)}  ` +
          `length ${fmtSeconds(playback.clipLength)}  age ${
            playback.tickNumber === undefined ? 'n/a' : `${currentTick - playback.tickNumber} ticks`
          }`
  )
  lines.push(
    state === undefined
      ? 'getAudioState: undefined'
      : `getAudioState: ${mediaStateName(state.state)} @ts ${state.timestamp}`
  )
  lines.push(`loop ${AudioSource.get(audioEntity).loop ? 'ON' : 'OFF'}`)
  lines.push('state log (registerAudioEventsEntity):')
  lines.push(...(stateLog.length > 0 ? stateLog : ['(none yet)']))
  setLabel(sidePanel, lines.join('\n'))
}

// ---------------------------------------------------------------------------
// Push API: every report, position updates included
// ---------------------------------------------------------------------------
function onPlaybackReport(report: Readonly<PBAudioEvent>): void {
  playbackCallbackCount++
  lastReportWallMs = Date.now()
  if (report.currentOffset === undefined) return
  positionReportCount++
  const offsetMs = report.currentOffset * 1000
  const clockAtTick = report.tickNumber === undefined ? undefined : clockByTick.get(report.tickNumber)
  const clockNow = sceneClockMs()
  if (clockAtTick !== undefined) {
    lagMs = clockAtTick - offsetMs
    if (firstLagMs === undefined) firstLagMs = lagMs
  }
  if (clockNow !== undefined) naiveLagMs = clockNow - offsetMs
}

function setPushCallback(enabled: boolean): void {
  if (enabled) audioEventsSystem.registerAudioPlaybackEntity(audioEntity, onPlaybackReport)
  else audioEventsSystem.removeAudioPlaybackEntity(audioEntity)
  pushCallbackRegistered = enabled
}
setPushCallback(true)

// State-change API: must NOT fire for position reports that keep the same state
audioEventsSystem.registerAudioEventsEntity(audioEntity, (event) => {
  stateCallbackCount++
  stateLog.push(`${mediaStateName(event.state)} @ts ${event.timestamp}`)
  if (stateLog.length > 5) stateLog.shift()
})

// ---------------------------------------------------------------------------
// Buttons: three in front, two in the corner
// ---------------------------------------------------------------------------
function startClock(offsetMs: number): void {
  clockOriginWallMs = Date.now()
  clockOffsetMs = offsetMs
  clockByTick.clear()
  lagMs = undefined
  naiveLagMs = undefined
  firstLagMs = undefined
  for (const cube of [clockBeat, audioBeat, naiveBeat]) cube.lastSecond = -1
  recordSceneClock()
}

function addButton(
  position: Vector3,
  color: Color4,
  caption: string,
  hoverText: string,
  onClick: () => void,
  scale = 1.2
): Entity {
  const button = createButton(position, color, scale)
  createLabel(
    Vector3.create(position.x, position.y + scale + 0.4, position.z),
    scale > 1 ? 2 : 1.5,
    Color4.White(),
    caption
  )
  pointerEventsSystem.onPointerDown({ entity: button, opts: { button: InputAction.IA_POINTER, hoverText } }, onClick)
  return button
}

addButton(Vector3.create(5.5, 1, 4), Color4.create(0.2, 0.8, 0.2, 1), 'PLAY', 'Play from 0 (scene clock -> 0)', () => {
  AudioSource.playSound(audioEntity, CLIP, true)
  startClock(0)
})
addButton(
  Vector3.create(8, 1, 4),
  Color4.create(0.2, 0.4, 0.9, 1),
  `SEEK ${SEEK_TARGET_SECONDS}s`,
  `Seek to ${SEEK_TARGET_SECONDS}s and play (scene clock -> 10 s)`,
  () => {
    // createOrReplace always emits a PUT, even when playing/currentTime are unchanged (SEEK pressed twice), so the
    // renderer re-seeks every time. Hand-mutating via getMutable would be deduped when nothing changed.
    AudioSource.createOrReplace(audioEntity, {
      ...AudioSource.get(audioEntity),
      playing: true,
      currentTime: SEEK_TARGET_SECONDS
    })
    startClock(SEEK_TARGET_SECONDS * 1000)
  }
)
addButton(Vector3.create(10.5, 1, 4), Color4.create(0.8, 0.2, 0.2, 1), 'STOP', 'Stop (scene-initiated)', () => {
  AudioSource.stopSound(audioEntity, true)
})

// Coverage controls, out of the way
addButton(
  Vector3.create(14.6, 0.8, 2.2),
  Color4.create(0.6, 0.4, 0.8, 1),
  'LOOP',
  'Toggle AudioSource.loop',
  () => {
    const source = AudioSource.getMutable(audioEntity)
    source.loop = !source.loop
  },
  0.8
)
addButton(
  Vector3.create(14.6, 0.8, 4),
  Color4.create(0.5, 0.5, 0.5, 1),
  'PUSH CB',
  'registerAudioPlaybackEntity / removeAudioPlaybackEntity',
  () => {
    setPushCallback(!pushCallbackRegistered)
  },
  0.8
)

// ---------------------------------------------------------------------------
// Per-frame: cubes and readouts
// ---------------------------------------------------------------------------
engine.addSystem(() => {
  const playing = AudioSource.get(audioEntity).playing ?? false
  const clock = sceneClockMs()
  const wallNow = Date.now()
  updateBeat(clockBeat, playing ? clock : undefined, wallNow)
  updateBeat(audioBeat, playing && clock !== undefined && lagMs !== undefined ? clock - lagMs : undefined, wallNow)
  updateBeat(
    naiveBeat,
    playing && clock !== undefined && naiveLagMs !== undefined ? clock - naiveLagMs : undefined,
    wallNow
  )
  setLabel(
    headline,
    lagMs === undefined
      ? 'Press PLAY, then listen: which cube flashes with the beep?'
      : `AUDIO flashes with the beep. CLOCK runs ${fmtMs(lagMs)} early. NAIVE is off by ${fmtMs((naiveLagMs ?? lagMs) - lagMs)}.`
  )
  renderPanel()
  renderSidePanel(audioEventsSystem.getAudioPlayback(audioEntity), audioEventsSystem.getAudioState(audioEntity))
})

// ---------------------------------------------------------------------------
// Scene dressing
// ---------------------------------------------------------------------------
const ground = engine.addEntity()
Transform.create(ground, { position: Vector3.create(8, -0.05, 8), scale: Vector3.create(16, 0.1, 16) })
MeshRenderer.setBox(ground)
Material.setPbrMaterial(ground, { albedoColor: Color4.create(0.15, 0.15, 0.15, 1) })

createLabel(
  Vector3.create(8, 7.8, 9),
  2.2,
  Color4.White(),
  'Audio Playback Position Reports\nThe renderer starts a clip late. Reports with a tickNumber let the scene measure by how much.'
)
void lastReportWallMs
