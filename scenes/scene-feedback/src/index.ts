import { isServer } from '@dcl/sdk/network'
import { feedback } from './feedback-questions'
import { setupGame } from './game'

export async function main() {
  feedback.start()
  if (isServer()) return
  setupGame()
}
