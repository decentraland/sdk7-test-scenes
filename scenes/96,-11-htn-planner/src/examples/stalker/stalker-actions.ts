// Stalker on the guard machinery: the facts stalker.domain reads beyond the guard blackboard,
// and the executors for its primitives. Movement, chase, look-around and forgetting reuse the guard
// executors, wrapped so each step also picks its animation clip through the host. Pure: no SDK imports,
// so it runs in Node tests; the ECS side (body, animations, sound) is the host, e.g. src/playground/levels/stalker.ts.
import { float, int, sym, vec3 } from '../../htn-planner/htn/atom'
import { WorldState } from '../../htn-planner/htn/world-state'
import { ActionContext, ActionExecutor, ActionFactory, ActionRegistry, ActionStatus, atomName, atomNumber, atomVec3, GUARD_ACTIONS, instant, timed } from '../../htn-planner/npc/actions'
import type { GuardAgent } from '../../htn-planner/npc/agent'
import { normalizeYaw, turnToward } from '../../htn-planner/npc/movement'
import { angleDiff, DEG, distanceXZ, Vec3, yawTo } from '../../htn-planner/npc/vec'
import { GAZE_LIMIT, lookAroundYaw } from './stalker-gaze'

const PEER_SWAY = 12 // deg: !peer's slow sway about the point (clamped by the rig's limit)
const PEER_SWAY_RATE = 1.1 // rad/s

export type StalkerClip = 'PatrolWalk' | 'PatrolIdle' | 'PatrolTurn' | 'HeadTurnLeft' | 'AggroRun' | 'BodyTurnLeft'
export type StalkerGait = 'walk' | 'hurry' | 'run'

/** What the executors need from the scene: animation, the turn convention, the hunted target. */
export interface StalkerHost {
  /** Play a clip at an animation speed; a one-shot restarts. */
  play(clip: StalkerClip, speed?: number): void
  /** True once the renderer reported that a one-shot clip stopped playing (never headless). */
  clipFinished(clip: StalkerClip): boolean
  /** Where the hunted target is now, to walk away from it on giving up. */
  targetPosition(): Vec3 | undefined
  /** v18 head actuator; null releases control. Older hosts keep body-sweep behavior. */
  lookYaw?(degrees: number | null): void
  /** Patrol recognition: world-space head bearing, released after the body catches up. */
  lookWorldYaw?(radians: number | null): void
}

export interface StalkerActionConfig {
  /** +1: BodyTurnLeft turns the entity yaw by +90 deg (src/npc/vec yaw: 0 = +Z, PI/2 = +X); -1: by -90 deg. */
  turnSign: number
  /** Body yaw (degrees, 0..90) along BodyTurnLeft, by seconds since it started. */
  bodyYawDeg(seconds: number): number
  headTurnSeconds: number // HeadTurnLeft length: done after this even if the renderer never reports
  bodyTurnSeconds: number // BodyTurnLeft length
  minClipSeconds: number // trust a renderer "finished" only after this, so a stale flag cannot skip a clip
  leaveDistance: number // m: on giving up he walks this far away from the target
  faceTurnRate: number // rad/s: !face (turning toward a heard noise), slower than a chase turn so it reads
  /** Clip and animation speed per gait of !move_to (and !chase = run). */
  gaitClips: Record<StalkerGait, { clip: StalkerClip; speed: number }>
}

// ---- facts ---------------------------------------------------------------------------------------

/** Facts written by primitives and the host on top of GuardBlackboard (schema: stalker.domain). */
export const stalkerFacts = {
  noticed: (w: WorldState, id: string) => w.rows('noticed', 1).some(r => atomName(r[0]) === id),
  setNoticed(w: WorldState, id: string) {
    if (!stalkerFacts.noticed(w, id)) w.add('noticed', sym(id))
  },
  watching: (w: WorldState) => w.rows('watching', 1).length > 0,
  setWatching: (w: WorldState) => w.set('watching', sym('yes')),
  setWatchPoint: (w: WorldState, index: number | null) =>
    index === null ? w.clear('watch_point', 1) : w.set('watch_point', { t: 'int', v: index }),
  caught: (w: WorldState) => w.rows('caught', 1).length > 0,
  setCaught: (w: WorldState, id: string) => w.set('caught', sym(id)),
  gaveUp: (w: WorldState) => w.rows('gave_up', 1).length > 0,
  /** Investigating a heard noise (set by !hear, cleared by !unfocus / !notice): sight narrows to a cone. */
  focused: (w: WorldState) => w.rows('focus', 1).length > 0,
  setFocus: (w: WorldState, heardAt: number) => w.set('focus', float(heardAt)),
  clearFocus: (w: WorldState) => w.clear('focus', 1),
  /** Static: the noise kinds the player makes (footsteps, running, landings), read as (player_noise ?kind). */
  setPlayerNoiseKinds(w: WorldState, kinds: readonly string[]) {
    w.clear('player_noise', 1)
    for (const k of kinds) w.add('player_noise', sym(k))
  },
  /** Static: the route is a patrol loop; `looks[i]` > 0 = stop and look around that long at waypoint i;
   *  `faces[i]` = first turn to face that point there. */
  setPatrol(w: WorldState, looks: readonly number[], faces: readonly (Vec3 | null)[] = []) {
    w.set('route_loop', sym('yes'))
    w.clear('waypoint_look', 2)
    w.clear('waypoint_face', 2)
    looks.forEach((s, i) => {
      if (s > 0) w.add('waypoint_look', int(i), float(s))
    })
    faces.forEach((p, i) => {
      if (p) w.add('waypoint_face', int(i), vec3(p.x, p.y, p.z))
    })
  },
  setGaveUp(w: WorldState, id: string, exit: Vec3) {
    w.set('gave_up', sym(id))
    w.set('exit_point', vec3(exit.x, exit.y, exit.z))
  }
}

export interface StalkerSenseConfig {
  closeRadius: number // m: a visible target this close is noticed even when he is not watching
  frontDeg: number // half-angle: a visible target within it needs no head / body turn
  /** The target hides in a shelter (counts as unseen; he searches longer at the door). */
  sheltered(id: string): boolean
}

/**
 * GuardAgentOptions.syncFacts for Stalker: writes target_close / target_in_front / target_sheltered.
 * The returned key (close targets) replans when a target comes close, since that can notice it at once.
 * It also holds the time of the heard noise, so every new noise (another stone, the player's next
 * footstep) replans at once, even while an unnoticed target is in sight; while he hunts a target in
 * sight it holds the last value instead, so mid-notice and mid-chase it does not (the domain drops
 * such a noise when it next plans).
 */
export function syncStalkerFacts(agent: GuardAgent, cfg: StalkerSenseConfig): string {
  const w = agent.blackboard.world
  const k = agent.kinematic
  w.clear('target_close', 1)
  w.clear('target_in_front', 1)
  w.clear('target_sheltered', 1)
  const close: string[] = []
  for (const t of agent.blackboard.visibleTargets) {
    if (distanceXZ(k.position, t.position) <= cfg.closeRadius) {
      w.add('target_close', sym(t.id))
      close.push(t.id)
    }
    if (Math.abs(angleDiff(k.yaw, yawTo(k.position, t.position))) <= cfg.frontDeg * DEG) w.add('target_in_front', sym(t.id))
  }
  const ids: string[] = agent.blackboard.visibleTargets.map(t => t.id)
  agent.blackboard.memories.forEach((_m, id) => ids.push(id))
  for (const id of ids) if (cfg.sheltered(id)) w.add('target_sheltered', sym(id))
  const noise = agent.blackboard.heardNoise
  const hunting = agent.blackboard.visibleTargets.some(t => stalkerFacts.noticed(w, t.id))
  // While he hunts a target in sight the noise part is frozen, not dropped: noticing (the head and body
  // turn) must not be cut short by the key changing, nor the chase by each new footstep.
  const noisePart = hunting ? (noiseKeys.get(agent) ?? '') : noise ? `|noise ${noise.time.toFixed(3)}` : ''
  noiseKeys.set(agent, noisePart)
  return close.join(',') + noisePart
}
const noiseKeys = new WeakMap<GuardAgent, string>()

/**
 * Exit when giving up: straight away from `away` (the target) until `distance` m from it, walking at
 * least `minWalk` m; with no usable target, straight back.
 */
export function pickExit(self: { position: Vec3; yaw: number }, away: Vec3 | undefined, distance: number, minWalk = 10): Vec3 {
  const p = self.position
  let dx = away ? p.x - away.x : 0
  let dz = away ? p.z - away.z : 0
  let len = Math.sqrt(dx * dx + dz * dz)
  let walk = Math.max(minWalk, distance - len)
  if (!away || len < 0.5) {
    dx = -Math.sin(self.yaw)
    dz = -Math.cos(self.yaw)
    len = 1
    walk = Math.max(minWalk, distance)
  }
  return { x: p.x + (dx / len) * walk, y: p.y, z: p.z + (dz / len) * walk }
}

// ---- executors -----------------------------------------------------------------------------------

/** A guard executor that also plays a clip when it starts. */
function withClip(factory: ActionFactory, clip: (args: Parameters<ActionFactory>[0]) => { clip: StalkerClip; speed: number } | null, host: StalkerHost): ActionFactory {
  return (args, ctx) => {
    const inner = factory(args, ctx)
    const anim = clip(args)
    if (!inner || !anim) return inner
    return {
      start() {
        host.play(anim.clip, anim.speed)
        return inner.start()
      },
      update: dt => inner.update(dt),
      cancel: () => inner.cancel()
    }
  }
}

/** Where the target is: live while detected, else where it was last seen. */
function targetOf(ctx: ActionContext, id: string): Vec3 | undefined {
  return ctx.targetPosition(id) ?? ctx.blackboard.memoryOf(id)?.position
}

/** A one-shot clip step: done after `seconds`, or earlier once the renderer reports the clip finished. */
function oneShot(host: StalkerHost, clip: StalkerClip, seconds: number, minSeconds: number, tick: (elapsed: number) => void = () => {}): ActionExecutor {
  let elapsed = 0
  return {
    start() {
      host.play(clip, 1)
      tick(0)
      return 'running'
    },
    update(dt): ActionStatus {
      elapsed += dt
      const done = elapsed >= seconds - 1e-6 || (elapsed >= minSeconds && host.clipFinished(clip))
      tick(done ? seconds : elapsed)
      return done ? 'done' : 'running'
    },
    cancel: () => {}
  }
}

export function stalkerActions(host: StalkerHost, cfg: StalkerActionConfig): ActionRegistry {
  const gaitClip = (gait: string | undefined) => (gait === 'walk' || gait === 'hurry' || gait === 'run' ? cfg.gaitClips[gait] : null)

  /** `(!body_turn ?target)`: BodyTurnLeft with the entity yaw following the clip; if the target is on the other side, a quick turn instead. */
  const bodyTurn: ActionFactory = (args, ctx) => {
    const id = atomName(args[0])
    if (id === undefined) return null
    const k = ctx.kinematic
    if (host.lookWorldYaw) {
      const turn = (dt: number): ActionStatus => {
        const p = targetOf(ctx, id)
        if (!p) { host.lookWorldYaw!(null); return 'done' }
        const yaw = yawTo(k.position, p)
        host.lookWorldYaw!(yaw)
        if (!turnToward(k, yaw, dt, cfg.faceTurnRate)) return 'running'
        host.lookWorldYaw!(null)
        return 'done'
      }
      return {
        start() { host.play('PatrolTurn', 1); return turn(0) },
        update: turn,
        cancel() { host.lookWorldYaw!(null) }
      }
    }
    const target = targetOf(ctx, id)
    const sideOk = !target || angleDiff(k.yaw, yawTo(k.position, target)) * cfg.turnSign > -10 * DEG
    if (sideOk) {
      const base = k.yaw
      return oneShot(host, 'BodyTurnLeft', cfg.bodyTurnSeconds, cfg.minClipSeconds, elapsed => {
        const deg = elapsed >= cfg.bodyTurnSeconds ? 90 : cfg.bodyYawDeg(elapsed)
        k.yaw = normalizeYaw(base + cfg.turnSign * deg * DEG)
      })
    }
    // The clip only turns one way; the remaining angle is closed by the chase's own turn.
    host.play('PatrolTurn', 1)
    const turn = (dt: number): ActionStatus => {
      const p = targetOf(ctx, id)
      return !p || turnToward(k, yawTo(k.position, p), dt, ctx.tuning.turnRate) ? 'done' : 'running'
    }
    return { start: () => turn(0), update: turn, cancel: () => {} }
  }

  const registry: Record<string, ActionFactory> = {
    ...GUARD_ACTIONS,
    '!move_to': withClip(GUARD_ACTIONS['!move_to'], args => gaitClip(atomName(args[1])), host),
    '!chase': withClip(GUARD_ACTIONS['!chase'], () => cfg.gaitClips.run, host),
    '!look_around': (args, ctx) => {
      if (!host.lookYaw) return withClip(GUARD_ACTIONS['!look_around'], () => ({ clip: 'PatrolTurn', speed: 1 }), host)(args, ctx)
      const seconds = atomNumber(args[0])
      if (seconds === undefined) return null
      const exec = timed(seconds, (_dt, elapsed) => host.lookYaw!(lookAroundYaw(Math.min(1, elapsed / seconds))))
      return {
        start() { host.play('PatrolIdle', 1); host.lookYaw!(0); return exec.start() },
        update(dt) { const status = exec.update(dt); if (status !== 'running') host.lookYaw!(null); return status },
        cancel() { host.lookYaw!(null); exec.cancel() }
      }
    },

    /**
     * `(!peer ?position ?seconds)`: stand (PatrolIdle), the body staying; the head turns toward the point (to the
     * rig's limit) and sways a little about it, its sight with it (the body stays in profile).
     * Without a head actuator: a plain look-around.
     */
    '!peer': (args, ctx) => {
      const at = atomVec3(args[0])
      const seconds = atomNumber(args[1])
      if (!at || seconds === undefined) return null
      if (!host.lookYaw) return registry['!look_around']([args[1]], ctx)
      const k = ctx.kinematic
      const toward = () => Math.max(-GAZE_LIMIT, Math.min(GAZE_LIMIT, angleDiff(k.yaw, yawTo(k.position, at)) / DEG))
      const exec = timed(seconds, (_dt, elapsed) => host.lookYaw!(toward() + PEER_SWAY * Math.sin(elapsed * PEER_SWAY_RATE)))
      return {
        start() { host.play('PatrolIdle', 1); return exec.start() },
        update(dt) { const status = exec.update(dt); if (status !== 'running') host.lookYaw!(null); return status },
        cancel() { host.lookYaw!(null); exec.cancel() }
      }
    },

    /** `(!catch ?target)`: face it, remember the catch, tell the host. Instant. */
    '!catch': (args, ctx) => {
      const id = atomName(args[0])
      if (id === undefined) return null
      return instant(() => {
        const p = ctx.targetPosition(id)
        if (p) ctx.kinematic.yaw = yawTo(ctx.kinematic.position, p)
        stalkerFacts.setCaught(ctx.blackboard.world, id)
        host.play('PatrolIdle', 1)
        ctx.emit({ type: 'catch', guard: ctx.id, target: id })
        return 'done'
      })
    },

    /** `(!stand ?seconds)`: stand still, idle clip. */
    '!stand': args => {
      const seconds = atomNumber(args[0])
      if (seconds === undefined) return null
      const exec = timed(seconds)
      return {
        start() {
          host.play('PatrolIdle', 1)
          return exec.start()
        },
        update: dt => exec.update(dt),
        cancel: () => {}
      }
    },

    /** `(!watch)`: from now on a target in sight is noticed. Instant. */
    '!watch': (_args, ctx) =>
      instant(() => {
        stalkerFacts.setWatching(ctx.blackboard.world)
        return 'done'
      }),

    /** `(!notice ?target)`: he has noticed it (the host shakes the bell). Instant. */
    '!notice': (args, ctx) => {
      const id = atomName(args[0])
      if (id === undefined) return null
      return instant(() => {
        stalkerFacts.setNoticed(ctx.blackboard.world, id)
        stalkerFacts.clearFocus(ctx.blackboard.world) // his attention is on the target now
        ctx.emit({ type: 'signal', guard: ctx.id, name: 'noticed', target: id })
        return 'done'
      })
    },

    /** `(!head_turn ?target)`: HeadTurnLeft, the body stays still. */
    '!head_turn': (args, ctx) => {
      const id = atomName(args[0])
      if (id === undefined) return null
      if (!host.lookWorldYaw) return oneShot(host, 'HeadTurnLeft', cfg.headTurnSeconds, cfg.minClipSeconds)
      const aim = () => {
        const p = targetOf(ctx, id)
        if (p) host.lookWorldYaw!(yawTo(ctx.kinematic.position, p))
      }
      const exec = timed(cfg.headTurnSeconds, aim)
      return {
        start() { host.play('PatrolIdle', 1); aim(); return exec.start() },
        update: dt => exec.update(dt),
        cancel() { host.lookWorldYaw!(null); exec.cancel() }
      }
    },

    '!body_turn': bodyTurn,

    /** `(!give_up ?target ?position)`: stop hunting, pick an exit away from the target. Instant. */
    '!give_up': (args, ctx) => {
      const id = atomName(args[0])
      const lastSeen = atomVec3(args[1])
      if (id === undefined || !lastSeen) return null
      return instant(() => {
        const exit = pickExit(ctx.kinematic, host.targetPosition() ?? lastSeen, cfg.leaveDistance)
        stalkerFacts.setGaveUp(ctx.blackboard.world, id, exit)
        ctx.emit({ type: 'signal', guard: ctx.id, name: 'gave_up', target: id })
        return 'done'
      })
    },

    /** `(!hear ?position ?time)`: he heard a noise there (the host clanks the bell); focus on it. Instant. */
    '!hear': (args, ctx) => {
      const at = atomVec3(args[0])
      const heardAt = atomNumber(args[1])
      if (!at || heardAt === undefined) return null
      return instant(() => {
        stalkerFacts.setFocus(ctx.blackboard.world, heardAt)
        host.play('PatrolIdle', 1)
        ctx.emit({ type: 'signal', guard: ctx.id, name: 'heard' })
        return 'done'
      })
    },

    /** `(!refocus ?time)`: investigate a newer noise without the start (no clank). Instant. */
    '!refocus': (args, ctx) => {
      const heardAt = atomNumber(args[0])
      if (heardAt === undefined) return null
      return instant(() => {
        stalkerFacts.setFocus(ctx.blackboard.world, heardAt)
        return 'done'
      })
    },

    /**
     * `(!face ?position)`: turn in place toward a point at faceTurnRate (PatrolTurn); done when facing it.
     * `(!face ?position quick)`: the same at the chase turn rate (startled by a loud noise close by).
     */
    '!face': (args, ctx) => {
      const at = atomVec3(args[0])
      if (!at) return null
      const rate = args.length > 1 && atomName(args[1]) === 'quick' ? ctx.tuning.turnRate : cfg.faceTurnRate
      const k = ctx.kinematic
      const turn = (dt: number): ActionStatus =>
        distanceXZ(k.position, at) < 1e-3 || turnToward(k, yawTo(k.position, at), dt, rate) ? 'done' : 'running'
      return {
        start() {
          if (turn(0) === 'done') return 'done'
          host.play('PatrolTurn', 1)
          return 'running'
        },
        update: turn,
        cancel: () => {}
      }
    },

    /** `(!unfocus)`: the investigation is over; all-around sight again. Instant. */
    '!unfocus': (_args, ctx) =>
      instant(() => {
        stalkerFacts.clearFocus(ctx.blackboard.world)
        return 'done'
      }),

    /** `(!despawn)`: the host removes him; the step never ends by itself. */
    '!despawn': (_args, ctx) => {
      let sent = false
      const run = (): ActionStatus => {
        if (!sent) ctx.emit({ type: 'signal', guard: ctx.id, name: 'despawn' })
        sent = true
        return 'running'
      }
      return { start: run, update: run, cancel: () => {} }
    }
  }
  return registry
}
