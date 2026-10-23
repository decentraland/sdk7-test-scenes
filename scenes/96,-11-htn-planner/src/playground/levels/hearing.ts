// Level 6: the guard hears faint and loud noises: listen, or run to check.
import { v3, Vec3 } from '../../htn-planner'
import { act, AgentSetup, expect, LevelInfo, Marker, TesterStep, wait } from '../sim'
import { FENCE, GuardLevel, ROUTE, yardMarkers } from './guard-yard'

export class HearingLevel extends GuardLevel {
  readonly info: LevelInfo = {
    id: 'hearing',
    number: 6,
    title: 'Hearing: faint vs loud',
    source: 'guard/guard.domain',
    lesson: [
      'Faint noise -> (alert wary) -> listen_to_noise: turn, listen.',
      'Loud noise -> (alert alarmed) -> check_alarming_noise: run there.',
      'The tester stays behind the hedge; your footsteps count too.'
    ],
    watch: '(heard_noise ...) and (alert ...) decide the branch'
  }

  spots() {
    return { hedge: v3(0, 0, -11), bell: v3(0, 0, 1) }
  }
  protected agentSetup(): AgentSetup {
    return this.guardSetup()
  }
  protected testerStart() {
    return v3(0, 0, -11)
  }
  /** The yard corner furthest from the guard: a pebble landing there reaches it faintly. */
  private farCorner(): Vec3 {
    const g = this.agent.kinematic.position
    let best = ROUTE[0]
    for (const p of ROUTE) if ((p.x - g.x) ** 2 + (p.z - g.z) ** 2 > (best.x - g.x) ** 2 + (best.z - g.z) ** 2) best = p
    return best
  }
  protected testerScript(): TesterStep[] {
    return [
      expect('quiet -> patrol', () => this.doing('patrol'), 40, 'quiet...'),
      wait(2, 'I throw a pebble far from it'),
      act('pebble: faint', () => this.noise('impact', this.farCorner(), 20)),
      expect('faint -> listen_to_noise', () => this.doing('listen_to_noise'), 3),
      expect('nothing more -> patrol', () => this.doing('patrol'), 20),
      wait(3, 'now the bell'),
      act('DONG! bell: loud', () => this.noise('bell', this.spot('bell') as Vec3, 25)),
      expect('loud -> check_alarming_noise', () => this.doing('check_alarming_noise'), 3),
      expect('checked it, back to patrol', () => this.doing('patrol'), 30),
      wait(3, 'again in a moment')
    ]
  }
  controls() {
    return [
      { label: 'Ring the bell', run: () => this.noise('bell', this.spot('bell') as Vec3, 25) },
      { label: 'Pebble (faint)', run: () => this.noise('impact', this.farCorner(), 20) }
    ]
  }
  markers(): Marker[] {
    return [
      ...yardMarkers(false),
      { id: 'hedge', shape: 'box', position: v3(0, 1, -9.6), scale: v3(8, 2, 0.8), color: { r: 0.15, g: 0.4, b: 0.15 }, label: 'hedge', solid: true },
      { id: 'bell', shape: 'cylinder', position: v3(0, 1.5, 1), scale: v3(0.6, 0.6, 0.6), color: { r: 0.9, g: 0.75, b: 0.2 }, glow: 0.5, label: 'bell' },
      { id: 'bell-post', shape: 'box', position: v3(0, 0.6, 1), scale: v3(0.12, 1.2, 0.12), color: FENCE }
    ]
  }
}
