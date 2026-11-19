import { setupFontTests } from './fontTests'
import { setupIconRepro } from './iconRepro'

// Font atlas cap repro: pages of 50 Font Awesome icons (creator report). Set to false to restore the font QA scene.
const iconRepro = true

export function main() {
  if (iconRepro) setupIconRepro()
  else setupFontTests({ delayedLoads: false })
}
