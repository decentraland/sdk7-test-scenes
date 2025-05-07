import { Vector2, Vector3 } from '@dcl/sdk/math'
import { EasingFunction, TextureMovementType, TextureWrapMode, TweenLoop } from '@dcl/sdk/ecs'
import { createCube, createFloor, createTilingPlane, createVerifyOtherTweens } from './utils'

createFloor()

createCube(
  Vector3.create(3, 0.5, 4), // box initial position
  TextureWrapMode.TWM_REPEAT,
  Vector2.One(), // texture initial tiling
  Vector2.Zero(), // texture initial offset
  4000, // tween duration
  EasingFunction.EF_LINEAR,
  Vector2.create(0, 0), // texture move start
  Vector2.create(0, 1), // texture move target
  TextureMovementType.TMT_OFFSET,
  TweenLoop.TL_RESTART
)

createCube(
  Vector3.create(4, 0.5, 4), // box initial position
  TextureWrapMode.TWM_REPEAT,
  Vector2.One(), // texture initial tiling
  Vector2.Zero(), // texture initial offset
  4000, // tween duration
  EasingFunction.EF_LINEAR,
  Vector2.create(0, 0), // texture move start
  Vector2.create(-1, 0), // texture move target
  TextureMovementType.TMT_OFFSET,
  TweenLoop.TL_RESTART
)

createTilingPlane()

createVerifyOtherTweens()