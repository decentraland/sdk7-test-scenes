// One playground level in the scene: a pad with its lesson sign, the live board (planner + auto-test), the NPC and
// the tester bot as capsules, the level's props and buttons. Everything is parented to the root entity the spawner
// gives it (src/spawn), so the level works in local coordinates; the player's position and footsteps are converted
// into them. levelPlayground() makes a level a spawnable playground.
import {
  Billboard,
  BillboardMode,
  engine,
  Entity,
  MeshCollider,
  MeshRenderer,
  TextAlignMode,
  TextShape,
  Transform
} from '@dcl/sdk/ecs'
import { Color3, Quaternion, Vector3 } from '@dcl/sdk/math'
import { formatTask, GuardBody, Kinematic, NoiseEvent, noiseBus, possessEntityBody, retainPlayerNoise, Vec3 } from '../htn-planner'
import { Frame, toLocal, toScene } from '../spawn/frame'
import { debugRegistry, DebugHost, MapActor, MapArea } from '../debugger/registry'
import { planPoints, rgbHex } from '../debugger/map'
import { senseView } from '../debugger/senses'
import { pickable } from '../debugger/pick'
import type { Built, Playground } from '../spawn/spawner'
import { button, floor, paint, Rgb, setText, sign, wall } from '../demo/world'
import { allPassing, branchColor, hexRgb, plannerText, testerText } from './board'
import { CrewMember, LevelSim, Marker, PAD_HALF } from './sim'

// The board refreshes every 0.25 s of simulated or of wall-clock time, whichever comes first: a slowed or stepped
// simulation still updates it.
const BOARD_REFRESH = 0.25 // s
const BUTTONS_PER_ROW = 4
const BOARD = { z: PAD_HALF.z - 0.6, width: 26, height: 11, bottom: 0.4, split: 2.6 }
const TESTER_BLUE = { r: 0.25, g: 0.55, b: 1 }
const PAD_COLORS: Rgb[] = [
  { r: 0.17, g: 0.22, b: 0.2 },
  { r: 0.2, g: 0.2, b: 0.16 },
  { r: 0.16, g: 0.19, b: 0.24 },
  { r: 0.22, g: 0.18, b: 0.15 },
  { r: 0.2, g: 0.16, b: 0.2 },
  { r: 0.15, g: 0.2, b: 0.22 },
  { r: 0.22, g: 0.15, b: 0.15 },
  { r: 0.15, g: 0.17, b: 0.25 }
]

const yawRotation = (yaw: number) => Quaternion.fromEulerDegrees(0, (yaw * 180) / Math.PI, 0)

export function text(parent: Entity, position: Vector3, value: string, size: number, align: TextAlignMode, billboard = false, wrapWidth?: number): Entity {
  const e = engine.addEntity()
  Transform.create(e, { parent, position })
  TextShape.create(e, {
    text: value,
    fontSize: size,
    textAlign: align,
    outlineWidth: 0.12,
    outlineColor: Color3.Black(),
    ...(wrapWidth ? { width: wrapWidth, height: BOARD.height - 0.6, textWrapping: true } : {})
  })
  if (billboard) Billboard.create(e, { billboardMode: BillboardMode.BM_Y })
  return e
}

/** Cylinder body, sphere head, a nose where it looks; `color` paints body and head. */
class Capsule {
  readonly root: Entity
  readonly body: Entity
  private readonly head: Entity
  readonly label: Entity
  readonly bubble: Entity
  private color = ''

  constructor(parent: Entity, height = 1.3, cap?: Rgb) {
    this.root = engine.addEntity()
    Transform.create(this.root, { parent })
    this.body = engine.addEntity()
    Transform.create(this.body, { parent: this.root, position: { x: 0, y: height / 2, z: 0 }, scale: { x: 0.6, y: height, z: 0.6 } })
    MeshRenderer.setCylinder(this.body)
    this.head = engine.addEntity()
    Transform.create(this.head, { parent: this.root, position: { x: 0, y: height + 0.25, z: 0 }, scale: { x: 0.45, y: 0.45, z: 0.45 } })
    MeshRenderer.setSphere(this.head)
    const nose = engine.addEntity()
    Transform.create(nose, { parent: this.root, position: { x: 0, y: height + 0.25, z: 0.25 }, scale: { x: 0.12, y: 0.12, z: 0.2 } })
    MeshRenderer.setBox(nose)
    paint(nose, { r: 0.95, g: 0.95, b: 0.9 }, 0.5)
    if (cap) {
      const c = engine.addEntity()
      Transform.create(c, { parent: this.root, position: { x: 0, y: height + 0.52, z: 0.05 }, scale: { x: 0.5, y: 0.12, z: 0.55 } })
      MeshRenderer.setBox(c)
      paint(c, cap, 0.6)
    }
    this.label = text(this.root, Vector3.create(0, height + 1.2, 0), '', 1.6, TextAlignMode.TAM_BOTTOM_CENTER, true)
    this.bubble = text(this.root, Vector3.create(0, height + 0.75, 0), '', 2, TextAlignMode.TAM_BOTTOM_CENTER, true)
  }

  pose(p: Vec3, yaw: number) {
    const t = Transform.getMutable(this.root)
    t.position = { x: p.x, y: p.y, z: p.z }
    t.rotation = yawRotation(yaw)
  }

  paint(c: Rgb) {
    const key = `${c.r},${c.g},${c.b}`
    if (key === this.color) return
    this.color = key
    paint(this.body, c, 0.8)
    paint(this.head, c, 0.8)
  }
}

/**
 * A ready-made figure of separate entities (robe, head, hat, lantern), the way a composite places an NPC. The level's
 * agent drives it through the library's possessEntityBody: the robe moves and the other parts follow rigidly; the
 * floating sphere shows the agent's mode. Its own colours stay.
 */
export class Figure {
  readonly body: GuardBody
  /** The robe: the entity the agent moves. */
  readonly robe: Entity
  private readonly anchor: Entity
  readonly label: Entity
  readonly bubble: Entity

  constructor(parent: Entity, at: Vec3, private readonly frame: Frame) {
    const part = (mesh: 'box' | 'sphere' | 'cylinder', dx: number, y: number, dz: number, scale: Vec3, color: Rgb, glow = 0.3) => {
      const e = engine.addEntity()
      Transform.create(e, { parent, position: { x: at.x + dx, y, z: at.z + dz }, scale })
      if (mesh === 'box') MeshRenderer.setBox(e)
      else if (mesh === 'sphere') MeshRenderer.setSphere(e)
      else MeshRenderer.setCylinder(e)
      paint(e, color, glow)
      return e
    }
    const robe = part('cylinder', 0, 0.75, 0, { x: 0.9, y: 1.5, z: 0.9 }, { r: 0.35, g: 0.12, b: 0.4 })
    const attachments = [
      part('sphere', 0, 1.75, 0, { x: 0.5, y: 0.5, z: 0.5 }, { r: 0.9, g: 0.75, b: 0.6 }),
      part('box', 0, 2.02, 0, { x: 0.85, y: 0.06, z: 0.85 }, { r: 0.08, g: 0.08, b: 0.1 }),
      part('box', 0, 2.3, 0, { x: 0.45, y: 0.5, z: 0.45 }, { r: 0.08, g: 0.08, b: 0.1 }),
      part('sphere', 0.45, 1.05, 0.35, { x: 0.22, y: 0.22, z: 0.22 }, { r: 1, g: 0.85, b: 0.3 }, 2)
    ]
    this.robe = robe
    this.body = possessEntityBody(robe, { groundY: frame.origin.y, attachments, indicatorHeight: 2.9 })
    this.anchor = engine.addEntity()
    Transform.create(this.anchor, { parent, position: at })
    this.label = text(this.anchor, Vector3.create(0, 3.6, 0), '', 1.6, TextAlignMode.TAM_BOTTOM_CENTER, true)
    this.bubble = text(this.anchor, Vector3.create(0, 3.25, 0), '', 2, TextAlignMode.TAM_BOTTOM_CENTER, true)
  }

  pose(k: Kinematic, mode: Parameters<GuardBody['setMode']>[0]) {
    // LevelSim stays pad-local; the library body and its indicator use scene coordinates.
    this.body.write({ position: toScene(this.frame, k.position), yaw: this.frame.yaw + k.yaw })
    this.body.setMode(mode)
    Transform.getMutable(this.anchor).position = { x: k.position.x, y: k.position.y, z: k.position.z }
  }
}

/**
 * A body a playground brings for a crew member whose setup says `body: 'model'` (levelPlayground's `view`): an
 * animated model, with sound. The station writes its label and bubble; the view poses itself every frame.
 */
export interface NpcView {
  /** Its body for the pointer (the debugger picks it) and the overlay's label: an unscaled parent, uniform x / z. */
  readonly entity: Entity
  readonly label: Entity
  readonly bubble: Entity
  /** Metres above the feet for the overlay's label (above its own labels). */
  readonly overlayHeight: number
  /** One frame: the member now (a respawn gives a new one), and whether it is out (LevelSim.present). */
  render(member: CrewMember, present: boolean, dt: number): void
}

/** Makes the view of crew member `index` under the station's root. */
export type NpcViewFactory = (parent: Entity, level: LevelSim, index: number) => NpcView

const isView = (b: Capsule | Figure | NpcView): b is NpcView => 'render' in b

/** Props from LevelSim.markers(): created on first sight, moved every frame, removed when gone. */
class MarkerSet {
  private readonly live = new Map<string, { e: Entity; label: Entity | null; paint: string; shape: string; solid: boolean }>()

  constructor(private readonly parent: Entity) {}

  sync(markers: readonly Marker[]) {
    const seen = new Set<string>()
    for (const m of markers) {
      seen.add(m.id)
      let rec = this.live.get(m.id)
      if (!rec || rec.shape !== m.shape) {
        if (rec) this.remove(m.id)
        const e = engine.addEntity()
        Transform.create(e, { parent: this.parent })
        if (m.shape === 'box') MeshRenderer.setBox(e)
        else if (m.shape === 'sphere') MeshRenderer.setSphere(e)
        else MeshRenderer.setCylinder(e)
        rec = { e, label: null, paint: '', shape: m.shape, solid: false }
        this.live.set(m.id, rec)
      }
      const t = Transform.getMutable(rec.e)
      t.position = m.position
      t.scale = m.scale
      const key = `${m.color.r},${m.color.g},${m.color.b},${m.glow ?? 0.2}`
      if (key !== rec.paint) {
        rec.paint = key
        paint(rec.e, m.color, m.glow ?? 0.2)
      }
      if (!!m.solid !== rec.solid) {
        rec.solid = !!m.solid
        if (rec.solid) MeshCollider.setBox(rec.e)
        else MeshCollider.deleteFrom(rec.e)
      }
      if (m.label) {
        const at = Vector3.create(m.position.x, m.position.y + m.scale.y / 2 + 0.5, m.position.z)
        if (!rec.label) rec.label = text(this.parent, at, m.label, 1.6, TextAlignMode.TAM_BOTTOM_CENTER, true)
        else {
          Transform.getMutable(rec.label).position = at
          setText(rec.label, m.label)
        }
      } else if (rec.label) {
        engine.removeEntity(rec.label)
        rec.label = null
      }
    }
    for (const id of [...this.live.keys()]) if (!seen.has(id)) this.remove(id)
  }

  private remove(id: string) {
    const rec = this.live.get(id)
    if (!rec) return
    engine.removeEntity(rec.e)
    if (rec.label) engine.removeEntity(rec.label)
    this.live.delete(id)
  }
}

export class Station implements Built {
  /** One body per crew member: a capsule, a ready-made figure, or the playground's own view (a model). */
  readonly npcs: (Capsule | Figure | NpcView)[]
  private readonly tester: Capsule
  private readonly markers: MarkerSet
  private readonly planner: Entity
  private readonly checks: Entity
  private readonly lamp: Entity
  private since = BOARD_REFRESH
  private boardAt = -Infinity
  private noiseCursor = noiseBus.lastSeq
  private lampColor = ''
  private readonly releaseNoise = retainPlayerNoise()
  private readonly releaseDebug: () => void
  private dt = 0

  constructor(readonly level: LevelSim, readonly root: Entity, readonly frame: Frame, view?: NpcViewFactory) {
    const info = level.info
    floor(Vector3.create(0, 0, 0), PAD_HALF.x * 2, PAD_HALF.z * 2, PAD_COLORS[(info.number - 1) % PAD_COLORS.length], this.root)

    // The lesson sign at the front-left corner, facing the visitor.
    const front = -PAD_HALF.z
    wall(Vector3.create(-7, 2.4, front + 0.6), Vector3.create(11.4, 2.6, 0.15), { r: 0.12, g: 0.12, b: 0.16 }, this.root)
    text(
      this.root,
      Vector3.create(-12.5, 3.55, front + 0.5),
      [`<size=170%><b>${info.number}</b></size>  <b>${info.title}</b>`, ...info.lesson.map(l => `<color=#d0d0d0>${l}</color>`), `<color=#ffe066>watch: ${info.watch}</color>`].join('\n'),
      2.1,
      TextAlignMode.TAM_TOP_LEFT
    )

    // The board at the back: planner on the left, auto-test on the right; a lamp on top shows the verdict.
    wall(Vector3.create(0, BOARD.bottom + BOARD.height / 2, BOARD.z + 0.15), Vector3.create(BOARD.width, BOARD.height, 0.2), { r: 0.06, g: 0.07, b: 0.1 }, this.root)
    // With a width the text box is centred on its entity; TOP_LEFT aligns inside the box.
    const middle = BOARD.bottom + BOARD.height / 2
    const scale = level.boardScale
    const left = { from: -BOARD.width / 2 + 0.4, to: BOARD.split - 0.4 }
    const right = { from: BOARD.split, to: BOARD.width / 2 - 0.4 }
    this.planner = text(this.root, Vector3.create((left.from + left.to) / 2, middle, BOARD.z), '', 5.1 * scale, TextAlignMode.TAM_TOP_LEFT, false, left.to - left.from)
    this.checks = text(this.root, Vector3.create((right.from + right.to) / 2, middle, BOARD.z), '', 4 * Math.max(scale, 0.75), TextAlignMode.TAM_TOP_LEFT, false, right.to - right.from)
    text(this.root, Vector3.create(0, BOARD.bottom + BOARD.height + 1.4, BOARD.z), `<b>${info.number}</b>`, 30, TextAlignMode.TAM_MIDDLE_CENTER)
    this.lamp = engine.addEntity()
    Transform.create(this.lamp, { parent: this.root, position: { x: 4, y: BOARD.bottom + BOARD.height + 1.4, z: BOARD.z }, scale: { x: 1.6, y: 1.6, z: 1.6 } })
    MeshRenderer.setSphere(this.lamp)

    // Buttons along the front-right, BUTTONS_PER_ROW to a row.
    const controls = [
      { label: 'Tester: pause/run', run: () => (level.testerPaused = !level.testerPaused) },
      { label: 'Reset level', run: () => level.reset() },
      ...level.controls()
    ]
    controls.forEach((c, i) => {
      const at = Vector3.create(1.5 + (i % BUTTONS_PER_ROW) * 3, 0, front + 1.2 + Math.floor(i / BUTTONS_PER_ROW) * 2.4)
      button(at, c.label, c.run, i < 2 ? { r: 0.55, g: 0.55, b: 0.6 } : { r: 0.2, g: 0.45, b: 0.9 }, this.root)
    })

    this.npcs = level.crew.map((m, i) =>
      m.body === 'model' && view ? view(this.root, level, i) : m.body === 'figure' ? new Figure(this.root, m.agent.kinematic.position, this.frame) : new Capsule(this.root)
    )
    // The HTN debugger reads every NPC of the level and its other planners (a squad's); the crew is rebuilt on Reset:
    // the source lists it as it is.
    const hosts = level.crew.map((_m, i) => this.debugHost(i))
    const planners = level.planners().map((_p, i) => this.plannerHost(i))
    this.releaseDebug = debugRegistry.add(() => [...hosts.slice(0, level.crew.length), ...planners], this.mapArea())
    this.npcs.forEach((body, i) => pickable(bodyEntity(body), hosts[i].id, level.crew[i].id))
    this.tester = new Capsule(this.root, 1.2, TESTER_BLUE)
    this.tester.paint(TESTER_BLUE)
    this.markers = new MarkerSet(this.root)
    this.render()
  }

  update(dt: number) {
    const level = this.level
    level.player = this.localPlayer()
    level.update(Math.min(dt, 0.1), this.playerNoises())
    this.dt = dt
    this.since += dt
    this.render()
  }

  dispose() {
    this.releaseNoise()
    this.releaseDebug()
    this.level.dispose()
    // Dispose possession before the spawner removes the pad tree: this releases the scene-root
    // mode indicator and restores local figure transforms while their entities still exist.
    for (const body of this.npcs) if (body instanceof Figure) body.body.dispose()
  }

  /** The pad on the debugger's map: the level's props, the tester, the player while on the pad. */
  private mapArea(): MapArea {
    const level = this.level
    return {
      label: `${level.info.number} ${level.info.title}`,
      half: PAD_HALF,
      toScene: p => toScene(this.frame, p),
      props: () =>
        level.markers().map(m => ({
          id: m.id,
          x: m.position.x,
          z: m.position.z,
          w: m.scale.x,
          d: m.scale.z,
          color: rgbHex(m.color),
          solid: m.solid,
          round: m.shape !== 'box',
          label: m.label
        })),
      actors: () => {
        const out: MapActor[] = [{ id: 'tester', label: 'tester', kind: 'tester', position: level.tester.position }]
        if (level.player) out.push({ id: 'you', label: 'you', kind: 'player', position: level.player })
        return out
      }
    }
  }

  /** The debugger's view of the level's planner `i` that drives no NPC (a squad planner). */
  private plannerHost(i: number): DebugHost {
    const level = this.level
    const planner = () => level.planners()[i]
    const first = planner()
    return {
      id: `${level.info.id}:${first.id}`,
      label: first.label,
      group: `${level.info.number} ${level.info.title}`,
      get domain() {
        return planner().domain
      },
      get recorder() {
        return planner().recorder
      },
      get world() {
        return planner().world
      },
      status: () => {
        const s = planner().status()
        return { state: 'squad', lastStatus: s.lastStatus, reason: s.reason, current: '', steps: s.steps, done: [] }
      }
    }
  }

  /** The debugger's view of crew member `i` (whoever it is after a Reset). */
  private debugHost(i: number): DebugHost {
    const level = this.level
    const member = () => level.crew[i]
    const body = this.npcs[i]
    const frame = this.frame
    return {
      id: `${level.info.id}:${member().id}`,
      label: member().id,
      group: `${level.info.number} ${level.info.title}`,
      get domain() {
        return member().trace.domain
      },
      get recorder() {
        return member().trace
      },
      get world() {
        return member().agent.blackboard.world
      },
      get history() {
        return member().history
      },
      get metrics() {
        return member().agent.metrics
      },
      entity: bodyEntity(body),
      // Above the body's own two-line label (capsule 2.5 m, figure 3.6 m, a view says).
      overlayHeight: isView(body) ? body.overlayHeight : body instanceof Figure ? 4.3 : 3.2,
      replan: reason => member().agent.requestReplan(reason, true, 'debug'),
      // Its senses for the gizmos: every NPC of a level perceives; one off-stage shows none.
      senses: () => (level.present(member()) ? senseView(member().agent, level.senseArcs(member())) : undefined),
      position: () => toScene(frame, member().agent.kinematic.position),
      // On the map: the positions its plan's steps name (its route), and where the running step points: a position,
      // or someone it names whom the agent sees or remembers or the level knows ('you', 'tester'); a later step's
      // id is not a place on the route (`!forget tester` goes nowhere).
      pose: () => {
        const a = member().agent
        const steps = a.runner.steps
        const route = planPoints(steps, () => undefined).filter((p): p is Vec3 => p !== undefined)
        const resolve = (id: string) => level.positionOf(id) ?? a.blackboard.visibleTarget(id)?.position ?? a.blackboard.memoryOf(id)?.position
        const target = a.currentAction !== '' && steps.length > 0 ? planPoints(steps.slice(0, 1), resolve)[0] : undefined
        return { position: a.kinematic.position, yaw: a.kinematic.yaw, target, route }
      },
      status: () => {
        const m = member()
        const a = m.agent
        const step = a.currentAction !== '' ? a.runner.current() : null
        return {
          state: a.mode,
          lastStatus: a.lastPlanStatus,
          reason: a.lastReplanReason,
          replan: a.lastReplan,
          current: step ? formatTask(step.name, step.args) : '',
          steps: a.runner.steps.map(s => formatTask(s.name, s.args)),
          done: m.doneSteps
        }
      }
    }
  }

  private localPlayer(): Vec3 | null {
    const t = Transform.getOrNull(engine.PlayerEntity)
    if (!t) return null
    const p = { ...toLocal(this.frame, t.position), y: 0 }
    return Math.abs(p.x) <= PAD_HALF.x && Math.abs(p.z) <= PAD_HALF.z ? p : null
  }

  /** The player's footsteps on this pad, in local coordinates. */
  private playerNoises(): NoiseEvent[] {
    const out: NoiseEvent[] = []
    for (const n of noiseBus.since(this.noiseCursor)) {
      if (n.source !== 'player') continue
      const p = toLocal(this.frame, n.position)
      if (Math.abs(p.x) <= PAD_HALF.x && Math.abs(p.z) <= PAD_HALF.z) out.push({ ...n, position: p })
    }
    this.noiseCursor = noiseBus.lastSeq
    return out
  }

  private renderNpc(body: Capsule | Figure | NpcView, m: CrewMember) {
    const level = this.level
    const a = m.agent
    const chosen = level.chosenOf(m)
    const present = level.present(m)
    if (isView(body)) body.render(m, present, this.dt)
    else if (body instanceof Figure) body.pose(a.kinematic, a.mode)
    else {
      // Off-stage (LevelSim.present): under the floor, labels and all.
      body.pose(present ? a.kinematic.position : { ...a.kinematic.position, y: -40 }, a.kinematic.yaw)
      const branches = m.trace.domain.methods.find(x => x.topLevel)?.branches ?? []
      const index = branches.findIndex(b => b.name === chosen)
      body.paint(index >= 0 ? hexRgb(branchColor(level, chosen, index)) : { r: 0.5, g: 0.5, b: 0.5 })
    }
    const step = a.runner.current()
    const onBoard = level.crew.length > 1 && m === level.crew[level.focus] ? '  <color=#9fd3ff>(on the board)</color>' : ''
    setText(body.label, `<b>${m.id}</b>  ${chosen || '-'}${onBoard}\n<color=#ffe066>${step ? formatTask(step.name, step.args) : ''}</color>`)
    const bubble = m === level.crew[0] ? level.bubbles.npc : null
    setText(body.bubble, bubble ? `<color=#ffffff>"${bubble.text}"</color>` : '')
  }

  private render() {
    const level = this.level
    level.crew.forEach((m, i) => this.renderNpc(this.npcs[i], m))
    this.tester.pose(level.tester.position, level.tester.yaw)
    setText(this.tester.label, `<color=#56a8ff><b>TESTER</b></color>${level.testerPaused ? ' (paused)' : ''}`)
    setText(this.tester.bubble, `<color=#9fd3ff>${level.testerSay}</color>`)
    this.markers.sync(level.markers())
    const now = Date.now()
    if (this.since < BOARD_REFRESH && now - this.boardAt < BOARD_REFRESH * 1000) return
    this.since = 0
    this.boardAt = now
    setText(this.planner, plannerText(level))
    setText(this.checks, testerText(level))
    const ok = allPassing(level)
    const anyFail = level.checks.some(c => c.state === 'fail')
    const verdict = anyFail ? 'red' : ok ? 'green' : 'grey'
    if (verdict !== this.lampColor) {
      this.lampColor = verdict
      paint(this.lamp, anyFail ? { r: 1, g: 0.2, b: 0.15 } : ok ? { r: 0.3, g: 1, b: 0.35 } : { r: 0.5, g: 0.5, b: 0.5 }, 2)
    }
  }
}

/** The entity that stands for a body: the pointer target and the overlay label's parent. */
function bodyEntity(body: Capsule | Figure | NpcView): Entity {
  return isView(body) ? body.entity : body instanceof Figure ? body.robe : body.body
}

const capitalized = (id: string) => id.charAt(0).toUpperCase() + id.slice(1)

/**
 * A level as a spawnable playground; `make` is a fresh level each spawn (also run headless by the tests). `view`: the
 * body of crew members whose setup says `body: 'model'` (else they are capsules).
 */
export function levelPlayground(make: () => LevelSim, opts: { view?: NpcViewFactory } = {}): Playground & { make: () => LevelSim } {
  const info = make().info
  return {
    id: info.id,
    label: `${info.number}  ${capitalized(info.id)}`,
    half: PAD_HALF,
    make,
    build: (root, frame) => new Station(make().init(), root, frame, opts.view)
  }
}
