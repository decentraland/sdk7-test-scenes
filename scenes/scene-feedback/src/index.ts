import { isServer } from '@dcl/sdk/network'
import { setupClient } from './client/setup'
import { setupUi } from './client/ui'
import { registerValidators } from './shared/schemas'

// Static side-effect import: registerMessages() defines a component under the
// hood, so it must run at module load, before the engine seals.
import './shared/messages'

export async function main() {
  registerValidators()
  if (isServer()) {
    // Dynamic import keeps @dcl/sdk/server (Storage) out of the client path.
    const { startServer } = await import('./server/server')
    await startServer()
    return
  }
  setupClient()
  setupUi()
}
