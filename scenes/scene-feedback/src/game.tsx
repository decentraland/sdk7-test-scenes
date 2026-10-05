import {
  Entity,
  InputAction,
  Material,
  MeshCollider,
  MeshRenderer,
  TextAlignMode,
  TextShape,
  Transform,
  engine,
  pointerEventsSystem
} from '@dcl/sdk/ecs'
import { Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import ReactEcs, { Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { feedback } from './feedback'

// A tiny coin hunt, only here to show feedback.ask() at different moments of play:
//   first coin of the visit  → coinSpotting (mid-round, the round keeps going)
//   round 1 complete         → nextGoal
//   round 2 complete         → repeatLoop, then playMore once repeatLoop is answered or skipped
//   round 3 complete         → nextCoinKnown
const COINS_PER_ROUND = 5

let round = 1
let collected = 0
let totalCollected = 0
const coins: Entity[] = []

export function setupGame(): void {
  const ground = engine.addEntity()
  Transform.create(ground, { position: Vector3.create(8, 0, 8), scale: Vector3.create(16, 0.1, 16) })
  MeshRenderer.setBox(ground)
  MeshCollider.setBox(ground)
  Material.setPbrMaterial(ground, { albedoColor: Color4.fromHexString('#1b2a4aff') })

  const sign = engine.addEntity()
  Transform.create(sign, { position: Vector3.create(8, 2.5, 15) })
  TextShape.create(sign, {
    text: 'COIN HUNT\n\nClick the coins.\nFeedback questions pop up as you play.',
    fontSize: 3,
    textColor: Color4.White(),
    textAlign: TextAlignMode.TAM_MIDDLE_CENTER
  })

  engine.addSystem(spinSystem)
  // The scene's own UI keeps setUiRenderer: the feedback panel renders alongside.
  ReactEcsRenderer.setUiRenderer(hud)
  spawnRound()
}

function spawnRound(): void {
  collected = 0
  for (let i = 0; i < COINS_PER_ROUND; i++) {
    const coin = engine.addEntity()
    Transform.create(coin, {
      position: Vector3.create(2 + Math.random() * 12, 1, 2 + Math.random() * 11),
      scale: Vector3.create(0.8, 0.8, 0.8)
    })
    // A flat cylinder standing on its edge, as a child so the parent can spin freely.
    const disc = engine.addEntity()
    Transform.create(disc, {
      parent: coin,
      rotation: Quaternion.fromEulerDegrees(90, 0, 0),
      scale: Vector3.create(1, 0.1, 1)
    })
    MeshRenderer.setCylinder(disc)
    MeshCollider.setCylinder(disc)
    Material.setPbrMaterial(disc, { albedoColor: Color4.fromHexString('#ffc933ff'), metallic: 0.8, roughness: 0.3 })
    pointerEventsSystem.onPointerDown(
      { entity: disc, opts: { button: InputAction.IA_POINTER, hoverText: 'Collect' } },
      () => collect(coin, disc)
    )
    coins.push(coin)
  }
}

function collect(coin: Entity, disc: Entity): void {
  engine.removeEntity(disc)
  engine.removeEntity(coin)
  coins.splice(coins.indexOf(coin), 1)
  collected++
  totalCollected++

  // Mid-round: not awaited, the player keeps playing while the Question is up.
  if (totalCollected === 1) void feedback.ask('coinSpotting', 'first-coin')

  if (collected < COINS_PER_ROUND) return
  if (round === 1) void feedback.ask('nextGoal', 'round-1-complete')
  if (round === 2) void askAfterRepeat()
  if (round === 3) void feedback.ask('nextCoinKnown', 'round-3-complete')
  round++
  spawnRound()
}

// A short series: the follow-up waits for the player to finish the first Question.
async function askAfterRepeat(): Promise<void> {
  const result = await feedback.ask('repeatLoop', 'round-2-complete')
  if (result === 'submitted' || result === 'skipped') void feedback.ask('playMore', 'after-round-2')
}

function spinSystem(dt: number): void {
  for (const coin of coins) {
    const transform = Transform.getMutable(coin)
    transform.rotation = Quaternion.multiply(transform.rotation, Quaternion.fromEulerDegrees(0, 90 * dt, 0))
  }
}

const hud = () => (
  <UiEntity
    uiTransform={{ width: '100%', height: 60, positionType: 'absolute', position: { top: 16 }, justifyContent: 'center' }}
  >
    <UiEntity
      uiTransform={{ padding: { left: 20, right: 20 }, justifyContent: 'center', alignItems: 'center' }}
      uiBackground={{ color: Color4.create(0, 0, 0, 0.5) }}
    >
      <Label value={`Round ${round} · Coins ${collected}/${COINS_PER_ROUND}`} fontSize={22} color={Color4.White()} />
    </UiEntity>
  </UiEntity>
)
