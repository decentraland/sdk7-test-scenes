import { setupExplorerUiEvents } from './modules/explorerUiEvents'
import { setupOpenExplorerUiButtons } from './modules/openExplorerUiButtons'
import { setupStopEmoteButtons } from './modules/stopEmoteButtons'
import { setupWaitHelperButtons } from './modules/waitHelperButtons'
import { setupUi } from './ui'

export function main() {
  // Started before the buttons so the on-start no-gesture call cannot produce an event that
  // nothing is listening for yet.
  setupExplorerUiEvents()
  setupOpenExplorerUiButtons()
  setupWaitHelperButtons()
  setupStopEmoteButtons()
  setupUi()
}
