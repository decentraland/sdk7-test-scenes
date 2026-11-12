import {
    Animator,
    AudioSource,
    engine,
    Entity,
    GltfContainer,
    Transform,
    TriggerArea, triggerAreaEventsSystem,
    Tween
} from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'

/**
 * Sound is a separated from the coin entity so that you can
 * still hear it even when the coin is removed from the engine.
 */
const coinPickupSound = engine.addEntity()
Transform.create(coinPickupSound)
AudioSource.create(coinPickupSound, { audioClipUrl: 'sounds/coinPickup.mp3' })

export function createCoin(model: string, position: Vector3): Entity {
    const entity = engine.addEntity()
    GltfContainer.create(entity, { src: model })
    Transform.create(entity, { position })

    // Use Tween instead of animation
    Animator.stopAllAnimations(entity)
    Tween.setRotateContinuous(entity, Quaternion.fromEulerDegrees(0, -1, 0), 100)
    
    TriggerArea.setSphere(entity)
    triggerAreaEventsSystem.onTriggerEnter(entity, () => {
        Transform.getMutable(coinPickupSound).position = Transform.get(engine.PlayerEntity).position
        AudioSource.getMutable(coinPickupSound).playing = true

        triggerAreaEventsSystem.removeOnTriggerEnter(entity)
        engine.removeEntity(entity)
    })

    return entity
}
