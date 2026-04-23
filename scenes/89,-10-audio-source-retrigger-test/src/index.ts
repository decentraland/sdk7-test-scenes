/**
 * AudioSource Retrigger Test Scene
 *
 * Tests PBAudioSource behavior with focus on two fixes:
 *   - fix/audio-source-retrigger-dedup (js-sdk-toolchain):
 *       AudioSource.playSound / stopSound now use createOrReplace so identical-
 *       param retriggers always emit a CRDT PUT.
 *   - fix/audio-source-same-url-retrigger (unity-explorer):
 *       Same-URL PUT with playing:true now seeks to currentTime and restarts
 *       playback even if Unity's AudioSource.isPlaying is already true.
 *
 * Zones:
 *   A — Basic playback (createOrReplace directly)
 *   B — Same-URL retrigger: the primary retrigger bug scenario
 *   C — URL swap on the same entity
 *   D — resetCursor semantics (playSound / stopSound with resetCursor flag)
 *   E — Property variations (volume, pitch, loop)
 *   F — getMutable hand-mutation vs playSound helper (LWW dedup demonstration)
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
  AudioSource
} from '@dcl/sdk/ecs'
import { Color4, Vector3, Quaternion } from '@dcl/sdk/math'
import { pointerEventsSystem, InputAction, PointerEventType } from '@dcl/sdk/ecs'

// ---------------------------------------------------------------------------
// Audio clip paths — drop the actual files here before testing
// ---------------------------------------------------------------------------

const CLIP_A = 'audio/a.mp3'        // short clip ~1 s
const CLIP_B = 'audio/b.mp3'        // short clip, different timbre
const CLIP_C = 'audio/c.mp3'        // short clip, different timbre
const CLIP_SHORT = 'audio/short.mp3' // very short clip ~0.5 s
const CLIP_LONG = 'audio/long.mp3'  // long clip ~20 s

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------

/** One parcel is 16 m wide. We have 2 parcels (89,-10 and 90,-10) = 32 m x 16 m. */
const ZONE_LABEL_Y = 2.2
const BUTTON_Y = 1.0
const LABEL_Y = 1.8

/** Create a simple box button entity at the given world position. */
function createButton(
  position: Vector3,
  color: Color4,
  scaleOverride?: Vector3
): Entity {
  const entity = engine.addEntity()
  Transform.create(entity, {
    position,
    scale: scaleOverride ?? Vector3.create(1.2, 1.2, 1.2)
  })
  MeshRenderer.setBox(entity)
  MeshCollider.setBox(entity)
  Material.setPbrMaterial(entity, { albedoColor: color })
  return entity
}

/** Create a floating text label above the given world position. */
function createLabel(
  text: string,
  position: Vector3,
  fontSize: number = 3,
  color: Color4 = Color4.White()
): Entity {
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

/** Create a zone header sign (taller text, yellow). */
function createZoneHeader(text: string, position: Vector3): void {
  createLabel(text, position, 4, Color4.Yellow())
}

// ---------------------------------------------------------------------------
// Zone A — Basic playback
// ---------------------------------------------------------------------------
// Two buttons operate on a dedicated audio entity using createOrReplace directly.

function setupZoneA(): void {
  const BASE_X = 2
  const BASE_Z = 4

  createZoneHeader('Zone A: Basic Playback\n(createOrReplace)', Vector3.create(BASE_X + 1, 4, BASE_Z))

  const audioEntity = engine.addEntity()
  Transform.create(audioEntity, { position: Vector3.create(BASE_X + 1, 0, BASE_Z) })

  // A1 — Create + play
  const btnA1 = createButton(
    Vector3.create(BASE_X, BUTTON_Y, BASE_Z),
    Color4.create(0.2, 0.8, 0.2, 1)
  )
  createLabel('Create + play A', Vector3.create(BASE_X, LABEL_Y, BASE_Z))
  pointerEventsSystem.onPointerDown(
    { entity: btnA1, opts: { button: InputAction.IA_POINTER, hoverText: 'Create + play A' } },
    () => {
      AudioSource.createOrReplace(audioEntity, {
        audioClipUrl: CLIP_A,
        playing: true,
        volume: 1
      })
    }
  )

  // A2 — Stop
  const btnA2 = createButton(
    Vector3.create(BASE_X + 2, BUTTON_Y, BASE_Z),
    Color4.create(0.8, 0.2, 0.2, 1)
  )
  createLabel('Stop A', Vector3.create(BASE_X + 2, LABEL_Y, BASE_Z))
  pointerEventsSystem.onPointerDown(
    { entity: btnA2, opts: { button: InputAction.IA_POINTER, hoverText: 'Stop A' } },
    () => {
      AudioSource.createOrReplace(audioEntity, {
        audioClipUrl: CLIP_A,
        playing: false
      })
    }
  )
}

// ---------------------------------------------------------------------------
// Zone B — Same-URL retrigger (THE retrigger bug scenario)
// ---------------------------------------------------------------------------
// Pre-populate entity. Clicking B1 repeatedly should restart from 0 each time.
// Without fix/audio-source-retrigger-dedup + fix/audio-source-same-url-retrigger
// the second and subsequent clicks are silently swallowed.

function setupZoneB(): void {
  const BASE_X = 6
  const BASE_Z = 4

  createZoneHeader('Zone B: Same-URL Retrigger\n(THE bug)', Vector3.create(BASE_X + 1, 4, BASE_Z))

  // Pre-populate with playing:false so subsequent playSound calls trigger CRDT PUTs
  const audioEntity = engine.addEntity()
  Transform.create(audioEntity, { position: Vector3.create(BASE_X + 1, 0, BASE_Z) })
  AudioSource.create(audioEntity, {
    audioClipUrl: CLIP_LONG,
    playing: false,
    loop: false
  })

  // B1 — playSound (same URL, retrigger every click)
  const btnB1 = createButton(
    Vector3.create(BASE_X, BUTTON_Y, BASE_Z),
    Color4.create(0.2, 0.6, 1, 1)
  )
  createLabel('playSound\n(same URL)', Vector3.create(BASE_X, LABEL_Y, BASE_Z))
  pointerEventsSystem.onPointerDown(
    { entity: btnB1, opts: { button: InputAction.IA_POINTER, hoverText: 'playSound – same URL retrigger' } },
    () => {
      // Each click must restart from 0 even if already playing.
      // Pre-fix: getMutableOrNull path deduped identical values; post-fix: createOrReplace always emits PUT.
      AudioSource.playSound(audioEntity, CLIP_LONG)
    }
  )

  // B2 — stopSound
  const btnB2 = createButton(
    Vector3.create(BASE_X + 2, BUTTON_Y, BASE_Z),
    Color4.create(0.8, 0.4, 0, 1)
  )
  createLabel('stopSound', Vector3.create(BASE_X + 2, LABEL_Y, BASE_Z))
  pointerEventsSystem.onPointerDown(
    { entity: btnB2, opts: { button: InputAction.IA_POINTER, hoverText: 'stopSound' } },
    () => {
      AudioSource.stopSound(audioEntity)
    }
  )
}

// ---------------------------------------------------------------------------
// Zone C — URL swap on the same entity
// ---------------------------------------------------------------------------
// Clicking C1 → C2 → C3 → C1 … should cleanly cut between clips.

function setupZoneC(): void {
  const BASE_X = 10
  const BASE_Z = 4

  createZoneHeader('Zone C: URL Swap\n(same entity)', Vector3.create(BASE_X + 1.5, 4, BASE_Z))

  const audioEntity = engine.addEntity()
  Transform.create(audioEntity, { position: Vector3.create(BASE_X + 1.5, 0, BASE_Z) })
  AudioSource.create(audioEntity, { audioClipUrl: CLIP_A, playing: false })

  const clips = [CLIP_A, CLIP_B, CLIP_C]
  const labels = ['Swap to A', 'Swap to B', 'Swap to C']
  const colors = [
    Color4.create(0.9, 0.3, 0.9, 1),
    Color4.create(0.3, 0.9, 0.9, 1),
    Color4.create(0.9, 0.9, 0.3, 1)
  ]

  for (let i = 0; i < 3; i++) {
    const clip = clips[i]
    const btn = createButton(
      Vector3.create(BASE_X + i * 1.6, BUTTON_Y, BASE_Z),
      colors[i],
      Vector3.create(1.1, 1.1, 1.1)
    )
    createLabel(labels[i], Vector3.create(BASE_X + i * 1.6, LABEL_Y, BASE_Z))
    pointerEventsSystem.onPointerDown(
      { entity: btn, opts: { button: InputAction.IA_POINTER, hoverText: labels[i] } },
      () => {
        AudioSource.createOrReplace(audioEntity, {
          audioClipUrl: clip,
          playing: true
        })
      }
    )
  }
}

// ---------------------------------------------------------------------------
// Zone D — resetCursor semantics
// ---------------------------------------------------------------------------
// Validates the resetCursor parameter in playSound and stopSound.

function setupZoneD(): void {
  const BASE_X = 16
  const BASE_Z = 4

  createZoneHeader('Zone D: resetCursor\nSemantics', Vector3.create(BASE_X + 1.5, 4, BASE_Z))

  const audioEntity = engine.addEntity()
  Transform.create(audioEntity, { position: Vector3.create(BASE_X + 1.5, 0, BASE_Z) })
  AudioSource.create(audioEntity, {
    audioClipUrl: CLIP_LONG,
    playing: false,
    loop: false
  })

  type ButtonDef = { label: string; hoverText: string; color: Color4; action: () => void }
  const buttons: ButtonDef[] = [
    {
      label: 'playSound\nresetCursor=true',
      hoverText: 'playSound resetCursor=true — starts from 0',
      color: Color4.create(0.2, 0.8, 0.4, 1),
      action: () => { AudioSource.playSound(audioEntity, CLIP_LONG, true) }
    },
    {
      label: 'playSound\nresetCursor=false',
      hoverText: 'playSound resetCursor=false — resumes from SDK mirror cursor (0 if never set)',
      color: Color4.create(0.2, 0.5, 0.3, 1),
      action: () => { AudioSource.playSound(audioEntity, CLIP_LONG, false) }
    },
    {
      label: 'stopSound\nresetCursor=true',
      hoverText: 'stopSound resetCursor=true — stops and resets cursor to 0',
      color: Color4.create(0.8, 0.2, 0.2, 1),
      action: () => { AudioSource.stopSound(audioEntity, true) }
    },
    {
      label: 'stopSound\nresetCursor=false',
      hoverText: 'stopSound resetCursor=false — stops and keeps cursor position',
      color: Color4.create(0.5, 0.1, 0.1, 1),
      action: () => { AudioSource.stopSound(audioEntity, false) }
    }
  ]

  buttons.forEach((def, i) => {
    const btn = createButton(
      Vector3.create(BASE_X + i * 1.6, BUTTON_Y, BASE_Z),
      def.color,
      Vector3.create(1.1, 1.1, 1.1)
    )
    createLabel(def.label, Vector3.create(BASE_X + i * 1.6, LABEL_Y, BASE_Z), 2.5)
    pointerEventsSystem.onPointerDown(
      { entity: btn, opts: { button: InputAction.IA_POINTER, hoverText: def.hoverText } },
      def.action
    )
  })
}

// ---------------------------------------------------------------------------
// Zone E — Property variations
// ---------------------------------------------------------------------------
// Each button toggles an entity with a specific property set.

function setupZoneE(): void {
  const BASE_X = 2
  const BASE_Z = 11

  createZoneHeader('Zone E: Property\nVariations', Vector3.create(BASE_X + 1.5, 4, BASE_Z))

  type PropDef = { label: string; volume?: number; pitch?: number; loop?: boolean }
  const defs: PropDef[] = [
    { label: 'Low volume\n(0.25)', volume: 0.25 },
    { label: 'Half pitch\n(0.5)',  pitch: 0.5 },
    { label: 'Double pitch\n(2.0)', pitch: 2.0 },
    { label: 'Looping',            loop: true }
  ]

  const colors = [
    Color4.create(0.6, 0.8, 1, 1),
    Color4.create(1, 0.7, 0.4, 1),
    Color4.create(1, 0.4, 0.7, 1),
    Color4.create(0.4, 1, 0.6, 1)
  ]

  // Track toggle state per entity
  const playingState: boolean[] = [false, false, false, false]

  defs.forEach((def, i) => {
    const audioEntity = engine.addEntity()
    Transform.create(audioEntity, { position: Vector3.create(BASE_X + i * 2, 0, BASE_Z) })
    AudioSource.create(audioEntity, {
      audioClipUrl: CLIP_A,
      playing: false,
      volume: def.volume ?? 1.0,
      pitch: def.pitch ?? 1.0,
      loop: def.loop ?? false
    })

    const btn = createButton(
      Vector3.create(BASE_X + i * 2, BUTTON_Y, BASE_Z),
      colors[i]
    )
    createLabel(def.label, Vector3.create(BASE_X + i * 2, LABEL_Y, BASE_Z), 2.5)
    pointerEventsSystem.onPointerDown(
      { entity: btn, opts: { button: InputAction.IA_POINTER, hoverText: `Toggle: ${def.label.replace('\n', ' ')}` } },
      () => {
        playingState[i] = !playingState[i]
        if (playingState[i]) {
          AudioSource.playSound(audioEntity, CLIP_A)
        } else {
          AudioSource.stopSound(audioEntity)
        }
      }
    )
  })
}

// ---------------------------------------------------------------------------
// Zone F — getMutable hand-mutation vs playSound helper
// ---------------------------------------------------------------------------
// F1 uses playSound (reliable retrigger, post-fix).
// F2 uses getMutable directly (deduped by LWW on identical values — known limitation).

function setupZoneF(): void {
  const BASE_X = 12
  const BASE_Z = 11

  createZoneHeader('Zone F: Helper vs getMutable\n(LWW dedup demo)', Vector3.create(BASE_X + 1, 4, BASE_Z))

  // Explanatory sign
  const signEntity = engine.addEntity()
  Transform.create(signEntity, { position: Vector3.create(BASE_X + 1, 3.2, BASE_Z - 0.5) })
  TextShape.create(signEntity, {
    text: 'Use AudioSource.playSound() for reliable retriggers.\nHand-mutation via getMutable may be suppressed\nby LWW CRDT dedup when values are unchanged.\nF1 should retrigger every click; F2 may not.',
    fontSize: 2,
    textColor: Color4.create(1, 0.9, 0.6, 1),
    outlineWidth: 0.08,
    outlineColor: Color4.Black()
  })
  Billboard.create(signEntity, {})

  // F1 entity — using playSound helper
  const audioEntityF1 = engine.addEntity()
  Transform.create(audioEntityF1, { position: Vector3.create(BASE_X, 0, BASE_Z) })
  AudioSource.create(audioEntityF1, {
    audioClipUrl: CLIP_SHORT,
    playing: false
  })

  const btnF1 = createButton(
    Vector3.create(BASE_X, BUTTON_Y, BASE_Z),
    Color4.create(0.2, 0.8, 0.2, 1)
  )
  createLabel('F1: via playSound\nhelper (reliable)', Vector3.create(BASE_X, LABEL_Y, BASE_Z), 2.5)
  pointerEventsSystem.onPointerDown(
    { entity: btnF1, opts: { button: InputAction.IA_POINTER, hoverText: 'F1: playSound helper — retriggers every click' } },
    () => {
      // createOrReplace is always a CRDT PUT, regardless of prior values
      AudioSource.playSound(audioEntityF1, CLIP_SHORT)
    }
  )

  // F2 entity — using getMutable directly
  const audioEntityF2 = engine.addEntity()
  Transform.create(audioEntityF2, { position: Vector3.create(BASE_X + 2, 0, BASE_Z) })
  AudioSource.create(audioEntityF2, {
    audioClipUrl: CLIP_SHORT,
    playing: false
  })

  const btnF2 = createButton(
    Vector3.create(BASE_X + 2, BUTTON_Y, BASE_Z),
    Color4.create(0.8, 0.4, 0.1, 1)
  )
  createLabel('F2: via getMutable\n(LWW dedup risk)', Vector3.create(BASE_X + 2, LABEL_Y, BASE_Z), 2.5)
  pointerEventsSystem.onPointerDown(
    { entity: btnF2, opts: { button: InputAction.IA_POINTER, hoverText: 'F2: getMutable — may be deduped after first click' } },
    () => {
      // This approach sets playing=true and currentTime=0 via getMutable.
      // The CRDT LWW check may suppress the PUT if the values did not change
      // (i.e., playing was already true, currentTime was already 0).
      // First click works; subsequent clicks may be silently ignored.
      const mutable = AudioSource.getMutable(audioEntityF2)
      mutable.playing = true
      mutable.currentTime = 0
    }
  )
}

// ---------------------------------------------------------------------------
// Scene entry point
// ---------------------------------------------------------------------------

export function main(): void {
  // Ground plane so the scene looks tidy
  const ground = engine.addEntity()
  Transform.create(ground, {
    position: Vector3.create(16, -0.05, 8),
    scale: Vector3.create(32, 0.1, 16)
  })
  MeshRenderer.setBox(ground)
  Material.setPbrMaterial(ground, { albedoColor: Color4.create(0.15, 0.15, 0.15, 1) })

  // Scene title sign
  const titleEntity = engine.addEntity()
  Transform.create(titleEntity, { position: Vector3.create(8, 5.5, 8) })
  TextShape.create(titleEntity, {
    text: 'AudioSource Retrigger Test Scene\nZones A-F — click buttons to trigger audio scenarios',
    fontSize: 4,
    textColor: Color4.White(),
    outlineWidth: 0.1,
    outlineColor: Color4.Black()
  })
  Billboard.create(titleEntity, {})

  setupZoneA()
  setupZoneB()
  setupZoneC()
  setupZoneD()
  setupZoneE()
  setupZoneF()
}
