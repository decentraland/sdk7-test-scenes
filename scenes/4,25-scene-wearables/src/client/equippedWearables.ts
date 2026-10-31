import { AvatarEquippedData, Entity } from '@dcl/sdk/ecs'
import _m0 from 'protobufjs/minimal'

// `visible` is unset until the explorer loads the avatar
export type EquippedWearable = { urn: string; visible?: boolean }
type WithWearables = { wearables?: EquippedWearable[] }

// Stopgap: delete this module once the SDK codec decodes `PBAvatarEquippedData.wearables` (field 3)
const schema = AvatarEquippedData.schema
const decodeBase = schema.deserialize
const encodeBase = schema.serialize

schema.deserialize = (reader) => {
  const value = decodeBase(reader) as ReturnType<typeof decodeBase> & WithWearables
  const bytes = _m0.Reader.create(reader.buffer())
  const end = reader.remainingBytes()
  const wearables: EquippedWearable[] = []
  while (bytes.pos < end) {
    const tag = bytes.uint32()
    if (tag !== 26) {
      bytes.skipType(tag & 7)
      continue
    }
    const wearable: EquippedWearable = { urn: '' }
    const itemEnd = bytes.uint32() + bytes.pos
    while (bytes.pos < itemEnd) {
      const itemTag = bytes.uint32()
      if (itemTag === 10) wearable.urn = bytes.string()
      else if (itemTag === 16) wearable.visible = bytes.bool()
      else bytes.skipType(itemTag & 7)
    }
    wearables.push(wearable)
  }
  value.wearables = wearables
  return value
}

// Keeps the round trip byte-stable, so the engine does not see its own copy as different data
schema.serialize = (value, builder) => {
  encodeBase(value, builder)
  const writer = _m0.Writer.create()
  for (const { urn, visible } of (value as WithWearables).wearables ?? []) {
    writer.uint32(26).fork().uint32(10).string(urn)
    if (visible !== undefined) writer.uint32(16).bool(visible)
    writer.ldelim()
  }
  builder.writeBuffer(writer.finish(), false)
}

export function getEquippedWearables(entity: Entity): readonly EquippedWearable[] | undefined {
  return (AvatarEquippedData.getOrNull(entity) as WithWearables | null)?.wearables
}
