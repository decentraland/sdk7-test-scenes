import type { Point } from '../../arena'
import type { TraversalFrame, TraversalRun, TraversalScenario, TraversalShape } from '../types'
import { advance, BOT_HEIGHT, BOT_RADIUS, capsuleHits, supports, touchesGrip } from './mantles-support'

type Leg = { to: Point; speed: number; label: string }
type Verdict = TraversalFrame['verdict']

function shape(id: string, kind: TraversalShape['kind'], center: Point, size: Point): TraversalShape {
  return { id, kind, center, size }
}

const mantleVariants = [
  { id: 'clear', label: 'Clear vault', grip: true, opening: true, landing: true, blocked: false },
  { id: 'wrong-ledge', label: 'Target ledge blocked', grip: true, opening: true, landing: true, blocked: true },
  { id: 'missing-grip', label: 'Missing handhold', grip: false, opening: true, landing: true, blocked: false },
  { id: 'low-opening', label: 'Low opening', grip: true, opening: false, landing: true, blocked: false },
  { id: 'narrow-landing', label: 'Narrow landing', grip: true, opening: true, landing: false, blocked: false },
  { id: 'no-grip-low', label: 'No grip + low opening', grip: false, opening: false, landing: true, blocked: false },
  { id: 'no-grip-narrow', label: 'No grip + narrow landing', grip: false, opening: true, landing: false, blocked: false },
  { id: 'low-narrow', label: 'Low opening + narrow landing', grip: true, opening: false, landing: false, blocked: false },
  { id: 'all-blocked', label: 'All three checks blocked', grip: false, opening: false, landing: false, blocked: false }
]

function createMantle(variantId: string): TraversalRun {
  const selected = mantleVariants.find(({ id }) => id === variantId)
  if (!selected) throw new Error('Unknown mantle variant: ' + variantId)
  const variant = selected

  const start: Point = [8, 0.35, 3.2]
  const approach: Point = [8, 0.35, 5.55]
  const landing: Point = [8, 1.5, 7.85]
  const platform = shape('start', 'surface', [8, 0.15, 4], [3.2, 0.4, 3.7])
  const lowerZ = variant.blocked ? 6.12 : 6.22
  const lower = shape('lower-ledge', 'surface', [8, 0.85, lowerZ], [1.25, 0.2, 0.58])
  const target = shape('target-ledge', 'surface', [8, 1.4, 7.74], [variant.landing ? 1.65 : 0.42, 0.2, 2.32])
  const grip = shape('target-grip', 'obstacle', [8, 1.51, 6.53], [0.58, 0.14, 0.14])
  const openingBottom = variant.opening ? 3.55 : 2.7
  const openingTop = 4.25
  const blockers = [
    shape('opening-left', 'obstacle', [7.125, 2.15, 7.14], [0.75, 4.2, 0.2]),
    shape('opening-right', 'obstacle', [8.875, 2.15, 7.14], [0.75, 4.2, 0.2]),
    shape('opening-top', 'obstacle', [8, (openingBottom + openingTop) / 2, 7.14], [1, openingTop - openingBottom, 0.2])
  ]
  if (variant.blocked) {
    blockers.push(shape('target-blocker', 'obstacle', [8, 1.99, 6.76], [0.68, 0.36, 0.18]))
  }
  const solids = [platform, lower, target, ...blockers, ...(variant.grip ? [grip] : [])]
  const shapes = [
    ...solids,
    shape('target-marker', 'target', [landing[0], landing[1] + 0.06, landing[2]], [0.24, 0.12, 0.24]),
    shape('probe-guide', 'guide', [8, 2.35, 6.7], [0.035, 0.035, 2.3])
  ]
  const vault: readonly Leg[] = [
    { to: [8, 1.61, approach[2]], speed: 1.8, label: 'Pull up' },
    { to: [8, 1.61, landing[2]], speed: 2.2, label: 'Sweep through opening' },
    { to: landing, speed: 1.3, label: 'Plant on target ledge' }
  ]

  let feet = start
  let legs: readonly Leg[] = [{ to: approach, speed: 2.2, label: 'Approach ledges' }]
  let legIndex = 0
  let stage: 'approach' | 'vault' | 'retreat' = 'approach'
  let verdict: Verdict = 'running'
  let detail = 'The guide shows the narrow probe. The bot needs hand contact and full capsule clearance.'

  function fail(reason: string) {
    verdict = 'fail'
    detail = reason
  }

  function probeSeesLanding() {
    const probeY = 2.35
    const across = !solids.some(({ center: [x, y, z], size: [w, h, d] }) =>
      Math.abs(landing[0] - x) <= w / 2 && Math.abs(probeY - y) <= h / 2 &&
      z + d / 2 > approach[2] && z - d / 2 < landing[2])
    return across && supports(target, landing, 0)
  }

  function evaluateVault() {
    const hand: Point = [8, 1.58, 6.48]
    const maxReach = 1
    const handDistance = Math.hypot(hand[1] - (feet[1] + 1.23), hand[2] - feet[2])
    const hasGrip = solids.some((part) => part.id === grip.id && touchesGrip(hand, part)) && handDistance <= maxReach
    const clearArc = vault.every(({ to }, index) => {
      const from = index === 0 ? approach : vault[index - 1].to
      return !solids.some((part) => capsuleHits(from, to, part))
    })
    const fullLanding = supports(target, landing)
    if (!supports(lower, [8, 0.95, lowerZ]) || !probeSeesLanding() || hasGrip !== variant.grip ||
        clearArc !== (variant.opening && !variant.blocked) || fullLanding !== variant.landing) {
      fail('The observed probe, grip, swept capsule or landing disagrees with the fixture.')
      return
    }
    const failures = [
      ...(!hasGrip ? ['handhold missing'] : []),
      ...(!clearArc ? ['capsule blocked'] : []),
      ...(!fullLanding ? ['landing too narrow'] : [])
    ]
    if (failures.length) {
      stage = 'retreat'
      legs = [{ to: start, speed: 2.4, label: 'Retreat to start' }]
      detail = 'Probe sees the target. Vault rejected: ' + failures.join(', ') + '.'
    } else {
      stage = 'vault'
      legs = vault
      detail = 'Handhold, capsule sweep and landing verified. Executing the target ledge.'
    }
    legIndex = 0
  }

  return {
    frame() {
      return {
        shapes, bots: [{ id: 'bot', feet, radius: BOT_RADIUS, height: BOT_HEIGHT }],
        phase: verdict === 'running' ? legs[legIndex].label : 'Finished', verdict, detail
      }
    },
    step(dt) {
      if (verdict !== 'running') return
      const leg = legs[legIndex]
      const next = advance(feet, leg.to, leg.speed * dt)
      if (solids.some((part) => capsuleHits(feet, next, part))) {
        fail('The executing capsule intersected a solid.')
        return
      }
      feet = next
      if (feet !== leg.to || ++legIndex < legs.length) return
      if (stage === 'approach') {
        evaluateVault()
        return
      }
      const expectedSupport = stage === 'vault' ? target : platform
      if (!supports(expectedSupport, feet) || supports(lower, feet)) {
        fail('The bot stopped without the intended floor support.')
        return
      }
      verdict = 'pass'
      if (stage === 'vault') detail = 'Reached the named upper ledge with full support.'
    }
  }
}

export const mantleClearance: TraversalScenario = {
  id: 'mantle-clearance',
  label: 'Ledges and vault clearance',
  cases: ['GAME-T08', 'TALK-T07', 'TALK-T10'],
  variants: mantleVariants.map(({ id, label }) => ({ id, label })),
  create: createMantle
}

const transferVariants = [
  { id: 'clear', label: 'Two connected grips' },
  { id: 'missing-transfer', label: 'Transfer link disabled' },
  { id: 'rotating-grip', label: 'Rotating grip and release' }
]

type Pose = { feet: Point; heading: number }
type TransferStage = 'approach' | 'grab' | 'rotate' | 'released' | 'transfer' | 'landing'

function rotate(point: Point, degrees: number): Point {
  const angle = degrees * Math.PI / 180
  const sin = Math.sin(angle)
  const cos = Math.cos(angle)
  return [point[0] * cos + point[2] * sin, point[1], -point[0] * sin + point[2] * cos]
}

function add(a: Point, b: Point): Point {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

function subtract(a: Point, b: Point): Point {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

function poseMatches(a: Pose, b: Pose) {
  const offset = subtract(a.feet, b.feet)
  const headingError = ((a.heading - b.heading + 540) % 360) - 180
  return Math.hypot(...offset) <= 0.02 && Math.abs(headingError) <= 1
}

function createTransfer(variantId: string): TraversalRun {
  if (!transferVariants.some(({ id }) => id === variantId)) throw new Error('Unknown transfer variant: ' + variantId)

  const start: Point = [3.35, 1.45, 7]
  const approach: Point = [5.05, 1.45, 7]
  const pivot: Point = [7.3, 2.1, 7.6]
  const firstFeet: Point = [6.1, 1, 7]
  const firstGripLocal = subtract([6.1, 2.25, 7.32], pivot)
  const secondFeet: Point = [9.72, 1.25, 7]
  const handOffset: Point = [0, 1.25, 0.32]
  const targetFeet: Point = [11.15, 1.9, 7]
  const startFloor = shape('start-floor', 'surface', [3.8, 1.30, 7], [3.2, 0.3, 3.2])
  const bottomFloor = shape('lower-floor', 'surface', [8, 0.07, 7.3], [6.8, 0.14, 4])
  const finalFloor = shape('final-floor', 'surface', [12.2, 1.75, 7], [3.2, 0.3, 3.2])
  const floors = [startFloor, bottomFloor, finalFloor]
  const secondGrip = shape('second-grip', 'obstacle', add(secondFeet, rotate(handOffset, 180)), [0.08, 0.14, 0.08])
  const secondWall = shape('second-wall', 'obstacle', add(secondGrip.center, [0, -0.25, -0.27]), [0.38, 0.64, 0.38])
  const pivotMarker = shape('pivot', 'guide', [pivot[0], 1.16, pivot[2]], [0.08, 2.04, 0.08])
  const targetMarker = shape('target', 'target', [targetFeet[0], targetFeet[1] + 0.05, targetFeet[2]], [0.24, 0.10, 0.24])
  const links = variantId === 'missing-transfer'
    ? { start: 'first', first: undefined, second: 'target' }
    : { start: 'first', first: 'second', second: 'target' }

  let parentHeading = 0
  let attached = false
  let pose: Pose = { feet: start, heading: 90 }
  let poseAtRelease: Pose | undefined
  let verdict: Verdict = 'running'
  let stage: TransferStage = 'approach'
  let detail = 'Transfer between both handholds before standing on the exit floor.'
  let legs: readonly Leg[] = [{ to: approach, speed: 2.4, label: 'Approach first grip' }]
  let legIndex = 0

  function worldPose(): Pose {
    if (!attached) return pose
    return { feet: add(pivot, rotate(pose.feet, parentHeading)), heading: pose.heading + parentHeading }
  }

  function firstGrip() {
    return shape('first-grip', 'obstacle', add(pivot, rotate(firstGripLocal, parentHeading)), [0.08, 0.14, 0.08])
  }

  function firstWall() {
    const center = add(pivot, rotate(add(firstGripLocal, [0, -0.25, 0.27]), parentHeading))
    return shape('first-wall', 'obstacle', center, [0.38, 0.64, 0.38])
  }

  function solids() {
    return [...floors, firstGrip(), firstWall(), secondGrip, secondWall]
  }

  function fail(reason: string) {
    verdict = 'fail'
    detail = reason
  }

  function follow(next: TransferStage, moves: readonly Leg[]) {
    legs = moves
    legIndex = 0
    stage = next
  }

  function grounded(feet: Point) {
    return floors.some((floor) => supports(floor, feet))
  }

  function holdsGrip(value: Pose, grip: TraversalShape) {
    return touchesGrip(add(value.feet, rotate(handOffset, value.heading)), grip) && !grounded(value.feet)
  }

  function startTransfer() {
    const current = worldPose()
    const [x, y, z] = current.feet
    // After detaching, clear the side of the rotating wall before crossing the shaft.
    const departure: Point = poseAtRelease ? [x, y + 0.15, z - 0.65] : current.feet
    follow('transfer', [
      ...(poseAtRelease ? [{ to: departure, speed: 2.3, label: 'Clear rotating wall' }] : []),
      {
        to: [(departure[0] + secondFeet[0]) / 2, y + 0.46, (departure[2] + secondFeet[2]) / 2],
        speed: 3.2, label: 'Traverse without floor support'
      },
      { to: secondFeet, speed: 3.2, label: 'Catch second grip' }
    ])
    pose = { feet: current.feet, heading: 180 }
  }

  function rotateWithGrip(dt: number) {
    const before = worldPose()
    parentHeading = Math.min(90, parentHeading + 90 * dt)
    const after = worldPose()
    const sweptOtherSurfaces = [...floors, secondGrip, secondWall].some((part) => capsuleHits(before.feet, after.feet, part))
    const overlapsOwnGrip = [firstGrip(), firstWall()].some((part) => capsuleHits(after.feet, after.feet, part))
    if (!holdsGrip(after, firstGrip()) || sweptOtherSurfaces || overlapsOwnGrip) {
      fail('The rotating grip lost hand contact or swept into a solid.')
      return
    }
    if (parentHeading < 90) return
    pose = after
    attached = false
    poseAtRelease = worldPose()
    if (!poseMatches(after, poseAtRelease)) {
      fail('Changing the parent moved or turned the bot.')
      return
    }
    stage = 'released'
  }

  function onArrival() {
    if (stage === 'approach') {
      const reachesTarget = links.start === 'first' && links.first === 'second' && links.second === 'target'
      if (!reachesTarget) {
        if (!supports(startFloor, pose.feet)) {
          fail('Missing transfer allowed the bot to leave the starting floor.')
          return
        }
        verdict = 'pass'
        detail = 'Both grips exist, but the transfer between them is disabled. The bot stayed on the start floor.'
        return
      }
      follow('grab', [
        { to: [firstFeet[0], 1.64, firstFeet[2]], speed: 2.3, label: 'Leap to first grip' },
        { to: firstFeet, speed: 1.8, label: 'Catch first grip' }
      ])
      pose = { feet: pose.feet, heading: 0 }
    } else if (stage === 'grab') {
      if (!holdsGrip(pose, firstGrip())) {
        fail('The first grip was not reached while suspended.')
      } else if (variantId === 'rotating-grip') {
        pose = { feet: rotate(subtract(pose.feet, pivot), -parentHeading), heading: pose.heading - parentHeading }
        attached = true
        stage = 'rotate'
      } else {
        startTransfer()
      }
    } else if (stage === 'transfer') {
      if (!holdsGrip(pose, secondGrip)) {
        fail('The second grip was not reached while suspended.')
        return
      }
      follow('landing', [
        { to: [secondFeet[0], 2.12, secondFeet[2]], speed: 1.9, label: 'Pull above exit floor' },
        { to: [targetFeet[0], 2.12, targetFeet[2]], speed: 2.4, label: 'Move across exit ledge' },
        { to: targetFeet, speed: 1.5, label: 'Plant on exit floor' }
      ])
      pose = { feet: pose.feet, heading: 90 }
    } else if (stage === 'landing') {
      if (!supports(finalFloor, pose.feet)) {
        fail('The bot ended without the required exit floor contact.')
        return
      }
      verdict = 'pass'
      detail = variantId === 'rotating-grip'
        ? 'Both grips reached and release preserved world pose before landing on the exit floor.'
        : 'Both grips reached without touching the lower floor. Exit contact confirmed.'
    }
  }

  return {
    frame() {
      const current = worldPose()
      const phase = stage === 'rotate' ? 'Follow rotating grip'
        : stage === 'released' ? 'Detach into world space'
        : legs[legIndex]?.label ?? 'Finished'
      return {
        shapes: [...solids(), pivotMarker, targetMarker],
        bots: [{ id: 'bot', feet: current.feet, headingDegrees: current.heading, height: BOT_HEIGHT, radius: BOT_RADIUS }],
        phase: verdict === 'running' ? phase : 'Finished', verdict, detail
      }
    },
    step(dt) {
      if (verdict !== 'running') return
      if (stage === 'rotate') {
        rotateWithGrip(dt)
        return
      }
      if (stage === 'released') {
        parentHeading += 15
        if (!poseAtRelease || !poseMatches(poseAtRelease, worldPose())) {
          fail('A detached bot moved with its previous parent.')
          return
        }
        startTransfer()
        return
      }
      const leg = legs[legIndex]
      const next = advance(pose.feet, leg.to, leg.speed * dt)
      const obstacle = solids().find((part) => capsuleHits(pose.feet, next, part))
      if (obstacle) {
        fail(leg.label + ': capsule intersected ' + obstacle.id + '.')
        return
      }
      if (stage === 'transfer' && grounded(next)) {
        fail('The transfer erroneously used a floor between the grips.')
        return
      }
      pose = { feet: next, heading: pose.heading }
      if (next === leg.to && ++legIndex === legs.length) onArrival()
    }
  }
}

export const ledgeTransfer: TraversalScenario = {
  id: 'ledge-transfer',
  label: 'Grip transfer across a shaft',
  cases: ['TALK-T11', 'SDK-T04'],
  variants: transferVariants,
  create: createTransfer
}
