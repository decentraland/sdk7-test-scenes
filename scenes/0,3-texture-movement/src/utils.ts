import {
  engine,
  Transform,
  MeshRenderer,
  Material,
  TextureWrapMode,
  MeshCollider,
  Tween,
  EasingFunction,
  TextureMovementType,
  TweenSequence,
  TweenLoop,
  InputAction,
  pointerEventsSystem,
  Billboard,
  BillboardMode,
  TextShape
} from '@dcl/sdk/ecs'
import { Vector3, Vector2, Quaternion, Color4 } from '@dcl/sdk/math'

export function createCube(
  boxInitialPos: Vector3,
  textureWrapMode: TextureWrapMode,
  textureInitialTiling: Vector2,
  textureInitialOffset: Vector2,
  tweenDuration: number,
  easingFunction: EasingFunction,
  textureMoveStart: Vector2,
  textureMoveTarget: Vector2,
  movementType: TextureMovementType,
  sequenceLoop: TweenLoop
) {
  const boxEntity = engine.addEntity()

  Transform.create(boxEntity, {
    position: boxInitialPos
  })

  MeshRenderer.setBox(boxEntity)

  Material.setPbrMaterial(boxEntity, {
    texture: Material.Texture.Common({
      src: 'assets/dcl_icon_fullcolor.png',
      wrapMode: textureWrapMode,
      tiling: textureInitialTiling,
      offset: textureInitialOffset
    }),
    bumpTexture: Material.Texture.Common({
      src: 'assets/dcl normal.png',
      wrapMode: textureWrapMode
    })
  })

  MeshCollider.setBox(boxEntity)

  Tween.create(boxEntity, {
    duration: tweenDuration,
    easingFunction: easingFunction,
    currentTime: 0,
    playing: true,
    mode: Tween.Mode.TextureMove({
      start: textureMoveStart,
      end: textureMoveTarget,
      movementType: movementType
    })
  })

  TweenSequence.create(boxEntity, { sequence: [], loop: sequenceLoop })
}

export function createFloor() {
  const floorPlane = engine.addEntity()

  Transform.create(floorPlane, {
    position: Vector3.create(8, 0.01, 8),
    scale: Vector3.create(16, 16, 1),
    rotation: Quaternion.fromEulerDegrees(-90, 0, 0)
  })

  MeshRenderer.setPlane(floorPlane)

  Material.setBasicMaterial(floorPlane, {
    texture: Material.Texture.Common({
      src: 'assets/tiles.png',
      wrapMode: TextureWrapMode.TWM_REPEAT,
      tiling: Vector2.create(8, 8)
    })
  })

  const floorButtonBase = engine.addEntity()
  Transform.create(floorButtonBase, {
    position: Vector3.create(1, 0.5, 2),
    scale: Vector3.create(0.25, 1, 0.25)
  })
  Material.setBasicMaterial(floorButtonBase, {
    diffuseColor: Color4.White()
  })
  MeshRenderer.setBox(floorButtonBase)
  MeshCollider.setBox(floorButtonBase)

  const floorButton = engine.addEntity()
  Transform.create(floorButton, {
    position: Vector3.create(1, 1.1, 2),
    scale: Vector3.create(0.2, 0.2, 0.2)
  })
  Material.setBasicMaterial(floorButton, {
    diffuseColor: Color4.Red()
  })
  MeshRenderer.setBox(floorButton)
  MeshCollider.setBox(floorButton)

  let floortTiled = true

  pointerEventsSystem.onPointerDown(
    {
      entity: floorButton,
      opts: { button: InputAction.IA_PRIMARY, hoverText: 'Toggle Floor tiling' }
    },
    function () {
      if (floortTiled) {
        Material.setBasicMaterial(floorPlane, {
          texture: Material.Texture.Common({
            src: 'assets/tiles.png',
            wrapMode: TextureWrapMode.TWM_REPEAT,
            tiling: Vector2.create(1, 1)
          })
        })
        floortTiled = false
      } else {
        Material.setBasicMaterial(floorPlane, {
          texture: Material.Texture.Common({
            src: 'assets/tiles.png',
            wrapMode: TextureWrapMode.TWM_REPEAT,
            tiling: Vector2.create(8, 8)
          })
        })
        floortTiled = true
      }
    }
  )
}

export function createTilingPlane() {
  const plane = engine.addEntity()

  Transform.create(plane, {
    position: Vector3.create(6, 0.75, 4)
  })

  MeshRenderer.setPlane(plane)

  Material.setBasicMaterial(plane, {
    texture: Material.Texture.Common({
      src: 'assets/dcl_icon_fullcolor.png',
      wrapMode: TextureWrapMode.TWM_REPEAT
    })
  })

  Tween.create(plane, {
    duration: 4000,
    easingFunction: EasingFunction.EF_LINEAR,
    currentTime: 0,
    playing: true,
    mode: Tween.Mode.TextureMove({
      start: Vector2.create(1, 1),
      end: Vector2.create(2, 2),
      movementType: TextureMovementType.TMT_TILING
    })
  })

  TweenSequence.create(plane, { sequence: [], loop: TweenLoop.TL_YOYO })
}


export function createVerifyOtherTweens(){
  
const sign = engine.addEntity()

Transform.create(sign, {
	position: Vector3.create(8, 4, 10),
})

TextShape.create(sign, {
  text: "Rotation, Move and Scale tweens\nto verify all tweens work",
  fontSize: 8,
  outlineWidth: .2,
  outlineColor: Color4.Black()
})

Billboard.create(sign, {billboardMode: BillboardMode.BM_Y})

const myEntity = engine.addEntity()
Transform.create(myEntity, {
	position: Vector3.create(2, 1.2, 10),
})
MeshRenderer.setBox(myEntity)

Tween.create(myEntity, {
	mode: Tween.Mode.Rotate({
		start: Quaternion.fromEulerDegrees(0, 0, 0),
		end: Quaternion.fromEulerDegrees(0, 170, 0),
	}),
	duration: 700,
	easingFunction: EasingFunction.EF_LINEAR,
})

TweenSequence.create(myEntity, { sequence: [], loop: TweenLoop.TL_YOYO })

const myEntity2 = engine.addEntity()
Transform.create(myEntity2, {
	position: Vector3.create(6, 1.2, 10),
})
MeshRenderer.setBox(myEntity2)

Tween.create(myEntity2, {
	mode: Tween.Mode.Move({
		start: Vector3.create(6, 1.2, 10),
		end: Vector3.create(7, 2, 11),
	}),
	duration: 700,
	easingFunction: EasingFunction.EF_LINEAR,
})

TweenSequence.create(myEntity2, { sequence: [], loop: TweenLoop.TL_YOYO })

const myEntity3 = engine.addEntity()
Transform.create(myEntity3, {
	position: Vector3.create(12, 1.2, 10),
})
MeshRenderer.setBox(myEntity3)

Tween.create(myEntity3, {
	mode: Tween.Mode.Scale({
		start: Vector3.create(1, 1, 1),
		end: Vector3.create(2, 3, 4),
	}),
	duration: 700,
	easingFunction: EasingFunction.EF_LINEAR,
})

TweenSequence.create(myEntity3, { sequence: [], loop: TweenLoop.TL_YOYO })
}