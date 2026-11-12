import { Quaternion, Vector3 } from '@dcl/sdk/math';
import ReactEcs, { Button, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { changeRealm, movePlayerTo, openExternalUrl, openNftDialog, teleportTo, triggerEmote, triggerSceneEmote } from "~system/RestrictedActions";
import { engine, Transform } from '@dcl/sdk/ecs'

export function setupUi() {
  ReactEcsRenderer.setUiRenderer(uiComponent)
}

const uiComponent = () => (
  [
    OpenNftDialogExample(),
    TriggerEmoteExample(),
    TeleportToExample(),
    MovePlayerToExample(),
    RotateInPlaceExample(),
    OpenExternalUrlExample(),
    ChangeRealmExample(),
  ]
)

function OpenNftDialogExample() {
  return <UiEntity
      uiTransform={{
          positionType: 'absolute',
          position: { right: '50px', bottom: '610px' },
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

function TriggerEmoteExample() {
    return <UiEntity
        uiTransform={{
            positionType: 'absolute',
            position: { right: '50px', bottom: '530px' },
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

function TeleportToExample() {
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

function MovePlayerToExample() {
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

function RotateInPlaceExample() {
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
                value="Rotate Avatar Leftwards"
                fontSize={20}
                variant="primary"
                uiTransform={{ width: 200, height: 60 }}
                onMouseDown={() => {
                    const playerTransform = Transform.get(engine.PlayerEntity)
                    const avatarForward = Vector3.rotate(Vector3.Forward(), playerTransform.rotation)
                    const leftWardsTarget = Vector3.rotate(avatarForward, Quaternion.fromEulerDegrees(0, -15, 0))
                    movePlayerTo({ newRelativePosition: playerTransform.position , avatarTarget: Vector3.add(playerTransform.position, leftWardsTarget) })
                }}
            />
        </UiEntity>
        <UiEntity
            uiTransform={{
                margin : '0px 0px 0px 10px',
            }}
        >
            <Button
                value="Rotate Player Rightwards"
                fontSize={20}
                variant="primary"
                uiTransform={{ width: 200, height: 60 }}
                onMouseDown={() => {
                    const playerTransform = Transform.get(engine.PlayerEntity)
                    const avatarForward = Vector3.rotate(Vector3.Forward(), playerTransform.rotation)
                    const rightWardsTarget = Vector3.rotate(avatarForward, Quaternion.fromEulerDegrees(0, 15, 0))
                    movePlayerTo({ newRelativePosition: playerTransform.position , avatarTarget: Vector3.add(playerTransform.position, rightWardsTarget) })
                }}
            />
        </UiEntity>
        <UiEntity
            uiTransform={{
                margin : '0px 0px 0px 10px',
            }}
        >
            <Button
                value="Teleport+Rotate+PlaySceneEmote"
                fontSize={20}
                variant="primary"
                uiTransform={{ width: 200, height: 60 }}
                onMouseDown={() => {
                    const playerTransform = Transform.get(engine.PlayerEntity)
                    const avatarForward = Vector3.rotate(Vector3.Forward(), playerTransform.rotation)
                    const leftWardsTarget = Vector3.rotate(avatarForward, Quaternion.fromEulerDegrees(0, -15, 0))
                    movePlayerTo({ newRelativePosition: Vector3.create(8, 0, 8) , avatarTarget: Vector3.add(playerTransform.position, leftWardsTarget) })
                    triggerSceneEmote({ src: 'animations/Crafting_Snowball_emote.glb', loop: false })
                }}
            />
        </UiEntity>
    </UiEntity>
}

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

function ChangeRealmExample() {
    return <UiEntity
        uiTransform={{
            positionType: 'absolute',
            position: { right: '50px', bottom: '130px' },
        }}
    >
        <UiEntity
            uiTransform={{
                margin : '0px 0px 0px 10px',
            }}
        >
            <Button
                value="Change Realm\nWITHOUT PROMPT"
                fontSize={20}
                variant="primary"
                uiTransform={{ width: 200, height: 60 }}
                onMouseDown={() => {
                    changeRealm({ realm: "https://peer.decentraland.org" })
                }}
            />
        </UiEntity>
        <UiEntity
            uiTransform={{
                margin : '0px 0px 0px 10px',
            }}
        >
            <Button
                value="Change Realm\nWITH PROMPT"
                fontSize={20}
                variant="primary"
                uiTransform={{ width: 200, height: 60 }}
                onMouseDown={() => {
                    changeRealm({
                        realm: "https://peer.decentraland.org",
                        message: "Are you sure you want to change realm?",
                    })
                }}
            />
        </UiEntity>
    </UiEntity>
}
