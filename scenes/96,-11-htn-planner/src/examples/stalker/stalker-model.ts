// Primitive visual adapter: HTN actions choose rig clips; this driver turns them into primitive poses.
// No Animator is attached to these meshes. For a skinned GLTF, replace this adapter with the SDK Animator
// recipe in htn-planner/HOW-TO.md. Keep the same rig and change clips only on transitions/retriggers.
import { engine, Entity, Material, MeshRenderer, Name, Transform } from '@dcl/sdk/ecs'
import { Quaternion } from '@dcl/sdk/math'
import type { Vec3 } from '../../htn-planner'
import type { StalkerClip } from './stalker-actions'
import { isOneShotClip, StalkerRig } from './stalker-rig'
import { StalkerAudio } from './stalker-audio'

export const STALKER_HEIGHT = 3.18
export const STALKER_BODY_NAME = 'HTN stalker primitives'
const HIDDEN_Y = -40
export type StalkerAnimation = 'idle' | 'walk' | 'run' | 'look' | 'turn'
const animationFor = (clip: StalkerClip): StalkerAnimation =>
  clip === 'PatrolWalk' ? 'walk' : clip === 'AggroRun' ? 'run' : clip === 'HeadTurnLeft' ? 'look' : clip === 'PatrolTurn' || clip === 'BodyTurnLeft' ? 'turn' : 'idle'
const COLORS = {
  idle: { r: 0.25, g: 0.55, b: 0.8 }, walk: { r: 0.15, g: 0.7, b: 0.65 }, run: { r: 0.95, g: 0.25, b: 0.15 },
  look: { r: 0.75, g: 0.45, b: 0.9 }, turn: { r: 0.85, g: 0.6, b: 0.15 }
}

export interface StalkerModelOptions { parent?: Entity; scale: number; sound?: boolean }

/** A readable puppet: joint pivots stay separate from scaled meshes so limbs rotate at shoulders/hips. */
export class StalkerModel {
  readonly root: Entity
  readonly model: Entity
  readonly hit: Entity
  readonly head: Entity
  readonly eyes: readonly Entity[]
  readonly arms: readonly Entity[]
  readonly legs: readonly Entity[]
  animation: StalkerAnimation = 'idle'
  private readonly parts: Entity[] = []
  private readonly chest: Entity
  readonly audio: StalkerAudio | null
  private rig: StalkerRig | null = null
  private clip: StalkerClip | '' = ''
  private starts = -1
  private elapsed = 0
  private cueSeen = 0
  private flash = 0
  private paintKey = ''

  constructor(private readonly opts: StalkerModelOptions) {
    this.root = this.part(opts.parent)
    this.model = this.part(this.root)
    Transform.getMutable(this.model).scale = { x: opts.scale, y: opts.scale, z: opts.scale }
    Name.create(this.model, { value: STALKER_BODY_NAME })
    this.chest = this.part(this.model, { x: 0, y: 1.75, z: 0 })
    this.mesh(this.chest, 'cylinder', { x: 0, y: 0, z: 0 }, { x: 0.9, y: 0.9, z: 0.9 })
    for (const y of [-0.45, 0.45]) this.mesh(this.chest, 'sphere', { x: 0, y, z: 0 }, { x: 0.9, y: 0.9, z: 0.9 })
    this.head = this.part(this.model, { x: 0, y: 2.7, z: 0 })
    this.mesh(this.head, 'sphere', { x: 0, y: 0, z: 0 }, { x: 0.96, y: 0.96, z: 0.96 }, { r: 0.9, g: 0.9, b: 0.8 })
    // At Ambush scale 0.8 the eyes sit at 2.2 m, matching the actual perception origin.
    this.eyes = [-0.19, 0.19].map(x => this.mesh(this.head, 'sphere', { x, y: 0.05, z: 0.42 }, { x: 0.16, y: 0.16, z: 0.12 }, { r: 0.05, g: 0.08, b: 0.1 }))
    this.mesh(this.head, 'box', { x: 0, y: -0.12, z: 0.5 }, { x: 0.18, y: 0.16, z: 0.24 }, { r: 1, g: 0.65, b: 0.1 })
    this.arms = [-0.68, 0.68].map(x => this.limb({ x, y: 2.05, z: 0 }, 1.2, 0.3))
    this.legs = [-0.27, 0.27].map(x => this.limb({ x, y: 1.25, z: 0 }, 1.25, 0.32))
    this.audio = opts.sound === false ? null : new StalkerAudio(this.root, this.height)
    this.hit = this.part(this.root, { x: 0, y: this.height * 0.4, z: 0 })
    Transform.getMutable(this.hit).scale = { x: 1.3 * opts.scale, y: this.height * 0.8, z: 1.3 * opts.scale }
  }

  get height(): number { return STALKER_HEIGHT * this.opts.scale }

  update(dt: number, rig: StalkerRig, pose: { position: Vec3; yaw: number }, shown: boolean): void {
    const delta = Math.max(0, dt)
    this.audio?.update(delta, rig, shown)
    if (rig !== this.rig) {
      this.rig = rig
      this.clip = ''
      this.starts = -1
      this.elapsed = 0
      this.cueSeen = rig.cueSeq
      this.flash = 0
    }
    const root = Transform.getMutable(this.root)
    root.position = { x: pose.position.x, y: shown ? pose.position.y : HIDDEN_Y, z: pose.position.z }
    root.rotation = Quaternion.fromEulerDegrees(0, pose.yaw * 180 / Math.PI, 0)
    if (!shown) { this.cueSeen = rig.cueSeq; return }

    // This is the animation switch: loops keep their phase; a repeated one-shot explicitly restarts.
    const restart = rig.clip !== this.clip || (isOneShotClip(rig.clip) && rig.clipStarts !== this.starts)
    if (restart) this.elapsed = 0
    this.clip = rig.clip
    this.starts = rig.clipStarts
    this.animation = animationFor(rig.clip)
    this.elapsed += delta * Math.max(0, rig.speed)
    this.flash = Math.max(0, this.flash - delta)
    if (rig.cueSeq !== this.cueSeen) { this.cueSeen = rig.cueSeq; this.flash = 0.65 }
    const paintKey = this.flash > 0 ? 'cue' : this.animation
    if (paintKey !== this.paintKey) {
      this.paintKey = paintKey
      const color = paintKey === 'cue' ? { r: 1, g: 0.85, b: 0.15 } : COLORS[this.animation]
      // Paint the torso only; the contrasting face and limbs remain easy to read from the camera.
      for (const e of this.parts) if (Transform.get(e).parent === this.chest) Material.setPbrMaterial(e, { albedoColor: { ...color, a: 1 }, roughness: 1, metallic: 0 })
    }
    this.pose(rig)
  }

  private pose(rig: StalkerRig): void {
    const moving = this.animation === 'walk' || this.animation === 'run'
    const run = this.animation === 'run'
    const cycle = run ? 0.8 : 3.2
    const wave = Math.sin(this.elapsed * Math.PI * 2 / cycle)
    const swing = moving ? wave * (run ? 48 : 30) : this.animation === 'turn' ? Math.sin(this.elapsed * 4) * 8 : 0
    this.legs.forEach((e, i) => { Transform.getMutable(e).rotation = Quaternion.fromEulerDegrees((i ? -1 : 1) * swing, 0, 0) })
    this.arms.forEach((e, i) => { Transform.getMutable(e).rotation = Quaternion.fromEulerDegrees((i ? 1 : -1) * swing, 0, (i ? -1 : 1) * (run ? 15 : 6)) })
    const model = Transform.getMutable(this.model)
    model.position.y = moving ? Math.abs(wave) * (run ? 0.16 : 0.07) : Math.sin(this.elapsed * 2) * 0.025
    Transform.getMutable(this.chest).rotation = Quaternion.fromEulerDegrees(run ? 12 : 0, 0, 0)
    const headYaw = this.animation === 'look' ? -90 * Math.sin(Math.min(1, this.elapsed / 1.8) * Math.PI / 2) : rig.gaze.degrees
    Transform.getMutable(this.head).rotation = Quaternion.fromEulerDegrees(0, headYaw, 0)
  }

  private part(parent?: Entity, position = { x: 0, y: 0, z: 0 }): Entity {
    const e = engine.addEntity()
    this.parts.push(e)
    Transform.create(e, { position, ...(parent !== undefined ? { parent } : {}) })
    return e
  }
  private mesh(parent: Entity, shape: 'sphere' | 'cylinder' | 'box', position: Vec3, scale: Vec3, color = { r: 0.15, g: 0.45, b: 0.5 }): Entity {
    const e = this.part(parent, position)
    Transform.getMutable(e).scale = scale
    if (shape === 'sphere') MeshRenderer.setSphere(e)
    else if (shape === 'cylinder') MeshRenderer.setCylinder(e)
    else MeshRenderer.setBox(e)
    Material.setPbrMaterial(e, { albedoColor: { ...color, a: 1 }, roughness: 1, metallic: 0 })
    return e
  }
  private limb(at: Vec3, length: number, width: number): Entity {
    const pivot = this.part(this.model, at)
    this.mesh(pivot, 'cylinder', { x: 0, y: -length / 2, z: 0 }, { x: width, y: length - width, z: width })
    for (const y of [-width / 2, -length + width / 2]) this.mesh(pivot, 'sphere', { x: 0, y, z: 0 }, { x: width, y: width, z: width })
    return pivot
  }
  dispose(): void { this.audio?.dispose(); for (const e of this.parts.slice().reverse()) engine.removeEntity(e) }
}
