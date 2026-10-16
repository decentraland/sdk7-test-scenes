import { Schemas } from '@dcl/sdk/ecs'
import { registerMessages } from '@dcl/sdk/network'

// Client → server intents. `npc` picks the mannequin instead of the sender's own avatar.
export const Messages = {
  toggleWearable: Schemas.Map({ npc: Schemas.Boolean, name: Schemas.String }),
  takeOffAll: Schemas.Map({ npc: Schemas.Boolean })
}

export const room = registerMessages(Messages)
