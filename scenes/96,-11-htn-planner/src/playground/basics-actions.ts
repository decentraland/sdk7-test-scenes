// Primitives of the basics domains (src/examples/basics): the planner names them, these give them time and
// effects. Each level passes the hooks it needs; a missing hook leaves the step without an executor, which the
// agent runs as a 0.05 s no-op and reports once (a `diagnostic` event).
import {
  ActionFactory,
  ActionRegistry,
  atomName,
  atomNumber,
  distanceXZ,
  instant,
  MoveParams,
  stepToward,
  timed,
  turnToward,
  Vec3,
  yawTo
} from '../htn-planner'

export interface BasicsHost {
  spot(name: string): Vec3 | undefined
  say(text: string): void
  /** Live position of a visitor ('tester', 'you'). */
  positionOf?(who: string): Vec3 | undefined
  switchLamp?(on: boolean): void
  remember?(who: string): void
  /** false: nothing to pick up (the step fails). */
  pickUp?(): boolean
  putOn?(shelf: string): boolean
}

const SAY_SECONDS = 1.5

export function basicsActions(host: BasicsHost): ActionRegistry {
  /** `(!go_to ?spot)`: walk to a named spot. */
  const goTo: ActionFactory = (args, ctx) => {
    const name = atomName(args[0])
    const target = name === undefined ? undefined : host.spot(name)
    if (!target) return null
    const params: MoveParams = { speed: ctx.tuning.walkSpeed, turnRate: ctx.tuning.turnRate, arrivalRadius: ctx.tuning.arrivalRadius }
    const timeout = distanceXZ(ctx.kinematic.position, target) / params.speed + ctx.tuning.moveTimeoutSlack
    let elapsed = 0
    return {
      start: () => (distanceXZ(ctx.kinematic.position, target) <= params.arrivalRadius ? 'done' : 'running'),
      update(dt) {
        elapsed += dt
        return stepToward(ctx.kinematic, target, dt, params, ctx.terrain) || elapsed >= timeout ? 'done' : 'running'
      },
      cancel: () => {}
    }
  }
  /** `(!say ?text)` */
  const say: ActionFactory = args => {
    const text = atomName(args[0])
    if (text === undefined) return null
    host.say(text)
    return timed(SAY_SECONDS)
  }
  /** `(!face ?who)`: turn toward a visitor (done when facing, or when the visitor is gone). */
  const face: ActionFactory = (args, ctx) => {
    const who = atomName(args[0])
    if (who === undefined || !host.positionOf) return null
    const turn = (dt: number) => {
      const p = host.positionOf?.(who)
      return !p || turnToward(ctx.kinematic, yawTo(ctx.kinematic.position, p), dt, ctx.tuning.turnRate) ? 'done' : 'running'
    }
    return { start: () => turn(0), update: turn, cancel: () => {} }
  }
  /** `(!wave ?who)` */
  const wave: ActionFactory = args => {
    const who = atomName(args[0])
    if (who === undefined) return null
    host.say(`hi, ${who}!`)
    return timed(SAY_SECONDS)
  }
  const remember: ActionFactory = args => {
    const who = atomName(args[0])
    if (who === undefined || !host.remember) return null
    return instant(() => {
      host.remember?.(who)
      return 'done'
    })
  }
  /** `(!switch_lamp on|off)`: a short reach, then the lamp changes. */
  const switchLamp: ActionFactory = args => {
    const state = atomName(args[0])
    if ((state !== 'on' && state !== 'off') || !host.switchLamp) return null
    let switched = false
    return timed(0.6, (_dt, elapsed) => {
      if (!switched && elapsed >= 0.5) {
        switched = true
        host.switchLamp?.(state === 'on')
      }
    })
  }
  const pickUp: ActionFactory = () => (host.pickUp ? instant(() => (host.pickUp?.() ? 'done' : 'failed')) : null)
  const putOn: ActionFactory = args => {
    const shelf = atomName(args[0])
    if (shelf === undefined || !host.putOn) return null
    return instant(() => (host.putOn?.(shelf) ? 'done' : 'failed'))
  }
  const wait: ActionFactory = args => {
    const s = atomNumber(args[0])
    return s === undefined ? null : timed(s)
  }
  return {
    '!go_to': goTo,
    '!say': say,
    '!face': face,
    '!wave': wave,
    '!remember': remember,
    '!switch_lamp': switchLamp,
    '!pick_up': pickUp,
    '!put_on': putOn,
    '!wait': wait
  }
}
