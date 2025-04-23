import { Schemas, engine } from '@dcl/sdk/ecs'
import { MessageBus } from '@dcl/sdk/message-bus'
import { BinaryMessageBus } from '@dcl/sdk/network/binary-message-bus'
import ReactEcs, { Label, type JSX } from '@dcl/sdk/react-ecs'
import { sendBinary } from '~system/CommunicationsController'
import { sceneEntities } from '../../utils/entity'
import { sceneSystems } from '../../utils/system'
import { UiBox } from '../../utils/ui/box'

function textToBinary(text: string): Uint8Array {
  const buffer = new ArrayBuffer(text.length)
  const view = new DataView(buffer)
  for (let i = 0; i < text.length; i++) {
    view.setUint8(i, text.charCodeAt(i))
  }
  return new Uint8Array(buffer)
}

const MyTestComponent = engine.defineComponent('sycn-test-component', {
  text: Schemas.String
})

// function getTestText(): string {
//   const arr = Array.from(engine.getEntitiesWith(MyTestComponent)).map(([entity, value]) => value)
//   return arr[0]?.text ?? ""

// }

const messageBus = new MessageBus()
const stringMessages: Array<{ message: string; sender: string }> = []

const binaryMessages: Array<{ message: Uint8Array; sender: string }> = []
const binaryMessageBus = BinaryMessageBus((message) => {
    sendBinary({
      data: [],
      peerData: [{ data: [message], address: [] }]
    })
    .then((response) => {
      binaryMessageBus.__processMessages(response.data)
    })
    .catch(console.error)
})

export function main(): void {
  const textEntity = sceneEntities.addEntity()
  MyTestComponent.create(textEntity, { text: 'hola' })

  messageBus.on('test', (message, sender) => {
    stringMessages.push({ message, sender })
  })

  binaryMessageBus.on(32 as any, (value, sender) => {
    binaryMessages.push({ message: value, sender })
  })

  sceneSystems.addSystemWithInverval(
    (_dt) => {
      messageBus.emit('test', { testdata: 'asd' })
    },
    3.5,
    'string-sync-test-system'
  )

  sceneSystems.addSystemWithInverval(
    (_dt) => {
      binaryMessageBus.emit(32 as any, textToBinary('holamundo'))
    },
    1,
    'bin-sync-test-system'
  )
}

export function UI(): JSX.Element {
  return (
    <UiBox width={400} height={100} uiTransform={{ padding: 10 }}>
      <Label value="Check the console logs" uiTransform={{ height: 30 }} />
      <Label
        value={`stringMessages total: ${stringMessages.length}`}
        uiTransform={{ height: 30 }}
      />
      <Label
        value={`External stringMessages received: ${
          stringMessages.filter((data) => data.sender !== 'self').length
        }`}
        uiTransform={{ height: 30 }}
      />
      <Label
        value={`abinaryMessages total: ${binaryMessages.length}`}
        uiTransform={{ height: 30 }}
      />
    </UiBox>
  )
}
