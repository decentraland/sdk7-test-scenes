import { AvatarBase, AvatarShape, engine, Entity, PlayerIdentityData, Transform } from '@dcl/sdk/ecs'
import { Color3, Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { isStateSyncronized } from '@dcl/sdk/network'
import ReactEcs, { Button, Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { room } from '../shared/messages'
import { Outfits } from '../shared/schemas'
import { NPC_KEY, WEARABLE_NAMES, WEARABLES } from '../shared/wearables'

const BASE = 'urn:decentraland:off-chain:base-avatars:'
const BASE_FEMALE = (BASE + 'BaseFemale').toLowerCase()
const NPC_BASE_LOOK = ['eyes_00', 'eyebrows_00', 'mouth_00', 'casual_hair_01', 'red_tshirt', 'safari_pants', 'sneakers'].map(
  (w) => BASE + w
)
const base = (...names: string[]) => names.map((w) => BASE + w)
const HEAD = base('eyes_00', 'eyebrows_00', 'mouth_00', 'casual_hair_01')

// Edge cases: a full AvatarShape on a player entity, from before scene wearables. Builds without them spawn a second
// avatar from it; builds with them keep the real avatar and take only this scene's wearables
const PROFILE_OVERRIDE = {
  name: 'OVERRIDDEN',
  bodyShape: BASE + 'BaseMale',
  skinColor: Color3.create(0.3, 0.8, 0.3),
  hairColor: Color3.create(0.9, 0.1, 0.1),
  expressionTriggerId: 'wave',
  wearables: base('black_jacket', 'brown_pants', 'classic_shoes', 'short_hair')
}

type Target = 'me' | 'npc'
type Mode = 'local' | 'synced'

let npc: Entity
let target: Target = 'me'
let mode: Mode = 'local'
let overrideMe = false
let overrideOthers = false

// Example 1: picks that only this client applies; other players keep seeing the profile
const local: Record<Target, string[]> = { me: [], npc: [] }
// Example 2: the authoritative server's outfits; `undefined` until they have synced
let synced: Map<string, string[]> | undefined
const NO_OUTFITS = new Map<string, string[]>()

const applied = new Map<Entity, string>()

export function startClient() {
  npc = engine.addEntity()
  Transform.create(npc, { position: Vector3.create(8, 0, 10), rotation: Quaternion.fromEulerDegrees(0, 180, 0) })

  // Edge cases: AvatarShape NPCs that do not use scene wearables
  spawnNpc('Control', 3, [...HEAD, ...base('red_tshirt', 'safari_pants', 'sneakers')])
  spawnNpc('Same category', 5.5, [...HEAD, ...base('red_tshirt', 'black_jacket', 'safari_pants', 'sneakers')])
  spawnNpc('Missing path', 10.5, [...HEAD, ...base('red_tshirt'), 'wearables/missing/missing_upper_body.glb'])

  engine.addSystem(dressAvatarsSystem)
  ReactEcsRenderer.setUiRenderer(panel, { virtualWidth: 1920, virtualHeight: 1080 })
}

function spawnNpc(name: string, x: number, wearables: string[]) {
  const entity = engine.addEntity()
  Transform.create(entity, { position: Vector3.create(x, 0, 13), rotation: Quaternion.fromEulerDegrees(0, 180, 0) })
  AvatarShape.create(entity, { id: `edge-${name}`, name, bodyShape: BASE + 'BaseMale', wearables, emotes: [] })
}

function readSynced(): Map<string, string[]> | undefined {
  for (const [, outfits] of engine.getEntitiesWith(Outfits)) {
    const result = new Map<string, string[]>()
    outfits.keys.forEach((key, i) => result.set(key, outfits.wearables[i].split(',').filter((n) => n in WEARABLES)))
    return result
  }
  return undefined
}

// Local picks go last, so they win over a synced item of the same category
const merge = (syncedNames: readonly string[], localNames: readonly string[]) => [
  ...syncedNames.filter((n) => !localNames.includes(n)),
  ...localNames
]

const toPaths = (names: readonly string[], female: boolean) =>
  names.map((n) => (female ? WEARABLES[n].female : WEARABLES[n].male))

function dressAvatarsSystem() {
  synced = isStateSyncronized() ? readSynced() : undefined
  const outfits = synced ?? NO_OUTFITS

  dress(npc, NPC_KEY, toPaths(merge(outfits.get(NPC_KEY) ?? [], local.npc), false), (paths) =>
    AvatarShape.createOrReplace(npc, {
      id: 'scene-wearables-npc',
      name: 'Mannequin',
      bodyShape: BASE + 'BaseMale',
      // Scene wearables last: they replace the base look's items of the same category
      wearables: [...NPC_BASE_LOOK, ...paths],
      emotes: []
    })
  )

  // Every client dresses every player in the scene: the explorer applies AvatarShape locally and broadcasts nothing
  for (const [player, identity] of engine.getEntitiesWith(PlayerIdentityData)) {
    // Body shape picks the male / female model
    const avatarBase = AvatarBase.getOrNull(player)
    if (!avatarBase) continue

    const address = identity.address.toLowerCase()
    const names = merge(outfits.get(address) ?? [], player === engine.PlayerEntity ? local.me : [])
    const paths = toPaths(names, avatarBase.bodyShapeUrn.toLowerCase() === BASE_FEMALE)
    const override = player === engine.PlayerEntity ? overrideMe : overrideOthers

    // Player entity ids are recycled, so the address is part of the key
    dress(player, `${address}|${override}`, paths, () => {
      if (override)
        AvatarShape.createOrReplace(player, {
          ...PROFILE_OVERRIDE,
          id: identity.address,
          wearables: [...PROFILE_OVERRIDE.wearables, ...paths],
          emotes: []
        })
      else if (paths.length === 0) AvatarShape.deleteFrom(player)
      else AvatarShape.createOrReplace(player, { id: identity.address, wearables: paths, emotes: [] })
    })
  }
}

function dress(entity: Entity, key: string, paths: string[], write: (paths: string[]) => void) {
  const state = `${key}|${paths.join(',')}`
  if (applied.get(entity) === state) return
  applied.set(entity, state)
  write(paths)
}

function worn(): string[] {
  if (mode === 'local') return local[target]
  if (target === 'npc') return synced?.get(NPC_KEY) ?? []
  const me = PlayerIdentityData.getOrNull(engine.PlayerEntity)
  return me ? synced?.get(me.address.toLowerCase()) ?? [] : []
}

function toggle(name: string) {
  if (mode === 'synced') room.send('toggleWearable', { npc: target === 'npc', name })
  else local[target] = local[target].includes(name) ? local[target].filter((n) => n !== name) : [...local[target], name]
}

function takeOffAll() {
  if (mode === 'synced') room.send('takeOffAll', { npc: target === 'npc' })
  else local[target] = []
}

function choice<T extends string>(options: [T, string][], current: T, pick: (value: T) => void) {
  return (
    <UiEntity uiTransform={{ flexDirection: 'row', width: '100%', margin: { top: 4 } }}>
      {options.map(([value, label]) => (
        <Button
          key={value}
          value={label}
          variant={current === value ? 'primary' : 'secondary'}
          fontSize={16}
          uiTransform={{ width: '50%', height: 36 }}
          onMouseDown={() => pick(value)}
        />
      ))}
    </UiEntity>
  )
}

const panel = () => {
  const disabled = mode === 'synced' && synced === undefined
  const names = worn()
  return (
    <UiEntity
      uiTransform={{ positionType: 'absolute', position: { top: 180, left: 80 }, width: 320, flexDirection: 'column', padding: 12 }}
      uiBackground={{ color: Color4.create(0, 0, 0, 0.6) }}
    >
      {choice<Target>([['me', 'Me'], ['npc', 'Mannequin']], target, (t) => (target = t))}
      {choice<Mode>([['local', 'Local only'], ['synced', 'Synced']], mode, (m) => (mode = m))}
      <Label
        value={mode === 'local' ? 'Only this client sees it' : 'Everyone sees it (authoritative server)'}
        fontSize={14}
        uiTransform={{ margin: { top: 4 } }}
      />
      {WEARABLE_NAMES.map((name) => (
        <Button
          key={name}
          value={name}
          variant={names.includes(name) ? 'primary' : 'secondary'}
          fontSize={16}
          disabled={disabled}
          uiTransform={{ width: '100%', height: 36, margin: { top: 4 } }}
          onMouseDown={() => toggle(name)}
        />
      ))}
      <Button
        value="Take off all"
        fontSize={16}
        disabled={disabled}
        uiTransform={{ width: '100%', height: 36, margin: { top: 8 } }}
        onMouseDown={takeOffAll}
      />
      <Label
        value={disabled ? 'Waiting for the server…' : `Worn: ${names.join(', ') || '-'}`}
        fontSize={14}
        uiTransform={{ margin: { top: 8 } }}
      />
      <Label value="Edge cases (this client only)" fontSize={14} uiTransform={{ margin: { top: 12 } }} />
      <Button
        value="Full AvatarShape on me"
        variant={overrideMe ? 'primary' : 'secondary'}
        fontSize={16}
        uiTransform={{ width: '100%', height: 36, margin: { top: 4 } }}
        onMouseDown={() => (overrideMe = !overrideMe)}
      />
      <Button
        value="Full AvatarShape on others"
        variant={overrideOthers ? 'primary' : 'secondary'}
        fontSize={16}
        uiTransform={{ width: '100%', height: 36, margin: { top: 4 } }}
        onMouseDown={() => (overrideOthers = !overrideOthers)}
      />
    </UiEntity>
  )
}
