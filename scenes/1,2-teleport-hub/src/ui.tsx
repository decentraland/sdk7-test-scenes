import ReactEcs, { Button, Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'

import { RESTRICTED_ACTIONS_SCENE, TEST_SCENES_WORLD } from './destinations'
import { getLastRequest, teleportToDestination, teleportToOtherRealm, teleportToParcelOnly, teleportToRealmSpawn } from './teleport'

/** Realm alias the client resolves to Genesis City of the current environment. */
const GENESIS_REALM = 'genesis'

/** The destination the four request shapes below are compared on. */
const SAMPLE = RESTRICTED_ACTIONS_SCENE

export function setupUi() {
  ReactEcsRenderer.setUiRenderer(uiComponent)
}

const uiComponent = () => (
  <UiEntity
    uiTransform={{
      positionType: 'absolute',
      position: { right: '20px', top: '80px' },
      width: 320,
      flexDirection: 'column',
      padding: 12
    }}
    uiBackground={{ color: Color4.create(0, 0, 0, 0.7) }}
  >
    <Label value="teleportTo request shapes" fontSize={18} color={Color4.White()} />
    <Label
      value={`sample destination:\n${SAMPLE.title} (${SAMPLE.x},${SAMPLE.y})`}
      fontSize={14}
      color={Color4.create(0.7, 0.75, 0.85, 1)}
    />

    <TeleportButton label={`realm + parcel\n(what the portals do)`} onClick={() => teleportToDestination(SAMPLE)} />
    <TeleportButton label={`parcel only\n(no realm)`} onClick={() => teleportToParcelOnly(SAMPLE)} />
    <TeleportButton label={`realm only\n(world default spawn)`} onClick={() => teleportToRealmSpawn(TEST_SCENES_WORLD)} />
    <TeleportButton label={`another realm + parcel\n(leaves this world)`} onClick={() => teleportToOtherRealm(GENESIS_REALM, 0, 0)} />

    <Label value={`last request:\n${getLastRequest()}`} fontSize={14} color={Color4.create(0.55, 0.85, 0.6, 1)} />
  </UiEntity>
)

function TeleportButton(props: { label: string; onClick: () => void }) {
  return (
    <Button
      value={props.label}
      fontSize={15}
      variant="primary"
      uiTransform={{ width: '100%', height: 52, margin: { top: 8 } }}
      onMouseDown={props.onClick}
    />
  )
}
