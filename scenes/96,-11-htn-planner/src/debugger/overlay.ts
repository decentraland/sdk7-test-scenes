// The in-world overlay: a label above each NPC with what it is doing, read while walking around the playgrounds
// (design: docs/htn-guidance.md, Debugging, view 6 "In the scene"). Three levels: off, step (the running step in the
// state's colour, one line), full (name and state, the step, root method → chosen branch, why it last planned: the
// replan's trigger, its reason in words and the facts the domain reads that changed, from the structured replan event).
// A line on the ground goes to where the running step points (the map's target, map.ts planPoints). Everything is
// rebuilt only when its change key moves (the map's idea): the label on what it shows, the line in 0.2 m steps.
// Pure: the scene side is overlay-scene.ts.
import { rootMethod } from '../htn-planner'
import type { PlanRun, PlanTraceRecorder, Vec3 } from '../htn-planner'
import { chosenBranchName } from '../htn-planner'
import { changeSummary, knowledgeText, withTrigger } from './history-rows'
import { stateHex } from './map'
import { clip, colored, escapeRich, HEX, STATUS_HEX } from './theme'

export type OverlayLevel = 'off' | 'step' | 'full'
export const OVERLAY_LEVELS: readonly OverlayLevel[] = ['off', 'step', 'full']

export const nextLevel = (level: OverlayLevel): OverlayLevel => OVERLAY_LEVELS[(OVERLAY_LEVELS.indexOf(level) + 1) % OVERLAY_LEVELS.length]

/** The level a host shows: its own (set by hovering it and pressing 1), else everyone's. */
export function levelFor(global: OverlayLevel, overrides: ReadonlyMap<string, OverlayLevel>, id: string): OverlayLevel {
  return overrides.get(id) ?? global
}

/** The top of the plan: the root method and the branch it chose. */
export interface Goal {
  method: string
  branch: string
}

export interface OverlayInput {
  label: string
  /** The host's state word (an agent's mode, a station's walk / step / idle / no plan). */
  state: string
  lastStatus: string
  /** The running step, formatted, or ''. */
  current: string
  /** Why it planned last. */
  reason: string
  /** What asked for that replan (a GuardAgent's lastReplan.trigger), if the host knows. */
  trigger?: string
  /** The facts the domain reads that changed since the replan before (`+ (fact ...)`, `- (fact ...)`). */
  changes?: readonly string[]
  goal: Goal | null
}

const STEP_CHARS = 44
const WHY_CHARS = 48

/** The newest top-level run: the top-level plan, or a deferred expansion of a top-level method made after it. */
function newestTopRun(recorder: PlanTraceRecorder): PlanRun | null {
  const plan = recorder.lastPlan
  const deferred = recorder.lastDeferred
  const root = deferred && rootMethod(deferred)
  if (deferred && plan && deferred.seq > plan.seq && root && recorder.domain.methods[root.ref].topLevel) return deferred
  return plan
}

/** Root method → chosen branch of the host's newest top-level run; null before it planned (or while not recording). */
export function goalOf(recorder: PlanTraceRecorder | null): Goal | null {
  if (!recorder) return null
  const run = newestTopRun(recorder)
  const root = rootMethod(run)
  if (!run || !root) return null
  return { method: recorder.domain.methods[root.ref].name, branch: chosenBranchName(run, recorder.domain) }
}

/** The run `goalOf` reads, as a key: the goal is recomputed only when this changes. */
export function goalKey(recorder: PlanTraceRecorder | null): string {
  return recorder ? `${recorder.lastPlan?.seq ?? '-'}/${recorder.lastDeferred?.seq ?? '-'}` : '-'
}

/** Why it planned, short: a perception change says what it knows now; a facts change says nothing (its changed
 *  facts do, whyText). */
export function shortReason(reason: string): string {
  const m = /^perception (\S*) -> (\S*)$/.exec(reason)
  if (m) return `now ${knowledgeText(m[2])}`
  return /^facts \S* -> \S*$/.test(reason) ? '' : reason
}

/** The why line: `<trigger>: <short reason> · +fact −fact` (the trigger said once, withTrigger; the changes left out
 *  when none or unknown). */
export function whyText(reason: string, trigger?: string, changes?: readonly string[]): string {
  const short = shortReason(reason)
  const head = withTrigger(trigger, short)
  const changed = changeSummary(changes)
  return [head || (changed ? '' : reason), changed].filter(Boolean).join(' · ')
}

function stepLine(i: OverlayInput): string {
  const color = stateHex(i.state)
  if (i.current) return colored(color, '▶ ' + clip(i.current, STEP_CHARS))
  if (i.lastStatus !== '' && i.lastStatus !== 'succeeded') return colored(STATUS_HEX.failed, '× ' + i.lastStatus)
  return colored(color, '· ' + i.state)
}

/** The label's rich text at `level` ('' when off). */
export function overlayText(i: OverlayInput, level: OverlayLevel): string {
  if (level === 'off') return ''
  if (level === 'step') return stepLine(i)
  const lines = [`<b>${escapeRich(clip(i.label, 24))}</b>  ${colored(stateHex(i.state), i.state)}`, stepLine(i)]
  if (i.goal) lines.push(colored(HEX.method, clip(`${i.goal.method} → ${i.goal.branch || '?'}`, STEP_CHARS)))
  const why = whyText(i.reason, i.trigger, i.changes)
  if (why) lines.push(colored(HEX.dim, 'why: ' + clip(why, WHY_CHARS)))
  return lines.join('\n')
}

/** What the label shows at `level`: it is rewritten only when this changes. */
export function overlayKey(i: OverlayInput, level: OverlayLevel): string {
  if (level === 'off') return 'off'
  const step = `${i.state}|${i.lastStatus}|${i.current}`
  if (level === 'step') return `step|${step}`
  return `full|${i.label}|${step}|${i.goal ? `${i.goal.method}/${i.goal.branch}` : '-'}|${i.reason}|${i.trigger ?? ''}|${i.changes?.join(',') ?? ''}`
}

/** A box of unit size stretched along +z from `a` to `b`: its centre, rotation (degrees) and length. */
export interface Segment {
  position: Vec3
  pitch: number
  yaw: number
  length: number
}

const MIN_SEGMENT = 0.05 // m

export function segment(a: Vec3, b: Vec3): Segment | null {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const dz = b.z - a.z
  const flat = Math.sqrt(dx * dx + dz * dz)
  const length = Math.sqrt(flat * flat + dy * dy)
  if (length < MIN_SEGMENT) return null
  const deg = 180 / Math.PI
  return {
    position: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 },
    // A positive rotation about x tilts +z down (left-handed, y up).
    pitch: Math.atan2(-dy, flat) * deg,
    yaw: Math.atan2(dx, dz) * deg,
    length
  }
}

const q = (v: number) => Math.round(v / 0.2)

/** A line's ends in 0.2 m steps: it is redrawn only when this changes. */
export function lineKey(a: Vec3, b: Vec3 | undefined): string {
  return b ? `${q(a.x)},${q(a.y)},${q(a.z)}>${q(b.x)},${q(b.y)},${q(b.z)}` : '-'
}
