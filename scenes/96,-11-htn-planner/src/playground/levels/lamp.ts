// Level 2: the lamp domain (src/examples/basics/lamp.domain): branches are tried top to bottom, the first match wins.
import { lampDomain } from '../../examples/basics/lamp.htn'
import { sym, v3 } from '../../htn-planner'
import { basicsActions } from '../basics-actions'
import { act, AgentSetup, Control, expect, LevelInfo, LevelSim, Marker, TesterStep, wait, walk } from '../sim'
import { box, GREY, WOOD } from './props'

export class LampLevel extends LevelSim {
  readonly info: LevelInfo = {
    id: 'lamp',
    number: 2,
    title: 'Branches: top to bottom, first match wins',
    source: 'basics/lamp.domain',
    lesson: [
      'hide_from_rain is checked first, then fix_the_lamp, then rest.',
      'Lamp off: the keeper fixes it. Rain AND lamp off: rain wins,',
      'the lamp waits. Facts change -> the NPC replans at once.'
    ],
    watch: 'the BRANCHES list: × = condition false, ✓ = chosen'
  }
  lampOn = true
  raining = false
  branchColors = { hide_from_rain: '#7c9cff', fix_the_lamp: '#ffe066', rest: '#7be37b' }

  spots() {
    return { lamp: v3(5, 0, 2.6), shelter: v3(-7, 0, 3), bench: v3(0, 0, -3), switch: v3(8.6, 0, 2.6), cloud: v3(-10, 0, -7) }
  }
  protected agentSetup(): AgentSetup {
    return { domain: lampDomain, start: { position: v3(0, 0, -3), yaw: 0 }, tuning: { walkSpeed: 2.2 } }
  }
  protected actions() {
    return basicsActions({ spot: n => this.spot(n), say: t => this.say('npc', t), switchLamp: on => (this.lampOn = on) })
  }
  protected facts(): string {
    const w = this.agent.blackboard.world
    w.set('lamp', sym(this.lampOn ? 'on' : 'off'))
    w.clear('raining', 0)
    if (this.raining) w.add('raining')
    return `lamp=${this.lampOn ? 'on' : 'off'} rain=${this.raining ? 'yes' : 'no'}`
  }
  protected resetProps() {
    this.lampOn = true
    this.raining = false
  }
  protected testerStart() {
    return v3(10, 0, -7)
  }
  protected testerScript(): TesterStep[] {
    return [
      expect('lamp on, dry -> rest', () => this.doing('rest'), 4, 'all fine: the keeper rests'),
      walk('switch', 'I will switch the lamp off'),
      act('click! lamp off', () => (this.lampOn = false)),
      expect('lamp off -> fix_the_lamp', () => this.doing('fix_the_lamp'), 3),
      expect('the keeper switched it back on', () => this.lampOn, 20, 'will it fix it?'),
      walk('cloud', 'now: rain AND lamp off'),
      act('rain on, lamp off', () => {
        this.raining = true
        this.lampOn = false
      }),
      expect('rain beats the lamp -> hide_from_rain', () => this.doing('hide_from_rain'), 3),
      wait(4, 'the lamp is off, but rain comes first'),
      expect('still sheltering, lamp still off', () => this.doing('hide_from_rain') && !this.lampOn, 1),
      act('rain off', () => (this.raining = false)),
      expect('dry again -> fix_the_lamp', () => this.doing('fix_the_lamp'), 3),
      expect('lamp on again', () => this.lampOn, 20),
      walk(this.testerStart(), 'back to my spot')
    ]
  }
  controls(): Control[] {
    return [
      { label: 'Lamp on/off', run: () => (this.lampOn = !this.lampOn) },
      { label: 'Rain on/off', run: () => (this.raining = !this.raining) }
    ]
  }
  markers(): Marker[] {
    const out: Marker[] = [
      { id: 'post', shape: 'cylinder', position: v3(6, 1.5, 3.4), scale: v3(0.2, 3, 0.2), color: GREY, solid: true },
      {
        id: 'bulb',
        shape: 'sphere',
        position: v3(6, 3.2, 3.4),
        scale: v3(0.7, 0.7, 0.7),
        color: this.lampOn ? { r: 1, g: 0.9, b: 0.4 } : { r: 0.15, g: 0.15, b: 0.18 },
        glow: this.lampOn ? 3 : 0,
        label: this.lampOn ? 'lamp: on' : 'lamp: OFF'
      },
      box('switch', v3(9.2, 1, 3.2), v3(0.3, 0.5, 0.2), { r: 0.9, g: 0.3, b: 0.2 }),
      box('roof', v3(-7, 2.6, 3.4), v3(3.4, 0.2, 2.6), WOOD, 'shelter'),
      box('roof-post-l', v3(-8.5, 1.25, 4.5), v3(0.2, 2.5, 0.2), WOOD),
      box('roof-post-r', v3(-5.5, 1.25, 4.5), v3(0.2, 2.5, 0.2), WOOD),
      box('bench', v3(0, 0.25, -1.9), v3(2, 0.5, 0.6), WOOD, 'bench'),
      box('cloud-lever', v3(-10.6, 0.6, -7), v3(0.4, 1.2, 0.4), { r: 0.3, g: 0.4, b: 0.9 })
    ]
    if (this.raining) {
      out.push(box('cloud', v3(-2, 7, 2), v3(16, 1.2, 9), { r: 0.35, g: 0.38, b: 0.45 }, 'RAIN'))
      for (let i = 0; i < 12; i++) {
        const x = -9 + (i % 6) * 2.8
        const z = -1 + Math.floor(i / 6) * 5 + ((this.time * 7 + i) % 1)
        out.push({ id: `drop${i}`, shape: 'box', position: v3(x, 3.5, z), scale: v3(0.05, 6, 0.05), color: { r: 0.5, g: 0.6, b: 1 }, glow: 1 })
      }
    }
    return out
  }
}
