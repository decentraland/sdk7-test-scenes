import {
  UiCanvasInformation,
  engine,
  type PBUiCanvasInformation
} from '@dcl/sdk/ecs'
import { Color4 } from '@dcl/sdk/math'
import ReactEcs, {
  Button,
  Dropdown,
  Label,
  UiEntity,
  type JSX
} from '@dcl/sdk/react-ecs'
import { sceneSystems } from '../../utils/system'
import { UiItem } from '../../utils/ui/item'
import {
  CurrentStateEnum,
  getUiTestState,
  setUiTestStateCanvasInfo,
  setUiTestStateCurrent,
  type UiTestStateType
} from './state'

export function main(): void {
  sceneSystems.addSystemWithInverval(
    () => {
      console.log('checking')
      const maybeNewCanvasInfo = UiCanvasInformation.get(engine.RootEntity)
      const currentCanvasInfo = getUiTestState().canvasInfo
      if (
        JSON.stringify(maybeNewCanvasInfo) !== JSON.stringify(currentCanvasInfo)
      ) {
        setUiTestStateCanvasInfo({ ...maybeNewCanvasInfo })
      }
    },
    1,
    'ui-test-canvas-info'
  )
}

export function UI(): JSX.Element[] {
  return [
    <UiSelector state={getUiTestState()} />,
    <UiTest state={getUiTestState()} />
  ]
}

function UiSelector(props: { state: UiTestStateType }): JSX.Element {
  return (
    <UiEntity
      uiTransform={{
        position: { left: 0, top: 0 },
        positionType: 'absolute',
        height: '100%',
        width: '100%'
      }}
    >
      <Label
        value="Select UI"
        fontSize={32}
        textAlign="middle-center"
        uiTransform={{ width: '100%', height: 40 }}
      />
      <Dropdown
        options={Object.values(CurrentStateEnum)}
        selectedIndex={
          Object.values(CurrentStateEnum).findIndex(
            (value) => value === props.state.current
          ) ?? 0
        }
        onChange={(value: number) => {
          setUiTestStateCurrent(Object.values(CurrentStateEnum)[value])
        }}
        uiTransform={{ width: '100%', height: 40 }}
      />
    </UiEntity>
  )
}

function UiTest(props: { state: UiTestStateType }): JSX.Element {
  const uiStateUi = {
    [CurrentStateEnum.CSE_INITIAL]: () => (
      <InitialUi canvasInfo={getUiTestState().canvasInfo} />
    ),
    [CurrentStateEnum.CSE_POPUP]: () => (
      <PopUpUiTest canvasInfo={getUiTestState().canvasInfo} />
    ),
    [CurrentStateEnum.CSE_FLEXTEST]: () => <FlexBoxTest />,
    [CurrentStateEnum.CSE_BACKGROUND]: () => <BackgroundTest />
  }
  if (uiStateUi[props.state.current] !== undefined) {
    return uiStateUi[props.state.current]()
  }

  return <UiEntity></UiEntity>
}

function InitialUi(props: { canvasInfo: PBUiCanvasInformation }): JSX.Element {
  const { canvasInfo } = props
  return (
    <UiEntity
      uiTransform={{
        position: { left: 0, top: 0 },
        positionType: 'absolute',
        height: '100%',
        width: '100%',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center'
      }}
      uiBackground={{ color: Color4.create(1, 1, 1, 0.1) }}
    >
      <Label
        value={`UiCanvasInformation`}
        fontSize={56}
        textAlign="middle-center"
        uiTransform={{ width: '100%', height: 40 }}
      />
      <Label
        value={`size: ${canvasInfo.width} x ${canvasInfo.height} x ${canvasInfo.devicePixelRatio}`}
        fontSize={32}
        textAlign="middle-center"
        uiTransform={{ width: '100%', height: 40 }}
      />
      <Label
        value={`interactable: ${canvasInfo.interactableArea?.top}  ${canvasInfo.interactableArea?.left}  ${canvasInfo.interactableArea?.bottom}  ${canvasInfo.interactableArea?.right} `}
        fontSize={32}
        textAlign="middle-center"
        uiTransform={{ width: '100%', height: 40 }}
      />
    </UiEntity>
  )
}

function PopUpUiTest(props: {
  canvasInfo: PBUiCanvasInformation
}): JSX.Element {
  return (
    <UiEntity
      uiTransform={{
        position: { left: 0, top: 0 },
        positionType: 'absolute',
        height: '100%',
        width: '100%',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center'
      }}
      uiBackground={{ color: Color4.create(1, 1, 1, 0.1) }}
    >
      <UiEntity
        uiBackground={{
          color: Color4.Purple()
        }}
        uiTransform={{ width: 400, height: 300, flexDirection: 'column' }}
      >
        <Label
          uiTransform={{ height: '15%', justifyContent: 'flex-end' }}
          fontSize={36}
          value="Title popup"
        />
        <Label
          fontSize={16}
          uiTransform={{ width: '100%', height: '65%' }}
          value={wrapText(
            'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Donec auctor, nisl eget ultricies ultrices, nunc nisl ultricies nunc, quis ultricies nisl nisl eget nisl. Donec auctor, nisl eget ultricies ultrices, nunc nisl ultricies nunc, quis ultricies nisl nisl eget nisl.',
            40
          )}
        />
        <UiEntity
          uiTransform={{
            height: '20%',
            justifyContent: 'center',
            alignItems: 'flex-start'
          }}
        >
          <Button
            uiTransform={{ width: '40%' }}
            value="Accept"
            uiBackground={{ color: Color4.Red() }}
            color={Color4.White()}
          />
          <UiEntity uiTransform={{ width: 20 }} />
          <Button
            uiTransform={{ width: '40%' }}
            value="Close"
            uiBackground={{ color: Color4.Red() }}
            color={Color4.White()}
          />
        </UiEntity>
      </UiEntity>
    </UiEntity>
  )
}

function wrapText(text: string, maxLineLength: number): string {
  const words = text.split(' ')
  let currentLineLength = 0
  let currentLine = ''
  let result = ''
  for (let i = 0; i < words.length; i++) {
    const word = words[i]
    if (currentLineLength + word.length > maxLineLength) {
      result += currentLine + '\n'
      currentLine = ''
      currentLineLength = 0
    }
    currentLine += word + ' '
    currentLineLength += word.length + 1
  }
  result += currentLine
  return result
}

function MainCanvas(props: any): JSX.Element {
  return (
    <UiItem
      position={{ left: 0, top: 0 }}
      positionType="absolute"
      height="100%"
      width="100%"
      color={Color4.create(1, 1, 1, 0.1)}
    >
      {props.children}
    </UiItem>
  )
}

function FlexBoxTest(): JSX.Element {
  return (
    <MainCanvas>
      <UiItem
        flexDirection={'column'}
        color={Color4.Blue()}
        width="50%"
        height="50%"
        position={{ top: '25%', left: '25%' }}
      >
        <UiItem flexGrow={2}>
          <UiItem color={Color4.Yellow()} width={'25%'} />
          <UiItem color={Color4.White()} width={'25%'} />
          <UiItem color={Color4.Black()} width={'25%'} />
        </UiItem>
        <UiItem flexGrow={1}>
          <UiItem color={Color4.Red()} width={'25%'} />
          <UiItem color={Color4.Purple()} flexGrow={1} />
          <UiItem color={Color4.Green()} width={'25%'} />
        </UiItem>
        <UiItem flexGrow={1}>
          <UiItem color={Color4.Purple()} width={'5%'} />
          <UiItem color={Color4.Green()} flexGrow={1} />
          <UiItem color={Color4.White()} flexGrow={4} />
        </UiItem>
        <UiItem color={Color4.Gray()} flexGrow={5}>
          <UiItem flexGrow={1} flexDirection={'column'}>
            <UiItem
              color={Color4.Yellow()}
              height={'10%'}
              justifyContent="center"
            >
              <UiItem color={Color4.Green()} width={'10%'} height={'40%'} />
              <UiItem color={Color4.Black()} width={'10%'} height={'80%'} />
              <UiItem color={Color4.Purple()} width={'10%'} height={'60%'} />
            </UiItem>
            <UiItem
              color={Color4.Red()}
              height={'10%'}
              justifyContent="flex-end"
            >
              <UiItem color={Color4.Green()} width={'10%'} height={'40%'} />
              <UiItem color={Color4.Black()} width={'10%'} height={'80%'} />
              <UiItem color={Color4.Purple()} width={'10%'} height={'60%'} />
            </UiItem>
            <UiItem
              color={Color4.Yellow()}
              height={'10%'}
              justifyContent="flex-start"
            >
              <UiItem color={Color4.Green()} width={'10%'} height={'40%'} />
              <UiItem color={Color4.Black()} width={'10%'} height={'80%'} />
              <UiItem color={Color4.Purple()} width={'10%'} height={'60%'} />
            </UiItem>
            <UiItem
              color={Color4.Red()}
              height={'10%'}
              justifyContent="space-around"
            >
              <UiItem color={Color4.Green()} width={'10%'} height={'40%'} />
              <UiItem color={Color4.Black()} width={'10%'} height={'80%'} />
              <UiItem color={Color4.Purple()} width={'10%'} height={'60%'} />
            </UiItem>
            <UiItem
              color={Color4.Yellow()}
              height={'10%'}
              justifyContent="space-between"
            >
              <UiItem color={Color4.Green()} width={'10%'} height={'40%'} />
              <UiItem color={Color4.Black()} width={'10%'} height={'80%'} />
              <UiItem color={Color4.Purple()} width={'10%'} height={'60%'} />
            </UiItem>
            <UiItem
              color={Color4.Red()}
              height={'10%'}
              justifyContent="space-evenly"
            >
              <UiItem color={Color4.Green()} width={'10%'} height={'40%'} />
              <UiItem color={Color4.Black()} width={'10%'} height={'80%'} />
              <UiItem color={Color4.Purple()} width={'10%'} height={'60%'} />
            </UiItem>
            <UiItem
              color={Color4.Yellow()}
              height={'10%'}
              justifyContent="center"
              alignItems="center"
            >
              <UiItem color={Color4.Green()} width={'10%'} height={'40%'} />
              <UiItem color={Color4.Black()} width={'10%'} height={'80%'} />
              <UiItem color={Color4.Purple()} width={'10%'} height={'60%'} />
            </UiItem>
            <UiItem
              color={Color4.Red()}
              height={'10%'}
              justifyContent="center"
              alignItems="flex-end"
            >
              <UiItem color={Color4.Green()} width={'10%'} height={'40%'} />
              <UiItem color={Color4.Black()} width={'10%'} height={'80%'} />
              <UiItem color={Color4.Purple()} width={'10%'} height={'60%'} />
            </UiItem>
            <UiItem
              color={Color4.Yellow()}
              height={'10%'}
              justifyContent="center"
              alignItems="stretch"
            >
              <UiItem color={Color4.Green()} width={'10%'} height={'40%'} />
              <UiItem color={Color4.Black()} width={'10%'} height={'80%'} />
              <UiItem color={Color4.Purple()} width={'10%'} height={'60%'} />
            </UiItem>
          </UiItem>
        </UiItem>
      </UiItem>
    </MainCanvas>
  )
}

const backgroundTextureTests = [
  {
    description: 'Stretch',
    value: (
      <UiItem
        texture={{
          src: 'assets/9slice.png',
          wrapMode: 'repeat',
          filterMode: 'bi-linear'
        }}
        textureMode="stretch"
        width={'100%'}
        height={'100%'}
      />
    )
  },
  {
    description: 'Stretch with colored',
    value: (
      <UiItem
        texture={{
          src: 'assets/9slice.png',
          wrapMode: 'repeat',
          filterMode: 'bi-linear'
        }}
        textureMode="stretch"
        width={'100%'}
        height={'100%'}
        color={Color4.Blue()}
      />
    )
  },
  {
    description: 'Stretch with uvs',
    value: (
      <UiItem
        texture={{
          src: 'assets/9slice.png',
          wrapMode: 'repeat',
          filterMode: 'bi-linear'
        }}
        textureMode="stretch"
        width={'100%'}
        height={'100%'}
        uvs={[0, 0, 0.5, 0.5]}
      />
    )
  },
  {
    description: 'Using avatar texture',
    value: (
      <UiItem
        avatarTexture={{
          userId: '0xa24793319d07844ebbee32f76b41e85bf81321d4'
        }}
        uvs={[0, 0, 1, 1]}
        width={'100%'}
        height={'100%'}
      />
    )
  },
  {
    description: 'NineSlices with default textureSlices',
    value: (
      <UiItem
        texture={{
          src: 'assets/9slice.png',
          wrapMode: 'repeat',
          filterMode: 'bi-linear'
        }}
        textureMode="nine-slices"
        width={'100%'}
        height={'100%'}
      />
    )
  },
  {
    description: 'NineSlices with right values',
    value: (
      <UiItem
        texture={{
          src: 'assets/9slice.png',
          wrapMode: 'repeat',
          filterMode: 'bi-linear'
        }}
        textureMode="nine-slices"
        textureSlices={{
          top: 115 / 256.0,
          right: 115 / 256.0,
          bottom: 115 / 256.0,
          left: 115 / 256.0
        }}
        width={'100%'}
        height={'100%'}
      />
    )
  },
  {
    description: 'Smaller NineSlices with right values',
    value: (
      <UiItem
        texture={{
          src: 'assets/9slice.png',
          wrapMode: 'repeat',
          filterMode: 'bi-linear'
        }}
        textureMode="nine-slices"
        textureSlices={{
          top: 115 / 256.0,
          right: 115 / 256.0,
          bottom: 115 / 256.0,
          left: 115 / 256.0
        }}
        width={'50%'}
        height={'50%'}
      />
    )
  }
]

let backgroundTextureTestIndex = 0
function BackgroundTest(): JSX.Element {
  return (
    <UiItem
      position={{ left: 0, top: 0 }}
      positionType="absolute"
      height="100%"
      width="100%"
      flexDirection="column"
      color={Color4.create(1, 1, 1, 0.1)}
    >
      <UiItem
        flexDirection={'column'}
        color={Color4.Blue()}
        width="50%"
        position={{ top: '25%', left: '25%' }}
      >
        <Dropdown
          options={backgroundTextureTests.map((value) => value.description)}
          selectedIndex={backgroundTextureTestIndex}
          onChange={(value: number) => {
            backgroundTextureTestIndex = value
          }}
          uiTransform={{ width: '100%', height: 40 }}
        />
      </UiItem>
      <UiItem
        flexDirection={'column'}
        color={Color4.Blue()}
        width="50%"
        height="50%"
        position={{ top: '25%', left: '25%' }}
      >
        {backgroundTextureTests[backgroundTextureTestIndex].value}
      </UiItem>
    </UiItem>
  )
}
