import { coreComponentMappings } from '@dcl/ecs/dist/components/generated/component-names.gen'
import { engine, ISchema } from '@dcl/sdk/ecs'
import _m0 from 'protobufjs/minimal'

// Shim for PBAvatarSceneWearables: delete this file once `@dcl/sdk/ecs` exports AvatarSceneWearables
const NAME = 'core::AvatarSceneWearables'

// The component id comes from this table; names missing from it get a hashed id
coreComponentMappings[NAME] = 1226

type Value = { wearables: string[] }

const schema: ISchema<Value> = {
  serialize(value, builder) {
    const writer = _m0.Writer.create()
    for (const path of value.wearables) writer.uint32(10).string(path)
    builder.writeBuffer(writer.finish(), false)
  },
  deserialize(reader) {
    const input = _m0.Reader.create(reader.buffer().subarray(0, reader.remainingBytes()))
    const value: Value = { wearables: [] }
    while (input.pos < input.len) {
      const tag = input.uint32()
      if (tag === 10) value.wearables.push(input.string())
      else input.skipType(tag & 7)
    }
    return value
  },
  create: () => ({ wearables: [] }),
  jsonSchema: {
    type: 'object',
    properties: {},
    serializationType: 'protocol-buffer',
    protocolBuffer: 'PBAvatarSceneWearables'
  }
}

export const AvatarSceneWearables = engine.defineComponentFromSchema(NAME, schema)
