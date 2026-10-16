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
import { feedback } from './playtest-feedback'
import { setupLeaveFeedback } from './leave-feedback'

// Tiny 3-round coin hunt, only to show feedback.ask() at different moments:
//   first coin         → Intro, then coinSpotting (single, mid-round, with comment)
//   round 1 complete   → nextGoal, playMore (Group: rating only, then with comment)
//   hunt complete      → repeatLoop, nextCoinKnown, worthIt (Group, ratings only), and a new hunt
// A second hunt asks nothing: once per visit per trigger. Player-initiated feedback: leave-feedback.tsx.
const COINS_PER_ROUND = 5
const ROUNDS = 3

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
  // setUiRenderer stays the scene's: the feedback panel has its own renderer
  ReactEcsRenderer.setUiRenderer(hud)
  setupLeaveFeedback()
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
    // disc on its edge, as a child so the parent spins freely
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
  const index = coins.indexOf(coin)
  // a second click before the removal lands
  if (index === -1) return
  coins.splice(index, 1)
  engine.removeEntity(disc)
  engine.removeEntity(coin)
  collected++
  totalCollected++

  // Intro right before the first Question: Give feedback leads straight into it.
  // With ASK_PARTICIPANTS_ONLY, only players who say yes get the game's Questions.
  // Not awaited: the player keeps playing while they are up.
  if (totalCollected === 1) {
    void feedback.intro('first-coin')
    void feedback.ask('coinSpotting', 'first-coin')
  }

  if (collected < COINS_PER_ROUND) return
  if (round === 1) void feedback.ask(['nextGoal', 'playMore'], 'round-1-complete', { comment: ['playMore'] })
  if (round === ROUNDS) return endHunt()
  round++
  spawnRound()
}

// Not awaited: ask() resolves only once the player closes the panel, and they may leave it open.
// The next hunt starts right away; the results come later.
function endHunt(): void {
  void feedback
    .ask(['repeatLoop', 'nextCoinKnown', 'worthIt'], 'hunt-complete', { comment: false })
    .then((results) => console.log(`[SCENE] end-of-hunt feedback: ${results.join(', ')}`))
  round = 1
  spawnRound()
}

function spinSystem(dt: number): void {
  for (const coin of coins) {
    const transform = Transform.getMutable(coin)
    transform.rotation = Quaternion.multiply(transform.rotation, Quaternion.fromEulerDegrees(0, 90 * dt, 0))
  }
}

const hud = () => (
  <UiEntity uiTransform={{ width: '100%', height: '100%', positionType: 'absolute' }}>
    <UiEntity
      uiTransform={{ width: '100%', height: 60, positionType: 'absolute', position: { top: 16 }, justifyContent: 'center' }}
    >
      <UiEntity
        uiTransform={{ padding: { left: 20, right: 20 }, justifyContent: 'center', alignItems: 'center' }}
        uiBackground={{ color: Color4.create(0, 0, 0, 0.5) }}
      >
        <Label
          value={`Round ${round}/${ROUNDS} · Coins ${collected}/${COINS_PER_ROUND}`}
          fontSize={22}
          color={Color4.White()}
        />
      </UiEntity>
    </UiEntity>
  </UiEntity>
)
