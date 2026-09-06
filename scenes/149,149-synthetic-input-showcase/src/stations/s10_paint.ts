import {
  engine,
  Entity,
  InputAction,
  PointerEventType,
  PrimaryPointerInfo,
  RaycastQueryType,
  Transform,
  Material,
  MeshRenderer,
  PointerEventsResult,
  pointerEventsSystem,
  raycastSystem
} from '@dcl/sdk/ecs'
import { Color3, Color4, Vector3 } from '@dcl/sdk/math'
import * as C from '../constants'
import { createSign, createReadout, createFloorMark, createBox, setBoxColor, COLORS } from '../lib'
import { counters, slog, logEntity, logMark, onReset } from '../state'

/**
 * S10 -- "painting" on a surface, i.e. turning pointer positions into geometry.
 *
 * Two canvases, because the synthetic-input layer reaches them by two different paths and they
 * fail in different ways:
 *
 *  STAMP canvas  -- ordinary `pointerEventsSystem.onPointerDown`. Every `click_entity` /
 *                   `click_at` / aimed `press_input` puts exactly one dot at the hit position
 *                   carried in the event (`PBPointerEventsResult.hit.position`, scene-relative).
 *                   Discrete, deterministic, and the only path that needs no held button.
 *
 *  STROKE canvas -- the pattern from the `0,5-primary-cursor-info` reference scene: an
 *                   `IA_POINTER` down/up pair marks the button held, and while it is held the
 *                   station raycasts along `PrimaryPointerInfo.worldRayDirection` every ~60ms and
 *                   drops a dot wherever the ray lands. This is the one that needs the pointer to
 *                   stay DOWN across several frames -- a synthetic drag that presses and releases
 *                   inside one drain window paints a single dot, and the log says so rather than
 *                   silently looking like a short stroke. The ray is the POINTER's, not the
 *                   camera's, and it is parked where the press landed. `worldRayDirection` is
 *                   populated for a synthetic held pointer in every case measured. Holding a
 *                   button and calling `camera_look` still samples the same spot ~25 times and
 *                   paints one dot -- but NOT because the ray fails to follow the camera:
 *                   measured 2026-09-04, MCP tool calls are SERIALISED, so the turn only starts
 *                   after the hold has ended and the camera is stationary for the whole hold.
 *                   That gesture therefore establishes nothing about re-derivation (an earlier
 *                   note here claimed it did; it was withdrawn). Only `sweep_pointer` holds the
 *                   press, the turn and the release inside one call, and it is the only gesture
 *                   that paints a stroke. Where an unaimed hold's ray lands depends on where the
 *                   last AIMED gesture parked the free cursor -- pitching the camera away does
 *                   not move it: left on this canvas it re-samples that one spot, anywhere else
 *                   it hits nothing. Dragging a mouse across the world does not paint -- it pans.
 *
 * The DECOY strip under the stroke canvas is collidable but not paintable: samples that land on
 * it are counted as off-canvas and leave no dot, which is what proves the stroke is following the
 * pointer over the surface rather than spraying dots at whatever is in front of the camera.
 */

const RAY_PERIOD_SECONDS = 0.06
/** Two consecutive samples closer than this are the same spot -- a held, motionless pointer. */
const MIN_SAMPLE_STEP = 0.04
/**
 * Watchdog. `IA_POINTER` down and up are separate events and a synthetic press whose release never
 * arrives would leave the station raycasting forever, painting the stroke canvas any time the
 * camera happened to sweep past it. A stroke this long is a lost release, not a drag.
 */
const MAX_HELD_SECONDS = 6

/** Distinct hue per stroke so consecutive strokes are told apart in a screenshot. */
const STROKE_PALETTE: Color4[] = [
  Color4.create(1, 0.35, 0.35, 1),
  Color4.create(0.35, 1, 0.5, 1),
  Color4.create(0.4, 0.6, 1, 1),
  Color4.create(1, 0.85, 0.3, 1),
  Color4.create(0.9, 0.45, 1, 1),
  Color4.create(0.3, 1, 1, 1)
]
const STAMP_COLOR = Color4.create(1, 1, 1, 1)

/**
 * A hit position sits exactly ON the surface, which would bury half of every dot inside the
 * canvas. Nudge it out along the hit normal by the dot's radius (the sphere primitive is a unit
 * sphere, so radius = scale / 2) so the paint reads clearly in a screenshot.
 */
function surfacePoint(position: Vector3, normal?: Vector3): Vector3 {
  const point = Vector3.create(position.x, position.y, position.z)
  if (!normal) return point
  const r = C.S10_DOT_SCALE / 2
  return Vector3.create(point.x + normal.x * r, point.y + normal.y * r, point.z + normal.z * r)
}

export function setupS10Paint() {
  const sign = createSign(C.S10_SIGN, 'S10 -- PAINT SURFACE\nstamp (click) vs stroke (drag)', COLORS.info)
  logEntity('S10 sign', sign)

  const readout = createReadout(C.S10_READOUT, 'nothing painted yet')
  logEntity('S10 readout', readout.entity)

  const stand = createFloorMark(C.S10_STAND, 'S10 STAND HERE\n(both canvases in view)', COLORS.info)
  logEntity('S10 stand mark', stand)
  logMark('S10 stand', C.S10_STAND)

  const stampCanvas = createBox(C.S10_STAMP_CANVAS, C.S10_STAMP_CANVAS_SCALE, Color4.create(0.16, 0.16, 0.22, 1))
  logEntity('S10 STAMP canvas (one dot per click)', stampCanvas)
  logMark('S10 stamp canvas center', C.S10_STAMP_CANVAS)

  const strokeCanvas = createBox(C.S10_STROKE_CANVAS, C.S10_STROKE_CANVAS_SCALE, Color4.create(0.14, 0.2, 0.16, 1))
  logEntity('S10 STROKE canvas (dots while the pointer is held and moving)', strokeCanvas)
  logMark('S10 stroke canvas center', C.S10_STROKE_CANVAS)

  const decoy = createBox(C.S10_DECOY, C.S10_DECOY_SCALE, COLORS.blocked)
  logEntity('S10 DECOY strip (collidable, NOT paintable -- drag off the canvas onto it)', decoy)
  logMark('S10 decoy strip center', C.S10_DECOY)

  // -----------------------------------------------------------------------------------------
  // Dot pool. Spheres are 804 triangles each in the client, so the pool is capped and recycles
  // oldest-first instead of growing -- see S10_DOT_POOL_MAX in constants.ts.
  // -----------------------------------------------------------------------------------------
  const dots: Entity[] = []
  let nextRecycleSlot = 0

  function paintDot(position: Vector3, color: Color4) {
    let dot: Entity
    if (dots.length < C.S10_DOT_POOL_MAX) {
      dot = engine.addEntity()
      MeshRenderer.setSphere(dot)
      dots.push(dot)
    } else {
      dot = dots[nextRecycleSlot]
      nextRecycleSlot = (nextRecycleSlot + 1) % C.S10_DOT_POOL_MAX
      counters.s10PoolRecycles++
      if (counters.s10PoolRecycles === 1) {
        slog('S10-PAINT', `dot pool full at ${C.S10_DOT_POOL_MAX} -- painting now recycles the oldest dot`)
      }
    }
    Transform.createOrReplace(dot, {
      position,
      scale: Vector3.create(C.S10_DOT_SCALE, C.S10_DOT_SCALE, C.S10_DOT_SCALE)
    })
    Material.setPbrMaterial(dot, {
      albedoColor: color,
      emissiveColor: Color3.create(color.r, color.g, color.b),
      emissiveIntensity: 0.7
    })
  }

  function removeAllDots() {
    for (const dot of dots) engine.removeEntity(dot)
    dots.length = 0
    nextRecycleSlot = 0
  }

  function clearCanvas(reason: string) {
    removeAllDots()
    counters.s10Clears++
    slog('S10-PAINT', `canvas cleared (${reason}) -- clear #${counters.s10Clears}`)
  }

  function refresh() {
    readout.setText(
      `STAMP dots (one per click): ${counters.s10Stamps}\n` +
        `STROKE dots: ${counters.s10StrokeDots}  strokes: ${counters.s10Strokes}  longest: ${counters.s10LongestStrokeDots} dots\n` +
        `off-canvas samples (decoy / miss): ${counters.s10OffCanvasSamples}  ` +
        `no-ray samples: ${counters.s10NoDirectionSamples}\n` +
        `live dots: ${dots.length}/${C.S10_DOT_POOL_MAX}  recycles: ${counters.s10PoolRecycles}  clears: ${counters.s10Clears}`
    )
  }
  refresh()

  // -----------------------------------------------------------------------------------------
  // STAMP path -- one dot per pointer-down, placed at the event's own hit position.
  // -----------------------------------------------------------------------------------------
  pointerEventsSystem.onPointerDown(
    {
      entity: stampCanvas,
      opts: { button: InputAction.IA_POINTER, hoverText: 'Stamp a dot here', maxDistance: 16 }
    },
    (event) => {
      const hit = event.hit?.position
      if (!hit) {
        slog('S10-PAINT', 'stamp click arrived with no hit position -- nothing painted')
        return
      }
      counters.s10Stamps++
      paintDot(surfacePoint(hit, event.hit?.normalHit), STAMP_COLOR)
      slog(
        'S10-PAINT',
        `STAMP #${counters.s10Stamps} at local (${hit.x.toFixed(2)}, ${hit.y.toFixed(2)}, ${hit.z.toFixed(2)}) ` +
          `world ${C.fmtWorld(Vector3.create(hit.x, hit.y, hit.z))}`
      )
      refresh()
    }
  )

  const clearButton = createBox(C.S10_CLEAR_BUTTON, Vector3.create(1.2, 1.2, 1.2), COLORS.warn)
  logEntity('S10 CLEAR CANVAS button', clearButton)
  pointerEventsSystem.onPointerDown(
    { entity: clearButton, opts: { button: InputAction.IA_POINTER, hoverText: 'Clear the painted dots', maxDistance: 16 } },
    () => {
      clearCanvas('world button')
      refresh()
    }
  )

  // -----------------------------------------------------------------------------------------
  // STROKE path -- held pointer + repeated ray along PrimaryPointerInfo.worldRayDirection.
  //
  // The held flag is armed by the two presses that can honestly mean "I am about to drag here":
  // a pointer-down on the stroke canvas itself (entity-bound, registered below), or an
  // IA_POINTER scene-root broadcast -- a press that no entity consumed, which is what clicking
  // empty space or an unaimed press_input produces.
  //
  // It used to arm from the entity-less `inputSystem.isTriggered`, which CANNOT read the scene
  // root: without an entity it answers from EVERY entity's results, and passing engine.RootEntity
  // is the same scan because RootEntity is 0 and the SDK's `if (entity)` guard treats it as
  // absent (JS falsy zero) -- the exact trap documented for S6. That made the station both deaf
  // to the broadcast it claimed to watch and armed by any click anywhere in the scene (S4/S8
  // clicks opened phantom strokes). Reading the root's own grow-only set with a timestamp
  // watermark is the only true measurement.
  // -----------------------------------------------------------------------------------------
  let pointerHeld = false
  let strokeActive = false
  let rayTimer = 0
  let strokeDots = 0
  let strokeOffCanvas = 0
  let strokeLength = 0
  let lastSample: Vector3 | null = null
  let strokeColor = STROKE_PALETTE[0]
  let heldSeconds = 0
  /** Ray sample attempts during THIS hold, and the subset skipped for a missing pointer ray. */
  let holdSamples = 0
  let holdNoDirectionSamples = 0

  function beginStroke(source: string) {
    if (pointerHeld) return
    pointerHeld = true
    heldSeconds = 0
    holdSamples = 0
    holdNoDirectionSamples = 0
    rayTimer = RAY_PERIOD_SECONDS // sample immediately on the press frame
    slog('S10-PAINT', `IA_POINTER held (${source}) -- sweeping the ray until it is released`)
  }

  function endStroke() {
    const wasHeld = pointerHeld
    pointerHeld = false
    heldSeconds = 0
    raycastSystem.removeRaycasterEntity(engine.CameraEntity)
    if (!strokeActive) {
      // The hold produced no stroke at all. Say which of the three ways it got here, rather than
      // returning silently -- telling them apart used to take four gestures and three
      // measurement channels. Skipped entirely for a stray release that followed no hold.
      if (wasHeld) {
        if (holdSamples === 0) {
          slog(
            'S10-PAINT',
            'hold ended without painting -- the pointer was released before a single ray sample was taken ' +
              '(press and release landed inside one drain window, so this was a click, not a drag)'
          )
        } else if (holdNoDirectionSamples === holdSamples) {
          slog(
            'S10-PAINT',
            `hold ended without painting -- all ${holdNoDirectionSamples} ray samples were skipped because ` +
              'PrimaryPointerInfo.worldRayDirection was not populated for this held pointer, so there was no ' +
              'ray to sweep at all. Use sweep_pointer, which presses at a screen position'
          )
        } else {
          slog(
            'S10-PAINT',
            `hold ended without painting -- ${holdSamples} ray samples were taken and none hit the stroke canvas ` +
              `(${holdNoDirectionSamples} of them had no pointer ray at all)`
          )
        }
        refresh()
      }
      holdSamples = 0
      holdNoDirectionSamples = 0
      lastSample = null
      return
    }
    strokeActive = false
    counters.s10Strokes++
    if (strokeDots > counters.s10LongestStrokeDots) counters.s10LongestStrokeDots = strokeDots
    slog(
      'S10-PAINT',
      `STROKE #${counters.s10Strokes} ended -- ${strokeDots} dots over ${strokeLength.toFixed(2)}m of surface ` +
        `(${strokeOffCanvas} samples landed off the canvas` +
        (holdNoDirectionSamples > 0 ? `, ${holdNoDirectionSamples} skipped for a missing pointer ray` : '') +
        ')'
    )
    const samplesThisHold = holdSamples
    holdSamples = 0
    holdNoDirectionSamples = 0
    if (strokeDots <= 1) {
      // Two very different causes land here and they used to be reported as one. Only the first
      // is "the gesture was too short"; the second is a held pointer whose RAY never moved, and
      // calling that one "not held across frames" sends the next run hunting the wrong bug.
      if (samplesThisHold <= 1) {
        slog(
          'S10-PAINT',
          `STROKE #${counters.s10Strokes} was a single dot -- the pointer was not held across frames. A drag has to ` +
            'keep IA_POINTER down over several updates for the ray to sweep; a press+release inside one drain window ' +
            'is indistinguishable from a click here'
        )
      } else {
        slog(
          'S10-PAINT',
          `STROKE #${counters.s10Strokes} was a single dot even though the pointer was held across ` +
            `${samplesThisHold} ray samples -- the ray never moved, i.e. the camera did not turn while the ` +
            'button was down. If you issued a camera_look alongside the hold, note that MCP calls are serialised: ' +
            'the turn ran AFTER the release, so the hold saw a stationary camera. Use sweep_pointer, which holds ' +
            'the press, turns and releases inside one call'
        )
      }
    }
    strokeDots = 0
    strokeOffCanvas = 0
    strokeLength = 0
    lastSample = null
    refresh()
  }

  // The stroke canvas is pressable so the gesture can start ON the surface being painted, which is
  // what a human does and what `sweep_pointer entityId:<this>` produces. An entity-bound press is
  // suppressed from the scene-root broadcast by design, so this handler -- not the root scan below
  // -- is what arms that case.
  pointerEventsSystem.onPointerDown(
    {
      entity: strokeCanvas,
      opts: { button: InputAction.IA_POINTER, hoverText: 'Hold and sweep to paint a stroke', maxDistance: 16 }
    },
    () => beginStroke('pointer-down on the stroke canvas')
  )

  pointerEventsSystem.onPointerUp(
    {
      entity: strokeCanvas,
      opts: { button: InputAction.IA_POINTER, hoverText: 'Release to end the stroke', maxDistance: 16 }
    },
    () => endStroke()
  )

  let lastRootTimestampSeen = 0

  engine.addSystem((dt: number) => {
    let maxTimestamp = lastRootTimestampSeen
    for (const cmd of PointerEventsResult.get(engine.RootEntity)) {
      if (cmd.timestamp <= lastRootTimestampSeen) continue
      if (cmd.timestamp > maxTimestamp) maxTimestamp = cmd.timestamp
      if (cmd.button !== InputAction.IA_POINTER) continue
      if (cmd.state === PointerEventType.PET_DOWN) beginStroke('scene-root broadcast')
      else if (cmd.state === PointerEventType.PET_UP) endStroke()
    }
    lastRootTimestampSeen = maxTimestamp

    if (!pointerHeld) return

    heldSeconds += dt
    if (heldSeconds > MAX_HELD_SECONDS) {
      slog('S10-PAINT', `IA_POINTER has been down for ${MAX_HELD_SECONDS}s with no release -- ending the stroke`)
      endStroke()
      return
    }

    rayTimer += dt
    if (rayTimer < RAY_PERIOD_SECONDS) return
    rayTimer = 0
    holdSamples++

    // getOrCreateMutable, matching the `0,5-primary-cursor-info` reference scene: the renderer owns
    // this component on the root and a read-only getter returns null until it has written it once.
    const pointer = PrimaryPointerInfo.getOrCreateMutable(engine.RootEntity)
    const direction = pointer.worldRayDirection
    if (!direction) {
      // Used to `return` silently, which made "no ray at all" indistinguishable from "the ray
      // missed" -- the off-canvas counter stays 0 in both cases. Count it so one gesture is
      // enough to tell them apart, and log once per hold so a 2s drag does not flood.
      holdNoDirectionSamples++
      counters.s10NoDirectionSamples++
      if (holdNoDirectionSamples === 1) {
        slog(
          'S10-PAINT',
          'ray sample skipped -- PrimaryPointerInfo.worldRayDirection is not populated for this held pointer ' +
            '(the press parked no pointer). Nothing will paint until the ray exists; the count is on the readout'
        )
        refresh()
      }
      return
    }

    raycastSystem.registerGlobalDirectionRaycast(
      { entity: engine.CameraEntity, opts: { queryType: RaycastQueryType.RQT_HIT_FIRST, direction } },
      (result) => {
        // A raycast result registered before the release can land AFTER endStroke() has run
        // (removeRaycasterEntity does not recall one already in flight). Without this guard the
        // on-canvas branch below re-opened a stroke bounded by no gesture: it painted an
        // unbounded dot, left strokeActive true, and the NEXT gesture was silently merged into
        // it -- no "started" line, and a dot count and length that overstated what was painted.
        if (!pointerHeld) return

        const hit = result.hits[0]
        if (!hit || !hit.position) return

        const onStrokeCanvas = hit.entityId === (strokeCanvas as number)
        if (!onStrokeCanvas) {
          if (!strokeActive) return // the press was aimed at something else entirely -- not our stroke
          strokeOffCanvas++
          counters.s10OffCanvasSamples++
          // The ray fires every ~60ms; a drag parked off the canvas would otherwise bury the
          // transcript. The first few say it happened, the stroke-end line gives the total.
          if (strokeOffCanvas <= 3) {
            slog(
              'S10-PAINT',
              `stroke sample left the canvas (hit entityId ${hit.entityId ?? 'none'}) -- no dot painted ` +
                `(off-canvas sample ${strokeOffCanvas} of this stroke)`
            )
          }
          refresh()
          return
        }

        const position = surfacePoint(hit.position, hit.normalHit)
        if (!strokeActive) {
          strokeActive = true
          strokeColor = STROKE_PALETTE[counters.s10Strokes % STROKE_PALETTE.length]
          slog(
            'S10-PAINT',
            `STROKE #${counters.s10Strokes + 1} started at local ` +
              `(${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)})`
          )
        } else if (lastSample) {
          const step = Vector3.distance(lastSample, position)
          if (step < MIN_SAMPLE_STEP) return // held but motionless -- do not stack dots in one spot
          strokeLength += step
        }

        lastSample = position
        strokeDots++
        counters.s10StrokeDots++
        paintDot(position, strokeColor)
        refresh()
      }
    )
  })

  onReset(() => {
    pointerHeld = false
    strokeActive = false
    strokeDots = 0
    strokeOffCanvas = 0
    strokeLength = 0
    holdSamples = 0
    holdNoDirectionSamples = 0
    lastSample = null
    raycastSystem.removeRaycasterEntity(engine.CameraEntity)
    // Not clearCanvas(): resetAllStations has already zeroed every counter, and counting its own
    // wipe would leave the readout claiming a clear the driver never asked for.
    removeAllDots()
    setBoxColor(clearButton, COLORS.warn)
    refresh()
  })

  slog(
    'S10-PAINT',
    'station ready -- click_entity/click_at the STAMP canvas for one dot per click; for a trail, use ' +
      'sweep_pointer aimed at the STROKE canvas, which is the ONLY gesture that paints one: it holds the press, ' +
      'turns and releases inside a single call. A press_input hold plus a separate camera_look does not, because ' +
      'MCP calls are serialised -- the turn runs after the hold ends, so the camera never moves while the button ' +
      'is down. Dragging a mouse across the world only pans it'
  )
}
