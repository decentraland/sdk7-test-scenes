import {
  engine,
  Entity,
  Transform,
  MeshRenderer,
  MeshCollider,
  Material,
  TextShape,
  Billboard,
  BillboardMode,
  pointerEventsSystem,
  InputAction,
  TextAlignMode
} from '@dcl/sdk/ecs'
import { Vector3, Color4 } from '@dcl/sdk/math'

// ---------------------------------------------------------------------------
// Geometry constants
// ---------------------------------------------------------------------------

export const CUBE_X = 3
export const CUBE_Y = 1.5
export const CUBE_HALF_EXTENTS = Vector3.create(0.5, 0.5, 0.5)
// Distance markers, measured from the cube's WEST-facing surface (x = CUBE_X + 0.5)
const RULER_DISTANCES_M = [2, 5, 8, 10, 15]

const GREEN = Color4.create(0.35, 1, 0.35, 1)
const RED = Color4.create(1, 0.3, 0.3, 1)
const WHITE = Color4.White()

// ---------------------------------------------------------------------------
// Lane configuration table (mirrors the rule table in README.md)
// ---------------------------------------------------------------------------

type LaneKind = 'cursor' | 'proximity'

export interface LaneConfig {
  z: number
  /**
   * Short tag rendered on the cube itself; keys into the README lane table.
   * Deliberately NOT the lane's z coordinate: in a scene about distances in metres a
   * tag like "z=11" reads as "11m", and that lane's threshold happens to be 10.
   */
  laneId: string
  kind: LaneKind
  maxDistance?: number
  maxPlayerDistance?: number
  maxCameraDistance?: number
  ruleLabel: string
  configLabel: string
  laneName: string
  albedo: Color4
}

export const LANES: LaneConfig[] = [
  {
    z: 1,
    laneId: 'L1',
    kind: 'cursor',
    maxDistance: 2,
    ruleLabel: 'RULE 1 - PLAYER DIST ONLY',
    configLabel: 'maxDistance: 2',
    laneName: 'L1 (z=1, maxDistance:2)',
    albedo: Color4.create(0.85, 0.15, 0.15, 1)
  },
  {
    z: 3,
    laneId: 'L2',
    kind: 'cursor',
    maxPlayerDistance: 2,
    ruleLabel: 'DEPRECATED ALIAS ALONE',
    configLabel: 'maxPlayerDistance: 2',
    laneName: 'L2 (z=3, maxPlayerDistance:2)',
    albedo: Color4.create(0.9, 0.55, 0.05, 1)
  },
  {
    z: 5,
    laneId: 'L3',
    kind: 'cursor',
    maxDistance: 2,
    maxPlayerDistance: 6,
    ruleLabel: 'LARGER WINS -> player <= 6',
    configLabel: 'maxDistance: 2, maxPlayerDistance: 6',
    laneName: 'L3 (z=5, maxDistance:2, maxPlayerDistance:6)',
    albedo: Color4.create(0.9, 0.85, 0.1, 1)
  },
  {
    z: 7,
    laneId: 'L4',
    kind: 'cursor',
    maxCameraDistance: 10,
    ruleLabel: 'RULE 2 - CAMERA DIST ONLY',
    configLabel: 'maxCameraDistance: 10',
    laneName: 'L4 (z=7, maxCameraDistance:10)',
    albedo: Color4.create(0.15, 0.75, 0.2, 1)
  },
  {
    z: 9,
    laneId: 'L5',
    kind: 'cursor',
    maxDistance: 2,
    maxCameraDistance: 10,
    ruleLabel: 'RULE 3 - OR (player<=2 || cam<=10)',
    configLabel: 'maxDistance: 2, maxCameraDistance: 10',
    laneName: 'L5 (z=9, maxDistance:2, maxCameraDistance:10)',
    albedo: Color4.create(0.1, 0.55, 0.9, 1)
  },
  {
    z: 11,
    laneId: 'L6',
    kind: 'cursor',
    ruleLabel: 'RULE 4 - IMPLICIT DEFAULT <=10',
    configLabel: '(no distance fields set)',
    laneName: 'L6 (z=11, no distance fields)',
    albedo: Color4.create(0.45, 0.2, 0.85, 1)
  },
  {
    z: 13,
    laneId: 'L7',
    kind: 'proximity',
    maxDistance: 2,
    maxCameraDistance: 20,
    ruleLabel: 'PROXIMITY - camera distance IGNORED',
    configLabel: 'maxDistance: 2, maxCamDistance: 20 (ign)',
    laneName: 'L7 PROXIMITY (z=13, maxDistance:2, maxCameraDistance:20 ignored)',
    albedo: Color4.create(0.85, 0.15, 0.65, 1)
  },
  {
    z: 15,
    laneId: 'L8',
    kind: 'proximity',
    maxDistance: 8,
    ruleLabel: 'PROXIMITY maxDistance:8 -- EXPECT <=8m, SUSPECT CLAMP AT 3m',
    configLabel: 'maxDistance: 8',
    laneName: 'L8 PROXIMITY PROBE (z=15, maxDistance:8, suspect 3m clamp)',
    albedo: Color4.create(0.15, 0.85, 0.75, 1)
  }
]

// ---------------------------------------------------------------------------
// Distance math -- surface distance to an axis-aligned box
// ---------------------------------------------------------------------------

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v
}

function closestPointOnBox(point: Vector3, center: Vector3, halfExtents: Vector3): Vector3 {
  return Vector3.create(
    clamp(point.x, center.x - halfExtents.x, center.x + halfExtents.x),
    clamp(point.y, center.y - halfExtents.y, center.y + halfExtents.y),
    clamp(point.z, center.z - halfExtents.z, center.z + halfExtents.z)
  )
}

export function distanceToBoxSurface(point: Vector3, center: Vector3, halfExtents: Vector3): number {
  return Vector3.distance(point, closestPointOnBox(point, center, halfExtents))
}

function round1(v: number): number {
  return Math.round(v * 10) / 10
}

// ---------------------------------------------------------------------------
// Rule resolution (mirrors decentraland/protocol#470 exactly)
// ---------------------------------------------------------------------------

export function resolveMaxPlayer(maxDistance?: number, maxPlayerDistance?: number): number | null {
  const md = maxDistance ?? null
  const mpd = maxPlayerDistance ?? null
  if (md !== null && mpd !== null) return Math.max(md, mpd)
  if (md !== null) return md
  if (mpd !== null) return mpd
  return null
}

export function predictCursor(
  playerDist: number,
  camDist: number,
  maxDistance?: number,
  maxPlayerDistance?: number,
  maxCameraDistance?: number
): boolean {
  const p = resolveMaxPlayer(maxDistance, maxPlayerDistance)
  const cam = maxCameraDistance ?? null
  if (p === null && cam === null) return playerDist <= 10
  if (p !== null && cam === null) return playerDist <= p
  if (p === null && cam !== null) return camDist <= cam
  return playerDist <= (p as number) || camDist <= (cam as number)
}

export function predictProximity(proximityPlayerDist: number, maxDistance?: number, maxPlayerDistance?: number): boolean {
  const p = resolveMaxPlayer(maxDistance, maxPlayerDistance) ?? 10
  return proximityPlayerDist <= p
}

// ---------------------------------------------------------------------------
// Entity creation
// ---------------------------------------------------------------------------

interface LaneRuntime {
  cfg: LaneConfig
  cubeCenter: Vector3
  label: Entity
  lastText: string
  lastPredicted: boolean | null
}

const runtime: LaneRuntime[] = []

/** Live per-lane readout, refreshed each frame and rendered as the HUD table. */
export interface LaneReadout {
  laneId: string
  z: number
  kind: LaneKind
  configLabel: string
  ruleLabel: string
  playerDist: number
  camDist: number
  predicted: boolean
}

const readouts: LaneReadout[] = []

export function getLaneReadouts(): LaneReadout[] {
  return readouts
}

// One ruler shared by every lane: a full-width stripe across all 8 lanes at each
// marked distance, signed at both edges of the corridor. Per-lane markers were 80
// entities of overlapping clutter; these 15 read the same at any lane.
const LANE_Z_MIN = 1
const LANE_Z_MAX = 15

function createSharedRuler() {
  const spanZ = LANE_Z_MAX - LANE_Z_MIN + 2
  const centerZ = (LANE_Z_MIN + LANE_Z_MAX) / 2

  for (const d of RULER_DISTANCES_M) {
    const x = CUBE_X + CUBE_HALF_EXTENTS.x + d

    const stripe = engine.addEntity()
    Transform.create(stripe, {
      position: Vector3.create(x, 0.03, centerZ),
      scale: Vector3.create(0.5, 0.06, spanZ)
    })
    MeshRenderer.setBox(stripe)
    // Emissive: an unlit albedo stripe washes out to almost exactly the ground tone
    // under this skybox and stops reading as a gridline.
    Material.setPbrMaterial(stripe, {
      albedoColor: Color4.White(),
      emissiveColor: Color4.White(),
      emissiveIntensity: 0.6,
      roughness: 1
    })

    // A sign at each edge of the lane band plus one mid-band: the edge signs fall
    // outside the frustum whenever you are walking a lane, so the middle one is what
    // you actually read while testing.
    for (const signZ of [LANE_Z_MIN - 1.4, centerZ, LANE_Z_MAX + 1.4]) {
      const sign = engine.addEntity()
      Transform.create(sign, { position: Vector3.create(x, 0.6, signZ) })
      TextShape.create(sign, {
        text: `${d}m`,
        // Small on purpose: world-space text balloons as you approach, and the mid-band
        // sign sits in the walking gap between lanes z=7 and z=9, right where you pass it.
        fontSize: 1.3,
        textColor: WHITE,
        outlineWidth: 0.2,
        outlineColor: Color4.Black()
      })
      Billboard.create(sign, { billboardMode: BillboardMode.BM_Y })
    }
  }
}

// Lanes are only 2m apart, so a cube label has ~2m of width to live in, and world-space
// text also grows as you approach -- the readout has to stay legible both at 25m down the
// corridor and at the 1-2m where you stand to click. So the cube carries identity plus
// verdict only (<=4 characters per line); every number lives in the HUD table.
function createLaneLabel(cubeEntity: Entity): Entity {
  const label = engine.addEntity()
  Transform.create(label, { position: Vector3.create(0, 1.15, 0), parent: cubeEntity })
  TextShape.create(label, {
    text: '',
    fontSize: 2.2,
    textColor: WHITE,
    outlineWidth: 0.2,
    outlineColor: Color4.Black(),
    textAlign: TextAlignMode.TAM_MIDDLE_CENTER
  })
  Billboard.create(label, { billboardMode: BillboardMode.BM_Y })
  return label
}

function logInteraction(cfg: LaneConfig, playerDist: number, camDist: number, kind: string) {
  console.log(
    `[pointer-events-distances] ${kind} FIRED :: ${cfg.laneName} :: config={${cfg.configLabel}} :: ` +
      `playerDist=${playerDist.toFixed(2)}m camDist=${camDist.toFixed(2)}m`
  )
}

export function setupLanes() {
  for (const cfg of LANES) {
    const cubeCenter = Vector3.create(CUBE_X, CUBE_Y, cfg.z)

    const cube = engine.addEntity()
    Transform.create(cube, { position: cubeCenter })
    MeshRenderer.setBox(cube)
    MeshCollider.setBox(cube)
    Material.setPbrMaterial(cube, { albedoColor: cfg.albedo })

    if (cfg.kind === 'cursor') {
      pointerEventsSystem.onPointerDown(
        {
          entity: cube,
          opts: {
            button: InputAction.IA_POINTER,
            hoverText: cfg.laneName,
            showFeedback: true,
            showHighlight: true,
            maxDistance: cfg.maxDistance,
            maxPlayerDistance: cfg.maxPlayerDistance,
            maxCameraDistance: cfg.maxCameraDistance
          }
        },
        () => {
          const playerPos = Transform.get(engine.PlayerEntity).position
          const camPos = Transform.get(engine.CameraEntity).position
          const playerDist = distanceToBoxSurface(playerPos, cubeCenter, CUBE_HALF_EXTENTS)
          const camDist = distanceToBoxSurface(camPos, cubeCenter, CUBE_HALF_EXTENTS)
          logInteraction(cfg, playerDist, camDist, 'CURSOR CLICK')
        }
      )
    } else {
      pointerEventsSystem.onProximityDown(
        {
          entity: cube,
          opts: {
            button: InputAction.IA_PRIMARY,
            hoverText: cfg.laneName,
            showFeedback: true,
            showHighlight: true,
            maxDistance: cfg.maxDistance,
            maxPlayerDistance: cfg.maxPlayerDistance,
            maxCameraDistance: cfg.maxCameraDistance
          }
        },
        () => {
          const playerPos = Transform.get(engine.PlayerEntity).position
          const camPos = Transform.get(engine.CameraEntity).position
          const capsuleCenter = Vector3.create(playerPos.x, playerPos.y + 1.0, playerPos.z)
          const playerDist = distanceToBoxSurface(capsuleCenter, cubeCenter, CUBE_HALF_EXTENTS)
          const camDist = distanceToBoxSurface(camPos, cubeCenter, CUBE_HALF_EXTENTS)
          logInteraction(cfg, playerDist, camDist, 'PROXIMITY FIRE')
        }
      )
    }

    const label = createLaneLabel(cube)

    runtime.push({ cfg, cubeCenter, label, lastText: '', lastPredicted: null })
    readouts.push({
      laneId: cfg.laneId,
      z: cfg.z,
      kind: cfg.kind,
      configLabel: cfg.configLabel,
      ruleLabel: cfg.ruleLabel,
      playerDist: 0,
      camDist: 0,
      predicted: false
    })
  }

  createSharedRuler()
}

export function updateLaneLabels() {
  const playerPos = Transform.get(engine.PlayerEntity).position
  const camPos = Transform.get(engine.CameraEntity).position
  const capsuleCenter = Vector3.create(playerPos.x, playerPos.y + 1.0, playerPos.z)

  for (let i = 0; i < runtime.length; i++) {
    const r = runtime[i]
    const playerDist = round1(distanceToBoxSurface(playerPos, r.cubeCenter, CUBE_HALF_EXTENTS))
    const camDist = round1(distanceToBoxSurface(camPos, r.cubeCenter, CUBE_HALF_EXTENTS))
    const proxPlayerDist = round1(distanceToBoxSurface(capsuleCenter, r.cubeCenter, CUBE_HALF_EXTENTS))

    // Effective player distance for this lane's own path (cursor measures from the
    // avatar root, proximity from the capsule centre ~1m higher).
    const effPlayerDist = r.cfg.kind === 'cursor' ? playerDist : proxPlayerDist

    const predicted =
      r.cfg.kind === 'cursor'
        ? predictCursor(playerDist, camDist, r.cfg.maxDistance, r.cfg.maxPlayerDistance, r.cfg.maxCameraDistance)
        : predictProximity(proxPlayerDist, r.cfg.maxDistance, r.cfg.maxPlayerDistance)

    // Compact tag: every line stays within ~7 characters so it fits the 2m lane pitch.
    // Camera distance is omitted on proximity lanes because that path ignores it.
    const text = `${r.cfg.laneId}\n${predicted ? 'LIVE' : 'DEAD'}`

    if (text !== r.lastText || predicted !== r.lastPredicted) {
      const mutable = TextShape.getMutable(r.label)
      mutable.text = text
      mutable.textColor = predicted ? GREEN : RED
      r.lastText = text
      r.lastPredicted = predicted
    }

    const out = readouts[i]
    out.playerDist = effPlayerDist
    out.camDist = camDist
    out.predicted = predicted
  }
}
