// Scripted stand-in for PlanRunner so agent/executor logic can be tested without the real planner.
import type { Atom } from '../../src/htn-planner/htn/atom'
import type { DecompositionStatus, PlanStep, Resolution } from '../../src/htn-planner/htn/planner'
import type { WorldState } from '../../src/htn-planner/htn/world-state'
import type { PlannerFactory, PlanRunnerLike } from '../../src/htn-planner/npc/agent'

export type Script = (call: number, world: WorldState) => PlanStep[] | null
export type DeferredExpander = (step: Extract<PlanStep, { kind: 'deferred' }>, world: WorldState) => PlanStep[] | null

export const prim = (name: string, ...args: Atom[]): PlanStep => ({ kind: 'primitive', name, args })
export const defer = (name: string, ...args: Atom[]): PlanStep => ({ kind: 'deferred', method: -1, name, args })

/** Plan calls counted over every runner of one factory, so a script sees one sequence of calls. */
interface CallCounter {
  calls: number
}

export class ScriptedRunner implements PlanRunnerLike {
  clears = 0
  private queue: PlanStep[] = []

  constructor(
    readonly world: WorldState,
    private readonly script: Script,
    private readonly expand?: DeferredExpander,
    /** The facts the scripted domain reads; none given: it reads everything. */
    readonly domain?: PlanRunnerLike['domain'],
    private readonly counter: CallCounter = { calls: 0 }
  ) {}

  /** Plan calls of all runners of the factory (the agent plans a candidate in a second one). */
  get calls(): number {
    return this.counter.calls
  }

  plan(_method?: string, _args?: readonly Atom[]): DecompositionStatus {
    const steps = this.script(this.counter.calls++, this.world)
    this.queue = steps ? steps.slice() : []
    return steps ? 'succeeded' : 'no_plan'
  }

  resolve(): Resolution {
    for (;;) {
      const head = this.queue[0]
      if (!head) return 'completed'
      if (head.kind === 'primitive') return 'ready'
      const expanded = this.expand ? this.expand(head, this.world) : null
      if (!expanded) return 'failed'
      this.queue.splice(0, 1, ...expanded)
    }
  }

  current(): Extract<PlanStep, { kind: 'primitive' }> | null {
    const head = this.queue[0]
    return head && head.kind === 'primitive' ? head : null
  }

  complete(): void {
    this.queue.shift()
  }

  clear(): void {
    this.clears++
    this.queue = []
  }

  get steps(): readonly PlanStep[] {
    return this.queue
  }
}

/** Factory that also exposes the created runners; `runner()` is the first one, `calls` counts all of them. */
export function scripted(
  script: Script,
  expand?: DeferredExpander,
  domain?: PlanRunnerLike['domain']
): { factory: PlannerFactory; runner: () => ScriptedRunner; runners: () => readonly ScriptedRunner[] } {
  const created: ScriptedRunner[] = []
  const counter: CallCounter = { calls: 0 }
  return {
    factory: world => {
      const r = new ScriptedRunner(world, script, expand, domain, counter)
      created.push(r)
      return r
    },
    runner: () => {
      if (created.length === 0) throw new Error('runner not created yet')
      return created[0]
    },
    runners: () => created
  }
}
