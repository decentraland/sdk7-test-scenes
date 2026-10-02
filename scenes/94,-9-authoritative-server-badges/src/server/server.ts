import { PlayerIdentityData, Transform, engine } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { Badges } from '@dcl/sdk/server'
import { ABSENT_ADDRESS, CLAIM_RADIUS, TARGET_BADGE, TARGET_POSITION, TEST_BADGE } from '../shared/config'
import { room } from '../shared/messages'

// Players with a TARGET_BADGE award in flight, so a fast resend can't produce two at once.
// Who already holds the badge is the badges service's call: a repeat award answers 200.
const inFlight = new Set<string>()

export function startServer(): void {
  console.log('[SERVER] Badges proof server starting…')

  // --- Layer 1: platform proof. ------------------------------------------------
  // Deliberately NO scene-side validation: this handler awards to whoever asks, and
  // also to an address that is never in the room. The engine's signing gate and the
  // badges service must tell those two apart on their own.
  room.onMessage('tryAward', async (_data, context) => {
    if (!context) return
    const sender = context.from.toLowerCase()

    const present = await Badges.award(sender, TEST_BADGE)
    room.send('awardResult', { kind: 'present', ok: present, reason: present ? '' : 'service rejected' }, { to: [context.from] })

    const absent = await Badges.award(ABSENT_ADDRESS, TEST_BADGE)
    room.send('awardResult', { kind: 'absent', ok: absent, reason: absent ? 'UNEXPECTED: absent player was awarded' : 'refused, as expected' }, { to: [context.from] })

    console.log(`[SERVER] tryAward from ${sender}: present=${present} absent=${absent}`)
  })

  // --- Layer 2: scene anti-cheat proof. ----------------------------------------
  // context.from is injected by the host from the verified LiveKit identity. The
  // payload is untrusted and unused. The position is the SERVER's copy.
  room.onMessage('claimBadge', async (_data, context) => {
    if (!context) return
    const sender = context.from.toLowerCase()
    const reject = (reason: string) => room.send('awardResult', { kind: 'claim', ok: false, reason }, { to: [context.from] })

    if (inFlight.has(sender)) return reject('claim in progress')

    const position = positionOf(sender)
    if (!position) return reject('unknown position')

    const distance = Vector3.distance(position, TARGET_POSITION)
    if (distance > CLAIM_RADIUS) return reject(`too far: ${distance.toFixed(1)}m`)

    inFlight.add(sender)
    const ok = await Badges.award(sender, TARGET_BADGE)
    inFlight.delete(sender)
    room.send('awardResult', { kind: 'claim', ok, reason: ok ? '' : 'service rejected' }, { to: [context.from] })

    console.log(`[SERVER] claimBadge from ${sender} at ${distance.toFixed(1)}m: ${ok}`)
  })

  console.log('[SERVER] Ready.')
}

// Where the server believes a player is, from PlayerIdentityData + Transform. Scene-local
// metres, the same frame TARGET_POSITION lives in. Never anything the client reported.
function positionOf(address: string): Vector3 | null {
  for (const [entity, identity] of engine.getEntitiesWith(PlayerIdentityData)) {
    if (identity.address.toLowerCase() !== address) continue
    return Transform.getOrNull(entity)?.position ?? null
  }
  return null
}
