import {
  Billboard,
  BillboardMode,
  ColliderLayer,
  Material,
  MeshCollider,
  MeshRenderer,
  TextAlignMode,
  TextShape,
  Transform,
  type Entity
} from '@dcl/sdk/ecs'
import { Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { HUB_ORIGIN, SCENE_SIZE, STAGE_SIZE, slotRect } from './layout'
import type { Tracker } from './tracking'
import type { SubsceneEntry } from './types'

type BoxOptions = {
  position: Vector3
  size: Vector3
  color: Color4
  /** Defaults to true. Turn it off for decoration you can walk through. */
  collider?: boolean
  rotation?: Quaternion
}

function box(tracker: Tracker, options: BoxOptions): Entity {
  const entity = tracker.add()
  Transform.create(entity, { position: options.position, rotation: options.rotation, scale: options.size })
  MeshRenderer.setBox(entity)
  Material.setPbrMaterial(entity, {
    albedoColor: options.color,
    metallic: 0,
    roughness: 0.9
  })
  if (options.collider !== false) {
    MeshCollider.setBox(entity, ColliderLayer.CL_PHYSICS)
  }
  return entity
}

type TextOptions = {
  text: string
  position: Vector3
  fontSize: number
  color?: Color4
  /** Billboard signs are readable from any angle (it is what mobile testers look at). */
  billboard?: boolean
  width?: number
}

function text(tracker: Tracker, options: TextOptions): Entity {
  const entity = tracker.add()
  Transform.create(entity, { position: options.position, scale: Vector3.create(1, 1, 1) })
  TextShape.create(entity, {
    text: options.text,
    fontSize: options.fontSize,
    textColor: options.color ?? Color4.White(),
    textWrapping: true,
    width: options.width ?? 14,
    height: 6,
    textAlign: TextAlignMode.TAM_MIDDLE_CENTER
  })
  if (options.billboard !== false) {
    Billboard.create(entity, { billboardMode: BillboardMode.BM_ALL })
  }
  return entity
}

const FLOOR_COLOR = Color4.create(0.16, 0.18, 0.22, 1)
const WALL_COLOR = Color4.create(0.1, 0.11, 0.14, 1)
const ACCENT_COLOR = Color4.create(0.24, 0.52, 0.94, 1)
const STAGE_COLOR = Color4.create(0.2, 0.26, 0.34, 1)
const STAGE_BORDER_COLOR = Color4.create(0.24, 0.52, 0.94, 1)

/**
 * Static world: floor and perimeter walls. Created once, never removed, so the
 * player can not fall out of the scene while a subscene is mounted or not.
 */
export function buildWorld(tracker: Tracker): void {
  box(tracker, {
    position: Vector3.create(SCENE_SIZE / 2, -0.1, SCENE_SIZE / 2),
    size: Vector3.create(SCENE_SIZE, 0.2, SCENE_SIZE),
    color: FLOOR_COLOR
  })

  const half = SCENE_SIZE / 2
  const height = 2.5
  const thickness = 0.5
  const walls: { position: Vector3; size: Vector3 }[] = [
    { position: Vector3.create(half, height / 2, 0), size: Vector3.create(SCENE_SIZE, height, thickness) },
    { position: Vector3.create(half, height / 2, SCENE_SIZE), size: Vector3.create(SCENE_SIZE, height, thickness) },
    { position: Vector3.create(0, height / 2, half), size: Vector3.create(thickness, height, SCENE_SIZE) },
    { position: Vector3.create(SCENE_SIZE, height / 2, half), size: Vector3.create(thickness, height, SCENE_SIZE) }
  ]
  for (const wall of walls) {
    box(tracker, { position: wall.position, size: wall.size, color: WALL_COLOR })
  }
}

/**
 * Hub props: a dais you spawn on, the hub title and the stage map printed on the
 * floor so you know where each registered subscene lives.
 */
export function buildHubProps(tracker: Tracker, entries: SubsceneEntry[]): void {
  box(tracker, {
    position: Vector3.create(HUB_ORIGIN.x, 0.15, HUB_ORIGIN.z),
    size: Vector3.create(10, 0.3, 10),
    color: Color4.create(0.13, 0.15, 0.19, 1)
  })
  box(tracker, {
    position: Vector3.create(HUB_ORIGIN.x, 0.31, HUB_ORIGIN.z + 4.6),
    size: Vector3.create(10, 0.02, 0.3),
    color: ACCENT_COLOR,
    collider: false
  })

  text(tracker, {
    text: 'Mobile QA hub',
    position: Vector3.create(HUB_ORIGIN.x, 3.4, HUB_ORIGIN.z + 4.2),
    fontSize: 8
  })
  text(tracker, {
    text: `${entries.length} subscene(s) registered\npick one in the list on the left`,
    position: Vector3.create(HUB_ORIGIN.x, 2.5, HUB_ORIGIN.z + 4.2),
    fontSize: 4,
    color: Color4.create(0.75, 0.8, 0.9, 1)
  })

  // Stage map on the floor: a marker per registered subscene, labelled with its issue.
  for (const entry of entries) {
    const rect = slotRect(entry.meta.slot)
    box(tracker, {
      position: Vector3.create(rect.center.x, 0.02, rect.center.z),
      size: Vector3.create(STAGE_SIZE - 1, 0.04, STAGE_SIZE - 1),
      color: entry.meta.status === 'done' ? Color4.create(0.1, 0.3, 0.18, 1) : STAGE_COLOR,
      collider: false
    })
    text(tracker, {
      text: `${entry.meta.issue}${entry.meta.pr === undefined ? '' : ` / ${entry.meta.pr}`}`,
      position: Vector3.create(rect.center.x, 0.6, rect.center.z),
      fontSize: 4,
      color: Color4.create(0.85, 0.9, 1, 1),
      billboard: false
    })
  }
}

/**
 * Dressing of the stage in use: floor plate, low border (keeps the test inside its
 * stage) and a sign with the issue/PR, so a screenshot is self explaining.
 */
export function buildStageProps(tracker: Tracker, entry: SubsceneEntry): void {
  const rect = slotRect(entry.meta.slot)
  const border = 0.4
  const height = 0.8

  box(tracker, {
    position: Vector3.create(rect.center.x, 0.01, rect.center.z),
    size: Vector3.create(STAGE_SIZE, 0.02, STAGE_SIZE),
    color: STAGE_COLOR,
    collider: false
  })
  for (const side of ['s', 'n', 'w', 'e'] as const) {
    const horizontal = side === 's' || side === 'n'
    const position =
      side === 's'
        ? Vector3.create(rect.center.x, height / 2, rect.minZ + border / 2)
        : side === 'n'
          ? Vector3.create(rect.center.x, height / 2, rect.maxZ - border / 2)
          : side === 'w'
            ? Vector3.create(rect.minX + border / 2, height / 2, rect.center.z)
            : Vector3.create(rect.maxX - border / 2, height / 2, rect.center.z)
    box(tracker, {
      position,
      size: horizontal ? Vector3.create(STAGE_SIZE, height, border) : Vector3.create(border, height, STAGE_SIZE),
      color: STAGE_BORDER_COLOR,
      collider: true
    })
  }

  const refs = entry.meta.pr === undefined ? entry.meta.issue : `${entry.meta.issue} / ${entry.meta.pr}`
  text(tracker, {
    text: `${refs}  ${entry.meta.title}`,
    position: Vector3.create(rect.center.x, 2.6, rect.minZ + 1.5),
    fontSize: 6
  })
  text(tracker, {
    text: `${entry.meta.owner} · ${entry.meta.status}${entry.meta.note === undefined ? '' : `\n${entry.meta.note}`}`,
    position: Vector3.create(rect.center.x, 1.9, rect.minZ + 1.5),
    fontSize: 4,
    color: Color4.create(0.75, 0.8, 0.9, 1)
  })
}
