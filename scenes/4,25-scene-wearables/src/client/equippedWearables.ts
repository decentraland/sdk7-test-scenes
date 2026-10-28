import { AvatarEquippedData, Entity } from '@dcl/sdk/ecs'
import _m0 from 'protobufjs/minimal'

export type EquippedWearable = { urn: string; visible?: boolean }
type WithWearables = { wearables?: EquippedWearable[] }

// Stopgap until the SDK includes `PBAvatarEquippedData.wearables` (field 3): the generated codec drops it, so wrap the
// component's schema to keep it on decode and write it back on encode
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

// `visible` is unset until the explorer has loaded the avatar; `undefined` means no data at all
export function getEquippedWearables(entity: Entity): readonly EquippedWearable[] | undefined {
  return (AvatarEquippedData.getOrNull(entity) as WithWearables | null)?.wearables
}
