import { isServer } from '@dcl/sdk/network'
import { startClient } from './client/client'
import { registerValidators } from './shared/schemas'
// registerMessages() defines a component, so it must run at module load, before the engine seals
import './shared/messages'

export async function main() {
  registerValidators()
  if (isServer()) {
    const { startServer } = await import('./server/server')
    startServer()
    return
  }
  startClient()
}
