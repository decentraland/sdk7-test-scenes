import {
  Animator,
  ColliderLayer,
  engine,
  GltfContainer,
  InputAction,
  pointerEventsSystem,
  Transform
} from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { setupUi } from './ui'

export function main() {

  const shark = engine.addEntity()

  Transform.create(shark, {
    position: Vector3.create(8, 3, 8)
  })

  GltfContainer.create(shark, {
    src: 'models/shark.glb',
    visibleMeshesCollisionMask: ColliderLayer.CL_POINTER,
    invisibleMeshesCollisionMask: undefined
  })

  Animator.create(shark, {
    states: [
      {
        clip: 'swim',
        playing: false,
        loop: true,
        weight: 1,
      },
      {
        clip: 'bite',
        playing: false,
        loop: true,
        weight: 0.5,
      }
    ]
  })

  let clickCounter = 0;

  let event = pointerEventsSystem.onPointerDown(
    {
      entity: shark,
      opts: {
        button: InputAction.IA_POINTER,
        hoverText: "Clickity click me!",
      }
    },
    () => {
      if (clickCounter === 0)
      {
        clickCounter = 1;
        Animator.playSingleAnimation(shark, "swim");
      } else if (clickCounter === 1)
      {
        clickCounter = 2;
      // TODO use Animator.getClip()
      Animator.playSingleAnimation(shark, "bite");
    }
      else if (clickCounter === 2) {
        clickCounter = 3;
        Animator.playSingleAnimation(shark, "swim");
        let animation = Animator.getClip(shark,"bite");
        animation.playing = true;
      }
      else {
        Animator.stopAllAnimations(shark);
        clickCounter = 0;
      }
    }
  )

  // UI with GitHub link
  setupUi()
}
