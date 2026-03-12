import {
  engine,
  Entity,
  Transform,
  MeshRenderer,
  MeshCollider,
  TextShape,
  Billboard,
  Material,
  MaterialTransparencyMode
} from '@dcl/sdk/ecs'
import {
  ParticleSystem,
  PBParticleSystem_BlendMode,
  PBParticleSystem_PlaybackState
} from '@dcl/sdk/ecs'
import { Color4, Vector3, Quaternion } from '@dcl/sdk/math'
import { setupUI } from './ui'

// ─── Types ────────────────────────────────────────────────────────────────────

export type PsEntry = { entity: Entity; name: string }

export const psEntries: PsEntry[] = []

let currentPsEntry: PsEntry | undefined

export function getCurrentPsEntry(): PsEntry | undefined {
  return currentPsEntry
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PROXIMITY_DIST = 5
const SHAPE_COLOR = Color4.create(0.4, 0.9, 1, 0.18)

// ─── Shape Visualizers ────────────────────────────────────────────────────────

function addPointVisualizer(parent: Entity): void {
  const vizEntity = engine.addEntity()
  Transform.create(vizEntity, {
    parent,
    position: Vector3.create(0, 0, 0),
    scale: Vector3.create(0.15, 0.15, 0.15)
  })
  MeshRenderer.setSphere(vizEntity)
  Material.setPbrMaterial(vizEntity, {
    albedoColor: SHAPE_COLOR,
    transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND
  })
}

function addSphereVisualizer(parent: Entity, radius: number): void {
  const vizEntity = engine.addEntity()
  const diameter = radius * 2
  Transform.create(vizEntity, {
    parent,
    position: Vector3.create(0, 0, 0),
    scale: Vector3.create(diameter, diameter, diameter)
  })
  MeshRenderer.setSphere(vizEntity)
  Material.setPbrMaterial(vizEntity, {
    albedoColor: SHAPE_COLOR,
    transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND
  })
}

function addConeVisualizer(parent: Entity, radius: number): void {
  const vizEntity = engine.addEntity()
  Transform.create(vizEntity, {
    parent,
    position: Vector3.create(0, 0, 0),
    scale: Vector3.create(radius * 2, 0.05, radius * 2)
  })
  MeshRenderer.setCylinder(vizEntity, radius, 0)
  Material.setPbrMaterial(vizEntity, {
    albedoColor: SHAPE_COLOR,
    transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND
  })
}

function addBoxVisualizer(parent: Entity, sizeX: number, sizeY: number, sizeZ: number): void {
  const vizEntity = engine.addEntity()
  Transform.create(vizEntity, {
    parent,
    position: Vector3.create(0, 0, 0),
    scale: Vector3.create(sizeX, sizeY, sizeZ)
  })
  MeshRenderer.setBox(vizEntity)
  Material.setPbrMaterial(vizEntity, {
    albedoColor: SHAPE_COLOR,
    transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND
  })
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
  TextShape.create(label, { text, fontSize: 1.5 })
  Billboard.create(label)
}

// ─── Register Helper ──────────────────────────────────────────────────────────

function registerPs(entity: Entity, name: string): PsEntry {
  const entry: PsEntry = { entity, name }
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
    billboard: true,
    shape: ParticleSystem.Shape.Point(),
    playbackState: PBParticleSystem_PlaybackState.PS_PLAYING
  })

  addPointVisualizer(entity)
  addLabel(entity, 'Fire Ember\nPoint | ADD')

  return registerPs(entity, 'Fire Ember')
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
    billboard: true,
    shape: ParticleSystem.Shape.Sphere({ radius: 0.8 }),
    playbackState: PBParticleSystem_PlaybackState.PS_PLAYING
  })

  addSphereVisualizer(entity, 0.8)
  addLabel(entity, 'Magic Aura\nSphere | ALPHA')

  return registerPs(entity, 'Magic Aura')
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
    billboard: true,
    shape: ParticleSystem.Shape.Cone({ angle: 15, radius: 2 }),
    playbackState: PBParticleSystem_PlaybackState.PS_PLAYING
  })

  addConeVisualizer(entity, 2)
  // Label as separate world entity so it isn't flipped by the 180° parent rotation
  addLabel(entity, 'Snowfall\nCone | ALPHA', Vector3.create(26, 7, 6))

  return registerPs(entity, 'Snowfall')
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
    billboard: true,
    spriteSheet: { tilesX: 4, tilesY: 4, startFrame: 0, endFrame: 15, cyclesPerLifetime: 1 },
    shape: ParticleSystem.Shape.Box({ size: Vector3.create(0.5, 0.1, 0.5) }),
    playbackState: PBParticleSystem_PlaybackState.PS_PLAYING
  })

  addBoxVisualizer(entity, 0.5, 0.1, 0.5)
  addLabel(entity, 'Sprite Flame\nBox | ADD | Sheet')

  return registerPs(entity, 'Sprite Flame')
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
    billboard: true,
    shape: ParticleSystem.Shape.Sphere({ radius: 0.1 }),
    playbackState: PBParticleSystem_PlaybackState.PS_PLAYING
  })

  addSphereVisualizer(entity, 0.1)
  addLabel(entity, 'Gravity Fountain\nSphere | ALPHA')

  return registerPs(entity, 'Gravity Fountain')
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
    billboard: true,
    texture: { src: 'assets/32x32-bat-sprite.png' },
    spriteSheet: { tilesX: 4, tilesY: 4, startFrame: 0, endFrame: 15, cyclesPerLifetime: 3 },
    shape: ParticleSystem.Shape.Sphere({ radius: 1.5 }),
    playbackState: PBParticleSystem_PlaybackState.PS_PLAYING
  })

  addSphereVisualizer(entity, 1.5)
  addLabel(entity, 'Bat Swarm\nSphere | ALPHA | Sheet')

  return registerPs(entity, 'Bat Swarm')
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
    billboard: true,
    shape: ParticleSystem.Shape.Sphere({ radius: 1.2 }),
    playbackState: PBParticleSystem_PlaybackState.PS_PLAYING
  })

  addSphereVisualizer(entity, 1.2)
  addLabel(entity, 'Smoke Haze\nSphere | ALPHA | Prewarm')

  return registerPs(entity, 'Smoke Haze')
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
    billboard: true,
    shape: ParticleSystem.Shape.Point(),
    playbackState: PBParticleSystem_PlaybackState.PS_PLAYING
  })

  addPointVisualizer(entity)
  addLabel(entity, 'Lightning Sparks\nPoint | ADD | LimitVel')

  return registerPs(entity, 'Lightning Sparks')
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
    billboard: true,
    shape: ParticleSystem.Shape.Box({ size: Vector3.create(6, 0.1, 6) }),
    playbackState: PBParticleSystem_PlaybackState.PS_PLAYING
  })

  addBoxVisualizer(entity, 6, 0.1, 6)
  // Label as separate world entity so it isn't flipped by the 180° parent rotation
  addLabel(entity, 'Heavy Rain\nBox | ALPHA | LimitVel', Vector3.create(26, 8, 22))

  return registerPs(entity, 'Heavy Rain')
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
    billboard: true,
    shape: ParticleSystem.Shape.Sphere({ radius: 0.5 }),
    playbackState: PBParticleSystem_PlaybackState.PS_PLAYING
  })

  addSphereVisualizer(entity, 0.5)
  addLabel(entity, 'One-Shot Burst\nSphere | ALPHA | No Loop')

  return registerPs(entity, 'One-Shot Burst')
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
    billboard: true,
    shape: ParticleSystem.Shape.Cone({ angle: 10, radius: 0.1 }),
    playbackState: PBParticleSystem_PlaybackState.PS_PLAYING
  })

  addConeVisualizer(entity, 0.1)
  addLabel(entity, 'Asteroid Trail\nCone | ADD | LimitVel')

  return registerPs(entity, 'Asteroid Trail')
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
    billboard: true,
    shape: ParticleSystem.Shape.Sphere({ radius: 0.3 }),
    playbackState: PBParticleSystem_PlaybackState.PS_PLAYING
  })

  addSphereVisualizer(entity, 0.3)
  addLabel(entity, 'Purple Swirl\nSphere | ALPHA | Force')

  return registerPs(entity, 'Purple Swirl')
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
    billboard: true,
    texture: { src: 'assets/dcl-particles/bee.png' },
    spriteSheet: { tilesX: 1, tilesY: 20, startFrame: 0, endFrame: 19, cyclesPerLifetime: 6 },
    shape: ParticleSystem.Shape.Sphere({ radius: 1.0 }),
    playbackState: PBParticleSystem_PlaybackState.PS_PLAYING
  })

  addSphereVisualizer(entity, 1.0)
  addLabel(entity, 'Bee Swarm\nSphere | ALPHA | Sheet 1x20')

  return registerPs(entity, 'Bee Swarm')
}

// ─── 14. Toxic Pumpkin — Point, PSB_ALPHA, rottenpumpkin spritesheet 2×2 ──────

function createToxicPumpkin(): PsEntry {
  const entity = engine.addEntity()
  Transform.create(entity, { position: Vector3.create(14, 1, 38) })

  ParticleSystem.create(entity, {
    active: true,
    rate: 6,
    lifetime: 3,
    maxParticles: 30,
    initialSize: { start: 0.6, end: 1.2 },
    sizeOverTime: { start: 0.8, end: 1.5 },
    initialColor: { start: Color4.create(0.4, 0.8, 0.2, 0.9), end: Color4.create(0.2, 0.6, 0.1, 0.9) },
    colorOverTime: { start: Color4.create(0.3, 0.7, 0.2, 0.8), end: Color4.create(0.1, 0.4, 0.05, 0) },
    initialVelocitySpeed: { start: 0.2, end: 0.5 },
    gravity: -0.2,
    blendMode: PBParticleSystem_BlendMode.PSB_ALPHA,
    billboard: true,
    texture: { src: 'assets/dcl-particles/rottenpumpkin.png' },
    spriteSheet: { tilesX: 2, tilesY: 2, startFrame: 0, endFrame: 3, cyclesPerLifetime: 1 },
    shape: ParticleSystem.Shape.Point(),
    playbackState: PBParticleSystem_PlaybackState.PS_PLAYING
  })

  addPointVisualizer(entity)
  addLabel(entity, 'Toxic Pumpkin\nPoint | ALPHA | Sheet 2x2')

  return registerPs(entity, 'Toxic Pumpkin')
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
    billboard: true,
    texture: { src: 'assets/dcl-particles/sprite_fire3.png' },
    spriteSheet: { tilesX: 4, tilesY: 3, startFrame: 0, endFrame: 11, cyclesPerLifetime: 2 },
    shape: ParticleSystem.Shape.Point(),
    playbackState: PBParticleSystem_PlaybackState.PS_PLAYING
  })

  addPointVisualizer(entity)
  addLabel(entity, 'Campfire\nPoint | ADD | Sheet 4x3')

  return registerPs(entity, 'Campfire')
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
    billboard: true,
    texture: { src: 'assets/dcl-particles/sprite_flame.png' },
    spriteSheet: { tilesX: 4, tilesY: 3, startFrame: 0, endFrame: 11, cyclesPerLifetime: 1 },
    shape: ParticleSystem.Shape.Cone({ angle: 20, radius: 0.3 }),
    playbackState: PBParticleSystem_PlaybackState.PS_PLAYING
  })

  addConeVisualizer(entity, 0.3)
  addLabel(entity, 'Flame Wisps\nCone | ADD | Sheet 4x3')

  return registerPs(entity, 'Flame Wisps')
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
    const dist = Vector3.distance(playerPos, transform.position)
    if (dist < nearestDist) {
      nearestDist = dist
      nearest = entry
    }
  }

  currentPsEntry = nearest
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
createToxicPumpkin()
createCampfire()
createFlameWisps()

setupUI()
