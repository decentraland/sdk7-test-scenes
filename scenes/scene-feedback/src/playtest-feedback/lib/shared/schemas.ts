import { engine, Schemas } from '@dcl/sdk/ecs'
import { AUTH_SERVER_PEER_ID } from '@dcl/sdk/network/message-bus-sync'

// Pulsed by the server every HEARTBEAT_MS. room.send is fire-and-forget and the
// room can be "ready" while the server is still cold-booting, so clients only
// open a Question once they have seen this value advance.
export const ServerHeartbeat = engine.defineComponent('feedback::Heartbeat', {
  beatAt: Schemas.Int64
})

// Server only: clients must accept the server's writes.
export function registerValidators(): void {
  ServerHeartbeat.validateBeforeChange(
    (value) => value.senderAddress.toLowerCase() === AUTH_SERVER_PEER_ID.toLowerCase()
  )
}
