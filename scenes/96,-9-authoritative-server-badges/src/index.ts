import { isServer } from '@dcl/sdk/network'
import { setupClient } from './client/setup'

// Static side-effect import: registerMessages() (in messages.ts) defines a
// component under the hood, so it MUST run during initial module load — before
// the engine seals. A dynamic import() inside main() would run it too late.
import './shared/messages'

// Single codebase, branched by isServer(). The server runs headlessly and is the
// only party that can call Badges.award.
export async function main() {
  if (isServer()) {
    // ONLY the server module is dynamically imported, so its server-only
    // dependency (@dcl/sdk/server → Badges) is never pulled into the client
    // bundle path. It defines no components at module scope, so loading it after
    // the seal is safe.
    const { startServer } = await import('./server/server')
    startServer()
    return
  }

  setupClient()
}
