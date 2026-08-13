/**
 * Animation Finish Detection Test Scene
 *
 * Validates playback-completion signaling for the Animator component:
 *   - The explorer flips a clip's `playing` flag to false when a non-looping
 *     animation finishes naturally (as opposed to the scene stopping it).
 *
 * Layout:
 *   The shark GLTF has two clips configured on its Animator:
 *     - "swim" — loop: true  (never reports finish; used as a control case)
 *     - "bite" — loop: false (finishes naturally after one playthrough)
 *   Three buttons: Play looping (swim), Play non-looping (bite), Stop all.
 *   On natural completion of "bite" the scene auto-chains into "swim" to prove
 *   completion-chaining works.
 */

import {
  engine,
  Entity,
  Transform,
  MeshRenderer,
  MeshCollider,
  TextShape,
  Billboard,
  Material,
  Animator,
  GltfContainer,
  ColliderLayer,
  pointerEventsSystem,
  InputAction
} from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'

const CLIP_LOOP = 'swim' // loop: true — control case, must never report finish
const CLIP_ONESHOT = 'bite' // loop: false — finishes naturally after one playthrough

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------

function createButton(position: Vector3, color: Color4): Entity {
  const entity = engine.addEntity()
  Transform.create(entity, { position, scale: Vector3.create(1.2, 1.2, 1.2) })
  MeshRenderer.setBox(entity)
  MeshCollider.setBox(entity)
  Material.setPbrMaterial(entity, { albedoColor: color })
  return entity
}

function createLabel(position: Vector3, fontSize = 2, color: Color4 = Color4.White(), text = ''): Entity {
  const entity = engine.addEntity()
  Transform.create(entity, { position })
  TextShape.create(entity, {
    text,
    fontSize,
    textColor: color,
    outlineWidth: 0.1,
    outlineColor: Color4.Black()
  })
  Billboard.create(entity, {})
  return entity
}

function setLabel(entity: Entity, text: string): void {
  const ts = TextShape.getMutable(entity)
  ts.text = text
}

// ---------------------------------------------------------------------------
// Shark entity with Animator
// ---------------------------------------------------------------------------

const shark = engine.addEntity()
Transform.create(shark, { position: Vector3.create(8, 1, 8) })
GltfContainer.create(shark, {
  src: 'models/shark.glb',
  visibleMeshesCollisionMask: ColliderLayer.CL_POINTER,
  invisibleMeshesCollisionMask: undefined
})
Animator.create(shark, {
  states: [
    { clip: CLIP_LOOP, playing: false, loop: true, weight: 1 },
    { clip: CLIP_ONESHOT, playing: false, loop: false, shouldReset: true, weight: 1 }
  ]
})

// Bookkeeping for the demo UI only (not ECS state).
let lastOneShotPlaying = false
let sceneRequestedStop = false
let finishedLatched = false
let chainedAfterFinish = false

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

const btnLoop = createButton(Vector3.create(4, 1, 4), Color4.create(0.2, 0.6, 1, 1))
createLabel(Vector3.create(4, 2.3, 4), 2, Color4.White(), 'PLAY LOOP\n(swim)')
pointerEventsSystem.onPointerDown(
  { entity: btnLoop, opts: { button: InputAction.IA_POINTER, hoverText: 'Play looping clip (swim)' } },
  () => {
    sceneRequestedStop = false
    finishedLatched = false
    chainedAfterFinish = false
    Animator.playSingleAnimation(shark, CLIP_LOOP)
  }
)

const btnOneShot = createButton(Vector3.create(8, 1, 4), Color4.create(0.2, 0.8, 0.2, 1))
createLabel(Vector3.create(8, 2.3, 4), 2, Color4.White(), 'PLAY ONCE\n(bite, loop:false)')
pointerEventsSystem.onPointerDown(
  { entity: btnOneShot, opts: { button: InputAction.IA_POINTER, hoverText: 'Play non-looping clip (bite)' } },
  () => {
    sceneRequestedStop = false
    finishedLatched = false
    chainedAfterFinish = false
    Animator.playSingleAnimation(shark, CLIP_ONESHOT)
  }
)

const btnStop = createButton(Vector3.create(12, 1, 4), Color4.create(0.8, 0.2, 0.2, 1))
createLabel(Vector3.create(12, 2.3, 4), 2, Color4.White(), 'STOP ALL')
pointerEventsSystem.onPointerDown(
  { entity: btnStop, opts: { button: InputAction.IA_POINTER, hoverText: 'Stop all clips (scene-initiated)' } },
  () => {
    sceneRequestedStop = true
    Animator.stopAllAnimations(shark)
  }
)

// ---------------------------------------------------------------------------
// Detection — poll the clip state via read-only Animator.get() (READ-ONLY)
// ---------------------------------------------------------------------------
// IMPORTANT: we use Animator.get() here, NOT Animator.getClip(). getClip() returns
// a MUTABLE reference (via getMutableOrNull under the hood) and marks the whole
// Animator component dirty on every call, which would trigger a CRDT re-sync every
// single frame even though we're only reading. Animator.get() is a plain read.

const loopStateLabel = createLabel(Vector3.create(8, 4.4, 4), 2, Color4.create(0.6, 0.8, 1, 1))
const oneShotStateLabel = createLabel(Vector3.create(8, 3.9, 4), 2, Color4.Yellow())
const finishLabel = createLabel(Vector3.create(8, 3.4, 4), 2.2, Color4.create(1, 0.5, 0.2, 1), 'Waiting for playback...')

engine.addSystem(() => {
  const animator = Animator.get(shark)

  const loopState = animator.states.find((s) => s.clip === CLIP_LOOP)
  const oneShotState = animator.states.find((s) => s.clip === CLIP_ONESHOT)

  const loopPlaying = loopState?.playing ?? false
  const oneShotPlaying = oneShotState?.playing ?? false

  setLabel(loopStateLabel, `swim (loop:true) playing = ${loopPlaying}  <- never flips to false on its own`)
  setLabel(oneShotStateLabel, `bite (loop:false) playing = ${oneShotPlaying}`)

  // Detect a true -> false transition on the non-looping clip.
  if (lastOneShotPlaying && !oneShotPlaying) {
    if (sceneRequestedStop) {
      setLabel(finishLabel, 'Stopped by scene (Stop All pressed)')
    } else {
      finishedLatched = true
    }
  }

  if (finishedLatched) {
    setLabel(finishLabel, 'ANIMATION FINISHED (bite completed naturally)')

    // Chain into a second clip to prove completion-chaining works.
    if (!chainedAfterFinish) {
      chainedAfterFinish = true
      Animator.playSingleAnimation(shark, CLIP_LOOP)
    }
  }

  lastOneShotPlaying = oneShotPlaying
})

// ---------------------------------------------------------------------------
// Scene setup
// ---------------------------------------------------------------------------

function addGround(): void {
  const ground = engine.addEntity()
  Transform.create(ground, { position: Vector3.create(8, -0.05, 8), scale: Vector3.create(16, 0.1, 16) })
  MeshRenderer.setBox(ground)
  Material.setPbrMaterial(ground, { albedoColor: Color4.create(0.15, 0.15, 0.15, 1) })
}

function addTitle(): void {
  createLabel(
    Vector3.create(8, 5.8, 8),
    3,
    Color4.White(),
    'Animation Finish Detection Test\nPress PLAY ONCE (bite) and let it finish naturally\nto see ANIMATION FINISHED and the auto-chain into swim.'
  )
}

addGround()
addTitle()
