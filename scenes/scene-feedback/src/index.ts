import { isServer } from '@dcl/sdk/network'
import { setupGame } from './game'

export async function main() {
  console.log(`[SCENE] main() on the ${isServer() ? 'server' : 'client'}`)
  // This scene has no server logic of its own: the feedback module (imported by the game) runs on the server by itself.
  if (isServer()) return
  setupGame()
}
