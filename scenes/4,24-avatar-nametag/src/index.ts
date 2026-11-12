import {
  AvatarModifierArea,
  AvatarModifierType,
  AvatarNametag,
  AvatarShape,
  engine,
  Material,
  MeshRenderer,
  Transform
} from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'
import { registerAutoTagSystem } from './modules/multiplayerRoster'
import { setupWalkerNpc } from './modules/walkerNpc'
import { setupUi } from './ui'

// Spawn point is x:[0,3] z:[0,3], cameraTarget (8,1,8) -- the player looks roughly toward +x/+z.
// The NPCs sit a few meters further along that same line, a few meters apart, and are rotated to
// face back toward the middle of the spawn area so they greet the player on load.
const SPAWN_LOOK_AT = Vector3.create(1.5, 1, 1.5)

export const npc1 = engine.addEntity()
export const npc2 = engine.addEntity()

// Whole-scene AvatarModifierArea used by the "Hide Nametags Area" toggle in the control panel
// (src/ui.tsx). Only the Transform is set up here; the AvatarModifierArea component itself is
// created/removed by the toggle button, default OFF, so its presence never drifts out of sync
// with what the panel displays.
export const hideNametagsAreaEntity = engine.addEntity()

// Small, always-present walk-in zone: walk in/out of this box to exercise the natural
// enter/leave path (as opposed to the toggle above, which flips the whole-scene area on/off from
// the UI). Placed away from both NPCs, at x:[11,15] z:[11,15], so they are never inside it.
const walkInZoneArea = engine.addEntity()
const walkInZoneMarker = engine.addEntity()

export function main() {
  // npc1/npc2/hideNametagsAreaEntity are passed in explicitly (rather than imported by ui.tsx)
  // to avoid a circular import between this file and ui.tsx -- see the comment on
  // `targetStates` in ui.tsx for the full story on why that ordering bug broke the NPC John /
  // NPC Sign panel targets.
  setupUi(npc1, npc2, hideNametagsAreaEntity)

  // Auto-tags every connected player (local + remote) from the roster in
  // modules/multiplayerRoster.ts, no button press required; also covers late joiners.
  registerAutoTagSystem()

  // Walking NPC: patrols a short line at x=2, z:[4,14] -- clear of the spawn area, both static
  // NPCs and the walk-in zone -- so the plate can be observed following a moving avatar, as
  // opposed to the two static NPCs below. See modules/walkerNpc.ts.
  setupWalkerNpc()

  AvatarNametag.create(engine.PlayerEntity, { label: 'MainPlayer Test Nametag' })

  // NPC 1: normal native name ("John") + a nametag plate. Expected: plate "Boss" rendered ABOVE
  // the native "John" nametag.
  const npc1Position = Vector3.create(6, 0, 6)
  Transform.create(npc1, {
    position: npc1Position,
    rotation: Quaternion.lookRotation(Vector3.subtract(SPAWN_LOOK_AT, npc1Position))
  })
  AvatarShape.create(npc1, {
    id: 'npc-john',
    name: 'John',
    bodyShape: 'urn:decentraland:off-chain:base-avatars:BaseMale',
    wearables: [],
    emotes: []
  })
  AvatarNametag.create(npc1, { label: 'Boss' })

  // NPC 2: empty native name + a nametag plate. Expected: ONLY the plate shows, no empty native
  // name box underneath.
  const npc2Position = Vector3.create(9, 0, 6)
  Transform.create(npc2, {
    position: npc2Position,
    rotation: Quaternion.lookRotation(Vector3.subtract(SPAWN_LOOK_AT, npc2Position))
  })
  AvatarShape.create(npc2, {
    id: 'npc-sign',
    name: '',
    bodyShape: 'urn:decentraland:off-chain:base-avatars:BaseFemale',
    wearables: [],
    emotes: []
  })
  AvatarNametag.create(npc2, { label: 'Sign Only' })

  // Whole-scene hide-nametags area: Transform only, no AvatarModifierArea component yet -- the
  // toggle button in ui.tsx adds/removes it. area (16,8,16) centered at (8,2,8) covers the whole
  // parcel (player spawn, both NPCs and the walk-in zone).
  Transform.create(hideNametagsAreaEntity, { position: Vector3.create(8, 2, 8) })

  // Walk-in zone: always has the AvatarModifierArea component, so walking through its bounds
  // toggles the effect naturally instead of via a UI button.
  Transform.create(walkInZoneArea, { position: Vector3.create(13, 2, 13) })
  AvatarModifierArea.create(walkInZoneArea, {
    area: Vector3.create(4, 6, 4),
    excludeIds: [],
    modifiers: [AvatarModifierType.AMT_HIDE_NAMETAGS]
  })

  // Thin ground marker so the walk-in zone is visible in-world. No MeshCollider, so it never
  // blocks movement -- it's a visual outline only.
  Transform.create(walkInZoneMarker, {
    position: Vector3.create(13, 0.05, 13),
    scale: Vector3.create(4, 0.1, 4)
  })
  MeshRenderer.setBox(walkInZoneMarker)
  Material.setPbrMaterial(walkInZoneMarker, {
    albedoColor: { r: 1, g: 0.6, b: 0, a: 1 },
    metallic: 0,
    roughness: 1
  })
}
