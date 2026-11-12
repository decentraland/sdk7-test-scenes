import {
  engine,
  Entity,
  InputAction,
  Material,
  MeshCollider,
  MeshRenderer,
  pointerEventsSystem,
  TextShape,
  Transform
} from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'
import { ExplorerUi, ItemPurchase, openExplorerUiAndWait, OpenExplorerUiResult } from '@dcl/sdk/explorer-ui'
import { PURCHASE_TIMEOUT_MS } from './config'
import { fetchListing } from './listing'

export type VendingMachineOptions = {
  /** Shown on the sign until the listing is read, and when it cannot be read. */
  label: string
  /** The item this machine sells. An empty urn leaves the machine disabled. */
  urn: string
  position: Vector3
  color: Color4
}

function describeNotOpened(openResult: OpenExplorerUiResult): string {
  switch (openResult) {
    case OpenExplorerUiResult.WAS_ALREADY_OPEN:
      return 'A purchase is already open'
    case OpenExplorerUiResult.REJECTED_NOT_CURRENT_SCENE:
      return 'Rejected: you are not standing in this scene'
    case OpenExplorerUiResult.REJECTED_FEATURE_DISABLED:
      return 'Rejected: buying with credits is not available'
    case OpenExplorerUiResult.REJECTED_NO_USER_GESTURE:
      return 'Rejected: no user gesture'
    default:
      return `Not opened (${openResult})`
  }
}

export function createVendingMachine(options: VendingMachineOptions): void {
  const { label, urn, position, color } = options

  const machine = engine.addEntity()
  Transform.create(machine, { position: Vector3.add(position, Vector3.create(0, 1, 0)), scale: Vector3.create(1, 2, 1) })
  MeshRenderer.setBox(machine)
  MeshCollider.setBox(machine)
  Material.setPbrMaterial(machine, { albedoColor: color })

  const sign = engine.addEntity()
  Transform.create(sign, { position: Vector3.add(position, Vector3.create(0, 2.9, 0)) })
  TextShape.create(sign, { text: label, fontSize: 2, textColor: Color4.White() })

  const status = engine.addEntity()
  Transform.create(status, { position: Vector3.add(position, Vector3.create(0, 2.4, 0)) })
  TextShape.create(status, { text: '', fontSize: 1.5, textColor: Color4.Yellow() })

  const setStatus = (text: string) => {
    TextShape.getMutable(status).text = text
  }

  if (urn === '') {
    setStatus('Disabled: set its urn in src/config.ts')
    return
  }

  let rewards = 0
  const spawnReward = () => {
    const reward: Entity = engine.addEntity()
    Transform.create(reward, {
      position: Vector3.add(position, Vector3.create(1.2, 0.3 + rewards * 0.5, 0)),
      scale: Vector3.create(0.4, 0.4, 0.4)
    })
    MeshRenderer.setSphere(reward)
    Material.setPbrMaterial(reward, { albedoColor: Color4.Green(), emissiveColor: Color4.Green(), emissiveIntensity: 2 })
    rewards++
  }

  void fetchListing(urn).then((listing) => {
    TextShape.getMutable(sign).text = listing
      ? `${listing.name}\n${listing.priceCredits} credits (${listing.available} left)`
      : `${label}\n(no primary listing found)`
  })

  pointerEventsSystem.onPointerDown(
    { entity: machine, opts: { button: InputAction.IA_POINTER, hoverText: `Buy ${label}`, maxDistance: 8 } },
    () => {
      // The explorer accepts the request only on the tick of the click, so this call must be the first thing
      // the handler does and must not sit behind an await.
      const purchase = openExplorerUiAndWait(
        { ui: ExplorerUi.EU_ITEM_PURCHASE, itemPurchase: { urn } },
        { collect: [ItemPurchase], timeoutMs: PURCHASE_TIMEOUT_MS }
      )

      setStatus('Opening...')

      purchase
        .then((outcome) => {
          if (outcome.$case === 'notOpened') {
            setStatus(describeNotOpened(outcome.openResult))
            return
          }

          if (outcome.$case === 'timedOut') {
            setStatus('Timed out waiting for the purchase')
            return
          }

          // The explorer reports the outcome before it reports the modal as closed.
          const result = outcome.events.find((collected) => collected.channel === 'itemPurchase')

          switch (result?.event.status?.$case) {
            case 'purchased':
              spawnReward()
              setStatus(`Purchased! (${rewards} so far)`)
              break
            case 'dismissed':
              setStatus('Dismissed')
              break
            case 'failed':
              setStatus('Failed')
              break
            default:
              setStatus('Closed without an outcome')
          }
        })
        .catch((error) => {
          console.error(`Purchase of ${urn} could not be tracked`, error)
          setStatus('Error: see the scene console')
        })
    }
  )
}
