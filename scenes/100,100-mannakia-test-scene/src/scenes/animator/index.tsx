import ReactEcs, {
  Button,
  Input,
  Label,
  UiEntity,
  type JSX
} from '@dcl/sdk/react-ecs'
import { sceneSystems } from '../../utils/system'
import { UiBox } from '../../utils/ui/box'

import {
  Animator,
  GltfContainer,
  Transform,
  type Entity,
  type PBAnimationState
} from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'
import { sceneEntities } from '../../utils/entity'

let animatorEntity: Entity

type State = {
  weight: Record<string, string>
  speed: Record<string, string>
}

const state: State = {
  weight: {
    swim: '1.0',
    bite: '1.0'
  },
  speed: {
    swim: '1.0',
    bite: '1.0'
  }
}

function respawnShark(): void {
  sceneEntities.removeEntity(animatorEntity)
  animatorEntity = sceneEntities.addEntity()

  const position = Vector3.create(8, 3, 8)
  Transform.createOrReplace(animatorEntity, {
    position: Vector3.add(position, Vector3.create(0, 0, -0.05))
  })
  GltfContainer.create(animatorEntity, { src: 'assets/shark/shark.glb' })
  Animator.createOrReplace(animatorEntity, {
    states: [
      {
        clip: 'swim'
      },
      {
        clip: 'bite'
      }
    ]
  })
}

export function main(): void {
  respawnShark()

  sceneSystems.addSystemWithInverval(
    (_dt) => {
      // const width = state.textShape.width ?? 4
      // const height = state.textShape.height ?? 4
      // TextShape.createOrReplace(textShapeEntity, { ...state.textShape })
      // const position = Vector3.create(8, 1 + height / 2, 8)
      // Transform.createOrReplace(textShapeEntity, {
      //   position: Vector3.add(position, Vector3.create(0, 0, -0.05))
      // })
      // Transform.createOrReplace(plane, {
      //   position,
      //   scale: Vector3.create(width, height, 1)
      // })
    },
    0.1,
    'animator-api-system'
  )
}

// clip: string;
// /** whether this animation is currently playing */
// playing?: boolean | undefined;
// /** the "weight" of this animation (see below, default: 1.0) */
// weight?: number | undefined;
// /** the playback speed (default: 1.0) */
// speed?: number | undefined;
// /** whether the animation repeats until stopped (default: true) */
// loop?: boolean | undefined;
// /** whether the Entity is restored to its prior state when done */
// shouldReset?: boolean | undefined;

// Get the value with default fallback
function getImmutableClip(clip: string): PBAnimationState {
  if (Animator.getOrNull(animatorEntity) === null) {
    return {
      clip,
      playing: false,
      weight: 1.0,
      speed: 1.0,
      loop: true,
      shouldReset: false
    }
  }

  const value = Animator.get(animatorEntity).states.find(
    (state) => state.clip === clip
  ) as PBAnimationState

  return {
    clip: value.clip,
    playing: value.playing ?? false,
    weight: value.weight ?? 1.0,
    speed: value.speed ?? 1.0,
    loop: value.loop ?? true,
    shouldReset: value.shouldReset ?? false
  }
}

function AnimatorClip(props: { clip: string }): JSX.Element {
  return (
    <UiBox
      width={280}
      height={280}
      color={Color4.create(1.0, 1.0, 1.0, 0.2)}
      fixedPosition={false}
    >
      <Label
        fontSize={20}
        uiTransform={{ minHeight: 30 }}
        value={`Clip=${props.clip}`}
      />
      <Button
        uiBackground={{
          color:
            getImmutableClip(props.clip).playing === true
              ? Color4.Green()
              : Color4.Red()
        }}
        uiTransform={{ width: '100%' }}
        value="Playing"
        onMouseDown={() => {
          const clip = Animator.getClip(animatorEntity, props.clip)
          clip.playing = getImmutableClip(props.clip).playing !== true
        }}
        fontSize={20}
      />
      <Button
        uiBackground={{
          color:
            getImmutableClip(props.clip).loop === true
              ? Color4.Green()
              : Color4.Red()
        }}
        uiTransform={{ width: '100%' }}
        value="Loop"
        onMouseDown={() => {
          const clip = Animator.getClip(animatorEntity, props.clip)
          clip.loop = getImmutableClip(props.clip).loop !== true
        }}
        fontSize={20}
      />
      <Button
        uiBackground={{
          color:
            getImmutableClip(props.clip).shouldReset === true
              ? Color4.Green()
              : Color4.Red()
        }}
        uiTransform={{ width: '100%' }}
        value="ShouldReset"
        onMouseDown={() => {
          const clip = Animator.getClip(animatorEntity, props.clip)
          clip.shouldReset = getImmutableClip(props.clip).shouldReset !== true
        }}
        fontSize={20}
      />
      <UiEntity>
        <Label
          fontSize={20}
          uiTransform={{ minHeight: 30, minWidth: '50%' }}
          value={`Weight=${(getImmutableClip(props.clip).weight ?? 1).toFixed(
            2
          )}`}
        />
        <Input
          uiTransform={{ width: '50%' }}
          value={state.weight[props.clip]}
          onChange={(newValue) => {
            const clip = Animator.getClip(animatorEntity, props.clip)
            const newNumber = Number(newValue)
            if (newNumber >= 0 && newNumber <= 1) {
              clip.weight = newNumber
            }
            state.weight[props.clip] = newValue
          }}
          fontSize={20}
        />
      </UiEntity>
      <UiEntity>
        <Label
          fontSize={20}
          uiTransform={{ minHeight: 30, minWidth: '50%' }}
          value={`Speed=${(getImmutableClip(props.clip).speed ?? 1).toFixed(
            2
          )}`}
        />
        <Input
          uiTransform={{ width: '50%' }}
          value={state.speed[props.clip]}
          onChange={(newValue) => {
            const clip = Animator.getClip(animatorEntity, props.clip)
            const newNumber = Number(newValue)
            if (newNumber >= 0 && newNumber <= 100.0) {
              clip.speed = newNumber
            }
            state.speed[props.clip] = newValue
          }}
          fontSize={20}
        />
      </UiEntity>
    </UiBox>
  )
}
export function MainSceneUi(): JSX.Element {
  return [
    <UiBox width={600} height={300} uiTransform={{ padding: 10 }}>
      <UiEntity>
        <AnimatorClip clip="swim" />
        <AnimatorClip clip="bite" />
      </UiEntity>
    </UiBox>,
    
    <UiBox width={200} height={300} uiTransform={{ padding: 10 }}>
    <Button value='Spawn Teleporter' onMouseDown={() => {
      respawnTeleporter()
    }} /> 
    <Button value='Remove Teleporter' onMouseDown={() => {
  if (teleporterEntity !== null) {
    sceneEntities.removeEntity(teleporterEntity)
  }
  teleporterEntity = null
    }} />
    </UiBox>
  ]
}


let teleporterEntity: Entity | null = null
function respawnTeleporter(): void {
  if (teleporterEntity !== null) {
    sceneEntities.removeEntity(teleporterEntity)
  }

  const newEntity = sceneEntities.addEntity()
  teleporterEntity = newEntity

  GltfContainer.create(newEntity, { src: 'assets/teleporter/teleporter.glb' })
  Transform.createOrReplace(newEntity, {
    position: Vector3.create(2, 0, 8)
  })
    
  Animator.create(newEntity, {
      states:[
      {
          clip: "teleportOpen",
          playing: true,
          loop: false,
          shouldReset: true,
      },
      {
          clip: "teleportClose",
          playing: false,
          loop: false
      }
      ]
  })

  // Animator.stopAllAnimations(newEntity)
  // const doorOpenAnim = Animator.getClip(newEntity, "teleportOpen")
  // doorOpenAnim.playing = true

}
