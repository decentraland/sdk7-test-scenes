import { ColliderLayer, engine, PlayerIdentityData, TextShape, Transform } from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'
import { createProbeWorld, fromAbove, requireCheck, type ProbeWorld } from '../../tools/sdk-detour-probe/sdk-collision-probes'
import type { LiveRecipe } from './types'

const v = Vector3.create
const teal = Color4.create(0.18, 0.65, 0.54, 1)
const amber = Color4.create(1, 0.76, 0.25, 1)
const id = 'SDK-T03'
const title = 'Два игрока на посадке без уникальных ID луча'
export const logIntegration = (value: unknown) => console.log('[sdk-navigation-integration] ' + JSON.stringify(value))
export class MissingParticipants extends Error {}

function createRemoteLandingPads(world: ProbeWorld) {
  const pads = [v(5, 0.25, 8), v(11, 0.25, 8)]
  const floors = pads.map((pad) => world.box(v(pad.x, 0.125, pad.z), v(1.6, 0.25, 1.6), teal))
  const marker = world.marker(v(8, 0.3, 8), amber)
  return { pads, floors, marker }
}

export function* remoteAvatarSupport(
  world: ProbeWorld,
  setLabel: (label: string) => void,
  { pads, floors, marker } = createRemoteLandingPads(world)
) {
  type Hit = { entityId?: number; position?: Vector3 }
  const onPad = (hit: Hit, pad: Vector3) =>
    hit.position && Math.hypot(hit.position.x - pad.x, hit.position.z - pad.z) <= 0.35
  // The protobuf field is optional, so a native hit can omit the zero sentinel.
  const remoteHits = (samples: readonly Hit[]) => samples.filter((hit) => (hit.entityId ?? 0) === 0)
  const occupancy = (samples: readonly Hit[]) => pads.map((pad) =>
    remoteHits(samples).some((hit) => onPad(hit, pad)))
  function* readPads(mask: number) {
    const rays = pads.map((pad) => world.issueRay(fromAbove(pad, 2.4), Vector3.Down(), 2.5, mask))
    const left = yield* world.readRay(rays[0])
    const right = yield* world.readRay(rays[1])
    return [...left.hits, ...right.hits]
  }
  function* checkPhysicsMask() {
    const worldHits = yield* readPads(ColliderLayer.CL_PHYSICS)
    requireCheck(!occupancy(worldHits).some(Boolean) && floors.every((floor) => worldHits.some((hit) => hit.entityId === floor)),
      'The physics-only mask must see the platforms without the avatars.')
  }
  function* waitForOccupancy(expected: readonly boolean[], detail: string) {
    for (let attempt = 0; attempt < 2400; attempt++) {
      const hits = yield* readPads(ColliderLayer.CL_PLAYER)
      const occupied = occupancy(hits)
      if (occupied.every((value, index) => value === expected[index])) {
        return { occupied, wireIds: pads.map((pad) => remoteHits(hits).find((hit) => onPad(hit, pad))?.entityId ?? null) }
      }
      if (attempt === 0 || attempt === 90) {
        logIntegration({ stage: 'avatar-sample', expected, occupied, hits: hits.map(({ entityId, position }) =>
          ({ entityId: entityId ?? null, position })) })
      }
      yield
    }
    throw new Error(detail)
  }
  setLabel('One guest: start on the left pad. Two guests: take one pad each. Observer stays off the pads.')
  logIntegration({ stage: 'avatar-instruction', phase: 'occupy-both' })
  const remotePlayers = () => new Set([...engine.getEntitiesWith(PlayerIdentityData)]
    .flatMap(([entity, player]) => entity === engine.PlayerEntity || !player.address ? [] : [player.address])).size
  let leftSeen = false
  let singleGuestPassed = false
  for (let frames = 0; frames < 14_400 && remotePlayers() < 2; frames++) {
    if (!singleGuestPassed && remotePlayers() === 1) {
      const [left, right] = occupancy(yield* readPads(ColliderLayer.CL_PLAYER))
      if (!leftSeen && left && !right) {
        yield* checkPhysicsMask()
        leftSeen = true
        setLabel('One guest detected on the left pad. Move to the right pad.')
        logIntegration({ stage: 'one-guest-smoke', phase: 'move-right', occupancy: [left, right], remoteEntityId: 0 })
      } else if (leftSeen && !left && right) {
        yield* checkPhysicsMask()
        singleGuestPassed = true
        setLabel('One-guest smoke PASS. A second remote guest is needed for the main test.')
        logIntegration({ stage: 'one-guest-smoke', verdict: 'pass', occupancy: [left, right], remoteEntityId: 0 })
      }
    }
    yield
  }
  if (remotePlayers() < 2) throw new MissingParticipants('Explorer did not see two remote players in the test realm.')
  logIntegration({ stage: 'avatar-instruction', phase: 'participants-ready', count: remotePlayers() })
  const initial = yield* waitForOccupancy([true, true], 'Did not receive separate native CL_PLAYER hits with entityId 0 on both pads.')
  yield* checkPhysicsMask()
  setLabel('Move the guest off the left pad. Leave the right pad occupied.')
  logIntegration({ stage: 'avatar-instruction', phase: 'release-left' })
  const final = yield* waitForOccupancy([false, true], 'Releasing one pad did not preserve the other avatar occupancy.')
  const landing = pads.find((_, index) => !final.occupied[index])
  requireCheck(landing === pads[0], 'The controller did not choose the freed pad.')
  Transform.getMutable(marker).position = landing
  return {
    initialOccupancy: initial.occupied, finalOccupancy: final.occupied,
    remoteEntityId: 0, initialWireIds: initial.wireIds, finalWireIds: final.wireIds, chosenLanding: 'left'
  }
}

export const remoteLandingTest: LiveRecipe = {
  id,
  label: 'Remote landing pads',
  mount(onResult, setAction) {
    const world = createProbeWorld()
    const fixture = createRemoteLandingPads(world)
    const instructions = world.entity(v(8, 2.2, 6.6))
    TextShape.create(instructions, {
      text: 'Guests: /goto-local landing-left or landing-right. Observer: Start observation.',
      fontSize: 2, width: 8
    })
    const setLabel = (text: string) => { TextShape.getMutable(instructions).text = text }
    const steps = remoteAvatarSupport(world, setLabel, fixture)
    let observing = false
    function stop() {
      if (!observing) return
      observing = false
      engine.removeSystem(observe)
    }
    function observe() {
      try {
        const step = steps.next()
        if (!step.done) return
        stop()
        logIntegration({ stage: 'result', id, title, verdict: 'pass', detail: step.value })
        setLabel('Passed. The right pad stayed occupied and the marker chose the freed left pad.')
        onResult({ status: 'pass', detail: 'Native avatar rays tracked both pads. The marker chose the freed left pad.' })
      } catch (error) {
        stop()
        const detail = String(error)
        logIntegration({ stage: 'result', id, title, verdict: error instanceof MissingParticipants ? 'missing' : 'fail', detail })
        onResult({ status: 'fail', detail })
      }
    }
    setAction({ label: 'Start observation', run() {
      if (observing) return
      observing = true
      setAction(undefined)
      engine.addSystem(observe)
    } })
    return () => {
      stop()
      world.dispose()
    }
  }
}
