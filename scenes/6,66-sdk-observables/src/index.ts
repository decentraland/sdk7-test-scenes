import { Vector3, Quaternion, Color4, Color3 } from '@dcl/sdk/math'
import { 
  engine,
  Transform,
  RealmInfo,
  EngineInfo,
  TextShape,
  Entity
} from '@dcl/sdk/ecs'
import {
  onEnterSceneObservable,
  onLeaveSceneObservable,
  onPlayerConnectedObservable,
  onPlayerDisconnectedObservable,
  onPlayerExpressionObservable, 
  onProfileChanged,
  onRealmChangedObservable,
  onSceneReadyObservable
} from '@dcl/sdk/observables';
export function main() {
  // Observables usage: https://docs.decentraland.org/creator/development-guide/sdk7/deprecated-functions/

  // sceneStart
  onSceneReadyObservable.add(() => {
    console.log('OBSERVABLE-LOG - onSceneReady!')
    SpawnTextShape(engine.addEntity(),
        "OBSERVABLES TEST",
        Vector3.create(8, 9, 13),
        Quaternion.Identity()
    )
    SpawnTextShape(engine.addEntity(),
        "OnSceneReady CALLED",
        Vector3.create(8, 8, 13),
        Quaternion.Identity()
    )
  })

  // onEnterScene
  let onEnterSceneEntity:any = undefined
  onEnterSceneObservable.add((player) => {
    if (!onEnterSceneEntity) {
      onEnterSceneEntity = engine.addEntity()
      SpawnTextShape(onEnterSceneEntity,
          "OnEnterScene userId: ",
          Vector3.create(8, 7, 13),
          Quaternion.Identity()
      )
    }

    console.log(`OBSERVABLE-LOG - onEnterScene! userId: ${player?.userId}`)
    TextShape.getMutable(onEnterSceneEntity).text = `OnEnterScene userId: ${player?.userId}`
  })

  // onPlayerConnected
  let onPlayerConnectedEntity:any = undefined
  onPlayerConnectedObservable.add((player) => {
    if (!onPlayerConnectedEntity) {
      onPlayerConnectedEntity = engine.addEntity()
      SpawnTextShape(onPlayerConnectedEntity,
          "onPlayerConnected userId: ",
          Vector3.create(8, 6, 13),
          Quaternion.Identity()
      )
    }

    console.log('OBSERVABLE-LOG - onPlayerConnected! ', player.userId)
    TextShape.getMutable(onPlayerConnectedEntity).text = `onPlayerConnected userId: ${player?.userId}`
  })

  // onLeaveScene
  let onLeaveSceneEntity:any = undefined
  onLeaveSceneObservable.add((player) => {
    if(!onLeaveSceneEntity) {
      onLeaveSceneEntity = engine.addEntity()
      SpawnTextShape(onLeaveSceneEntity,
          "OnLeaveScene userId: ",
          Vector3.create(8, 5, 13),
          Quaternion.Identity()
      )
    }

    console.log(`OBSERVABLE-LOG - onLeaveScene! userId: ${player?.userId}`)
    TextShape.getMutable(onLeaveSceneEntity).text = `OnLeaveScene userId: ${player?.userId}`
  })

  // onPlayerDisconnected
  let onPlayerDisconnectedEntity:any = undefined
  onPlayerDisconnectedObservable.add((player) => {
    if(!onPlayerDisconnectedEntity) {
      onPlayerDisconnectedEntity = engine.addEntity()
      SpawnTextShape(onPlayerDisconnectedEntity,
          "onPlayerDisconnected userId: ",
          Vector3.create(8, 4, 13),
          Quaternion.Identity()
      )
    }

    console.log('OBSERVABLE-LOG - onPlayerDisconnected! ', player.userId)
    TextShape.getMutable(onPlayerDisconnectedEntity).text = `onPlayerDisconnected userId: ${player?.userId}`
  })

  // onPlayerExpression
  let onPlayerExpressionEntity:any = undefined
  onPlayerExpressionObservable.add(({ expressionId }) => {
    if(!onPlayerExpressionEntity) {
      onPlayerExpressionEntity = engine.addEntity()
      SpawnTextShape(onPlayerExpressionEntity,
          "onPlayerExpressionEntity emoteId: ",
          Vector3.create(8, 3, 13),
          Quaternion.Identity()
      )
    }

    console.log('OBSERVABLE-LOG - onPlayerExpression! ', expressionId)
    TextShape.getMutable(onPlayerExpressionEntity).text = `onPlayerExpressionEntity emoteId: ${expressionId}`
  })

  // onProfileChanged
  let onProfileChangedEntity:any = undefined
  onProfileChanged.add((profileData) => {
    if(!onProfileChangedEntity) {
      onProfileChangedEntity = engine.addEntity()
      SpawnTextShape(onProfileChangedEntity,
          "onProfileChanged profileAddress: ",
          Vector3.create(8, 2, 13),
          Quaternion.Identity()
      )
    }

    console.log('OBSERVABLE-LOG - onProfileChanged! ', profileData.ethAddress) // own profile change
    TextShape.getMutable(onProfileChangedEntity).text = `onProfileChanged profileAddress: ${profileData.ethAddress}`
  })

  // Difficult to test:
  
  // onPlayerClicked
  // onPlayerClickedObservable.add((clickEvent) => {
  //   console.log('OBSERVABLE-LOG - onPlayerClicked! ', clickEvent.userId, ' details: ', clickEvent.ray)
  // })
  
  // onRealmChanged
  let onRealmChangedEntity:any = undefined
  onRealmChangedObservable.add((realmChange) => {
    if(!onRealmChangedEntity) {
      onRealmChangedEntity = engine.addEntity()
      SpawnTextShape(onRealmChangedEntity,
          "onRealmChanged realmName: ",
          Vector3.create(8, 1, 13),
          Quaternion.Identity()
      )
    }

    console.log('OBSERVABLE-LOG - onRealmChanged! ', realmChange.room)
    TextShape.getMutable(onRealmChangedEntity).text = `onRealmChanged realmName: ${realmChange.displayName}`
  })
}

function SpawnTextShape(entity: Entity, text: string, position: Vector3, rotation: Quaternion) {
  Transform.create(entity, {
    position,
    rotation
  })
  TextShape.create(entity, {
    text,
    textColor: Color4.Red(),
    outlineColor: Color3.Black(),
    outlineWidth: 0.15,
    fontSize: 6,
    textWrapping: false,
    width: 100
  })
}
