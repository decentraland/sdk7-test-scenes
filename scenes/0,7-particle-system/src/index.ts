import {
  engine,
  Transform,
  MeshRenderer,
  MeshCollider,
  Entity
} from '@dcl/sdk/ecs'
import {
  ParticleSystem,
  PBParticleSystem_BlendMode,
  PBParticleSystem_PlaybackState
} from '@dcl/sdk/ecs'
import { Color4, Vector3, Quaternion } from '@dcl/sdk/math'
import { setupUI } from './ui'

// ─── Helper ──────────────────────────────────────────────────────────────────

function addGround() {
  const ground = engine.addEntity()
  Transform.create(ground, { position: Vector3.create(8, 0, 8), scale: Vector3.create(16, 0.1, 16) })
  MeshRenderer.setBox(ground)
  MeshCollider.setBox(ground)
}

// ─── 1. Point emitter — fire ember (additive, warm-to-cool color) ─────────────

function createFireEmber(): Entity {
  const entity = engine.addEntity()
  Transform.create(entity, { position: Vector3.create(2, 0.5, 4) })

  ParticleSystem.create(entity, {
    active: true,
    rate: 30,
    lifetime: 2,
    maxParticles: 200,
    initialSize: { start: 0.1, end: 0.3 },
    sizeOverTime: { start: 1.0, end: 0.0 },
    initialColor: { start: Color4.create(1, 0.6, 0.1, 1), end: Color4.create(1, 0.2, 0, 1) },
    colorOverTime: { start: Color4.create(1, 0.6, 0.1, 1), end: Color4.create(0.2, 0, 0, 0) },
    initialVelocitySpeed: { start: 1.5, end: 2.5 },
    gravity: -0.3,
    blendMode: PBParticleSystem_BlendMode.PSB_ADD,
    billboard: true,
    shape: ParticleSystem.Shape.Point(),
    playbackState: PBParticleSystem_PlaybackState.PS_PLAYING
  })

  return entity
}

// ─── 2. Sphere emitter — magic aura (alpha, blue-to-white color) ──────────────

function createMagicAura(): Entity {
  const entity = engine.addEntity()
  Transform.create(entity, { position: Vector3.create(6, 0.5, 4) })

  ParticleSystem.create(entity, {
    active: true,
    rate: 15,
    lifetime: 3,
    maxParticles: 150,
    initialSize: { start: 0.2, end: 0.5 },
    sizeOverTime: { start: 0.5, end: 1.2 },
    initialColor: { start: Color4.create(0.2, 0.5, 1, 1), end: Color4.create(0.5, 0.8, 1, 1) },
    colorOverTime: { start: Color4.create(0.4, 0.6, 1, 1), end: Color4.create(1, 1, 1, 0) },
    initialVelocitySpeed: { start: 0.5, end: 1.0 },
    rotationOverTime: { start: 0, end: 90 },
    blendMode: PBParticleSystem_BlendMode.PSB_ALPHA,
    billboard: true,
    shape: ParticleSystem.Shape.Sphere({ radius: 0.8 }),
    playbackState: PBParticleSystem_PlaybackState.PS_PLAYING
  })

  return entity
}

// ─── 3. Cone emitter — rain/snow (alpha, downward gravity) ────────────────────

function createSnowfall(): Entity {
  const entity = engine.addEntity()
  Transform.create(entity, {
    position: Vector3.create(10, 4, 4),
    rotation: Quaternion.fromEulerDegrees(180, 0, 0)  // cone points downward
  })

  ParticleSystem.create(entity, {
    active: true,
    rate: 20,
    lifetime: 4,
    maxParticles: 300,
    initialSize: { start: 0.08, end: 0.15 },
    sizeOverTime: { start: 1.0, end: 0.8 },
    initialColor: { start: Color4.create(0.9, 0.95, 1, 0.8), end: Color4.create(0.9, 0.95, 1, 0.8) },
    colorOverTime: { start: Color4.create(1, 1, 1, 0.8), end: Color4.create(1, 1, 1, 0) },
    initialVelocitySpeed: { start: 2, end: 3 },
    gravity: 1.5,
    blendMode: PBParticleSystem_BlendMode.PSB_ALPHA,
    billboard: true,
    shape: ParticleSystem.Shape.Cone({ angle: 15, radius: 2 }),
    playbackState: PBParticleSystem_PlaybackState.PS_PLAYING
  })

  return entity
}

// ─── 4. Box emitter — sprite sheet flame ──────────────────────────────────────

function createSpriteFlame(): Entity {
  const entity = engine.addEntity()
  Transform.create(entity, { position: Vector3.create(2, 0.5, 10) })

  ParticleSystem.create(entity, {
    active: true,
    rate: 12,
    lifetime: 1.5,
    maxParticles: 60,
    initialSize: { start: 0.8, end: 1.2 },
    sizeOverTime: { start: 1.0, end: 0.3 },
    initialColor: { start: Color4.create(1, 0.8, 0.4, 1), end: Color4.create(1, 0.5, 0.1, 1) },
    colorOverTime: { start: Color4.create(1, 0.7, 0.3, 1), end: Color4.create(0.5, 0, 0, 0) },
    initialVelocitySpeed: { start: 0.5, end: 1.0 },
    blendMode: PBParticleSystem_BlendMode.PSB_ADD,
    billboard: true,
    spriteSheet: { tilesX: 4, tilesY: 4, startFrame: 0, endFrame: 15, cyclesPerLifetime: 1 },
    shape: ParticleSystem.Shape.Box({ size: Vector3.create(0.5, 0.1, 0.5) }),
    playbackState: PBParticleSystem_PlaybackState.PS_PLAYING
  })

  return entity
}

// ─── 5. Sphere emitter — gravity fountain ─────────────────────────────────────

function createGravityFountain(): Entity {
  const entity = engine.addEntity()
  Transform.create(entity, { position: Vector3.create(6, 0.2, 10) })

  ParticleSystem.create(entity, {
    active: true,
    rate: 25,
    lifetime: 3,
    maxParticles: 200,
    initialSize: { start: 0.15, end: 0.25 },
    sizeOverTime: { start: 1.0, end: 0.5 },
    initialColor: { start: Color4.create(0.3, 0.8, 1, 1), end: Color4.create(0.1, 0.5, 1, 1) },
    colorOverTime: { start: Color4.create(0.5, 0.9, 1, 1), end: Color4.create(0.1, 0.3, 0.8, 0) },
    initialVelocitySpeed: { start: 3, end: 5 },
    gravity: -2.5,
    additionalForce: Vector3.create(0, 0, 0),
    blendMode: PBParticleSystem_BlendMode.PSB_ALPHA,
    billboard: true,
    shape: ParticleSystem.Shape.Sphere({ radius: 0.1 }),
    playbackState: PBParticleSystem_PlaybackState.PS_PLAYING
  })

  return entity
}

// ─── 6. Lifecycle demo — controlled via UI ────────────────────────────────────

export let controlEntity: Entity

function createControlDemo(): Entity {
  const entity = engine.addEntity()
  Transform.create(entity, { position: Vector3.create(10, 0.5, 10) })

  ParticleSystem.create(entity, {
    active: true,
    rate: 20,
    lifetime: 2,
    maxParticles: 100,
    initialSize: { start: 0.2, end: 0.4 },
    initialColor: { start: Color4.create(0.8, 0.4, 1, 1), end: Color4.create(0.4, 0.1, 0.8, 1) },
    colorOverTime: { start: Color4.create(0.8, 0.4, 1, 1), end: Color4.create(0.4, 0.1, 0.8, 0) },
    initialVelocitySpeed: { start: 1, end: 2 },
    blendMode: PBParticleSystem_BlendMode.PSB_ALPHA,
    billboard: true,
    shape: ParticleSystem.Shape.Sphere({ radius: 0.3 }),
    playbackState: PBParticleSystem_PlaybackState.PS_PLAYING
  })

  return entity
}

// ─── Main ─────────────────────────────────────────────────────────────────────

addGround()
createFireEmber()
createMagicAura()
createSnowfall()
createSpriteFlame()
createGravityFountain()
controlEntity = createControlDemo()

setupUI()
