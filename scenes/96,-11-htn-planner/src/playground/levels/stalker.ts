// Level 7: the full stalker domain (src/examples/stalker/stalker.domain): upkeep, then 6 tiers. The capsule has no
// animations (clips only time out); the head sphere turns apart from the body, as the domain's head actuator asks.
import { pickExit, stalkerActions, stalkerFacts, syncStalkerFacts } from '../../examples/stalker/stalker-actions'
import { stalkerDomain } from '../../examples/stalker/stalker.htn'
import { DEG, GuardEvent, NoiseEvent, v3, Vec3 } from '../../htn-planner'
import { act, AgentSetup, Control, expect, LevelInfo, LevelSim, Marker, TesterStep, wait, walk } from '../sim'

// The hut (north-west), open to the south, away from the patrol loop.
const HUT = { minX: -12, maxX: -8, minZ: 6, maxZ: 10 }
const HUT_X = (HUT.minX + HUT.maxX) / 2
// Starts at the far (east) corner, away from the tester's gate.
const ROUTE = [v3(7, 0, -6), v3(7, 0, 3), v3(-7, 0, 3), v3(-7, 0, -6)]
const LEAVE_DISTANCE = 25

/** How a stalker starts (the Spawn buttons): the tester's script uses `patrol`. */
export type StalkerSpawn = 'patrol' | 'cross' | 'stand' | 'chase'
const SPAWNS: Record<StalkerSpawn, { start: { position: Vec3; yaw: number }; route: Vec3[] }> = {
  patrol: { start: { position: ROUTE[0], yaw: 0 }, route: ROUTE },
  // Walks across the field once; it starts watching after waypoint 1.
  cross: { start: { position: v3(-8, 0, -7), yaw: 0 }, route: [v3(-4, 0, -3), v3(0, 0, 3), v3(8, 0, 3), v3(10, 0, -7)] },
  // Stands in the field facing the gate, already watching.
  stand: { start: { position: v3(0, 0, 1), yaw: Math.PI }, route: [] },
  // Starts having noticed you (and the tester): it runs at whoever it sees.
  chase: { start: { position: v3(0, 0, 7), yaw: Math.PI }, route: [] }
}
const BODY_TURN_SECONDS = 44 / 30
const PLAYER_NOISE_KINDS = ['steps', 'run', 'land']
const WOOD = { r: 0.45, g: 0.3, b: 0.2 }
const inHut = (p: Vec3) => p.x > HUT.minX && p.x < HUT.maxX && p.z > HUT.minZ && p.z < HUT.maxZ

export class StalkerLevel extends LevelSim {
  readonly info: LevelInfo = {
    id: 'stalker',
    number: 7,
    title: 'A full NPC: tiers of behaviours',
    source: 'stalker/stalker.domain',
    lesson: [
      'Everything together: patrol with looks, notice (head, then body),',
      'chase, catch; hide in the hut and it searches the door, gives up,',
      'walks off. Noises re-target it. Read the tree top to bottom.',
      'Spawn buttons start it another way (the tester pauses; Reset: back).'
    ],
    watch: 'which tier and behaviour the chosen ✓ moves to as things change'
  }
  /** The current spawn; a Spawn button pauses the tester, Reset goes back to `patrol`. */
  spawnKind: StalkerSpawn = 'patrol'
  headYaw = 0 // deg, relative to the body
  worldLook: number | null = null
  clip = ''
  signals: string[] = []
  private respawnAt: number | null = null

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
      startled_by_loud_noise: '#ffe066'
    }
  }

  spots() {
    return { hut: v3(HUT_X, 0, 8), field: v3(-2, 0, -2), gate: v3(-12, 0, -11) }
  }
  private sheltered(id: string): boolean {
    const p = this.positionOf(id)
    return p !== undefined && inHut(p)
  }
  protected agentSetup(): AgentSetup {
    const self = this
    const spawn = SPAWNS[this.spawnKind]
    return {
      domain: stalkerDomain,
      // stalker.domain's belief upkeep, and its behaviour branch names one level below its tiers.
      reasoning: 'reasoning',
      chosenDepth: 2,
      start: { position: { ...spawn.start.position }, yaw: spawn.start.yaw },
      route: spawn.route,
      tuning: { walkSpeed: 0.9, hurrySpeed: 4, runSpeed: 6.5, turnRate: 300 * DEG, catchRadius: 1.6, lookAroundDeg: 75 },
      perception: { range: 16, fovDeg: 140, eyeHeight: 1.6, detectTime: 0.8, nearDetectTime: 0.15, nearRadius: 3, loseGrace: 1 },
      sightYaw: () => self.worldLook ?? (self.agent?.kinematic.yaw ?? 0) + self.headYaw * DEG,
      canSee: p => !inHut(p),
      occluders: [
        { min: v3(HUT.minX, 0, HUT.maxZ - 0.15), max: v3(HUT.maxX, 3, HUT.maxZ + 0.15) },
        { min: v3(HUT.minX - 0.15, 0, HUT.minZ), max: v3(HUT.minX + 0.15, 3, HUT.maxZ) },
        { min: v3(HUT.maxX - 0.15, 0, HUT.minZ), max: v3(HUT.maxX + 0.15, 3, HUT.maxZ) }
      ]
    }
  }
  protected actions() {
    const self = this
    return stalkerActions(
      {
        play: clip => (self.clip = clip),
        clipFinished: () => false,
        targetPosition: () => self.agent.blackboard.visibleTargets[0]?.position ?? self.positionOf('tester'),
        lookYaw: degrees => (self.headYaw = degrees ?? 0),
        lookWorldYaw: radians => (self.worldLook = radians)
      },
      {
        turnSign: 1,
        bodyYawDeg: s => Math.min(90, (s / BODY_TURN_SECONDS) * 90),
        headTurnSeconds: 1.8,
        bodyTurnSeconds: BODY_TURN_SECONDS,
        minClipSeconds: 0.25,
        leaveDistance: LEAVE_DISTANCE,
        faceTurnRate: 120 * DEG,
        gaitClips: { walk: { clip: 'PatrolWalk', speed: 1 }, hurry: { clip: 'AggroRun', speed: 0.75 }, run: { clip: 'AggroRun', speed: 1 } }
      }
    )
  }
  protected afterInit() {
    const w = this.agent.blackboard.world
    stalkerFacts.setPlayerNoiseKinds(w, PLAYER_NOISE_KINDS)
    const kind = this.spawnKind
    if (kind === 'patrol') stalkerFacts.setPatrol(w, [0, 3, 0, 2], [null, null, null, v3(0, 0, -13)])
    stalkerFacts.setWatchPoint(w, kind === 'cross' ? 1 : null)
    if (kind !== 'cross') stalkerFacts.setWatching(w)
    if (kind === 'chase') for (const id of ['you', 'tester']) stalkerFacts.setNoticed(w, id)
    this.headYaw = 0
    this.worldLook = null
    this.respawnAt = null
  }
  protected facts(): string {
    return syncStalkerFacts(this.agent, { closeRadius: 6, frontDeg: 35, sheltered: id => this.sheltered(id) })
  }
  protected testerVisible() {
    return true
  }
  protected onEvent(e: GuardEvent) {
    super.onEvent(e)
    if (e.type !== 'signal') return
    this.signals.push(e.name)
    if (this.signals.length > 4) this.signals.shift()
    if (e.name === 'despawn') this.respawnAt = this.time + 2
  }
  update(dt: number, extra: readonly NoiseEvent[] = []) {
    super.update(dt, extra)
    if (this.respawnAt !== null && this.time >= this.respawnAt) this.respawn()
  }
  /** Walked off after giving up: a new stalker starts again (the script keeps running). */
  respawn() {
    this.agent.stop()
    this.buildAgent()
  }

  /** A Spawn button: a new stalker of that kind; the tester pauses so you can play it yourself. */
  spawn(kind: StalkerSpawn) {
    this.spawnKind = kind
    this.testerPaused = true
    this.respawn()
  }

  /** The Give up button: as if the search ran out, it walks off away from its target. */
  giveUp() {
    const w = this.agent.blackboard.world
    if (stalkerFacts.gaveUp(w)) return
    const seen = this.agent.blackboard.visibleTargets[0]
    const id = seen?.id ?? (this.player ? 'you' : 'tester')
    const away = seen?.position ?? this.positionOf(id)
    stalkerFacts.setGaveUp(w, id, pickExit(this.agent.kinematic, away, LEAVE_DISTANCE))
    this.agent.requestReplan('button: give up', true)
  }

  controls(): Control[] {
    const spawn = (kind: StalkerSpawn) => ({ label: `Spawn: ${kind}`, run: () => this.spawn(kind) })
    return [spawn('cross'), spawn('stand'), spawn('patrol'), spawn('chase'), { label: 'Give up', run: () => this.giveUp() }]
  }

  protected resetProps() {
    this.spawnKind = 'patrol'
    this.testerPaused = false
  }
  protected testerStart() {
    return v3(-12, 0, -11)
  }
  protected testerScript(): TesterStep[] {
    const any = (...names: string[]) => () => names.some(n => this.doing(n))
    return [
      expect('nobody -> walk_route (patrol)', any('walk_route'), 60, 'it patrols the field'),
      walk(v3(-4, 0, -1), 'peeking into the field'),
      expect('sees me -> notice_seen_target', any('notice_seen_target', 'notice_close_target'), 20, 'standing in its view'),
      walk('hut', 'it noticed me: run to the hut!', 8),
      expect('lost me in the hut -> search_at_shelter', any('search_at_shelter', 'search_last_seen'), 15, 'hiding in the hut'),
      expect('gives up -> leave', any('leave', 'walked_off'), 60),
      expect('walked off, a new one patrols', any('walk_route'), 60, 'it walks away...'),
      walk('field', 'this time I stay'),
      expect('sees me -> notice (or already chasing)', any('notice_seen_target', 'notice_close_target', 'chase_noticed_target'), 20),
      expect('noticed -> chase_noticed_target', any('chase_noticed_target', 'chase_ignoring_noise'), 10),
      expect('caught -> stand_over_caught', any('stand_over_caught'), 10),
      wait(3, 'caught!'),
      act('a new round', () => {
        this.respawn()
        this.teleportTester(this.testerStart())
      })
    ]
  }
  markers(): Marker[] {
    const a = this.agent.kinematic
    return [
      { id: 'hut-back', shape: 'box', position: v3(HUT_X, 1.5, HUT.maxZ), scale: v3(4, 3, 0.3), color: WOOD, solid: true },
      { id: 'hut-l', shape: 'box', position: v3(HUT.minX, 1.5, 8), scale: v3(0.3, 3, 4), color: WOOD, solid: true },
      { id: 'hut-r', shape: 'box', position: v3(HUT.maxX, 1.5, 8), scale: v3(0.3, 3, 4), color: WOOD, solid: true, label: 'hut: inside = unseen, unheard' },
      // The head: a dark ball turned apart from the body, with a white nose where it looks.
      { id: 'look', shape: 'box', position: v3(a.position.x + Math.sin(this.lookYaw()) * 0.35, 1.85, a.position.z + Math.cos(this.lookYaw()) * 0.35), scale: v3(0.14, 0.14, 0.14), color: { r: 0.95, g: 0.95, b: 0.9 }, glow: 1 }
    ]
  }
  private lookYaw(): number {
    return this.worldLook ?? this.agent.kinematic.yaw + this.headYaw * DEG
  }
}
