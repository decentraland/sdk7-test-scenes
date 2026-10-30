// Check methods: a top-level method that judges the running plan instead of making one (GuardAgentOptions.activePlan,
// upstream docs/USE_CASES.md:32-34). It succeeds to let the running step go on, so a branch that always succeeds
// accepts any step, an invalid one too: "An unconditional fallback would incorrectly accept an invalid plan."
// One rule for the compiler warning (tools/htn/check-methods.ts) and the agent's run-time diagnostic (npc/agent.ts).
// Pure, no SDK.
import type { BranchIR, CondIR, ExprIR, MethodIR, TaskIR } from './ir'

/**
 * A condition that holds whatever the facts: `()` (null), `(and ...)` of such conditions (`(and)` too), an `or` /
 * `alt` with one such child. Anything that reads facts, calls an axiom or a callterm, compares or assigns may fail.
 */
export function alwaysHolds(cond: CondIR | null): boolean {
  if (cond === null) return true
  switch (cond.k) {
    case 'and':
      return cond.items.every(alwaysHolds)
    case 'or':
    case 'alt':
      return cond.items.some(alwaysHolds)
    default:
      return false
  }
}

/** An argument evaluated with no chance to fail: a literal, a variable, a list of such. Arithmetic and callterms may. */
function fixed(e: ExprIR): boolean {
  return e.k === 'lit' || e.k === 'var' || (e.k === 'list' && e.items.every(fixed))
}

/** A task that cannot fail: a primitive with fixed arguments (a primitive is plan output). Compound tasks may fail. */
function cannotFail(t: TaskIR): boolean {
  return t.k === 'prim' && t.args.every(fixed)
}

/** A branch that always succeeds: a condition that always holds and only tasks that cannot fail. */
export function acceptsAnything(branch: BranchIR): boolean {
  return alwaysHolds(branch.cond) && branch.tasks.every(cannotFail)
}

/** The branches of a check method that accept any running step, in source order. */
export function acceptingBranches(method: Pick<MethodIR, 'branches'>): BranchIR[] {
  return method.branches.filter(acceptsAnything)
}

/** Why an accepting branch is wrong in a check method; both diagnostics end with it. */
export const ACCEPTS_ANYTHING =
  'always succeeds (its condition always holds and none of its tasks can fail), so it accepts any running step and the check never fails (give each action its own branch)'
