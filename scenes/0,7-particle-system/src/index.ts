import {
  engine,
  Entity,
  Transform,
  MeshRenderer,
  MeshCollider,
  TextShape,
  Billboard,
  Material,
  MaterialTransparencyMode,
  Tween,
  TweenSequence,
  EasingFunction,
  TweenLoop
} from '@dcl/sdk/ecs'
import {
  ParticleSystem,
  PBParticleSystem_BlendMode,
  PBParticleSystem_PlaybackState,
  PBParticleSystem_SimulationSpace
} from '@dcl/sdk/ecs'
import { Color4, Vector3, Quaternion } from '@dcl/sdk/math'
import { setupUI } from './ui'

// ─── Types ────────────────────────────────────────────────────────────────────

export type PsEntry = { entity: Entity; name: string; vizEntity: Entity }

export const psEntries: PsEntry[] = []

let currentPsEntry: PsEntry | undefined

export function getCurrentPsEntry(): PsEntry | undefined {
  return currentPsEntry
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PROXIMITY_DIST = 5
const SHAPE_COLOR = Color4.create(0.4, 0.9, 1, 0.18)

// ─── Shape Visualizers ────────────────────────────────────────────────────────

function applyShapeToVisualizer(vizEntity: Entity, shape: NonNullable<ReturnType<typeof ParticleSystem.getOrNull>>['shape']): void {
  const t = Transform.getMutable(vizEntity)
  const shapeCase = shape?.$case ?? 'point'

  switch (shapeCase) {
    case 'point':
      t.scale = Vector3.create(0.15, 0.15, 0.15)
      MeshRenderer.setSphere(vizEntity)
      break
    case 'sphere': {
      const radius = (shape?.$case === 'sphere' ? shape.sphere.radius : undefined) ?? 1
      const diameter = radius * 2
      t.scale = Vector3.create(diameter, diameter, diameter)
      MeshRenderer.setSphere(vizEntity)
      break
    }
    case 'cone': {
      const radius = (shape?.$case === 'cone' ? shape.cone.radius : undefined) ?? 1
      t.scale = Vector3.create(radius * 2, 0.05, radius * 2)
      MeshRenderer.setCylinder(vizEntity, radius, 0)
      break
    }
    case 'box': {
      const size = (shape?.$case === 'box' ? shape.box.size : undefined) ?? Vector3.create(1, 1, 1)
      t.scale = Vector3.create(size.x, size.y, size.z)
      MeshRenderer.setBox(vizEntity)
      break
    }
  }
}

function createVisualizer(parent: Entity, shape: NonNullable<ReturnType<typeof ParticleSystem.getOrNull>>['shape']): Entity {
  const vizEntity = engine.addEntity()
  Transform.create(vizEntity, {
    parent,
    position: Vector3.create(0, 0, 0),
    scale: Vector3.create(0.15, 0.15, 0.15)
  })
  MeshRenderer.setSphere(vizEntity)
  Material.setPbrMaterial(vizEntity, {
    albedoColor: SHAPE_COLOR,
    transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND,
    castShadows: false
  })
  applyShapeToVisualizer(vizEntity, shape)
  return vizEntity
}

// ─── Label Helper ─────────────────────────────────────────────────────────────

function addLabel(parent: Entity, text: string, worldPos?: Vector3): void {
  const label = engine.addEntity()
  if (worldPos) {
    Transform.create(label, { position: worldPos })
  } else {
    Transform.create(label, {
      parent,
      position: Vector3.create(0, 2.5, 0)
    })
  }
  TextShape.create(label, {
    text,
    fontSize: 1.5,
    textColor: Color4.Yellow(),
    outlineColor: Color4.create(0, 0, 0, 1),
    outlineWidth: 0.35
  })
  Billboard.create(label)
}

// ─── Register Helper ──────────────────────────────────────────────────────────

function registerPs(entity: Entity, name: string, vizEntity: Entity): PsEntry {
  const entry: PsEntry = { entity, name, vizEntity }
  psEntries.push(entry)
  return entry
}

// ─── 1. Fire Ember — Point, PSB_ADD, gravity=-0.3, warm orange/red ────────────

function createFireEmber(): PsEntry {
  const entity = engine.addEntity()
  Transform.create(entity, { position: Vector3.create(6, 1, 6) })

  ParticleSystem.create(entity, {
    active: true,
    rate: 40,
    lifetime: 2,
    maxParticles: 200,
    initialSize: { start: 0.1, end: 0.3 },
    sizeOverTime: { start: 1.0, end: 0.0 },
    initialColor: { start: Color4.create(1, 0.6, 0.1, 1), end: Color4.create(1, 0.2, 0, 1) },
    colorOverTime: { start: Color4.create(1, 0.5, 0.1, 1), end: Color4.create(0.2, 0, 0, 0) },
    initialVelocitySpeed: { start: 1.5, end: 2.5 },
    gravity: -0.3,
    blendMode: PBParticleSystem_BlendMode.PSB_ADD,

    shape: ParticleSystem.Shape.Point(),
    playbackState: PBParticleSystem_PlaybackState.PS_PLAYING,
    bursts: []
  })

  const viz = createVisualizer(entity, ParticleSystem.Shape.Point())
  addLabel(entity, 'Fire Ember\nPoint | ADD')

  return registerPs(entity, 'Fire Ember', viz)
}

// ─── 2. Magic Aura — Sphere r=0.8, PSB_ALPHA, blue-to-white, rotationOverTime ─

function createMagicAura(): PsEntry {
  const entity = engine.addEntity()
  Transform.create(entity, { position: Vector3.create(16, 1, 6) })

  ParticleSystem.create(entity, {
    active: true,
    rate: 20,
    lifetime: 3,
    maxParticles: 150,
    initialSize: { start: 0.2, end: 0.5 },
    sizeOverTime: { start: 0.5, end: 1.2 },
    initialColor: { start: Color4.create(0.2, 0.5, 1, 1), end: Color4.create(0.5, 0.8, 1, 1) },
    colorOverTime: { start: Color4.create(0.4, 0.6, 1, 1), end: Color4.create(1, 1, 1, 0) },
    initialVelocitySpeed: { start: 0.5, end: 1.0 },
    rotationOverTime: { start: 0, end: 90 },
    blendMode: PBParticleSystem_BlendMode.PSB_ALPHA,

    shape: ParticleSystem.Shape.Sphere({ radius: 0.8 }),
    playbackState: PBParticleSystem_PlaybackState.PS_PLAYING,
    bursts: []
  })

  const viz = createVisualizer(entity, ParticleSystem.Shape.Sphere({ radius: 0.8 }))
  addLabel(entity, 'Magic Aura\nSphere | ALPHA')

  return registerPs(entity, 'Magic Aura', viz)
}

// ─── 3. Snowfall — Cone(angle=15, r=2), PSB_ALPHA, rotated 180° (downward), gravity=1.5

function createSnowfall(): PsEntry {
  const entity = engine.addEntity()
  Transform.create(entity, {
    position: Vector3.create(26, 5, 6),
    rotation: Quaternion.fromEulerDegrees(180, 0, 0)
  })

  ParticleSystem.create(entity, {
    active: true,
    rate: 30,
    lifetime: 4,
    maxParticles: 300,
    initialSize: { start: 0.06, end: 0.14 },
    sizeOverTime: { start: 1.0, end: 0.8 },
    initialColor: { start: Color4.create(0.9, 0.95, 1, 0.9), end: Color4.create(0.9, 0.95, 1, 0.9) },
    colorOverTime: { start: Color4.create(1, 1, 1, 0.8), end: Color4.create(1, 1, 1, 0) },
    initialVelocitySpeed: { start: 2, end: 3 },
    gravity: 1.5,
    blendMode: PBParticleSystem_BlendMode.PSB_ALPHA,

    shape: ParticleSystem.Shape.Cone({ angle: 15, radius: 2 }),
    playbackState: PBParticleSystem_PlaybackState.PS_PLAYING,
    bursts: []
  })

  const viz = createVisualizer(entity, ParticleSystem.Shape.Cone({ angle: 15, radius: 2 }))
  // Label as separate world entity so it isn't flipped by the 180° parent rotation
  addLabel(entity, 'Snowfall\nCone | ALPHA', Vector3.create(26, 7, 6))

  return registerPs(entity, 'Snowfall', viz)
}

// ─── 4. Sprite Flame — Box(0.5,0.1,0.5), PSB_ADD, spriteSheet tilesX=4,tilesY=4

function createSpriteFlame(): PsEntry {
  const entity = engine.addEntity()
  Transform.create(entity, { position: Vector3.create(6, 1, 14) })

  ParticleSystem.create(entity, {
    active: true,
    rate: 15,
    lifetime: 1.5,
    maxParticles: 60,
    initialSize: { start: 0.8, end: 1.2 },
    sizeOverTime: { start: 1.0, end: 0.3 },
    initialColor: { start: Color4.create(1, 0.8, 0.4, 1), end: Color4.create(1, 0.5, 0.1, 1) },
    colorOverTime: { start: Color4.create(1, 0.7, 0.3, 1), end: Color4.create(0.5, 0, 0, 0) },
    initialVelocitySpeed: { start: 0.5, end: 1.0 },
    blendMode: PBParticleSystem_BlendMode.PSB_ADD,

    spriteSheet: { tilesX: 4, tilesY: 4, framesPerSecond: 16 },
    shape: ParticleSystem.Shape.Box({ size: Vector3.create(0.5, 0.1, 0.5) }),
    playbackState: PBParticleSystem_PlaybackState.PS_PLAYING,
    bursts: []
  })

  const viz = createVisualizer(entity, ParticleSystem.Shape.Box({ size: Vector3.create(0.5, 0.1, 0.5) }))
  addLabel(entity, 'Sprite Flame\nBox | ADD | Sheet')

  return registerPs(entity, 'Sprite Flame', viz)
}

// ─── 5. Gravity Fountain — Sphere r=0.1, PSB_ALPHA, fast upward, gravity=-2.5 ─

function createGravityFountain(): PsEntry {
  const entity = engine.addEntity()
  Transform.create(entity, { position: Vector3.create(16, 1, 14) })

  ParticleSystem.create(entity, {
    active: true,
    rate: 30,
    lifetime: 3,
    maxParticles: 200,
    initialSize: { start: 0.15, end: 0.25 },
    sizeOverTime: { start: 1.0, end: 0.5 },
    initialColor: { start: Color4.create(0.3, 0.8, 1, 1), end: Color4.create(0.1, 0.5, 1, 1) },
    colorOverTime: { start: Color4.create(0.5, 0.9, 1, 1), end: Color4.create(0.1, 0.3, 0.8, 0) },
    initialVelocitySpeed: { start: 3, end: 5 },
    gravity: -2.5,
    blendMode: PBParticleSystem_BlendMode.PSB_ALPHA,

    shape: ParticleSystem.Shape.Sphere({ radius: 0.1 }),
    playbackState: PBParticleSystem_PlaybackState.PS_PLAYING,
    bursts: []
  })

  const viz = createVisualizer(entity, ParticleSystem.Shape.Sphere({ radius: 0.1 }))
  addLabel(entity, 'Gravity Fountain\nSphere | ALPHA')

  return registerPs(entity, 'Gravity Fountain', viz)
}

// ─── 6. Bat Swarm — Sphere r=1.5, PSB_ALPHA, texture, spriteSheet 4×4 16frames ─

function createBatSwarm(): PsEntry {
  const entity = engine.addEntity()
  Transform.create(entity, { position: Vector3.create(26, 1, 14) })

  ParticleSystem.create(entity, {
    active: true,
    rate: 5,
    lifetime: 4,
    maxParticles: 40,
    initialSize: { start: 0.6, end: 1.0 },
    sizeOverTime: { start: 1.0, end: 0.8 },
    initialColor: { start: Color4.create(1, 1, 1, 1), end: Color4.create(1, 1, 1, 1) },
    colorOverTime: { start: Color4.create(1, 1, 1, 1), end: Color4.create(1, 1, 1, 0) },
    initialVelocitySpeed: { start: 0.5, end: 1.5 },
    rotationOverTime: { start: -15, end: 15 },
    blendMode: PBParticleSystem_BlendMode.PSB_ALPHA,

    texture: { src: 'assets/32x32-bat-sprite.png' },
    spriteSheet: { tilesX: 4, tilesY: 4, framesPerSecond: 24 },
    shape: ParticleSystem.Shape.Sphere({ radius: 1.5 }),
    playbackState: PBParticleSystem_PlaybackState.PS_PLAYING,
    bursts: []
  })

  const viz = createVisualizer(entity, ParticleSystem.Shape.Sphere({ radius: 1.5 }))
  addLabel(entity, 'Bat Swarm\nSphere | ALPHA | Sheet')

  return registerPs(entity, 'Bat Swarm', viz)
}

// ─── 7. Smoke Haze — Sphere r=1.2, PSB_ALPHA, prewarm=true, slow, grey, large ─

function createSmokeHaze(): PsEntry {
  const entity = engine.addEntity()
  Transform.create(entity, { position: Vector3.create(6, 1, 22) })

  ParticleSystem.create(entity, {
    active: true,
    loop: true,
    prewarm: true,
    rate: 8,
    lifetime: 6,
    maxParticles: 80,
    initialSize: { start: 0.5, end: 1.0 },
    sizeOverTime: { start: 1.0, end: 1.5 },
    initialColor: { start: Color4.create(0.6, 0.6, 0.6, 0.5), end: Color4.create(0.4, 0.4, 0.4, 0.5) },
    colorOverTime: { start: Color4.create(0.5, 0.5, 0.5, 0.4), end: Color4.create(0.3, 0.3, 0.3, 0) },
    initialVelocitySpeed: { start: 0.1, end: 0.3 },
    blendMode: PBParticleSystem_BlendMode.PSB_ALPHA,

    shape: ParticleSystem.Shape.Sphere({ radius: 1.2 }),
    playbackState: PBParticleSystem_PlaybackState.PS_PLAYING,
    bursts: []
  })

  const viz = createVisualizer(entity, ParticleSystem.Shape.Sphere({ radius: 1.2 }))
  addLabel(entity, 'Smoke Haze\nSphere | ALPHA | Prewarm')

  return registerPs(entity, 'Smoke Haze', viz)
}

// ─── 8. Lightning Sparks — Point, PSB_ADD, fast, limitVelocity, short life, cyan

function createLightningSparks(): PsEntry {
  const entity = engine.addEntity()
  Transform.create(entity, { position: Vector3.create(16, 1, 22) })

  ParticleSystem.create(entity, {
    active: true,
    rate: 80,
    lifetime: 0.4,
    maxParticles: 200,
    initialSize: { start: 0.05, end: 0.12 },
    sizeOverTime: { start: 1.0, end: 0.0 },
    initialColor: { start: Color4.create(0.5, 1, 1, 1), end: Color4.create(0, 0.8, 1, 1) },
    colorOverTime: { start: Color4.create(0.6, 1, 1, 1), end: Color4.create(0, 0.5, 0.8, 0) },
    initialVelocitySpeed: { start: 6, end: 12 },
    limitVelocity: { speed: 4, dampen: 0.9 },
    blendMode: PBParticleSystem_BlendMode.PSB_ADD,

    shape: ParticleSystem.Shape.Point(),
    playbackState: PBParticleSystem_PlaybackState.PS_PLAYING,
    bursts: []
  })

  const viz = createVisualizer(entity, ParticleSystem.Shape.Point())
  addLabel(entity, 'Lightning Sparks\nPoint | ADD | LimitVel')

  return registerPs(entity, 'Lightning Sparks', viz)
}

// ─── 9. Heavy Rain — Box(6,0.1,6), PSB_ALPHA, rotated 180° (falling), limitVelocity

function createHeavyRain(): PsEntry {
  const entity = engine.addEntity()
  Transform.create(entity, {
    position: Vector3.create(26, 6, 22),
    rotation: Quaternion.fromEulerDegrees(180, 0, 0)
  })

  ParticleSystem.create(entity, {
    active: true,
    rate: 100,
    lifetime: 3,
    maxParticles: 600,
    initialSize: { start: 0.04, end: 0.07 },
    sizeOverTime: { start: 1.0, end: 0.8 },
    initialColor: { start: Color4.create(0.7, 0.8, 1, 0.7), end: Color4.create(0.6, 0.7, 0.9, 0.7) },
    colorOverTime: { start: Color4.create(0.7, 0.8, 1, 0.6), end: Color4.create(0.5, 0.6, 0.8, 0) },
    initialVelocitySpeed: { start: 4, end: 6 },
    limitVelocity: { speed: 5, dampen: 1 },
    gravity: 2,
    blendMode: PBParticleSystem_BlendMode.PSB_ALPHA,

    shape: ParticleSystem.Shape.Box({ size: Vector3.create(6, 0.1, 6) }),
    playbackState: PBParticleSystem_PlaybackState.PS_PLAYING,
    bursts: []
  })

  const viz = createVisualizer(entity, ParticleSystem.Shape.Box({ size: Vector3.create(6, 0.1, 6) }))
  // Label as separate world entity so it isn't flipped by the 180° parent rotation
  addLabel(entity, 'Heavy Rain\nBox | ALPHA | LimitVel', Vector3.create(26, 8, 22))

  return registerPs(entity, 'Heavy Rain', viz)
}

// ─── 10. One-Shot Burst — Sphere r=0.5, loop=false, prewarm=false, burst style ─

function createOneShotBurst(): PsEntry {
  const entity = engine.addEntity()
  Transform.create(entity, { position: Vector3.create(6, 1, 30) })

  ParticleSystem.create(entity, {
    active: true,
    loop: false,
    prewarm: false,
    rate: 0,
    lifetime: 3,
    maxParticles: 150,
    initialSize: { start: 0.1, end: 0.25 },
    sizeOverTime: { start: 1.0, end: 0.0 },
    initialColor: { start: Color4.create(1, 0.8, 0.3, 1), end: Color4.create(1, 0.5, 0.1, 1) },
    colorOverTime: { start: Color4.create(1, 0.7, 0.2, 1), end: Color4.create(1, 1, 1, 0) },
    initialVelocitySpeed: { start: 2, end: 4 },
    limitVelocity: { speed: 2, dampen: 0.6 },
    blendMode: PBParticleSystem_BlendMode.PSB_ALPHA,

    shape: ParticleSystem.Shape.Sphere({ radius: 0.5 }),
    playbackState: PBParticleSystem_PlaybackState.PS_PLAYING,
    bursts: [
      { time: 0, count: 100, cycles: 1, interval: 0.01, probability: 1.0 }
    ]
  })

  const viz = createVisualizer(entity, ParticleSystem.Shape.Sphere({ radius: 0.5 }))
  addLabel(entity, 'One-Shot Burst\nSphere | ALPHA | Burst Emission')

  return registerPs(entity, 'One-Shot Burst', viz)
}

// ─── 11. Asteroid Trail — Cone(angle=10, r=0.1), PSB_ADD, fast, limitVelocity ─

function createAsteroidTrail(): PsEntry {
  const entity = engine.addEntity()
  Transform.create(entity, { position: Vector3.create(16, 1, 30) })

  ParticleSystem.create(entity, {
    active: true,
    rate: 50,
    lifetime: 1.5,
    maxParticles: 200,
    initialSize: { start: 0.05, end: 0.15 },
    sizeOverTime: { start: 1.0, end: 0.0 },
    initialColor: { start: Color4.create(1, 0.7, 0.2, 1), end: Color4.create(0.8, 0.3, 0.1, 1) },
    colorOverTime: { start: Color4.create(1, 0.6, 0.1, 1), end: Color4.create(0.2, 0, 0, 0) },
    initialVelocitySpeed: { start: 5, end: 8 },
    limitVelocity: { speed: 3, dampen: 0.5 },
    gravity: -0.5,
    blendMode: PBParticleSystem_BlendMode.PSB_ADD,
    faceTravelDirection: true,

    shape: ParticleSystem.Shape.Cone({ angle: 10, radius: 0.1 }),
    playbackState: PBParticleSystem_PlaybackState.PS_PLAYING,
    bursts: []
  })

  const viz = createVisualizer(entity, ParticleSystem.Shape.Cone({ angle: 10, radius: 0.1 }))
  addLabel(entity, 'Asteroid Trail\nCone | ADD | LimitVel | FaceDir')

  return registerPs(entity, 'Asteroid Trail', viz)
}

// ─── 12. Purple Swirl — Sphere r=0.3, PSB_ALPHA, purple, additionalForce, rotation

function createPurpleSwirl(): PsEntry {
  const entity = engine.addEntity()
  Transform.create(entity, { position: Vector3.create(26, 1, 30) })

  ParticleSystem.create(entity, {
    active: true,
    rate: 25,
    lifetime: 4,
    maxParticles: 150,
    initialSize: { start: 0.15, end: 0.35 },
    sizeOverTime: { start: 0.8, end: 1.2 },
    initialColor: { start: Color4.create(0.6, 0.1, 1, 1), end: Color4.create(0.8, 0.3, 1, 1) },
    colorOverTime: { start: Color4.create(0.7, 0.2, 1, 1), end: Color4.create(0.4, 0, 0.8, 0) },
    initialVelocitySpeed: { start: 0.5, end: 1.5 },
    rotationOverTime: { start: 0, end: 180 },
    additionalForce: Vector3.create(0.5, 0, 0),
    blendMode: PBParticleSystem_BlendMode.PSB_ALPHA,

    shape: ParticleSystem.Shape.Sphere({ radius: 0.3 }),
    playbackState: PBParticleSystem_PlaybackState.PS_PLAYING,
    bursts: []
  })

  const viz = createVisualizer(entity, ParticleSystem.Shape.Sphere({ radius: 0.3 }))
  addLabel(entity, 'Purple Swirl\nSphere | ALPHA | Force')

  return registerPs(entity, 'Purple Swirl', viz)
}

// ─── 13. Bee Swarm — Sphere r=1.0, PSB_ALPHA, bee spritesheet 1×20 ────────────

function createBeeSwarm(): PsEntry {
  const entity = engine.addEntity()
  Transform.create(entity, { position: Vector3.create(6, 1.5, 38) })

  ParticleSystem.create(entity, {
    active: true,
    rate: 8,
    lifetime: 5,
    maxParticles: 40,
    initialSize: { start: 0.4, end: 0.6 },
    sizeOverTime: { start: 1.0, end: 1.0 },
    initialColor: { start: Color4.create(1, 1, 1, 1), end: Color4.create(1, 1, 1, 1) },
    colorOverTime: { start: Color4.create(1, 1, 1, 1), end: Color4.create(1, 1, 1, 0) },
    initialVelocitySpeed: { start: 0.3, end: 0.8 },
    rotationOverTime: { start: -10, end: 10 },
    blendMode: PBParticleSystem_BlendMode.PSB_ALPHA,

    texture: { src: 'assets/dcl-particles/bee.png' },
    spriteSheet: { tilesX: 1, tilesY: 20, framesPerSecond: 30 },
    shape: ParticleSystem.Shape.Sphere({ radius: 1.0 }),
    playbackState: PBParticleSystem_PlaybackState.PS_PLAYING,
    bursts: []
  })

  const viz = createVisualizer(entity, ParticleSystem.Shape.Sphere({ radius: 1.0 }))
  addLabel(entity, 'Bee Swarm\nSphere | ALPHA | Sheet 1x20')

  return registerPs(entity, 'Bee Swarm', viz)
}

// ─── 14. Fireworks Loop — Cone, PSB_ADD, loop=true, 3 staggered bursts ────────

function createFireworksLoop(): PsEntry {
  const entity = engine.addEntity()
  Transform.create(entity, { position: Vector3.create(14, 1, 38) })

  ParticleSystem.create(entity, {
    active: true,
    loop: true,
    rate: 0,
    lifetime: 2,
    maxParticles: 300,
    initialSize: { start: 0.08, end: 0.18 },
    sizeOverTime: { start: 1.0, end: 0.0 },
    initialColor: { start: Color4.create(1, 0.9, 0.4, 1), end: Color4.create(1, 0.4, 0.1, 1) },
    colorOverTime: { start: Color4.create(1, 0.8, 0.5, 1), end: Color4.create(0.8, 0.2, 0, 0) },
    initialVelocitySpeed: { start: 3, end: 6 },
    gravity: -1,
    blendMode: PBParticleSystem_BlendMode.PSB_ADD,

    shape: ParticleSystem.Shape.Cone({ angle: 30, radius: 0.2 }),
    playbackState: PBParticleSystem_PlaybackState.PS_PLAYING,
    bursts: [
      { time: 0, count: 40, cycles: 2, interval: 0.15, probability: 1.0 },
      { time: 0.5, count: 60, cycles: 1, interval: 0.01, probability: 0.8 },
      { time: 1.2, count: 30, cycles: 3, interval: 0.1, probability: 0.9 }
    ]
  })

  const viz = createVisualizer(entity, ParticleSystem.Shape.Cone({ angle: 30, radius: 0.2 }))
  addLabel(entity, 'Fireworks Loop\nCone | ADD | 3 Bursts | Loop')

  return registerPs(entity, 'Fireworks Loop', viz)
}

// ─── 15. Campfire — Point, PSB_ADD, sprite_fire3 spritesheet 4×3 ─────────────

function createCampfire(): PsEntry {
  const entity = engine.addEntity()
  Transform.create(entity, { position: Vector3.create(22, 1, 38) })

  ParticleSystem.create(entity, {
    active: true,
    rate: 12,
    lifetime: 1.8,
    maxParticles: 40,
    initialSize: { start: 0.8, end: 1.4 },
    sizeOverTime: { start: 1.0, end: 0.3 },
    initialColor: { start: Color4.create(1, 0.9, 0.7, 1), end: Color4.create(1, 0.7, 0.3, 1) },
    colorOverTime: { start: Color4.create(1, 0.8, 0.5, 1), end: Color4.create(0.4, 0.1, 0, 0) },
    initialVelocitySpeed: { start: 0.3, end: 0.8 },
    gravity: -0.5,
    blendMode: PBParticleSystem_BlendMode.PSB_ADD,

    texture: { src: 'assets/dcl-particles/sprite_fire3.png' },
    spriteSheet: { tilesX: 4, tilesY: 3, framesPerSecond: 12 },
    shape: ParticleSystem.Shape.Point(),
    playbackState: PBParticleSystem_PlaybackState.PS_PLAYING,
    bursts: []
  })

  const viz = createVisualizer(entity, ParticleSystem.Shape.Point())
  addLabel(entity, 'Campfire\nPoint | ADD | Sheet 4x3')

  return registerPs(entity, 'Campfire', viz)
}

// ─── 16. Flame Wisps — Cone(angle=20, r=0.3), PSB_ADD, sprite_flame 4×3 ──────

function createFlameWisps(): PsEntry {
  const entity = engine.addEntity()
  Transform.create(entity, { position: Vector3.create(30, 1, 38) })

  ParticleSystem.create(entity, {
    active: true,
    rate: 10,
    lifetime: 2,
    maxParticles: 50,
    initialSize: { start: 0.5, end: 1.0 },
    sizeOverTime: { start: 1.0, end: 0.0 },
    initialColor: { start: Color4.create(1, 0.8, 0.6, 0.9), end: Color4.create(1, 0.5, 0.2, 0.9) },
    colorOverTime: { start: Color4.create(1, 0.7, 0.4, 0.8), end: Color4.create(0.8, 0.2, 0.05, 0) },
    initialVelocitySpeed: { start: 0.5, end: 1.2 },
    gravity: -0.4,
    rotationOverTime: { start: -30, end: 30 },
    blendMode: PBParticleSystem_BlendMode.PSB_ADD,

    texture: { src: 'assets/dcl-particles/sprite_flame.png' },
    spriteSheet: { tilesX: 4, tilesY: 3, framesPerSecond: 10 },
    shape: ParticleSystem.Shape.Cone({ angle: 20, radius: 0.3 }),
    playbackState: PBParticleSystem_PlaybackState.PS_PLAYING,
    bursts: []
  })

  const viz = createVisualizer(entity, ParticleSystem.Shape.Cone({ angle: 20, radius: 0.3 }))
  addLabel(entity, 'Flame Wisps\nCone | ADD | Sheet 4x3')

  return registerPs(entity, 'Flame Wisps', viz)
}

// ─── 17. Moving Trail — Point, PSB_ADD, Tween YOYO, SimulationSpace demo ─────

function createMovingTrail(): PsEntry {
  const entity = engine.addEntity()
  const posA = Vector3.create(6, 1, 44)
  const posB = Vector3.create(26, 1, 44)
  Transform.create(entity, { position: posA })

  ParticleSystem.create(entity, {
    active: true,
    rate: 40,
    lifetime: 2,
    maxParticles: 200,
    initialSize: { start: 0.1, end: 0.2 },
    sizeOverTime: { start: 1.0, end: 0.0 },
    initialColor: { start: Color4.create(0.2, 1, 0.5, 1), end: Color4.create(0.1, 0.8, 1, 1) },
    colorOverTime: { start: Color4.create(0.3, 1, 0.7, 1), end: Color4.create(0, 0.3, 0.5, 0) },
    initialVelocitySpeed: { start: 0.5, end: 1.5 },
    blendMode: PBParticleSystem_BlendMode.PSB_ADD,

    shape: ParticleSystem.Shape.Point(),
    simulationSpace: PBParticleSystem_SimulationSpace.PSS_LOCAL,
    playbackState: PBParticleSystem_PlaybackState.PS_PLAYING,
    bursts: []
  })

  Tween.create(entity, {
    mode: Tween.Mode.Move({ start: posA, end: posB }),
    duration: 3000,
    easingFunction: EasingFunction.EF_LINEAR
  })
  TweenSequence.create(entity, {
    sequence: [
      { mode: Tween.Mode.Move({ start: posB, end: posA }), duration: 3000, easingFunction: EasingFunction.EF_LINEAR }
    ],
    loop: TweenLoop.TL_RESTART
  })

  const viz = createVisualizer(entity, ParticleSystem.Shape.Point())
  addLabel(entity, 'Moving Trail\nPoint | ADD | SimSpace')

  return registerPs(entity, 'Moving Trail', viz)
}

// ─── Ground ───────────────────────────────────────────────────────────────────

function addGround(): void {
  const ground = engine.addEntity()
  Transform.create(ground, {
    position: Vector3.create(16, 0, 24),
    scale: Vector3.create(32, 0.1, 48)
  })
  MeshRenderer.setBox(ground)
  MeshCollider.setBox(ground)
}

// ─── Proximity System ─────────────────────────────────────────────────────────

engine.addSystem((_deltaTime: number) => {
  const playerTransform = Transform.getOrNull(engine.PlayerEntity)
  if (!playerTransform) return

  const playerPos = playerTransform.position
  let nearest: PsEntry | undefined
  let nearestDist = PROXIMITY_DIST

  for (const entry of psEntries) {
    const transform = Transform.getOrNull(entry.entity)
    if (!transform) continue
    const dx = playerPos.x - transform.position.x
    const dz = playerPos.z - transform.position.z
    const dist = Math.sqrt(dx * dx + dz * dz)
    if (dist < nearestDist) {
      nearestDist = dist
      nearest = entry
    }
  }

  currentPsEntry = nearest
})

// ─── Shape Visualizer Sync System ────────────────────────────────────────────

const lastShapeState = new Map<Entity, string>()

function serializeShape(shape: NonNullable<ReturnType<typeof ParticleSystem.getOrNull>>['shape']): string {
  if (!shape) return 'point'
  switch (shape.$case) {
    case 'point': return 'point'
    case 'sphere': return `sphere:${shape.sphere.radius ?? 1}`
    case 'cone': return `cone:${shape.cone.angle ?? 25}:${shape.cone.radius ?? 1}`
    case 'box': {
      const s = shape.box.size ?? Vector3.create(1, 1, 1)
      return `box:${s.x}:${s.y}:${s.z}`
    }
    default: return 'point'
  }
}

engine.addSystem(() => {
  for (const entry of psEntries) {
    const ps = ParticleSystem.getOrNull(entry.entity)
    if (!ps) continue

    const currentKey = serializeShape(ps.shape)
    const prevKey = lastShapeState.get(entry.entity)

    if (prevKey !== currentKey) {
      lastShapeState.set(entry.entity, currentKey)
      applyShapeToVisualizer(entry.vizEntity, ps.shape)
    }
  }
})

// ─── Main ─────────────────────────────────────────────────────────────────────

addGround()

createFireEmber()
createMagicAura()
createSnowfall()
createSpriteFlame()
createGravityFountain()
createBatSwarm()
createSmokeHaze()
createLightningSparks()
createHeavyRain()
createOneShotBurst()
createAsteroidTrail()
createPurpleSwirl()
createBeeSwarm()
createFireworksLoop()
createCampfire()
createFlameWisps()
createMovingTrail()

setupUI()
