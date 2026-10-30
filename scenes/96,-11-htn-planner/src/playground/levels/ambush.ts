// Level 12: an ambush. The stalker domain (src/examples/stalker/stalker.domain, the same as level 7) on a lane that
// crosses the way to a light, with general mechanics around it:
//  - an ambush trigger: it waits off-stage until someone nears the crossing, steps out at the lane's east end and
//    crosses in front of the light, then walks a short round A - crossing - B, looking at each; at the crossing it
//    always peers with its head toward where people come from (the domain's waypoint_face / !peer);
//  - sight that depends on the target's light (TargetSample.visibility: lit far, shielded nearer, dark only close),
//    in a 120 degree cone, and a presence radius (PerceptionConfig.presenceRadius): right on its heels it smells you,
//    light or not;
//  - a lure ring: a light it glimpses beyond its sight but within the ring draws it over to look (a noise of its own,
//    heard at a level that sends it to investigate, not to chase);
//  - hearing: a thrown stone's knock, and your footsteps (louder to its ears), send it to look;
//  - noticed = caught: the chase is faster than a run; caught, the run fails: the one caught is back at the start, it
//    is gone and the trigger is armed again, and it re-arms only once nobody stands in the trigger (no capture loop).
//    Past the lane (at the light) the lane counts as passed: a later catch does not bring it out again.
// Its own ablation (docs/htn-level-metrics.md), `no_light`: sight not scaled by the target's light (every target
// seen as far as a lit one); the general ones no_hearing (the lure is no sound: it stays), no_memory and no_presence.
// The body is the playground's model view (src/examples/stalker/stalker-model.ts) driven by the rig (stalker-rig.ts):
// primitive poses and the head follow the domain; gameplay noises stay independent of visual/audio assets.
import { pickExit, stalkerActions, stalkerFacts, syncStalkerFacts } from '../../examples/stalker/stalker-actions'
import { StalkerRig } from '../../examples/stalker/stalker-rig'
import { stalkerDomain } from '../../examples/stalker/stalker.htn'
import {
  angleDiff,
  DEG,
  distanceXZ,
  eyeOf,
  aimOf,
  GeometricLineOfSight,
  GuardEvent,
  inViewCone,
  NoiseEvent,
  TargetSample,
  v3,
  Vec3,
  yawTo
} from '../../htn-planner'
import type { Ablation } from '../ablation'
import { act, AgentSetup, Control, CrewMember, expect, LevelInfo, LevelSim, Marker, TesterStep, walk } from '../sim'

const LANE_Z = 3
/** The layout and the tuning, in the pad's metres (the encounter's distances scaled to a 28 x 26 m pad). */
export const AMBUSH = {
  mid: v3(0, 0, LANE_Z), // the crossing: the way to the light crosses the lane here
  a: v3(-8, 0, LANE_Z),
  b: v3(8, 0, LANE_Z),
  entry: v3(13, 0, LANE_Z), // where it steps out, the lane's dark east end
  light: v3(0, 0, 9.5), // the light the way leads to; beyond the lane
  start: v3(0, 0, -12), // where a run starts (and a failed one starts again)
  /** It steps out when someone comes this close to the crossing (m). */
  trigger: 13,
  /** Sight range by the target's light (m), and the cone. */
  sight: { lit: 9, shielded: 7, dark: 5, fovDeg: 120 },
  /** The lure ring (m by light; none in the dark): a light glimpsed `glance` s there draws it to look; once per `every` s. */
  lure: { lit: 12, shielded: 9.5, glance: 0.8, every: 3 },
  /** Its nose: sensed all around, through anything, light or not (m). */
  smell: 2.5,
  /** A hard run (m/s) and how long it keeps after a target out of sight (s). */
  chase: { speed: 11, loseGrace: 5 },
  /** How fast a visitor runs (m/s): the chase must be faster. */
  playerRun: 10,
  /** s after a catch before the run fails; s after it walked off before it is back on the lane. */
  catchPause: 2,
  backAfter: 8,
  /** Its ears on the visitor's own noises (a factor on their radius). */
  ears: { steps: 1.75, run: 1.5, land: 1.5 } as Record<string, number>,
  /** Visual scale and legacy gait calibration (m/s per unit of animation speed), kept to preserve encounter timings. */
  model: { scale: 0.8, walkStride: (1.32 / 3.2) * 0.8, runStride: (6.5 / 1.2) * 0.8 }
}
const ROUTE = [AMBUSH.mid, AMBUSH.a, AMBUSH.mid, AMBUSH.b]
const LOOKS = [3, 3, 3, 3]
/** At the crossing it peers toward the start, the way people come; at A and B it looks around. */
const FACES = [AMBUSH.start, null, AMBUSH.start, null]
const TUNING = { walkSpeed: 0.8, hurrySpeed: 3, runSpeed: AMBUSH.chase.speed, turnRate: 300 * DEG, catchRadius: 1.6, lookAroundDeg: 75 }
const GAIT = {
  walk: { clip: 'PatrolWalk' as const, speed: TUNING.walkSpeed / AMBUSH.model.walkStride },
  hurry: { clip: 'AggroRun' as const, speed: TUNING.hurrySpeed / AMBUSH.model.runStride },
  run: { clip: 'AggroRun' as const, speed: TUNING.runSpeed / AMBUSH.model.runStride }
}
const PLAYER_NOISE_KINDS = ['steps', 'run', 'land']
/** A glimpsed light reaches it as a noise of its own, perceived at this level: investigate, not startle (0.6). */
const LURE_KIND = 'light'
const LURE_LEVEL = 0.45
/** A stone's knock: where it lands, how far it carries (m). */
const STONE = { at: v3(10, 0, 0), loudness: 22 }
/** Cover west of the way: rocks to hide behind (they block sight and muffle sound). */
const ROCKS = [
  { id: 'rock-1', at: v3(-7, 0, -1), size: v3(2.4, 1.8, 1.2) },
  { id: 'rock-2', at: v3(-4, 0, -6.5), size: v3(1.6, 1.1, 1.4) }
]
const ROCK = { r: 0.32, g: 0.33, b: 0.36 }
const LANE_COLOR = { r: 0.24, g: 0.2, b: 0.15 }

export type Light = 'lit' | 'shielded' | 'dark'
const LIGHTS: Light[] = ['lit', 'shielded', 'dark']
export type LaneStatus = 'armed' | 'active' | 'waiting' | 'passed'

const inZone = (p: Vec3) => distanceXZ(p, AMBUSH.mid) <= AMBUSH.trigger
const atLight = (p: Vec3) => p.z >= AMBUSH.light.z - 1.5 && Math.abs(p.x - AMBUSH.light.x) <= 4

export class AmbushLevel extends LevelSim {
  readonly info: LevelInfo = {
    id: 'ambush',
    number: 12,
    title: 'An ambush: sight, light, smell, sound',
    source: 'stalker/stalker.domain',
    lesson: [
      'It waits unseen; near the light it steps out and walks a round.',
      'Your light sets how far it sees; right behind it, it smells you.',
      'A knock or a light in its far ring draws it to look. Seen: caught.',
      'Key 1 (full): its sight cone, smell and hearing in the world.'
    ],
    watch: 'the cone shrink when the light goes out; the branch when the stone lands'
  }
  status: LaneStatus = 'armed'
  /** The NPC is out on the lane (not waiting off-stage). */
  out = false
  testerLight: Light = 'dark'
  playerLight: Light = 'dark'
  /** The NPC's body controller (clips, head, footfalls, cues); a new one with every NPC. */
  rig!: StalkerRig
  /** Runs failed (caught) since the start. */
  fails = 0
  /** Level time it last noticed someone (-Infinity: never), its fastest chase speed (m/s) this run. */
  noticedAt = -Infinity
  lastChaseSpeed = 0
  /** Glimpses of a light in the lure ring that sent it to look. */
  lures = 0
  private failAt: number | null = null
  private caught: string | null = null
  private backAt: number | null = null
  /** After a fail the trigger waits until nobody stands in it. */
  private needsClear = false
  private glimpse = 0
  private lureIn = 0
  private chaseFrom: Vec3 | null = null
  private mark = 0
  private los = new GeometricLineOfSight(ROCKS.map(r => rockBox(r)))

  constructor() {
    super()
    this.boardScale = 0.42
    this.branchColors = {
      stand_over_caught: '#ff6b5e',
      chase_noticed_target: '#ff6b5e',
      chase_ignoring_noise: '#ff6b5e',
      notice_seen_target: '#ffb14a',
      notice_close_target: '#ffb14a',
      search_at_shelter: '#c78bff',
      search_last_seen: '#c78bff',
      leave: '#56d8e6',
      walked_off: '#56d8e6',
      walk_route: '#7be37b',
      investigate_noise: '#ffe066',
      continue_investigation: '#ffe066',
      startled_by_loud_noise: '#ffe066'
    }
  }

  spots() {
    return {
      start: AMBUSH.start,
      near: v3(0, 0, -8), // in the trigger, in the lure ring of the crossing (11 m)
      close: v3(0, 0, -3.5), // 6.5 m in front of the crossing: inside lit sight, outside dark sight
      away: v3(-12, 0, -8), // west, out of its dark reach from the lure spot
      cover: v3(-8, 0, -2.6), // behind the rock
      across: v3(-8, 0, 6), // over the lane at A
      light: v3(-1.5, 0, 9.5),
      flank: v3(4, 0, -1) // south-east of the crossing: behind it as it walks west
    }
  }

  protected buildAgent(): void {
    const self = this
    this.rig = new StalkerRig({ gaitClips: GAIT, patrol: true, target: () => self.huntedPosition() })
    super.buildAgent()
  }

  protected agentSetup(): AgentSetup {
    const self = this
    const start = AMBUSH.entry
    return {
      domain: stalkerDomain,
      // stalker.domain's belief upkeep, and its behaviour branch names one level below its tiers.
      reasoning: 'reasoning',
      chosenDepth: 2,
      body: 'model',
      start: { position: { ...start }, yaw: yawTo(start, ROUTE[0]) },
      route: ROUTE,
      tuning: TUNING,
      perception: {
        range: AMBUSH.sight.lit,
        fovDeg: AMBUSH.sight.fovDeg,
        nearRadius: 0,
        presenceRadius: AMBUSH.smell,
        eyeHeight: 2.2,
        detectTime: 0.8,
        nearDetectTime: 0.15,
        loseGrace: AMBUSH.chase.loseGrace
      },
      sightYaw: () => self.rig.sightYaw(self.agent),
      occluders: ROCKS.map(r => rockBox(r))
    }
  }

  protected actions() {
    return stalkerActions(this.rig, {
      turnSign: 1,
      bodyYawDeg: s => Math.min(90, (s / (44 / 30)) * 90),
      headTurnSeconds: 1.8,
      bodyTurnSeconds: 44 / 30,
      minClipSeconds: 0.25,
      leaveDistance: 25,
      faceTurnRate: 120 * DEG,
      gaitClips: GAIT
    })
  }

  protected afterInit() {
    const w = this.agent.blackboard.world
    stalkerFacts.setPlayerNoiseKinds(w, PLAYER_NOISE_KINDS)
    stalkerFacts.setPatrol(w, LOOKS, FACES)
    stalkerFacts.setWatchPoint(w, null)
    stalkerFacts.setWatching(w)
    this.glimpse = 0
    this.chaseFrom = null
  }

  protected facts(): string {
    return syncStalkerFacts(this.agent, { closeRadius: 3, frontDeg: 35, sheltered: () => false })
  }

  protected testerVisible() {
    return true
  }
  protected targetVisibility(id: 'you' | 'tester'): number | undefined {
    if (this.ablated('no_light')) return undefined
    return lightFactor(id === 'tester' ? this.testerLight : this.playerLight)
  }
  protected levelAblations(): Ablation[] {
    return [{ name: 'no_light', change: "sight not scaled by the target's light (TargetSample.visibility unset): seen as far as lit; the lure ring stays" }]
  }
  /** The lure is a glimpse of a light that reaches it as a noise: not a sound (no_hearing keeps it). */
  protected isSound(noise: NoiseEvent): boolean {
    return noise.kind !== LURE_KIND
  }
  present(_member: CrewMember): boolean {
    return this.out
  }
  /** Glimpses of a light that sent it to look (metrics: per round). */
  outcomes() {
    return { lures: this.lures }
  }
  senseArcs(_member: CrewMember) {
    const lights = [this.testerLight, ...(this.player ? [this.playerLight] : [])]
    const ring = Math.max(...lights.map(lureRange))
    return ring > 0 ? [{ radius: ring, hex: '#ffe066' }] : []
  }

  // ---- the encounter ----------------------------------------------------------------------------

  /** It steps out at the lane's east end and walks to the crossing; then its round. */
  stepOut() {
    this.agent.stop()
    this.buildAgent()
    this.out = true
    this.status = this.status === 'passed' ? 'passed' : 'active'
    this.backAt = null
    this.say('npc', 'steps out of the dark', 2)
  }

  /** Gone, the trigger armed again (the start of a run; Reset). */
  rearm() {
    this.agent.stop()
    this.out = false
    this.status = 'armed'
    this.failAt = null
    this.backAt = null
    this.caught = null
  }

  /** The lane is behind you: a later catch does not bring it out again (the button; reaching the light). */
  checkpoint() {
    this.status = 'passed'
  }

  /** Someone is hunted now: it noticed them and has not given up. */
  hunting(): boolean {
    if (!this.out) return false
    const w = this.agent.blackboard.world
    return w.rows('noticed', 1).length > 0 && !stalkerFacts.gaveUp(w) && !stalkerFacts.caught(w)
  }

  private huntedPosition(): Vec3 | undefined {
    return this.agent?.blackboard.visibleTargets[0]?.position ?? this.positionOf(this.player ? 'you' : 'tester')
  }

  private targets(): { id: 'you' | 'tester'; position: Vec3; light: Light }[] {
    const out: { id: 'you' | 'tester'; position: Vec3; light: Light }[] = [{ id: 'tester', position: this.tester.position, light: this.testerLight }]
    if (this.player) out.unshift({ id: 'you', position: this.player, light: this.playerLight })
    return out
  }

  update(dt: number, extra: readonly NoiseEvent[] = []) {
    // Its ears: the visitor's footsteps carry further to it.
    const heard = extra.map(n => (AMBUSH.ears[n.kind] ? { ...n, loudness: n.loudness * AMBUSH.ears[n.kind] } : n))
    const before = this.out ? { ...this.agent.kinematic.position } : null
    super.update(dt, heard)
    if (before && this.out && this.agent.currentAction === '!chase' && dt > 0) {
      this.lastChaseSpeed = Math.max(this.lastChaseSpeed, distanceXZ(before, this.agent.kinematic.position) / dt)
    }
    this.trigger()
    this.lure(dt)
  }

  protected tickCrew(dt: number, targets: TargetSample[], noises: readonly NoiseEvent[]): void {
    if (!this.out) return
    this.rig.beforeTick(dt, this.agent)
    this.agent.tick(dt, targets, noises)
    this.rig.afterTick(dt)
  }

  private trigger() {
    if (this.failAt !== null && this.time >= this.failAt) this.failRun()
    const people = this.targets()
    if (this.status !== 'passed' && !this.hunting() && people.some(p => atLight(p.position))) this.checkpoint()
    if (this.status === 'armed') {
      const inside = people.some(p => inZone(p.position))
      if (this.needsClear) this.needsClear = inside
      else if (inside) this.stepOut()
    } else if (this.status === 'waiting' && this.backAt !== null && this.time >= this.backAt) this.stepOut()
  }

  /**
   * Caught: the run fails. The one caught is back at the last checkpoint (the start; past the lane, the light), it is
   * gone, and the trigger is armed again but waits until nobody stands in it; past the lane it stays away.
   */
  private failRun() {
    this.failAt = null
    this.fails++
    const passed = this.status === 'passed'
    if (this.caught === 'tester') {
      this.teleportTester(passed ? this.spots().light : AMBUSH.start)
      this.testerLight = 'dark'
    }
    // A visitor is not moved (the level is pure): the bubble says where to go.
    this.say('tester', this.caught === 'you' ? `caught: you go back to ${passed ? 'the light' : 'the start'}` : 'caught: the run fails', 3)
    this.caught = null
    this.rearm()
    if (passed) this.status = 'passed'
    this.needsClear = true
  }

  /** The lure ring: a light in its cone beyond its sight, within the ring, seen for a glance: it comes to look. */
  private lure(dt: number) {
    this.lureIn -= dt
    if (!this.out || this.hunting() || stalkerFacts.caught(this.agent.blackboard.world)) {
      this.glimpse = 0
      return
    }
    const a = this.agent
    const at = a.kinematic.position
    const yaw = this.rig.sightYaw(a)
    const cfg = a.perception.cfg
    let best: { p: Vec3; d: number } | null = null
    for (const t of this.targets()) {
      const ring = lureRange(t.light)
      const d = distanceXZ(at, t.position)
      const sight = cfg.range * (this.targetVisibility(t.id) ?? 1)
      if (ring <= 0 || d <= sight || d > ring) continue
      if (!inViewCone(at, yaw, t.position, cfg, ring) || !this.los.check(a.id + '#lure', eyeOf(at, cfg), aimOf(t.position, cfg))) continue
      if (!best || d < best.d) best = { p: t.position, d }
    }
    this.glimpse = best ? this.glimpse + dt : 0
    if (!best || this.glimpse < AMBUSH.lure.glance || this.lureIn > 0) return
    this.bus.emit({ kind: LURE_KIND, position: { x: best.p.x, y: 0.2, z: best.p.z }, source: 'light', loudness: best.d / (1 - LURE_LEVEL) })
    this.lureIn = AMBUSH.lure.every
    this.lures++
  }

  protected onEvent(e: GuardEvent, member?: CrewMember) {
    super.onEvent(e, member)
    if (member && member.agent !== this.agent) return // a retired NPC's late events
    this.rig.onEvent(e, this.agent)
    if (e.type === 'catch') {
      this.caught = e.target
      this.failAt = this.time + AMBUSH.catchPause
      this.say('npc', 'caught you', 2)
    } else if (e.type === 'step' && e.name === '!chase' && this.chaseFrom === null) {
      this.chaseFrom = { ...this.agent.kinematic.position }
      this.lastChaseSpeed = 0
    } else if (e.type === 'signal') {
      if (e.name === 'noticed') this.noticedAt = this.time
      if (e.name === 'despawn') {
        // Walked off after giving up: back on the lane a little later (its agent is stopped when it steps out).
        this.out = false
        if (this.status === 'active') {
          this.status = 'waiting'
          this.backAt = this.time + AMBUSH.backAfter
        }
      }
    }
  }

  // ---- buttons ------------------------------------------------------------------------------------

  /** A stone thrown to the lane's east end: a knock it hears. */
  throwStone() {
    this.noise('impact', STONE.at, STONE.loudness)
  }

  /** The Give up button: as if the search ran out, it walks off away from its target. */
  giveUp() {
    if (!this.out) return
    const w = this.agent.blackboard.world
    if (stalkerFacts.gaveUp(w)) return
    const seen = this.agent.blackboard.visibleTargets[0]
    const id = seen?.id ?? (this.player ? 'you' : 'tester')
    stalkerFacts.setGaveUp(w, id, pickExit(this.agent.kinematic, seen?.position ?? this.positionOf(id), 25))
    this.agent.requestReplan('button: give up', true)
  }

  controls(): Control[] {
    return [
      { label: 'Your light', run: () => (this.playerLight = LIGHTS[(LIGHTS.indexOf(this.playerLight) + 1) % LIGHTS.length]) },
      { label: 'Throw a stone', run: () => this.throwStone() },
      { label: 'New run (arm)', run: () => this.rearm() },
      { label: 'Past the lane', run: () => this.checkpoint() }
    ]
  }

  protected resetProps() {
    this.status = 'armed'
    this.out = false
    this.testerLight = 'dark'
    this.playerLight = 'dark'
    this.fails = 0
    this.lures = 0
    this.noticedAt = -Infinity
    this.lastChaseSpeed = 0
    this.failAt = null
    this.caught = null
    this.backAt = null
    this.needsClear = false
    this.glimpse = 0
    this.lureIn = 0
  }

  boardNotes(): string[] {
    const lane = this.status === 'armed' ? `armed (steps out within ${AMBUSH.trigger} m of the crossing)` : this.status
    const you = this.player ? ` · your light <b>${this.playerLight}</b>` : ''
    return [`lane: <b>${lane}</b> · tester's light <b>${this.testerLight}</b>${you} · failed runs ${this.fails}`]
  }

  // ---- the tester ---------------------------------------------------------------------------------

  protected testerStart() {
    return AMBUSH.start
  }

  /** At the crossing, standing, peering with its head toward the start; the body stays in profile. */
  peering(): boolean {
    if (!this.out) return false
    const a = this.agent
    const at = a.kinematic.position
    if (distanceXZ(at, AMBUSH.mid) > 0.6 || a.currentAction !== '!peer') return false
    const want = yawTo(at, AMBUSH.start)
    const head = Math.abs(angleDiff(this.rig.sightYaw(a), want))
    const body = Math.abs(angleDiff(a.kinematic.yaw, want))
    return head < (AMBUSH.sight.fovDeg / 2) * DEG && body > 0.6 && head < body - 0.5
  }

  private behind(gap: number): Vec3 {
    const k = this.agent.kinematic
    return v3(k.position.x - Math.sin(k.yaw) * gap, 0, k.position.z - Math.cos(k.yaw) * gap)
  }

  protected testerScript(): TesterStep[] {
    const any = (...names: string[]) => () => names.some(n => this.doing(n))
    const setMark = () => (this.mark = this.time)
    const looking = any('investigate_noise', 'continue_investigation', 'startled_by_loud_noise', 'retarget_investigation')
    const newRun = () =>
      act('a new run: at the start, light out', () => {
        this.rearm()
        this.needsClear = false
        this.teleportTester(AMBUSH.start)
        this.testerLight = 'dark'
      })
    const stepsOut = (label: string) => expect(label, () => this.out && distanceXZ(this.agent.kinematic.position, AMBUSH.entry) < 1.5, 4)
    const peers = (label: string) => expect(label, () => this.peering(), 40, 'it crosses in front of the light...')
    const caught = (label: string) => expect(label, () => this.fails > this.failsAt && this.lastChaseSpeed > AMBUSH.playerRun, 30)
    const failed = (label: string) =>
      expect(label, () => this.status === 'armed' && !this.out && distanceXZ(this.tester.position, AMBUSH.start) < 0.5, 6)
    return [
      newRun(),
      expect('armed: it waits out of sight', () => this.status === 'armed' && !this.out, 2),
      walk('near', 'towards the light, light out'),
      stepsOut('near the crossing -> it steps out at the east end'),
      peers('at the crossing it stops and peers toward me (head only)'),
      walk('close', 'closer, still dark'),
      act('dark at 6.5 m', setMark),
      expect('dark at 6.5 m: it does not see me', () => this.time - this.mark >= 8 && this.noticedAt < this.mark, 10),
      act('light my lantern', () => {
        this.testerLight = 'lit'
        this.failsAt = this.fails
      }),
      expect('lit at 6.5 m: it sees me and notices', () => this.noticedAt >= this.mark + 8, 40, 'lantern lit...'),
      caught('noticed = caught: its chase outruns a run'),
      failed('caught: the run fails, back at the start, armed'),
      act('back at the start', setMark),
      expect('no capture loop: it stays away after the fail', () => this.time - this.mark >= 6 && this.status === 'armed' && !this.out, 8),
      walk('near', 'again, light out'),
      stepsOut('re-armed: it steps out again'),
      peers('peers toward me again'),
      act('lantern lit, 11 m off', () => {
        this.testerLight = 'lit'
        this.mark = this.time
      }),
      expect('a light in its far ring: it comes to look, no chase', () => looking() && this.noticedAt < this.mark, 8),
      act('light out, slip away', () => (this.testerLight = 'dark')),
      walk('away', 'slipping away', 3),
      expect('looked, then back to its round', () => this.doing('walk_route') && this.noticedAt < this.mark, 45),
      walk('cover', 'behind the rock'),
      act('throw a stone east', () => {
        this.throwStone()
        this.mark = this.time
      }),
      expect('a knock: it goes to look', looking, 6),
      expect('it walks off toward the knock', () => this.out && this.agent.kinematic.position.x > 3, 40),
      walk('across', 'across the lane while it looks', 3),
      walk('light', 'to the light', 3),
      expect('at the light: the lane is passed', () => this.status === 'passed', 3),
      expect('it checked the knock, then its round again', () => this.doing('walk_route') && this.noticedAt < this.mark, 45),
      newRun(),
      walk('near', 'one more, light out'),
      stepsOut('steps out for the third run'),
      peers('peers at the crossing once more'),
      expect('it walks on from the crossing', () => this.doing('walk_route') && this.agent.currentAction === '!move_to' && distanceXZ(this.agent.kinematic.position, AMBUSH.mid) > 1, 20),
      walk('flank', 'round behind it, dark', 3),
      act('on its heels', () => {
        this.mark = this.time
        this.failsAt = this.fails
      }),
      walk(() => this.behind(1.6), 'right on its heels...', 3),
      expect('dark, right on its heels: it smells me', () => this.noticedAt >= this.mark, 8),
      walk('start', 'run!', 4),
      caught('it runs me down: faster than a run'),
      failed('the run fails again, back at the start')
    ]
  }
  /** Runs failed when the current check began. */
  private failsAt = 0

  // ---- props --------------------------------------------------------------------------------------

  markers(): Marker[] {
    const L = AMBUSH.light
    const out: Marker[] = [
      { id: 'lane', shape: 'box', position: v3(0, 0.02, LANE_Z), scale: v3(28, 0.04, 3), color: LANE_COLOR, label: undefined },
      { id: 'way', shape: 'box', position: v3(0, 0.03, -2), scale: v3(1.4, 0.04, 22), color: { r: 0.3, g: 0.27, b: 0.2 } },
      { id: 'light-post', shape: 'cylinder', position: v3(L.x, 1.2, L.z), scale: v3(0.2, 2.4, 0.2), color: { r: 0.2, g: 0.18, b: 0.15 } },
      { id: 'light', shape: 'sphere', position: v3(L.x, 2.6, L.z), scale: v3(0.6, 0.6, 0.6), color: { r: 1, g: 0.6, b: 0.25 }, glow: 3, label: 'the light (past the lane)' },
      { id: 'entry', shape: 'box', position: v3(AMBUSH.entry.x + 0.6, 1.5, LANE_Z), scale: v3(0.4, 3, 3.4), color: { r: 0.05, g: 0.05, b: 0.07 }, label: 'it waits here, in the dark' },
      ...ROCKS.map(r => ({ id: r.id, shape: 'box' as const, position: v3(r.at.x, r.size.y / 2, r.at.z), scale: r.size, color: ROCK, solid: true })),
      lantern('tester-light', this.tester.position, this.testerLight)
    ]
    if (this.player) out.push(lantern('your-light', this.player, this.playerLight, 'your light: ' + this.playerLight))
    return out.filter((m): m is Marker => m !== null)
  }
}

function rockBox(r: { at: Vec3; size: Vec3 }) {
  return { min: v3(r.at.x - r.size.x / 2, 0, r.at.z - r.size.z / 2), max: v3(r.at.x + r.size.x / 2, r.size.y, r.at.z + r.size.z / 2) }
}

/** The light's factor on the sight range: lit 1, shielded and dark less (AMBUSH.sight). */
export function lightFactor(light: Light): number {
  return AMBUSH.sight[light] / AMBUSH.sight.lit
}

/** The lure ring's radius for a light (m); 0 in the dark. */
export function lureRange(light: Light): number {
  return light === 'dark' ? 0 : AMBUSH.lure[light]
}

function lantern(id: string, at: Vec3, light: Light, label?: string): Marker {
  const glow = light === 'lit' ? 3 : light === 'shielded' ? 0.8 : 0
  const c = light === 'dark' ? { r: 0.15, g: 0.15, b: 0.15 } : { r: 1, g: 0.75, b: 0.35 }
  return { id, shape: 'sphere', position: v3(at.x + 0.35, 1.1, at.z), scale: v3(0.22, 0.22, 0.22), color: c, glow, label }
}

/** Visibility of each light, for docs and tests. */
export const LIGHT_FACTORS: Record<Light, number> = { lit: lightFactor('lit'), shielded: lightFactor('shielded'), dark: lightFactor('dark') }
