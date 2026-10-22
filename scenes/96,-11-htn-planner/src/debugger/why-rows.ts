// The watch's "why" lines (Plan and Domain Runner tabs): why the selected node of a run ended as it did, from the
// library's whyNode (htn/why-not.ts). A method row lists every branch of it (tried, chosen, not reached behind the
// chosen one); a branch row its attempt with the failing terms (needed vs the world's rows) and, when abandoned, why
// the failed task's method had no branch; a failed condition row its failing terms. Rich text, one string per line.
// Pure, no SDK.
import { whyNode } from '../htn-planner'
import type { DomainIR, PlanRun, WhyAttempt, WhyOutcome, WhyTerm, WorldSnapshot } from '../htn-planner'
import { colored, HEX, STATUS_HEX } from './theme'

const OUTCOME: Record<WhyOutcome, { glyph: string; hex: string }> = {
  chosen: { glyph: '✓', hex: STATUS_HEX.chosen },
  discarded: { glyph: '~', hex: STATUS_HEX.abandoned },
  no_match: { glyph: '×', hex: STATUS_HEX.failed },
  abandoned: { glyph: '×', hex: STATUS_HEX.abandoned },
  not_reached: { glyph: '·', hex: STATUS_HEX.untried },
  not_decomposed: { glyph: '·', hex: STATUS_HEX.untried }
}

/** What an attempt comes to, short: the first failing term, the failed task, the branch that came first. */
export function attemptShort(a: WhyAttempt): string {
  switch (a.outcome) {
    case 'chosen':
      return 'chosen'
    case 'no_match': {
      const t = a.terms[0]
      return t ? `${t.term}  ${t.why}${a.terms.length > 1 ? `  (+${a.terms.length - 1})` : ''}` : 'condition failed'
    }
    case 'abandoned':
      return a.task ? `held, then task ${a.task} failed` : 'held, then its tasks failed'
    case 'not_reached':
      return a.shadowedBy ? `not reached: ${a.shadowedBy} succeeded first` : a.text
    default:
      return a.text
  }
}

function attemptLine(a: WhyAttempt, indent: string): string {
  const o = OUTCOME[a.outcome]
  return `${indent}${colored(o.hex, o.glyph)} ${colored(HEX.branch, a.name)}  ${colored(HEX.dim, attemptShort(a))}`
}

function termLine(t: WhyTerm, indent: string): string {
  const via = t.via?.length ? colored(HEX.faint, t.via.join(' › ') + ' › ') : ''
  return `${indent}${colored(STATUS_HEX.failed, '×')} ${via}${colored(HEX.text, t.term)}  ${colored(HEX.dim, t.why)}`
}

/**
 * Lines for the watch of node `id` (at most `max`); [] when there is nothing to explain (a primitive task, the plan
 * row, a condition that held). `world`: the snapshots a run planned against (PlanTraceRecorder.world).
 */
export function whyLines(domain: DomainIR, run: PlanRun, id: number, world?: (revision: number) => WorldSnapshot | undefined, max = 12): string[] {
  const n = run.nodes[id]
  if (!n || run.method < 0) return []
  const { attempts, terms } = whyNode(domain, run, id, world, 1)
  const out: string[] = []
  if (n.kind === 'method' || n.kind === 'task') {
    for (const a of attempts) out.push(attemptLine(a, ''))
  } else if (n.kind === 'branch') {
    for (const a of attempts) {
      out.push(`${colored(OUTCOME[a.outcome].hex, OUTCOME[a.outcome].glyph)} ${colored(HEX.dim, a.text)}`)
      for (const t of a.terms) out.push(termLine(t, '   '))
      for (const nested of a.nested) {
        out.push(attemptLine(nested, '   '))
        if (nested.outcome === 'no_match') for (const t of nested.terms.slice(0, 2)) out.push(termLine(t, '      '))
      }
    }
  } else for (const t of terms) out.push(termLine(t, ''))
  if (out.length > max) return [...out.slice(0, max - 1), colored(HEX.faint, `… ${out.length - max + 1} more (npm run htn:run -- … --why <name>)`)]
  return out
}
