import {
  Billboard,
  BillboardMode,
  EasingFunction,
  Entity,
  Material,
  MeshCollider,
  MeshRenderer,
  TextAlignMode,
  TextShape,
  Transform,
  Tween,
  TweenLoop,
  TweenSequence,
  engine
} from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'
import { isStateSyncronized } from '@dcl/sdk/network'
import {
  CLIENT_LANE_X,
  PLATFORM_MS,
  PLATFORM_SCALE,
  PLATFORM_Z_END,
  PLATFORM_Z_START,
  RIG_Y,
  SERVER_LANE_X,
  ZONE_SCALE,
  ZONE_Z
} from '../shared/config'
import { harnessSystem } from '../shared/harness'
import { room } from '../shared/messages'
import { LiveRig } from '../shared/schemas'
import { isServerAlive, pollHeartbeat, runClientSuite, showToast } from './state'

// Requests queued locally until the room is synced, then auto-fired. Room-not-synced
// is a brief (~1 s) load-time blip, so buffering beats dropping the click.
const pendingServerTests: number[] = []
let pendingServerSuite = false

// --- The in-world live rig readout -------------------------------------------------
let serverGhost: Entity
let clientTwin: Entity
let serverLabel: Entity
let clientLabel: Entity
let zoneVisual: Entity
let zoneLabel: Entity
// The zone has THREE states, not two. Painting "no trigger system" the same green as
// "trigger system alive and empty" is the trap this rig exists to avoid: both would
// say "nothing wrong here" while one of them means the server cannot detect anything.
type ZoneState = 'dead' | 'empty' | 'occupied'
let lastZoneState: ZoneState | '' = ''
let lastLabelText = ''

export function setupClient(): void {
  buildFloor()
  buildSignpost()
  buildLiveRig()

  // Server → me: a transient notice (e.g. "a run is already in flight").
  room.onMessage('notice', (data) => showToast(data.text))

  // harnessSystem drives every await in the suite — the very same one the server
  // adds, so both columns are produced by identical machinery.
  engine.addSystem(harnessSystem)
  engine.addSystem(clientSystem)

  // Auto-run the client's own suite on load, so the reference column is already
  // filled in by the time the player has read the sign.
  runClientSuite()
}

// --- Server-run requests ------------------------------------------------------------

export function requestServerSuite(): void {
  if (!isServerAlive()) {
    showToast('Server is not responding — it may still be waking up.')
    return
  }
  pendingServerSuite = true
}

export function requestServerTest(index: number): void {
  if (!isServerAlive()) {
    showToast('Server is not responding — it may still be waking up.')
    return
  }
  pendingServerTests.push(index)
}

function clientSystem(): void {
  pollHeartbeat()
  updateLiveRig()

  if (!isStateSyncronized()) return

  if (pendingServerSuite) {
    pendingServerSuite = false
    room.send('runServerSuite', {})
  }
  while (pendingServerTests.length > 0) {
    room.send('runServerTest', { index: pendingServerTests.shift()! })
  }
}

// --- World -------------------------------------------------------------------------

function buildFloor(): void {
  const ground = engine.addEntity()
  Transform.create(ground, { position: Vector3.create(8, 0, 8), scale: Vector3.create(16, 0.1, 16) })
  MeshRenderer.setBox(ground)
  MeshCollider.setBox(ground)
  Material.setPbrMaterial(ground, { albedoColor: Color4.fromHexString('#101c2eff') })
}

// NOTE on orientation: a TextShape's READABLE face points down local -Z, so a sign
// meant to be read from the parcel's south edge needs NO rotation at all. Rotating it
// 180° (the instinctive "turn it around") is what shows the mirrored back — verified
// in-world here.
function buildSignpost(): void {
  const sign = engine.addEntity()
  Transform.create(sign, { position: Vector3.create(8, 5.2, 15) })
  TextShape.create(sign, {
    // Headline only. The two readouts that actually diagnose a build — the beam
    // counter's cause line and the panel — update live; a sign that repeated them
    // would go stale and, at this size, skews badly when read from an angle.
    text:
      'TWEEN & TRIGGER AREAS ON THE AUTHORITATIVE SERVER\n\n' +
      'Two boxes should be sliding: one moved by the SERVER’s tween,\n' +
      'one by this CLIENT’s. Both moving = the server tweens.\n\n' +
      'The zone is the SERVER’s own TriggerArea. Grey = it never fired.',
    fontSize: 1.9,
    textColor: Color4.White(),
    textAlign: TextAlignMode.TAM_MIDDLE_CENTER
  })
}

// The rig readout. Three pieces, each answering a different question at a glance:
// the server ghost ("does the server's platform move?"), the client twin ("would it
// move on a working host?"), and the beam ("does the server's raycast see it?").
function buildLiveRig(): void {
  // The SERVER's platform, drawn at the position the server itself reports. There is
  // no local animation here on purpose: every metre this box travels is a metre the
  // server's tween system actually moved its own entity.
  serverGhost = engine.addEntity()
  Transform.create(serverGhost, {
    position: Vector3.create(SERVER_LANE_X, RIG_Y, PLATFORM_Z_START),
    scale: PLATFORM_SCALE
  })
  MeshRenderer.setBox(serverGhost)
  Material.setPbrMaterial(serverGhost, {
    albedoColor: Color4.fromHexString('#38bdf8ff'),
    emissiveColor: Color4.fromHexString('#0ea5e9ff'),
    emissiveIntensity: 0.7
  })
  serverLabel = floatingLabel('SERVER TWEEN', Color4.fromHexString('#38bdf8ff'))

  // The CLIENT's reference twin: the identical tween, run locally. It is the control
  // for the comparison — if this one is frozen too, the fault is the scene, not the
  // server.
  clientTwin = engine.addEntity()
  const twinStart = Vector3.create(CLIENT_LANE_X, RIG_Y, PLATFORM_Z_START)
  const twinEnd = Vector3.create(CLIENT_LANE_X, RIG_Y, PLATFORM_Z_END)
  Transform.create(clientTwin, { position: twinStart, scale: PLATFORM_SCALE })
  MeshRenderer.setBox(clientTwin)
  Material.setPbrMaterial(clientTwin, {
    albedoColor: Color4.fromHexString('#fb923cff'),
    emissiveColor: Color4.fromHexString('#f97316ff'),
    emissiveIntensity: 0.7
  })
  Tween.setMove(clientTwin, twinStart, twinEnd, PLATFORM_MS, EasingFunction.EF_LINEAR)
  TweenSequence.create(clientTwin, { sequence: [], loop: TweenLoop.TL_YOYO })
  clientLabel = floatingLabel('CLIENT TWEEN', Color4.fromHexString('#fb923cff'))

  // The zone, drawn at the exact pose of the server's trigger area. Deliberately NO
  // TriggerArea and no collider of its own: this is a picture of the server's volume,
  // and giving it real trigger geometry the server cannot see would make it a lie.
  // Translucent so the platform stays visible while it is inside.
  zoneVisual = engine.addEntity()
  Transform.create(zoneVisual, {
    position: Vector3.create(SERVER_LANE_X, RIG_Y, ZONE_Z),
    scale: ZONE_SCALE
  })
  MeshRenderer.setBox(zoneVisual)

  zoneLabel = engine.addEntity()
  Transform.create(zoneLabel, { position: Vector3.create(SERVER_LANE_X, RIG_Y + 1.9, ZONE_Z) })
  TextShape.create(zoneLabel, { text: '', fontSize: 1.5, textColor: Color4.White() })
  Billboard.create(zoneLabel, { billboardMode: BillboardMode.BM_Y })
}

// A billboarded label kept at ROOT level and repositioned each frame, rather than
// parented to the box it names. Parenting is the obvious way to make a label follow
// something, but a billboarded TextShape under a parent renders mirrored in the
// Explorer (verified in-world) — a root-level one faces the player correctly.
function floatingLabel(text: string, color: Color4): Entity {
  const entity = engine.addEntity()
  Transform.create(entity, { position: Vector3.create(0, RIG_Y + 1.4, PLATFORM_Z_START) })
  TextShape.create(entity, { text, fontSize: 1.3, textColor: color })
  Billboard.create(entity, { billboardMode: BillboardMode.BM_Y })
  return entity
}

// Park a label above the box it names, writing only on a real change so a frozen
// server platform doesn't cost a CRDT update every frame.
function trackLabel(labelEntity: Entity, box: Entity): void {
  const boxPosition = Transform.get(box).position
  const transform = Transform.getMutable(labelEntity)
  const y = boxPosition.y + 1.4
  if (transform.position.x === boxPosition.x && transform.position.y === y && transform.position.z === boxPosition.z) {
    return
  }
  transform.position = Vector3.create(boxPosition.x, y, boxPosition.z)
}

// Mirror the synced LiveRig sample into the world. Runs every frame but only writes
// when something changed — the beam's material in particular would otherwise be
// re-serialized 30×/second for no reason.
function updateLiveRig(): void {
  let rig: ReturnType<typeof LiveRig.get> | undefined
  for (const [, value] of engine.getEntitiesWith(LiveRig)) {
    rig = value
    break
  }

  // canaryEvents is the liveness signal, and it is the whole reason the canary exists:
  // a trigger area reports transitions only, so an empty zone says nothing on its own.
  // The canary is driven by direct Transform writes rather than a tween, so it keeps
  // firing on a host that has triggers but no tweens. Zero means the host never
  // reported a transition at all.
  const zoneState: ZoneState =
    rig === undefined || rig.canaryEvents === 0 ? 'dead' : rig.zoneOccupied ? 'occupied' : 'empty'
  if (zoneState !== lastZoneState) {
    paintZone(zoneState)
    lastZoneState = zoneState
  }

  trackLabel(clientLabel, clientTwin)

  if (!rig) return

  // Only write when the server's reported position actually moved. On a server with
  // no tween system this value never changes, and writing it anyway would cost a
  // Transform update every frame for a box that is standing still.
  const reported = rig.platformPosition
  const ghost = Transform.getMutable(serverGhost)
  if (ghost.position.x !== reported.x || ghost.position.y !== reported.y || ghost.position.z !== reported.z) {
    ghost.position = Vector3.create(reported.x, reported.y, reported.z)
  }
  trackLabel(serverLabel, serverGhost)

  // An entry needs BOTH features, so the count alone cannot say which one is missing —
  // and "0" is the reading a passer-by will actually see on a broken server. So the
  // label names the cause from the two INDEPENDENT signals the server reports:
  // tweenState < 0 means no TweenState was ever written, canaryEvents === 0 means the
  // host never reported a trigger transition even for the tween-free canary. Without
  // this the rig invites exactly the wrong conclusion, e.g. "trigger areas must be
  // broken too" on a server whose trigger areas work.
  const entries = rig.zoneEntries
  const tweenAlive = rig.tweenState >= 0
  const triggerAlive = rig.canaryEvents > 0

  let text: string
  let color: Color4
  if (entries > 0) {
    text = `ZONE ENTRIES: ${entries}\nserver tween + trigger areas are LIVE`
    color = Color4.fromHexString('#4ade80ff')
  } else if (!triggerAlive && !tweenAlive) {
    text = 'ZONE ENTRIES: 0\nno server tween AND no server trigger areas'
    color = Color4.fromHexString('#ff5a5aff')
  } else if (!triggerAlive) {
    text = 'ZONE ENTRIES: 0\nno server trigger areas — the zone is deaf (tween IS live)'
    color = Color4.fromHexString('#ff5a5aff')
  } else {
    text = `ZONE ENTRIES: 0\nplatform frozen: no server tween\ntrigger areas ARE live — ${rig.canaryEvents} canary events`
    color = Color4.fromHexString('#ff5a5aff')
  }
  if (entries === 0 && triggerAlive && tweenAlive) {
    text = 'ZONE ENTRIES: 0\nboth live — waiting for the first entry'
    color = Color4.fromHexString('#ffb347ff')
  }

  if (text !== lastLabelText) {
    lastLabelText = text
    const shape = TextShape.getMutable(zoneLabel)
    shape.text = text
    shape.textColor = color
  }
}

// GREY = the server never reported a trigger transition, so the zone is deaf and its
// colour says nothing about the platform. GREEN = trigger system live, zone empty.
// RED = live, and the platform is inside it right now.
//
// Grey keeps a small emissive on purpose. Fully unlit reads as ABSENT at night — and
// "the zone vanished" is a different (and wrong) message from "the zone is deaf". It
// has to stay visible while being obviously duller than the two live colours. Alpha
// stays low throughout so the platform is visible through the volume.
function paintZone(state: ZoneState): void {
  if (state === 'dead') {
    Material.setPbrMaterial(zoneVisual, {
      albedoColor: Color4.create(0.54, 0.57, 0.63, 0.22),
      emissiveColor: Color4.fromHexString('#6b7280ff'),
      emissiveIntensity: 0.3
    })
    return
  }
  const occupied = state === 'occupied'
  Material.setPbrMaterial(zoneVisual, {
    albedoColor: occupied ? Color4.create(1, 0.3, 0.3, 0.34) : Color4.create(0.29, 0.87, 0.5, 0.24),
    emissiveColor: occupied ? Color4.fromHexString('#ff0000ff') : Color4.fromHexString('#22c55eff'),
    emissiveIntensity: occupied ? 1.4 : 0.8
  })
}
