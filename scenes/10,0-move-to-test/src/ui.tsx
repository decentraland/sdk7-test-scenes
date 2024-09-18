import ReactEcs, { Button, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { movePlayerTo } from '~system/RestrictedActions'
import { Vector3 } from '@dcl/sdk/math'
import { createCube } from './factory'

export function setupUi() {
  ReactEcsRenderer.setUiRenderer(uiComponent);
  Cubes();
}

const uiComponent = () => (
  [
    Fetch()
  ]
)

const playerPositions = [
  Vector3.create(1, 2.5, 6),
  Vector3.create(2, 3.5, 6),
  Vector3.create(3, 4.5, 6),
  Vector3.create(4, 5.5, 6),
  Vector3.create(4, 5.5, 8),
  Vector3.create(3, 4.5, 8),
  Vector3.create(2, 3.5, 8)
];

let currentPositionIndex = 0;

function Cubes(){
createCube(1,2,6);
createCube(2,3,6);
createCube(3,4,6);
createCube(4,5,6);
createCube(4,5,8);
createCube(3,4,8);
createCube(2,3,8);
}

function Fetch() {
  return <UiEntity
      uiTransform={{
          positionType: 'absolute',
          position: { right: '50px', bottom: '450px' },
      }}
  >
      <UiEntity
          uiTransform={{
            margin : '0px 0px 0px 10px',
          }}
      >
        <Button
          value="Move Player"
          fontSize={20}
          variant="primary"
          uiTransform={{ width: 300, height: 50 }}
          onMouseDown={() => {
            movePlayerTo({ newRelativePosition: playerPositions[currentPositionIndex] });
            currentPositionIndex = (currentPositionIndex + 1) % playerPositions.length;}}
         />
      </UiEntity>
  </UiEntity>
}