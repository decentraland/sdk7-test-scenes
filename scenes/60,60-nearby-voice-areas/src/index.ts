import { setupSpeakingMarkers } from './speaking'
import { setupUi } from './ui'
import { spawnZones } from './zones'

export function main() {
  spawnZones()
  setupSpeakingMarkers()
  setupUi()
}
