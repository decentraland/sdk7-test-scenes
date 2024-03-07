import ReactEcs, { Button, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { changeRealm, movePlayerTo, openExternalUrl, openNftDialog, teleportTo, triggerEmote, triggerSceneEmote } from "~system/RestrictedActions";

export function setupUi() {
  ReactEcsRenderer.setUiRenderer(uiComponent)
}

const uiComponent = () => (
  [
    OpenExternalUrlExample(),
    MovePlayerToExample(),
    TeleportToExample(),
    ChangeRealmExample(),
    TriggerEmoteExample(),
    OpenNftDialogExample(),
  ]
)

function OpenExternalUrlExample() {
  return <UiEntity
      uiTransform={{
          positionType: 'absolute',
          position: { right: '50px', bottom: '210px' },
      }}
  >
      <UiEntity
          uiTransform={{
            margin : '0px 0px 0px 10px',
          }}
      >
        <Button
          value="Open External Url\ndecentraland.org"
          fontSize={20}
          variant="primary"
          uiTransform={{ width: 200, height: 60 }}
          onMouseDown={() => {
            openExternalUrl({ url: "https://decentraland.org" })
          }}
        />
      </UiEntity>
      <UiEntity
          uiTransform={{
            margin : '0px 0px 0px 10px',
          }}
      >
        <Button
          value="Open External Url\ngoogle.com"
          fontSize={20}
          variant="primary"
          uiTransform={{ width: 200, height: 60 }}
          onMouseDown={() => {
            openExternalUrl({ url: "https://google.com" })
          }}
        />
      </UiEntity>
  </UiEntity>
}

function MovePlayerToExample() {
  return <UiEntity
      uiTransform={{
          positionType: 'absolute',
          position: { right: '50px', bottom: '290px' },
      }}
  >
      <UiEntity
          uiTransform={{
            margin : '0px 0px 0px 10px',
          }}
      >
        <Button
          value="Move Player To\n[1,12,9]"
          fontSize={20}
          variant="primary"
          uiTransform={{ width: 200, height: 60 }}
          onMouseDown={() => {
            movePlayerTo({ newRelativePosition: { x: 1, y: 12, z: 9 }, cameraTarget: { x: 5, y: 0, z: 5 } })
          }}
        />
      </UiEntity>
      <UiEntity
          uiTransform={{
            margin : '0px 0px 0px 10px',
          }}
      >
        <Button
          value="Move Player To\n[10,0,8]"
          fontSize={20}
          variant="primary"
          uiTransform={{ width: 200, height: 60 }}
          onMouseDown={() => {
            movePlayerTo({ newRelativePosition: { x: 10, y: 0, z: 8 }, cameraTarget: { x: 5, y: 0, z: 5 } })
          }}
        />
      </UiEntity>
      <UiEntity
          uiTransform={{
            margin : '0px 0px 0px 10px',
          }}
      >
        <Button
          value="Move Player To\n[0,0,0]"
          fontSize={20}
          variant="primary"
          uiTransform={{ width: 200, height: 60 }}
          onMouseDown={() => {
            movePlayerTo({ newRelativePosition: { x: 0, y: 0, z: 0 }, cameraTarget: { x: 5, y: 0, z: 5 } })
          }}
        />
      </UiEntity>
  </UiEntity>
}

function TeleportToExample() {
  return <UiEntity
      uiTransform={{
          positionType: 'absolute',
          position: { right: '50px', bottom: '370px' },
      }}
  >
      <UiEntity
          uiTransform={{
            margin : '0px 0px 0px 10px',
          }}
      >
        <Button
          value="Teleport To\n20,-15"
          fontSize={20}
          variant="primary"
          uiTransform={{ width: 200, height: 60 }}
          onMouseDown={() => {
            teleportTo({ worldCoordinates: { x: 20, y: -15 } })
          }}
        />
      </UiEntity>
      <UiEntity
          uiTransform={{
            margin : '0px 0px 0px 10px',
          }}
      >
        <Button
          value="Teleport To\n10,25"
          fontSize={20}
          variant="primary"
          uiTransform={{ width: 200, height: 60 }}
          onMouseDown={() => {
            teleportTo({ worldCoordinates: { x: 10, y: 25 } })
          }}
        />
      </UiEntity>
      <UiEntity
          uiTransform={{
            margin : '0px 0px 0px 10px',
          }}
      >
        <Button
          value="Teleport To\n54,-84"
          fontSize={20}
          variant="primary"
          uiTransform={{ width: 200, height: 60 }}
          onMouseDown={() => {
            teleportTo({ worldCoordinates: { x: 54, y: -81 } })
          }}
        />
      </UiEntity>
  </UiEntity>
}

function ChangeRealmExample() {
  return <UiEntity
      uiTransform={{
          positionType: 'absolute',
          position: { right: '50px', bottom: '130px' },
      }}
  >
      <Button
          value="Change Realm"
          fontSize={20}
          variant="primary"
          uiTransform={{ width: 200, height: 60 }}
          onMouseDown={() => {
            changeRealm({ realm: "https://peer.decentraland.org" })
          }}
      />
  </UiEntity>
}

function TriggerEmoteExample() {
  return <UiEntity
      uiTransform={{
          positionType: 'absolute',
          position: { right: '50px', bottom: '450px' },
      }}
  >
      <UiEntity
          uiTransform={{
            margin : '0px 0px 0px 10px',
          }}
      >
        <Button
          value="TriggerEmote\nROBOT"
          fontSize={20}
          variant="primary"
          uiTransform={{ width: 200, height: 60 }}
          onMouseDown={() => {
            triggerEmote({ predefinedEmote: "robot" })
          }}
        />
      </UiEntity>
      <UiEntity
          uiTransform={{
            margin : '0px 0px 0px 10px',
          }}
      >
        <Button
          value="Trigger Emote\nDANCE"
          fontSize={20}
          variant="primary"
          uiTransform={{ width: 200, height: 60 }}
          onMouseDown={() => {
            triggerEmote({ predefinedEmote: "dance" })
          }}
        />
      </UiEntity>
      <UiEntity
          uiTransform={{
            margin : '0px 0px 0px 10px',
          }}
      >
        <Button
          value="Trigger Emote\nMONEY"
          fontSize={20}
          variant="primary"
          uiTransform={{ width: 200, height: 60 }}
          onMouseDown={() => {
            triggerEmote({ predefinedEmote: "money" })
          }}
        />
      </UiEntity>
  </UiEntity>
}

function OpenNftDialogExample() {
  return <UiEntity
      uiTransform={{
          positionType: 'absolute',
          position: { right: '50px', bottom: '530px' },
          width: 'auto',
          height: 'auto',
      }}
  >
      <UiEntity
          uiTransform={{
            margin : '0px 0px 0px 10px',
          }}
      >
        <Button
          value="Open Nft Dialog\nEXAMPLE 1"
          fontSize={20}
          variant="primary"
          uiTransform={{ width: 200, height: 60 }}
          onMouseDown={() => {
            openNftDialog({ urn: "urn:decentraland:ethereum:erc721:0x06012c8cf97bead5deae237070f9587f8e7a266d:1540722" })
          }}
        />
      </UiEntity>
      <UiEntity
          uiTransform={{
            margin : '0px 0px 0px 10px',
          }}
      >
        <Button
          value="Open Nft Dialog\nEXAMPLE 2"
          fontSize={20}
          variant="primary"
          uiTransform={{ width: 200, height: 60 }}
          onMouseDown={() => {
            openNftDialog({ urn: "urn:decentraland:ethereum:erc721:0x2acab3dea77832c09420663b0e1cb386031ba17b:3695" })
          }}
        />
      </UiEntity>
      <UiEntity
          uiTransform={{
              margin : '0px 0px 0px 10px',
          }}
      >
        <Button
          value="Open Nft Dialog\nEXAMPLE 3"
          fontSize={20}
          variant="primary"
          uiTransform={{ width: 200, height: 60 }}
          onMouseDown={() => {
            openNftDialog({ urn: "urn:decentraland:ethereum:erc721:0x5c1a0cc6dadf4d0fb31425461df35ba80fcbc110:3784" })
          }}
        />
      </UiEntity>
  </UiEntity>
}
