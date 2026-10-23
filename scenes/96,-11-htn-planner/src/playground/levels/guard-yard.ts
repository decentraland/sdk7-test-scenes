// The guard levels (5, 6, 8) share the guard domain (src/examples/guard/guard.domain), perception and hearing from
// the agent kit, and the yard (level 11 too): the fenced square; the tester (and you) are seen only inside it, so
// leaving it is an escape.
import { guardDomain } from '../../examples/guard/guard.htn'
import { Box, GuardAgent, v3, Vec3 } from '../../htn-planner'
import { AgentSetup, LevelSim, Marker, Post } from '../sim'

export const ROUTE = [v3(-7, 0, -4), v3(7, 0, -4), v3(7, 0, 6), v3(-7, 0, 6)]
export const YARD = { x: 10, z: 9 }
export const inYard = (p: Vec3) => Math.abs(p.x) < YARD.x && Math.abs(p.z - 1) < YARD.z
export const FENCE = { r: 0.35, g: 0.32, b: 0.3 }
/** Where the gate (the gap in the front fence) is held from, inside it (level 11's gate post). */
export const GATE_POST = v3(-8, 0, -6.6)
/** The gate as a post the metrics watch (held: a guard within 2 m of GATE_POST; levels 8 and 11). */
export const YARD_GATE: Post = { id: 'gate', at: GATE_POST, radius: 2 }

export function yardMarkers(gap: boolean): Marker[] {
  // Low fence around the yard; a gap at the front-left corner for the way in and out.
  const out: Marker[] = [
    { id: 'fence-back', shape: 'box', position: v3(0, 0.4, 1 + YARD.z), scale: v3(YARD.x * 2, 0.8, 0.15), color: FENCE },
    { id: 'fence-l', shape: 'box', position: v3(-YARD.x, 0.4, 1), scale: v3(0.15, 0.8, YARD.z * 2), color: FENCE },
    { id: 'fence-r', shape: 'box', position: v3(YARD.x, 0.4, 1), scale: v3(0.15, 0.8, YARD.z * 2), color: FENCE }
  ]
  if (gap) out.push({ id: 'fence-front', shape: 'box', position: v3(2, 0.4, 1 - YARD.z), scale: v3(YARD.x * 2 - 4, 0.8, 0.15), color: FENCE })
  else out.push({ id: 'fence-front', shape: 'box', position: v3(0, 0.4, 1 - YARD.z), scale: v3(YARD.x * 2, 0.8, 0.15), color: FENCE })
  ROUTE.forEach((p, i) => out.push({ id: `wp${i}`, shape: 'box', position: v3(p.x, 0.03, p.z), scale: v3(0.6, 0.05, 0.6), color: { r: 0.3, g: 0.8, b: 0.4 }, label: `${i}` }))
  return out
}

export abstract class GuardLevel extends LevelSim {
  boardScale = 0.7
  branchColors = {
    chase_visible_target: '#ff6b5e',
    forget_stale_memory: '#8a8a8a',
    forget_stale_noise: '#8a8a8a',
    check_alarming_noise: '#ffb14a',
    investigate_last_seen: '#c78bff',
    listen_to_noise: '#ffe066',
    patrol: '#7be37b',
    idle: '#8a8a8a'
  }
  protected playerVisible(p: Vec3) {
    return inYard(p)
  }
  /** A point in the yard `ahead` m in front of an NPC: where it will see the tester. */
  protected inFrontOf(agent: GuardAgent, ahead = 4): Vec3 {
    const k = agent.kinematic
    const x = Math.max(-8, Math.min(8, k.position.x + Math.sin(k.yaw) * ahead))
    const z = Math.max(-6, Math.min(8, k.position.z + Math.cos(k.yaw) * ahead))
    return v3(x, 0, z)
  }
  protected guardSetup(occluders: Box[] = []): AgentSetup {
    return {
      domain: guardDomain,
      // guard.domain's belief upkeep, and its behaviour branch names one level below its tiers.
      reasoning: 'reasoning',
      chosenDepth: 2,
      start: { position: { ...ROUTE[0] }, yaw: Math.PI / 2 },
      route: ROUTE,
      perception: { range: 14, fovDeg: 120, detectTime: 0.8 },
      occluders
    }
  }
}
