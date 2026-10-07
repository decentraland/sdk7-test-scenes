import { isServer } from '@dcl/sdk/network'
import { setupGame } from './game'
import { feedback } from './playtest-feedback'

export async function main() {
  console.log(`[SCENE] main() on the ${isServer() ? 'server' : 'client'}`)
  
  // This scene has no server logic of its own: the feedback module (imported by the game) runs on the server by itself.
  if (isServer()) return
  
  // The Intro, first thing on arrival: a yes makes the player a playtest participant, and
  // with ASK_PARTICIPANTS_ONLY (questions.ts) only participants get the game's Questions.
  void feedback.intro('scene-enter')
  
  setupGame()
}
