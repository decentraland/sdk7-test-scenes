import { ColliderLayer, MeshCollider, MeshRenderer, Transform, Material, engine, type Entity } from '@dcl/sdk/ecs'
import { Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import type { Point } from '../arena'
import type { TraversalFrame, TraversalShape } from './types'

const shapeColors: Record<TraversalShape['kind'], Color4> = {
  surface: Color4.fromHexString('#506b83ff'),
  obstacle: Color4.fromHexString('#b9744aff'),
  target: Color4.fromHexString('#4bd8b7ff'),
  guide: Color4.fromHexString('#a0b7d7ff')
}
const botColors = ['#ffd05aff', '#46c4ffff', '#fa958eff', '#c3a1ffff'].map((color) => Color4.fromHexString(color))

function matches(vector: Vector3, point: Point) {
  return vector.x === point[0] && vector.y === point[1] && vector.z === point[2]
}

export function createTraversalVisuals() {
  const entities = new Map<string, Entity>()

  function draw(frame: TraversalFrame) {
    const visible = new Set<string>()

    function drawEntity(
      key: string, position: Point, size: Point, color: Color4, sphere: boolean, collider: boolean
    ) {
      visible.add(key)
      let entity = entities.get(key)
      if (entity === undefined) {
        entity = engine.addEntity()
        entities.set(key, entity)
        Transform.create(entity, { position: Vector3.create(...position), scale: Vector3.create(...size) })
        if (sphere) MeshRenderer.setSphere(entity)
        else MeshRenderer.setBox(entity)
        if (collider) MeshCollider.setBox(entity, ColliderLayer.CL_PHYSICS)
        Material.setBasicMaterial(entity, { diffuseColor: color })
        return
      }
      const pose = Transform.get(entity)
      if (!matches(pose.position, position) || !matches(pose.scale, size)) {
        const change = Transform.getMutable(entity)
        change.position = Vector3.create(...position)
        change.scale = Vector3.create(...size)
      }
    }

    for (const shape of frame.shapes) {
      const collider = shape.kind === 'surface' || shape.kind === 'obstacle'
      drawEntity('shape:' + shape.kind + ':' + shape.id, shape.center, shape.size, shapeColors[shape.kind], false, collider)
    }

    for (const [index, bot] of frame.bots.entries()) {
      const height = bot.height ?? 1.1
      const radius = bot.radius ?? 0.25
      const color = botColors[index % botColors.length]
      const [x, y, z] = bot.feet
      drawEntity('bot:' + bot.id, [x, y + height / 2, z], [radius * 2, height, radius * 2], color, true, false)
      if (bot.headingDegrees !== undefined) {
        const heading = Vector3.rotate(Vector3.Forward(), Quaternion.fromEulerDegrees(0, bot.headingDegrees, 0))
        drawEntity(
          'head:' + bot.id, [x + heading.x * radius * 0.95, y + height * 0.65, z + heading.z * radius * 0.95],
          [0.1, 0.1, 0.1], Color4.White(), true, false
        )
      }
    }

    for (const [key, entity] of entities) {
      if (visible.has(key)) continue
      engine.removeEntity(entity)
      entities.delete(key)
    }
  }

  return {
    draw,
    dispose() {
      for (const entity of entities.values()) engine.removeEntity(entity)
      entities.clear()
    }
  }
}
