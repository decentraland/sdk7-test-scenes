// Debugging an NPC by pointing at it: hover its body (the hover says its name and running step, and lists the keys),
// then a key acts on that NPC. Keys that are free in the Explorer and are not movement: E and F (the primary and
// secondary actions), 1-4 (IA_ACTION_3..6). A click selects it in the debugger as before (pick.ts).
//   E  open the debugger on it (again: close it)   F  replan now (reason 'debug')
//   1  its overlay detail: off → step → full        2  pause / run the simulation
//   3  step one frame (pauses)                       4  dump its world and plan to the console
// 1 also works with no NPC under the cursor; 2/3 work anywhere only while the debugger panel is open.
// Pure: the scene side is pick.ts.
import { snapshotWorld } from '../htn-planner'
import type { WorldState } from '../htn-planner'
import { readableReason } from './history-rows'
import { replanText } from './replan-rows'
import type { Goal } from './overlay'
import type { HostStatus } from './registry'
import { clip } from './theme'
import { atomText } from './tree-rows'

export type NpcAction = 'open' | 'replan' | 'detail' | 'pause' | 'step' | 'dump'

export interface NpcKey {
  action: NpcAction
  /** The key as the player presses it. */
  key: string
  /** The hover line for it (the Explorer puts the key's icon in front). */
  hint: string
  /** Also without an NPC under the cursor. */
  anywhere?: boolean
}

export const NPC_KEYS: readonly NpcKey[] = [
  { action: 'open', key: 'E', hint: 'HTN debugger' },
  { action: 'replan', key: 'F', hint: 'replan now' },
  { action: 'detail', key: '1', hint: 'overlay detail', anywhere: true },
  { action: 'pause', key: '2', hint: 'pause / run', anywhere: true },
  { action: 'step', key: '3', hint: 'step a frame', anywhere: true },
  { action: 'dump', key: '4', hint: 'dump to console' }
]

/** What a press does: on the NPC under the cursor (`host`), or on everyone (host null); null: nothing. */
export function resolvePress(action: NpcAction, host: string | undefined): { action: NpcAction; host: string | null } | null {
  if (host !== undefined) return { action, host }
  return NPC_KEYS.find(k => k.action === action)?.anywhere ? { action, host: null } : null
}

const HOVER_CHARS = 60

/** The click's hover line: its name and running step (else its state), plain text. */
export function hoverText(label: string, current: string, state: string): string {
  return clip(`${label}: ${current || state}`, HOVER_CHARS)
}

export interface DumpInput {
  id: string
  label: string
  domain: string
  status: HostStatus
  goal: Goal | null
  world: WorldState
}

/** A host's state for the console: goal, why, plan, done steps, and its world one fact per line. */
export function dumpText(d: DumpInput): string {
  const s = d.status
  const snap = snapshotWorld(d.world)
  const facts: string[] = []
  for (const [k, rows] of Object.entries(snap.tables)) {
    const name = k.slice(0, k.lastIndexOf('/'))
    for (const row of rows) facts.push(`  ${name}(${row.map(atomText).join(', ')})`)
  }
  const plan = s.steps.map((step, i) => (i === 0 && s.current ? `▶ ${step}` : step))
  return [
    `[htn-debug] ${d.id} "${d.label}" · ${d.domain} · ${s.state} · last plan ${s.lastStatus || '-'}`,
    `goal: ${d.goal ? `${d.goal.method} → ${d.goal.branch || '?'}` : '-'}`,
    `why: ${s.replan ? replanText(s.replan) : readableReason(s.reason) || '-'}`,
    `plan: ${plan.join(' | ') || '-'}`,
    `done: ${s.done.join(' | ') || '-'}`,
    `world: ${facts.length} facts (revision ${snap.revision})`,
    ...facts
  ].join('\n')
}
