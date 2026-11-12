import { isServer } from '@dcl/sdk/network'
import { setupGame } from './game'

export async function main() {
  console.log(`[SCENE] main() on the ${isServer() ? 'server' : 'client'}`)
  
  // no server logic here: the feedback module runs on the server by itself
  if (isServer()) return

  setupGame()
}
