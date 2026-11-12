import { engine, Entity, Transform } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'

export type CubeHint = {
    title: string
    whatIsTested: string
    steps: string
    getStatus?: () => string
}

// Close enough to click the cube
const hintDistance = 3

const hints: [Entity, CubeHint][] = []
let nearbyHint: CubeHint | undefined

export function addCubeHint(cube: Entity, hint: CubeHint) {
    if (hints.length === 0) engine.addSystem(updateNearbyHint)
    hints.push([cube, hint])
}

export function getNearbyCubeHint(): CubeHint | undefined {
    return nearbyHint
}

function updateNearbyHint() {
    nearbyHint = undefined
    const player = Transform.getOrNull(engine.PlayerEntity)
    if (player === null) return

    for (const [cube, hint] of hints) {
        if (Vector3.distance(player.position, Transform.get(cube).position) <= hintDistance) {
            nearbyHint = hint
            return
        }
    }
}
