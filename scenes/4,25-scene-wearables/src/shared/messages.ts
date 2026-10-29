import { Schemas } from '@dcl/sdk/ecs'
import { registerMessages } from '@dcl/sdk/network'

export const Messages = {
  toggleWearable: Schemas.Map({ npc: Schemas.Boolean, name: Schemas.String }),
  takeOffAll: Schemas.Map({ npc: Schemas.Boolean })
}

export const room = registerMessages(Messages)
