import { setupFontTests } from './fontTests'
import { setupIconRepro } from './iconRepro'

// Minimal Font Awesome icon repro (creator report). Set to false to restore the font QA scene.
const iconRepro = true

export function main() {
  if (iconRepro) setupIconRepro()
  else setupFontTests({ delayedLoads: false })
}
