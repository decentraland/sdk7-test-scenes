import {
  engine,
  Transform,
  Tween,
  tweenSystem,
  EasingFunction,
  MeshRenderer,
  MeshCollider,
  Material,
  TextShape,
  pointerEventsSystem,
  InputAction,
  Entity
} from '@dcl/sdk/ecs'
import { Vector3, Color4 } from '@dcl/sdk/math'

// ─── Colors ───

const COLOR_TRAVELER = Color4.create(0.2, 0.4, 1, 1) // blue
const COLOR_ARRIVED = Color4.create(1, 0.85, 0.1, 1) // gold flash
const COLOR_COME_TO_ME = Color4.create(0.75, 0.1, 0.85, 1) // magenta

const PAD_COLORS: { [name: string]: Color4 } = {
  RED: Color4.create(0.9, 0.15, 0.15, 1),
  ORANGE: Color4.create(1, 0.55, 0.1, 1),
  YELLOW: Color4.create(1, 0.9, 0.1, 1),
  GREEN: Color4.create(0.15, 0.8, 0.2, 1),
  BLUE: Color4.create(0.15, 0.45, 0.9, 1)
}

// ─── Interaction range ───
// Double the SDK default click range (10m) so every pad stays clickable from
// across the parcel, without having to walk up to it.
const POINTER_MAX_DISTANCE = 20

// ─── Helpers ───

function createLabel(text: string, position: Vector3, fontSize = 2): Entity {
  const label = engine.addEntity()
  Transform.create(label, { position })
  TextShape.create(label, {
    text,
    fontSize,
    textColor: Color4.White()
  })
  return label
}

function createFlatPad(position: Vector3, color: Color4): Entity {
  const pad = engine.addEntity()
  Transform.create(pad, { position, scale: Vector3.create(1.6, 0.2, 1.6) })
  MeshRenderer.setBox(pad)
  MeshCollider.setBox(pad)
  Material.setPbrMaterial(pad, { albedoColor: color })
  return pad
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function main() {
  // ─── CENTERPIECE: click-to-retarget mid-travel ───
  // One traveler cube + 5 clickable pads. Clicking a pad tweens the traveler
  // from ITS CURRENT LIVE POSITION (Transform.get, refreshed every frame by
  // the explorer over CRDT) to that pad. Because Tween.setMove uses
  // createOrReplace (which always resends, killing + rebuilding the tweener
  // the same frame), clicking a DIFFERENT pad mid-travel smoothly redirects
  // the cube from wherever it currently is -- no snap, no teleport.

  const traveler = engine.addEntity()
  const TRAVELER_START = Vector3.create(8, 1, 10)
  Transform.create(traveler, { position: TRAVELER_START })
  MeshRenderer.setBox(traveler)
  MeshCollider.setBox(traveler)
  Material.setPbrMaterial(traveler, { albedoColor: COLOR_TRAVELER })

  createLabel(
    'CENTERPIECE\nClick a pad. While the cube travels, click a\nDIFFERENT pad -- it redirects smoothly, no snap.',
    Vector3.create(8, 3.6, 15.5),
    1.4
  )

  const arrivedLabel = createLabel('', Vector3.create(8, 2.6, 10), 2)

  function sendTravelerTo(target: Vector3) {
    // The current live position -- refreshed every frame by the explorer over CRDT
    // while a tween is active -- becomes the new tween's start. This is what makes
    // mid-travel retargeting smooth instead of a snap back to a fixed point.
    const currentPosition = Transform.get(traveler).position
    Tween.setMove(traveler, currentPosition, target, 2500, EasingFunction.EF_EASEOUTQUAD)
    // A new journey is starting -- clear the previous "Arrived!" label and
    // restore the travelling color so the feedback reflects THIS journey.
    TextShape.getMutable(arrivedLabel).text = ''
    Material.setPbrMaterial(traveler, { albedoColor: COLOR_TRAVELER })
  }

  const padDefs: Array<{ name: string; position: Vector3 }> = [
    { name: 'RED', position: Vector3.create(2, 0.1, 14) },
    { name: 'ORANGE', position: Vector3.create(5.5, 0.1, 14) },
    { name: 'YELLOW', position: Vector3.create(9, 0.1, 14) },
    { name: 'GREEN', position: Vector3.create(12.5, 0.1, 14) },
    { name: 'BLUE', position: Vector3.create(15, 0.1, 11) }
  ]

  for (const { name, position } of padDefs) {
    const pad = createFlatPad(position, PAD_COLORS[name])
    createLabel(name, Vector3.create(position.x, position.y + 1, position.z))
    pointerEventsSystem.onPointerDown(
      {
        entity: pad,
        opts: {
          button: InputAction.IA_POINTER,
          hoverText: 'Send cube here (click another pad mid-travel!)',
          maxDistance: POINTER_MAX_DISTANCE
        }
      },
      () => {
        sendTravelerTo(Vector3.create(position.x, 1, position.z))
      }
    )
  }

  // ─── "Come to me": tween the traveler to the player's current position ───

  createLabel('COME TO ME\nSends the traveler cube to your current spot', Vector3.create(8, 2.6, 3.5), 1.4)
  const comeToMePad = createFlatPad(Vector3.create(8, 0.1, 2), COLOR_COME_TO_ME)
  pointerEventsSystem.onPointerDown(
    {
      entity: comeToMePad,
      opts: {
        button: InputAction.IA_POINTER,
        hoverText: 'Bring the traveler cube to me',
        maxDistance: POINTER_MAX_DISTANCE
      }
    },
    () => {
      const playerTransform = Transform.getOrNull(engine.PlayerEntity)
      if (!playerTransform) return
      const playerPos = playerTransform.position
      // Clamp inside the parcel (16m x 16m, 1m margin) so the cube never leaves the scene.
      const target = Vector3.create(clamp(playerPos.x, 1, 15), 1, clamp(playerPos.z, 1, 15))
      sendTravelerTo(target)
    }
  )

  // ─── Arrival feedback: gold flash + "Arrived!" label once the cube is there ───

  engine.addSystem(() => {
    if (tweenSystem.tweenCompleted(traveler)) {
      TextShape.getMutable(arrivedLabel).text = 'Arrived!'
      Material.setPbrMaterial(traveler, { albedoColor: COLOR_ARRIVED })
    }
  })
}
