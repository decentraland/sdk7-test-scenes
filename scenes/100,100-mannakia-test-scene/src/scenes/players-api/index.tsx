import {
  getConnectedPlayers,
  getPlayerData,
  getPlayersInScene
} from '~system/Players'
import { sceneSystems } from '../../utils/system'
import { UiBox } from '../../utils/ui/box'
import ReactEcs, { type JSX, Label } from '@dcl/sdk/react-ecs'

export function main(): void {
  sceneSystems.addSystemWithInverval(
    (_dt) => {
      getConnectedPlayers({})
        .then((data) => {
          console.log({ getConnectedPlayers: { players: data.players } })
        })
        .catch(console.error)

      getPlayersInScene({})
        .then((data) => {
          console.log({ getPlayersInScene: { players: data.players } })

          if (data.players.length > 0) {
            getPlayerData({ userId: data.players[0].userId })
              .then((data) => {
                console.log({ getPlayerData: { player: data.data } })
              })
              .catch(console.error)
          }
        })
        .catch(console.error)
    },
    1,
    'player-api-system'
  )
}

export function MainSceneUi(): JSX.Element {
  return (
    <UiBox width={400} height={100} uiTransform={{ padding: 10 }}>
      <Label value="Check the console logs" uiTransform={{ height: 30 }} />
    </UiBox>
  )
}
