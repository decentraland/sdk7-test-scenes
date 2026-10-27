import { isServer } from '@dcl/sdk/network'
import { setupGame } from './game'
import { setupStorageProbe } from './storage-probe'

export async function main() {
  console.log(`[SCENE] main() on the ${isServer() ? 'server' : 'client'}`)
  
  // diagnostic for lost CSV rows, both sides
  setupStorageProbe()
  // no other server logic here: the feedback module runs on the server by itself
  if (isServer()) return

  setupGame()
}
