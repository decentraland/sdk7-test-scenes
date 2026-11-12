import { Color4, Vector3 } from '@dcl/sdk/math'
import { EMOTE_URN, WEARABLE_URN } from './config'
import { createVendingMachine } from './vending-machine'

export function main() {
  createVendingMachine({
    label: 'Wearable',
    urn: WEARABLE_URN,
    position: Vector3.create(5, 0, 10),
    color: Color4.create(0.2, 0.4, 0.9, 1)
  })

  createVendingMachine({
    label: 'Emote',
    urn: EMOTE_URN,
    position: Vector3.create(11, 0, 10),
    color: Color4.create(0.9, 0.4, 0.2, 1)
  })

  // A urn that is not a collection item: the explorer answers OPENED and then reports Failed without a modal.
  createVendingMachine({
    label: 'Broken item',
    urn: 'urn:decentraland:amoy:collections-v2:not-an-item',
    position: Vector3.create(8, 0, 13),
    color: Color4.create(0.5, 0.5, 0.5, 1)
  })
}
