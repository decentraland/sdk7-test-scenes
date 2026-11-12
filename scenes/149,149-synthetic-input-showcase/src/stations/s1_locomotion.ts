import { engine, Transform, MeshCollider, MeshRenderer, Material, ColliderLayer, TextShape, TextAlignMode } from '@dcl/sdk/ecs'
import { Vector3, Color4 } from '@dcl/sdk/math'
import * as C from '../constants'
import { createSign, createReadout, COLORS } from '../lib'
import { counters, slog, logEntity, logMark } from '../state'

const IDLE_SPEED_MS = 0.15 // below this we consider the player stopped -- a burst has ended
const IDLE_GRACE_SEC = 0.35
const SPEED_SMOOTHING_SEC = 0.25 // EMA time constant: long enough to reject one-frame spikes, short enough to settle
// A single-frame displacement no gait can produce: a move_to teleport, not locomotion (run tops out ~10.5 m/s)
const TELEPORT_SPEED_MS = 20
// Gait thresholds on the SUSTAINED speed. RECALIBRATED 2026-09-04 -- the client got faster and the old
// pair (WALK 3 / JOG 9, measured 2026-08-28) had drifted BELOW the jog tier itself, so `bucket=` separated
// no pair at all: a 1.2s jog read 10.20 and labelled `run`, as did a degraded in-zone run at 9.13 and a
// free run at 12.75.
//
// Measured 2026-09-04, sustainedSpeed by burst length (the EMA needs ~1s to converge on a gait's top speed):
//
//   kind    0.4s    0.8s    1.2s    1.45s
//   walk      --    1.81    1.96      --
//   jog     6.77    9.04   10.20      --
//   run       --   10.82   12.75    13.24
//
// So the converged tiers are walk ~2.0, jog ~10.2-11, run ~12.8-13.2, and the jog/run boundary belongs
// between a LONG jog and a LONG run -- 12 leaves ~1.8 m/s of margin under it and ~0.75 above.
//
// KNOWN LIMIT, by design: a burst shorter than ~1s has not converged, so a 0.8s run (10.82) still reports
// `jog`. No fixed threshold on this metric can fix that -- a short run is genuinely slower than a long jog.
// Bursts of 1.2s or more (what S1 step 3 prescribes) label correctly; for the 0.8s comparisons S3 is forced
// into by its 9m corridor, compare sustainedSpeed directly, as MCP_SHOWCASE.md instructs.
const WALK_MAX_MS = 3
const JOG_MAX_MS = 12

export function setupS1Locomotion() {
  const sign = createSign(C.S1_SIGN, 'S1 -- LOCOMOTION LANE\nwalk / jog / run', COLORS.info)
  logEntity('S1 sign', sign)

  const readout = createReadout(C.S1_READOUT, 'waiting for movement...')
  logEntity('S1 readout', readout.entity)

  for (const marker of C.S1_MARKERS) {
    const plate = engine.addEntity()
    Transform.create(plate, { position: marker.pos, scale: Vector3.create(3.8, 0.05, 0.3) })
    MeshRenderer.setBox(plate)
    Material.setPbrMaterial(plate, { albedoColor: Color4.create(1, 1, 1, 1) })

    const label = engine.addEntity()
    Transform.create(label, { position: Vector3.create(marker.pos.x + 2.4, 0.05, marker.pos.z) })
    TextShape.create(label, {
      text: `${marker.meters}m`,
      fontSize: 2,
      textColor: Color4.Yellow(),
      textAlign: TextAlignMode.TAM_MIDDLE_CENTER
    })
    logMark(`S1 ${marker.meters}m marker`, marker.pos)
  }

  const wall = engine.addEntity()
  Transform.create(wall, { position: C.S1_WALL, scale: Vector3.create(6, 3, 0.4) })
  MeshRenderer.setBox(wall)
  MeshCollider.setBox(wall, ColliderLayer.CL_PHYSICS | ColliderLayer.CL_POINTER)
  Material.setPbrMaterial(wall, { albedoColor: COLORS.blocked })
  logEntity('S1 end wall (collision proof)', wall)

  let lastPos: Vector3 | null = null
  let idleTimer = 0
  let burstDistance = 0
  let burstDuration = 0
  let smoothedSpeed = 0
  let sustainedSpeed = 0
  let frame = 0

  engine.addSystem((dt: number) => {
    frame++
    if (!Transform.has(engine.PlayerEntity)) return

    const pos = Transform.get(engine.PlayerEntity).position
    if (lastPos) {
      const d = Vector3.distance(pos, lastPos)
      const speed = dt > 0 ? d / dt : 0

      if (speed > TELEPORT_SPEED_MS) {
        // A move_to reposition arrives as one impossible frame; counting it would report a phantom
        // superhuman burst. Drop the frame and let the burst (if any) continue from the new position.
        slog('S1-LOCOMOTION', `teleport detected (${d.toFixed(1)}m in one frame) -- ignored, not locomotion`)
        lastPos = pos
        return
      }

      if (speed > IDLE_SPEED_MS) {
        burstDistance += d
        burstDuration += dt
        // Peak per-frame speed is useless for classifying a gait: one physics step after a collision or a
        // dropped frame spikes it past the run threshold. An EMA over ~0.25s rides the sustained speed instead.
        smoothedSpeed += (speed - smoothedSpeed) * Math.min(1, dt / SPEED_SMOOTHING_SEC)
        if (smoothedSpeed > sustainedSpeed) sustainedSpeed = smoothedSpeed
        idleTimer = 0
      } else {
        idleTimer += dt
        if (idleTimer > IDLE_GRACE_SEC && burstDistance > 0.01) {
          const avgSpeed = burstDuration > 0 ? burstDistance / burstDuration : 0
          const bucket = sustainedSpeed < WALK_MAX_MS ? 'walk' : sustainedSpeed < JOG_MAX_MS ? 'jog' : 'run'
          counters.s1BurstDistance = Math.round(burstDistance * 100) / 100
          counters.s1LastKind = bucket
          slog(
            'S1-LOCOMOTION',
            `burst finished: distance=${counters.s1BurstDistance}m over ${burstDuration.toFixed(2)}s ` +
              `avgSpeed=${avgSpeed.toFixed(2)}m/s sustainedSpeed=${sustainedSpeed.toFixed(2)}m/s bucket=${bucket}`
          )
          burstDistance = 0
          burstDuration = 0
          smoothedSpeed = 0
          sustainedSpeed = 0
        }
      }
    }
    lastPos = pos

    if (frame % 6 === 0) {
      readout.setText(
        `player: (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)})\n` +
          `last burst: ${counters.s1BurstDistance}m [${counters.s1LastKind}]\n` +
          `global IA_FORWARD count: ${counters.globalForward} (see S6)\n` +
          `(walk does NOT increment IA_FORWARD)`
      )
    }
  })

  slog('S1-LOCOMOTION', 'station ready -- walk/jog/run north through the lane, collide with the end wall')
}
