import { sceneSystems } from '../../utils/system'
import ReactEcs, { Label, type JSX, Button } from '@dcl/sdk/react-ecs'
import { UiBox } from '../../utils/ui/box'

import * as crypto from 'dcl-crypto-toolkit'
import { getUserData } from '~system/UserIdentity'
import { sendAsync } from '~system/EthereumController'
import { callPromise } from '../../utils'

type State = {
  playerUserId: string
  connectedWeb3?: boolean
  currentBalance?: number
  gasPrice?: number
}

const state: State = {
  playerUserId: 'none'
}

export function main(): void {
  sceneSystems.addSystemWithInverval(
    (_dt) => {
      getUserData({})
        .then((res) => {
          state.playerUserId =
            res.data?.userId !== undefined ? res.data?.userId : 'unknown'
          state.connectedWeb3 = res.data?.hasConnectedWeb3
        })
        .catch(console.error)
    },
    1,
    'player-api-system'
  )
}

async function handleBalance(): Promise<void> {
  console.log('Checking balance')
  crypto.mana
    .myBalance()
    .then((balance: any) => {
      state.currentBalance = balance
    })
    .catch(console.error)
}

async function handleSendMana(): Promise<void> {
  console.log('Sending Mana')
  await crypto.mana.send(`0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee`, 1.22)
}

async function handleGasPrice(): Promise<void> {
  console.log('Checking Gas price')
  const res = await sendAsync({
    id: 0,
    method: 'eth_gasPrice',
    jsonParams: '[]'
  })

  const gasPriceResult = JSON.parse(res.jsonAnyResponse)
  const gasPrice = Number(gasPriceResult?.result)
  console.log('asdasd', { gasPriceResult })
  state.gasPrice = gasPrice
}

export function MainSceneUi(): JSX.Element {
  return (
    <UiBox width={400} height={300} uiTransform={{ padding: 10 }}>
      <Label
        value={`Player UserId: ${state.playerUserId}`}
        uiTransform={{ height: 30 }}
      />
      {state.connectedWeb3 !== true && (
        <Label
          value="Only web3 connection can send transaction (library limitation)"
          uiTransform={{ height: 30 }}
        />
      )}

      <Button
        onMouseDown={callPromise(handleBalance)}
        disabled={state.connectedWeb3 !== true}
        value="Check Mana Balance"
      ></Button>
      {state.currentBalance !== undefined && (
        <Label
          value={`Balance: ${state.currentBalance}`}
          uiTransform={{ height: 30 }}
        />
      )}

      <Button
        uiTransform={{ margin: { top: 10 } }}
        onMouseDown={callPromise(handleSendMana)}
        disabled={state.connectedWeb3 !== true}
        value="Try send Mana"
      ></Button>

      <Button
        uiTransform={{ margin: { top: 10 } }}
        onMouseDown={callPromise(handleGasPrice)}
        value="Check Gas Price"
      ></Button>
      {state.gasPrice !== undefined && (
        <Label
          value={`Gas price: ${state.gasPrice}`}
          uiTransform={{ height: 30 }}
        />
      )}
    </UiBox>
  )
}
