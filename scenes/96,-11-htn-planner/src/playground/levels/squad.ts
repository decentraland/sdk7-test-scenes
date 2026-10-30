// Level 8: one guard domain on three independent NPCs (three GuardAgents ticked by the level; no GuardSquad, no squad
// planner: that is level 11); the third drives a ready-made figure (possessEntityBody).
import { distanceXZ, NoiseEvent, v3 } from '../../htn-planner'
import { act, AgentSetup, expect, LevelInfo, Marker, Post, TesterStep, wait, walk } from '../sim'
import { FENCE, GuardLevel, inYard, ROUTE, YARD_GATE, yardMarkers } from './guard-yard'

const FIGURE_ROUTE = [v3(-4, 0, -2), v3(4, 0, -2)]
const REVERSED = [...ROUTE].reverse()
const SQUAD_BELL = v3(0, 0, 3)

export class SquadLevel extends GuardLevel {
  readonly info: LevelInfo = {
    id: 'squad',
    number: 8,
    title: 'A squad: one domain, three NPCs',
    source: 'guard/guard.domain',
    lesson: [
      'Each NPC has its own planner, facts and plan; no squad planner.',
      'What one sees the others do not know: only it chases.',
      'One bell, three plans: near ones run to it, a far one listens.',
      'The third drives a ready-made figure (possessEntityBody).'
    ],
    watch: '"Board: next NPC" switches whose plan the board shows'
  }
  /** Since the tester came in: one NPC chased while another still patrolled. */
  private split = false
  /** At the last ring: the branch each NPC should pick by its distance (undefined: close to the limit, either). */
  private bellPlan: (string | undefined)[] = []

  spots() {
    return { exit: v3(-12.5, 0, -10.5), centre: v3(-1, 0, 0) }
  }
  protected agentSetup(): AgentSetup {
    return this.crewSetup()[0]
  }
  protected crewSetup(): AgentSetup[] {
    const guard = this.guardSetup()
    return [
      { ...guard, id: 'guard-a' },
      // The other way round the loop, so the two do not end up walking together after a chase.
      { ...guard, id: 'guard-b', route: REVERSED, start: { position: { ...REVERSED[1] }, yaw: Math.PI }, routeStart: 1 },
      { ...guard, id: 'figure', body: 'figure', route: FIGURE_ROUTE, start: { position: { ...FIGURE_ROUTE[0] }, yaw: Math.PI / 2 } }
    ]
  }
  protected testerVisible() {
    return inYard(this.tester.position)
  }
  /** The gate, as level 11 holds it: how long a guard happens to stand there without orders (metrics). */
  posts(): Post[] {
    return [YARD_GATE]
  }
  protected testerStart() {
    return v3(-12.5, 0, -10.5)
  }
  private count(name: string): number {
    return this.crew.filter(m => this.doingOf(m, name)).length
  }
  private all(...names: string[]): () => boolean {
    return () => this.crew.every(m => names.some(n => this.doingOf(m, n)))
  }
  update(dt: number, extra: readonly NoiseEvent[] = []) {
    super.update(dt, extra)
    if (this.count('chase_visible_target') >= 1 && this.count('patrol') >= 1) this.split = true
  }
  protected testerScript(): TesterStep[] {
    return [
      expect('nobody in the yard -> all three patrol', this.all('patrol'), 40, 'three guards, one domain'),
      walk(v3(-9, 0, -7.8), 'sneaking in'),
      act('', () => (this.split = false)),
      walk(() => this.inFrontOf(this.crew[0].agent), 'in front of guard-a...'),
      expect('the one that sees me chases, another still patrols', () => this.split, 15, 'who sees me first?'),
      walk('exit', 'run out of the yard!', 7),
      expect('lost me -> all back to patrol', this.all('patrol'), 45, 'safe outside'),
      wait(2, 'now the bell'),
      act('DONG! bell: loud', () => this.ring()),
      expect('one bell -> near: check it, far: listen', () => this.bellAnswered(), 3),
      expect('checked it -> all back to patrol', this.all('patrol'), 45),
      wait(3, 'again in a moment')
    ]
  }
  /** Hearing alarms at once at a perceived level of 0.5 or more: within half the bell's 25 m. */
  private ring() {
    this.bellPlan = this.crew.map(m => {
      const d = distanceXZ(m.agent.kinematic.position, SQUAD_BELL)
      return d < 11.5 ? 'check_alarming_noise' : d > 13.5 ? 'listen_to_noise' : undefined
    })
    this.noise('bell', SQUAD_BELL, 25)
  }
  private bellAnswered(): boolean {
    return this.crew.every((m, i) => {
      const want = this.bellPlan[i]
      return want ? this.doingOf(m, want) : this.doingOf(m, 'check_alarming_noise') || this.doingOf(m, 'listen_to_noise')
    })
  }
  controls() {
    return [
      { label: 'Board: next NPC', run: () => (this.focus = (this.focus + 1) % this.crew.length) },
      { label: 'Ring the bell', run: () => this.ring() },
      { label: 'Noise at me (10 m)', run: () => this.player && this.noise('test', this.player, 10) }
    ]
  }
  markers(): Marker[] {
    const out = yardMarkers(true)
    FIGURE_ROUTE.forEach((p, i) => out.push({ id: `fp${i}`, shape: 'box', position: v3(p.x, 0.03, p.z), scale: v3(0.5, 0.05, 0.5), color: { r: 0.8, g: 0.6, b: 0.3 } }))
    out.push(
      { id: 'bell', shape: 'cylinder', position: v3(SQUAD_BELL.x, 1.5, SQUAD_BELL.z), scale: v3(0.6, 0.6, 0.6), color: { r: 0.9, g: 0.75, b: 0.2 }, glow: 0.5, label: 'bell' },
      { id: 'bell-post', shape: 'box', position: v3(SQUAD_BELL.x, 0.6, SQUAD_BELL.z), scale: v3(0.12, 1.2, 0.12), color: FENCE }
    )
    return out
  }
}
