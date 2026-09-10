import { setupHub } from './hub'
import { setupUi } from './ui'

export function main() {
  // In-world portal ring: one clickable portal per destination scene of this world.
  setupHub()

  // UI panel comparing the request shapes `teleportTo` accepts.
  setupUi()
}
