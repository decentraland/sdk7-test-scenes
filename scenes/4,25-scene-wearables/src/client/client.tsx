import { AvatarBase, AvatarEquippedData, AvatarShape, engine, Entity, PlayerIdentityData, Transform } from '@dcl/sdk/ecs'
import { Color3, Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { isStateSyncronized } from '@dcl/sdk/network'
import ReactEcs, { Button, Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { room } from '../shared/messages'
import { Outfits } from '../shared/schemas'
import { NPC_KEY, WEARABLE_NAMES, WEARABLES } from '../shared/wearables'
import { getEquippedWearables } from './equippedWearables'

const BASE = 'urn:decentraland:off-chain:base-avatars:'
const BASE_FEMALE = (BASE + 'BaseFemale').toLowerCase()
const NPC_BASE_LOOK = ['eyes_00', 'eyebrows_00', 'mouth_00', 'casual_hair_01', 'red_tshirt', 'safari_pants', 'sneakers'].map(
  (w) => BASE + w
)
const base = (...names: string[]) => names.map((w) => BASE + w)
const HEAD = base('eyes_00', 'eyebrows_00', 'mouth_00', 'casual_hair_01')
const MISSING_PATH = 'wearables/missing/missing_upper_body.glb'
const NOT_A_WEARABLE = 'wearables/kilt/kilt.json'
const GREEN_SKIN = Color3.create(0.3, 0.8, 0.3)
const RED_HAIR = Color3.create(0.9, 0.1, 0.1)

const PROFILE_OVERRIDE = {
  name: 'OVERRIDDEN',
  bodyShape: BASE + 'BaseMale',
  skinColor: GREEN_SKIN,
  hairColor: RED_HAIR,
  expressionTriggerId: 'wave',
  wearables: base('black_jacket', 'brown_pants', 'classic_shoes', 'short_hair')
}

type Target = 'me' | 'npc'
type Mode = 'local' | 'synced'
type PlayerCase = 'add' | 'colours' | 'replace' | 'body' | 'showOnly' | 'dropped' | 'full'

const PLAYER_CASES: [PlayerCase, string][] = [
  ['add', 'Add on top'],
  ['colours', 'Colours only'],
  ['replace', 'Replace list'],
  ['body', 'Other body'],
  ['showOnly', 'Show only wearables'],
  ['dropped', 'Only a missing path'],
  ['full', 'Full AvatarShape']
]

let npc: Entity
let target: Target = 'me'
let mode: Mode = 'local'
let caseMe: PlayerCase = 'add'
let caseOthers: PlayerCase = 'add'

const local: Record<Target, string[]> = { me: [], npc: [] }
let synced: Map<string, string[]> | undefined
const NO_OUTFITS = new Map<string, string[]>()

const applied = new Map<Entity, string>()

export function startClient() {
  npc = engine.addEntity()
  Transform.create(npc, { position: Vector3.create(8, 0, 10), rotation: Quaternion.fromEulerDegrees(0, 180, 0) })

  spawnNpc('Control', 3, [...HEAD, ...base('red_tshirt', 'safari_pants', 'sneakers')])
  spawnNpc('Same category', 5.5, [...HEAD, ...base('red_tshirt', 'black_jacket', 'safari_pants', 'sneakers')])
  spawnNpc('Missing path', 10.5, [...HEAD, ...base('red_tshirt'), MISSING_PATH])
  spawnNpc('Catalog hides', 13, [...HEAD, ...base('denimdungareesblue', 'safari_pants', 'sneakers')])
  spawnNpc('Scene not hidden', 15, [...HEAD, ...base('denimdungareesblue', 'sneakers'), WEARABLES.kilt.male])
  spawnNpc('Unknown entry', 3, [...HEAD, ...base('red_tshirt'), NOT_A_WEARABLE, 'not-a-urn'], 15)

  engine.addSystem(dressAvatarsSystem)
  ReactEcsRenderer.setUiRenderer(panel, { virtualWidth: 1920, virtualHeight: 1080 })
}

function spawnNpc(name: string, x: number, wearables: string[], z = 13) {
  const entity = engine.addEntity()
  Transform.create(entity, { position: Vector3.create(x, 0, z), rotation: Quaternion.fromEulerDegrees(0, 180, 0) })
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
      wearables: [...NPC_BASE_LOOK, ...paths],
      emotes: []
    })
  )

  // AvatarShape on a player applies on this client only, so every client dresses every player
  for (const [player, identity] of engine.getEntitiesWith(PlayerIdentityData)) {
    const avatarBase = AvatarBase.getOrNull(player)
    const equipped = AvatarEquippedData.getOrNull(player)
    if (!avatarBase || !equipped) continue

    const address = identity.address.toLowerCase()
    const female = avatarBase.bodyShapeUrn.toLowerCase() === BASE_FEMALE
    const names = merge(outfits.get(address) ?? [], player === engine.PlayerEntity ? local.me : [])
    const paths = toPaths(names, female)
    const playerCase = player === engine.PlayerEntity ? caseMe : caseOthers

    // Player entity ids are reused after a disconnect, so the key includes the address
    dress(player, `${address}|${playerCase}|${equipped.wearableUrns.join(',')}`, paths, () => {
      const shape = playerShape(playerCase, equipped.wearableUrns, paths, female)
      if (shape) AvatarShape.createOrReplace(player, { id: identity.address, emotes: [], ...shape })
      else AvatarShape.deleteFrom(player)
    })
  }
}

// Unset fields keep the profile value. A non-empty `wearables` replaces the profile list, and an empty one keeps it.
function playerShape(playerCase: PlayerCase, equipped: readonly string[], paths: string[], female: boolean) {
  switch (playerCase) {
    case 'add':
      // A later item wins its category, so the scene wearables go after the equipped items
      return paths.length === 0 ? undefined : { wearables: [...equipped, ...paths] }
    case 'colours':
      return { skinColor: GREEN_SKIN, hairColor: RED_HAIR, wearables: [] }
    case 'replace':
      return { wearables: [...base('black_jacket'), ...paths] }
    case 'body':
      return { bodyShape: BASE + (female ? 'BaseMale' : 'BaseFemale'), wearables: [] }
    case 'showOnly':
      return { showOnlyWearables: true, wearables: [] }
    case 'dropped':
      return { wearables: [MISSING_PATH] }
    case 'full':
      return { ...PROFILE_OVERRIDE, wearables: [...PROFILE_OVERRIDE.wearables, ...paths] }
  }
}

function nextCase(current: PlayerCase): PlayerCase {
  const i = PLAYER_CASES.findIndex(([value]) => value === current)
  return PLAYER_CASES[(i + 1) % PLAYER_CASES.length][0]
}

const caseLabel = (value: PlayerCase) => PLAYER_CASES.find(([v]) => v === value)![1]

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

const VISIBILITY: [string, Color4][] = [
  ['hidden', Color4.Red()],
  ['visible', Color4.Green()],
  ['unknown', Color4.Gray()]
]

function profileWearables() {
  return (getEquippedWearables(engine.PlayerEntity) ?? []).map(({ urn, visible }) => {
    const [label, color] = VISIBILITY[visible === undefined ? 2 : visible ? 1 : 0]
    const value = `${urn.split(':').pop()}: ${label}`
    return (
      <Label
        key={urn}
        value={value}
        fontSize={12}
        color={color}
        textAlign="middle-left"
        textWrap="nowrap"
        uiTransform={{ width: '100%', height: 14 }}
      />
    )
  })
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
        value={`On me: ${caseLabel(caseMe)}`}
        variant={caseMe === 'add' ? 'secondary' : 'primary'}
        fontSize={16}
        uiTransform={{ width: '100%', height: 36, margin: { top: 4 } }}
        onMouseDown={() => (caseMe = nextCase(caseMe))}
      />
      <Button
        value={`On others: ${caseLabel(caseOthers)}`}
        variant={caseOthers === 'add' ? 'secondary' : 'primary'}
        fontSize={16}
        uiTransform={{ width: '100%', height: 36, margin: { top: 4 } }}
        onMouseDown={() => (caseOthers = nextCase(caseOthers))}
      />
      <Label value="Profile wearables" fontSize={14} uiTransform={{ margin: { top: 12, bottom: 2 } }} />
      {profileWearables()}
    </UiEntity>
  )
}
