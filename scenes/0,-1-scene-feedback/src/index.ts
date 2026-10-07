import { isServer } from '@dcl/sdk/network'
import { setupGame } from './game'
import { feedback } from './playtest-feedback'

export async function main() {
  console.log(`[SCENE] main() on the ${isServer() ? 'server' : 'client'}`)
  
  // no server logic here: the feedback module runs on the server by itself
  if (isServer()) return
  
  // Intro on arrival. With ASK_PARTICIPANTS_ONLY, only players who say yes get the game's Questions.
  void feedback.intro('scene-enter')
  
  setupGame()
}
