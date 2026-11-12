/**
 * Emote Finish Detection Test Scene
 *
 * Validates playback-completion signaling for avatar emotes:
 *   - AvatarEmoteCommand is a grow-only value set, appended to by the explorer on
 *     the local player entity whenever an emote's lifecycle changes (started,
 *     finished naturally, or interrupted).
 *   - EmoteState: ES_STARTED=0 (also the default when `state` is absent, for
 *     backward compat with older explorers), ES_FINISHED=1, ES_INTERRUPTED=2.
 *
 * Layout:
 *   "Trigger emote" plays a predefined emote (triggerEmote).
 *   "Trigger scene emote" plays a non-looping custom .glb emote (triggerSceneEmote).
 *   A scrolling log shows every AvatarEmoteCommand entry appended to the player
 *   entity: urn + resolved state name.
 *
 * Try it:
 *   - Let an emote play out fully -> expect FINISHED.
 *   - Start an emote and walk away mid-playback -> expect INTERRUPTED.
 */

import { triggerEmote, triggerSceneEmote } from '~system/RestrictedActions'
import {
  engine,
  Entity,
  Transform,
  MeshRenderer,
  MeshCollider,
  TextShape,
  Billboard,
  Material,
  AvatarEmoteCommand,
  EmoteState,
  pointerEventsSystem,
  InputAction
} from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'

const PREDEFINED_EMOTE = 'robot' // one of the default-emote-wheel predefined emotes
const SCENE_EMOTE_SRC = 'animations/Snowball_Throw_emote.glb' // non-looping custom emote

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

function emoteStateName(state: EmoteState | undefined): string {
  // Absent state defaults to STARTED for backward compatibility with older explorers.
  switch (state ?? EmoteState.ES_STARTED) {
    case EmoteState.ES_STARTED:
      return 'STARTED'
    case EmoteState.ES_FINISHED:
      return 'FINISHED'
    case EmoteState.ES_INTERRUPTED:
      return 'INTERRUPTED'
    default:
      return `UNKNOWN(${state})`
  }
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

const btnPredefined = createButton(Vector3.create(6, 1, 4), Color4.create(0.2, 0.6, 1, 1))
createLabel(Vector3.create(6, 2.3, 4), 2, Color4.White(), `TRIGGER EMOTE\n(${PREDEFINED_EMOTE})`)
pointerEventsSystem.onPointerDown(
  { entity: btnPredefined, opts: { button: InputAction.IA_POINTER, hoverText: `Trigger predefined emote (${PREDEFINED_EMOTE})` } },
  () => {
    triggerEmote({ predefinedEmote: PREDEFINED_EMOTE })
  }
)

const btnSceneEmote = createButton(Vector3.create(10, 1, 4), Color4.create(0.2, 0.8, 0.2, 1))
createLabel(Vector3.create(10, 2.3, 4), 2, Color4.White(), 'TRIGGER SCENE EMOTE\n(loop: false)')
pointerEventsSystem.onPointerDown(
  { entity: btnSceneEmote, opts: { button: InputAction.IA_POINTER, hoverText: 'Trigger non-looping scene emote' } },
  () => {
    triggerSceneEmote({ src: SCENE_EMOTE_SRC, loop: false })
  }
)

// ---------------------------------------------------------------------------
// Detection — AvatarEmoteCommand.onChange on the local player entity
// ---------------------------------------------------------------------------
// AvatarEmoteCommand is a grow-only value set: onChange fires once per newly
// appended entry (not once per whole set), so every lifecycle event shows up here
// exactly once, in order.

const logLabel = createLabel(Vector3.create(8, 4, 4), 1.8, Color4.create(0.6, 0.9, 1, 1), 'AvatarEmoteCommand log:\n(none yet)')
const emoteLog: string[] = []

// Scene-emote URNs embed the full base64-encoded scene + glb paths and run to
// hundreds of characters. A single line that long blows up the TextShape width
// and makes the whole label unreadable, so truncate long URNs for display only.
function shortUrn(urn: string): string {
  if (urn.length <= 48) return urn
  return `${urn.slice(0, 30)}…${urn.slice(-14)}`
}

AvatarEmoteCommand.onChange(engine.PlayerEntity, (cmd) => {
  if (!cmd) return

  const stateName = emoteStateName(cmd.state)
  const line = `${stateName}  urn=${shortUrn(cmd.emoteUrn)}  loop=${cmd.loop}`
  emoteLog.push(line)
  if (emoteLog.length > 8) emoteLog.shift()
  setLabel(logLabel, `AvatarEmoteCommand log:\n${emoteLog.join('\n')}`)
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
    Vector3.create(8, 6.2, 8),
    3,
    Color4.White(),
    'Emote Finish Detection Test\nLet an emote play out fully to see FINISHED.\nStart an emote and walk away mid-playback to see INTERRUPTED.'
  )
}

addGround()
addTitle()
