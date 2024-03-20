import { type JSX } from '@dcl/sdk/react-ecs'
import {
  main as PlayerApiTestMain,
  MainSceneUi as PlayersApiUi
} from '../players-api'
import {
  main as EthereumApiTestMain,
  MainSceneUi as EthereumApiUi
} from '../ethereum-api'
import {
  main as TextShapeApiTestMain,
  MainSceneUi as TextShapeApiUi
} from '../text-shape'
import { MainSceneUi as TweenSceneUi, main as TweenMain } from '../tweens'
import { main as GltfTest } from '../gltf-test'
import { UI as UiTestUi, main as UiTestMain } from '../ui-test'
import { UI as AvatarTestUi, main as AvatarTestMain } from '../avatar-test'
import { UI as SyncSceneUi, main as SyncSceneMain } from '../sync-scene'
import {
  MainSceneUi as AnimatorSceneUi,
  main as AnimatorSceneMain
} from '../animator'

export type SceneItem = {
  name: string
  mainFn?: () => void
  ui?: () => JSX.Element
  extended?: boolean
}

export const scenesOptions: SceneItem[] = [
  {
    name: 'Empty',
    mainFn: undefined,
    ui: undefined
  },
  {
    name: 'Players API test',
    mainFn: PlayerApiTestMain,
    ui: PlayersApiUi
  },
  {
    name: 'Ethereum API test',
    mainFn: EthereumApiTestMain,
    ui: EthereumApiUi
  },
  {
    name: 'Text Shape test',
    mainFn: TextShapeApiTestMain,
    ui: TextShapeApiUi
  },
  {
    name: 'Tween test',
    mainFn: TweenMain,
    ui: TweenSceneUi
  },
  {
    name: 'Gltf test',
    mainFn: GltfTest,
    ui: undefined
  },
  {
    name: 'Ui test',
    mainFn: UiTestMain,
    ui: UiTestUi,
    extended: true
  },
  {
    name: 'Avatar Test',
    mainFn: AvatarTestMain,
    ui: AvatarTestUi
  },
  {
    name: 'Sync Scene Test',
    mainFn: SyncSceneMain,
    ui: SyncSceneUi
  },
  {
    name: 'Animator Scene Test',
    mainFn: AnimatorSceneMain,
    ui: AnimatorSceneUi
  }
]
