// Named callterm sets reproducing the C++ bindings of the ported upstream tests
// (urosidoki/htn_planner HTNTest/src). Each callterm receives the case's HostContext as `context`.
//
// Upstream typed bindings (HTN_CALLTERM_BIND) are typed here too (`callterm`, htn/callterms.ts): they check
// the count and types and report what they reject. Upstream raw lambdas that validate by hand and return a
// fallback value (e.g. `return 0;`) keep that fallback. Host counters (`Calls`, `OuterCalls`...) and traces
// mirror the C++ test variables.
import { bool, float, int, list, str } from '../../htn-planner/htn/atom'
import type { Atom } from '../../htn-planner/htn/atom'
import { callterm, listCallterms, type CallTerm } from '../../htn-planner/htn/callterms'
import type { WorldState } from '../../htn-planner/htn/world-state'

export interface HostContext {
  world: WorldState
  /** Host-controlled values the upstream test mutates between runs (`Value`, `Time`, `Alive`...). */
  vars: Record<string, Atom | undefined>
  trace: string[]
  counters: Record<string, number>
  /** Failures of argument checks upstream performs inside callterms (EXPECT_* in lambdas). */
  errors: string[]
}

type Fn = (args: readonly Atom[], ctx: HostContext) => Atom | undefined
type Set = Record<string, CallTerm>

const set = (fns: Record<string, Fn>): Set => {
  const out: Set = {}
  for (const [name, fn] of Object.entries(fns)) out[name] = (args, context) => fn(args, context as HostContext)
  return out
}

const bump = (ctx: HostContext, counter: string) => {
  ctx.counters[counter] = (ctx.counters[counter] ?? 0) + 1
}
/** `name` in vars wins (even when it holds `undefined` = unbound result), else the upstream default. */
const varOr = (ctx: HostContext, name: string, fallback: Atom): Atom | undefined =>
  name in ctx.vars ? ctx.vars[name] : fallback
const expectThat = (ctx: HostContext, ok: boolean, what: string) => {
  if (!ok) ctx.errors.push(what)
}

const isInt = (a: Atom | undefined): a is Extract<Atom, { t: 'int' }> => a?.t === 'int'
const isFloat = (a: Atom | undefined): a is Extract<Atom, { t: 'float' }> => a?.t === 'float'
const isList = (a: Atom | undefined): a is Extract<Atom, { t: 'list' }> => a?.t === 'list'
const intValue = (a: Atom | undefined): number => (isInt(a) ? a.v : NaN) // HTNAtomGetValue<int32>, unchecked

// HTNGeneratedEquivalenceTest.cpp BindTestCallTerms (lines 286-363) + TestWorldStateCallTermDaemon; with
// AIHtnListDaemon::BindCallTerms, the library's listCallterms.
const testCallTerms: Record<string, Fn> = {
  // Member binding with no parameters: adds target_available(<daemon target>) and returns true.
  add_target_available: (args, ctx) => {
    if (args.length !== 0) return undefined
    ctx.world.add('target_available', varOr(ctx, 'target', str('enemy0')) ?? str('enemy0'))
    return bool(true)
  },
  binded_function_with_args: args => bool(args.length === 1 && args[0].t === 'str'),
  get_health: args => int(args.length === 1 && isInt(args[0]) ? 50 : 0),
  get_max_speed: args => float(args.length === 1 && isInt(args[0]) ? 1 : 0),
  lt: args => bool(args.length === 2 && isInt(args[0]) && isInt(args[1]) && args[0].v < args[1].v),
  inc: args => int(args.length === 1 && isInt(args[0]) ? args[0].v + 1 : 0),
  add: args => int(args.length === 2 && isInt(args[0]) && isInt(args[1]) ? args[0].v + args[1].v : 0),
  mul: args => int(args.length === 2 && isInt(args[0]) && isInt(args[1]) ? Math.imul(args[0].v, args[1].v) : 0)
}

// HTNDecompositionTest.cpp BindDeferredTestCallTerms (lines 117-153).
const readCell = (a: Atom | undefined): [number, number] | undefined =>
  isList(a) && a.v.length === 2 && isInt(a.v[0]) && isInt(a.v[1]) ? [a.v[0].v, a.v[1].v] : undefined

export const CALLTERM_SETS: Record<string, Set> = {
  /** No bindings (upstream empty HTNCallTermRegistry). */
  empty: {},

  /** HTNGeneratedEquivalenceTest.cpp:286 BindTestCallTerms. Var `target` (default "enemy0"). */
  test: { ...listCallterms, ...set(testCallTerms) },

  /** BindTestCallTerms with `inc` rebound to count `Increments` (HTNGeneratedEquivalenceTest.cpp:3036). */
  'test-counting-inc': {
    ...listCallterms,
    ...set({
      ...testCallTerms,
      inc: (args, ctx) => {
        bump(ctx, 'Increments')
        return int(intValue(args[0]) + 1)
      }
    })
  },

  /** HTNGeneratedEquivalenceTest.cpp:365 BindTracingNestedCallTerms: trace "inc(1)", "add(2,15)"... */
  'tracing-nested': set({
    inc: (args, ctx) => {
      if (args.length !== 1 || !isInt(args[0])) return int(0)
      ctx.trace.push(`inc(${args[0].v})`)
      return int(args[0].v + 1)
    },
    add: (args, ctx) => {
      if (args.length !== 2 || !isInt(args[0]) || !isInt(args[1])) return int(0)
      ctx.trace.push(`add(${args[0].v},${args[1].v})`)
      return int(args[0].v + args[1].v)
    },
    mul: (args, ctx) => {
      if (args.length !== 2 || !isInt(args[0]) || !isInt(args[1])) return int(0)
      ctx.trace.push(`mul(${args[0].v},${args[1].v})`)
      return int(Math.imul(args[0].v, args[1].v))
    }
  }),

  /** HTNDecompositionTest.cpp:117 BindDeferredTestCallTerms (Wanderer deferred test). */
  'deferred-wanderer': set({
    inc: args => int(args.length === 1 && isInt(args[0]) ? args[0].v + 1 : 0),
    same_location: args => {
      const from = readCell(args[0])
      const to = readCell(args[1])
      return bool(args.length === 2 && !!from && !!to && from[0] === to[0] && from[1] === to[1])
    },
    both_coordinates_even: args => {
      const c = readCell(args[0])
      return bool(args.length === 1 && !!c && c[0] % 2 === 0 && c[1] % 2 === 0)
    },
    both_coordinates_odd: args => {
      const c = readCell(args[0])
      return bool(args.length === 1 && !!c && c[0] % 2 !== 0 && c[1] % 2 !== 0)
    }
  }),

  /**
   * HTNRuntimeListTest.cpp:63 SetUp. Counters Calls/AfterCalls/OuterCalls; ppr_start pushes its argument
   * (upstream `Seen`) to the trace. Vars: `time` (default 10), `ppr_result` (default #true).
   */
  'runtime-lists': set({
    ppr_start: (args, ctx) => {
      bump(ctx, 'OuterCalls')
      ctx.trace.push(args[0] ? formatForTrace(args[0]) : '<none>')
      return varOr(ctx, 'ppr_result', bool(true))
    },
    get_entity_position: (args, ctx) => {
      bump(ctx, 'Calls')
      return list(int(intValue(args[0])), int(0), int(3))
    },
    get_time: (_args, ctx) => {
      bump(ctx, 'Calls')
      return varOr(ctx, 'time', int(10))
    },
    count_after: (_args, ctx) => {
      bump(ctx, 'AfterCalls')
      return int(1)
    },
    failing_runtime_list: (_args, ctx) => {
      bump(ctx, 'Calls')
      return undefined
    },
    identity: args => args[0],
    add_fact: (args, ctx) => {
      ctx.world.add('added', args[0])
      return args[0]
    }
  }),

  /** HTNBooleanCallTermTest.cpp:89 SetUp. Var `value` (default #true; null = unbound result). Counter Calls. */
  'boolean-callterms': set({
    ppr_finalize_best: (_args, ctx) => {
      bump(ctx, 'Calls')
      return varOr(ctx, 'value', bool(true))
    },
    expected_value: (_args, ctx) => varOr(ctx, 'value', bool(true)),
    accept_value: () => bool(true)
  }),

  /** HTNBooleanCompatibilityTest.cpp:142 SetUp. Var `alive` (default #false). Counter Calls. */
  'boolean-compat': {
    // HTN_CALLTERM_BIND(Flags::Accept(bool, bool)): typed bool parameters accept BOOL or INT 0/1.
    accept_flags: callterm(['bool', 'bool'], (enabled, disabled) => enabled && !disabled, 'bool'),
    ...set({
      is_entity_alive: (_args, ctx) => {
        bump(ctx, 'Calls')
        return varOr(ctx, 'alive', bool(false))
      },
      alive_for_candidate: (args, ctx) => {
        bump(ctx, 'Calls')
        return bool(intValue(args[0]) === 1)
      }
    })
  },

  /** HTNNestedCallExpressionTest.cpp:142 ValuesParticipateInBothOperandsAndEveryOperator. Counter Calls. */
  'nested-operator-calls': set({
    distance: (_args, ctx) => {
      bump(ctx, 'Calls')
      return float(0.1)
    },
    missing_distance_callterm: (args, ctx) => {
      bump(ctx, 'Calls')
      expectThat(ctx, args.length === 2, 'missing_distance_callterm: 2 arguments')
      const a = args[0]
      const b = args[1]
      expectThat(ctx, isList(a) && a.v.length === 3, 'missing_distance_callterm: arg0 is a 3-list')
      expectThat(ctx, isList(a) && isFloat(a.v[0]) && a.v[0].v === 1, 'missing_distance_callterm: arg0[0] == 1.0f')
      expectThat(ctx, isList(b) && isFloat(b.v[0]) && b.v[0].v === 2, 'missing_distance_callterm: arg1[0] == 2.0f')
      return float(0.1)
    },
    identity: (args, ctx) => {
      bump(ctx, 'Calls')
      return args[0]
    }
  }),

  /** HTNNestedCallExpressionTest.cpp:177 MissingPolicies...: only `identity`, counting OuterCalls. */
  'nested-operator-missing': set({
    identity: (args, ctx) => {
      bump(ctx, 'OuterCalls')
      return args[0]
    }
  }),

  /** HTNNestedCallExpressionTest.cpp:255 ContinueMove... Var `distance`. Counters PositionCalls/DistanceCalls. */
  'nested-operator-continue-move': set({
    get_entity_position: (args, ctx) => {
      bump(ctx, 'PositionCalls')
      expectThat(ctx, args.length === 1 && intValue(args[0]) === 42, 'get_entity_position(42)')
      return int(20)
    },
    get_distance_from_to: (args, ctx) => {
      bump(ctx, 'DistanceCalls')
      expectThat(ctx, args.length === 2 && intValue(args[0]) === 10 && intValue(args[1]) === 20,
        'get_distance_from_to(10, 20)')
      return varOr(ctx, 'distance', float(0.1))
    }
  }),

  /** HTNNestedCallExpressionTest.cpp:331 DebuggerKeepsRetries...: identity/distance counting Calls. */
  'nested-operator-debugger': set({
    identity: (args, ctx) => {
      bump(ctx, 'Calls')
      return args[0]
    },
    distance: (_args, ctx) => {
      bump(ctx, 'Calls')
      return float(0.1)
    }
  }),

  /** HTNMissingCallTermTest.cpp:131: `probe` unregistered, `identity` echoes. */
  'missing-callterms': set({
    identity: args => args[0]
  }),

  /**
   * HTNMissingCallTermTest.cpp:518-520: probe is HTN_CALLTERM_BIND(ErrorFunctions::Integer(int32)), so a call
   * with no argument reports argument_count_mismatch before invoking; invocations count Calls; identity counts
   * OuterCalls.
   */
  'missing-callterms-typed-probe': {
    probe: callterm(['int'], (_value, call) => (bump(call.context as HostContext, 'Calls'), 1), 'int'),
    ...set({
      identity: (_args, ctx) => {
        bump(ctx, 'OuterCalls')
        return int(1)
      }
    })
  },

  /** HTNNegativeLiteralTest.cpp:213 SetUp. */
  'negative-literals': set({
    negative_identity: args => args[0],
    negative_predicate: args =>
      bool(isInt(args[0]) && args[0].v === -1 && isFloat(args[1]) && args[1].v === Math.fround(-0.5))
  }),

  /** HTNSharedImplementationTest.cpp:125 SetUp: echo counts Calls. */
  'shared-impl': set({
    echo: (args, ctx) => {
      bump(ctx, 'Calls')
      return args[0]
    }
  }),

  /** HTNGeneratedEquivalenceTest.cpp:1823 assignment_probe: Calls++, returns arg + 1. */
  'assignment-probe': set({
    assignment_probe: (args, ctx) => {
      bump(ctx, 'Calls')
      return int(intValue(args[0]) + 1)
    }
  }),

  /** HTNGeneratedEquivalenceTest.cpp:2835: get_entity_position(1) -> 7, counting Calls. */
  'axiom-assignments': set({
    get_entity_position: (args, ctx) => {
      bump(ctx, 'Calls')
      expectThat(ctx, intValue(args[0]) === 1, 'get_entity_position(1)')
      return int(7)
    }
  }),

  /** HTNGeneratedEquivalenceTest.cpp:2986: axiom_trace(x) traces x; axiom_value traces 42, returns 42. */
  'nested-axiom-effects': set({
    axiom_trace: (args, ctx) => {
      ctx.trace.push(String(intValue(args[0])))
      return bool(true)
    },
    axiom_value: (_args, ctx) => {
      ctx.trace.push('42')
      return int(42)
    }
  }),

  /** recursion_dispatch `visit`: counts Visits, returns true (HTNGeneratedEquivalenceTest.cpp:3145). */
  'recursion-visit': set({
    visit: (_args, ctx) => {
      bump(ctx, 'Visits')
      return bool(true)
    }
  }),

  /** SDK/Examples/CoreConsumer/main.cpp: condition_value (var `value`, default INT 42), ConditionCalls. */
  'core-consumer': set({
    condition_value: (_args, ctx) => {
      bump(ctx, 'ConditionCalls')
      return varOr(ctx, 'value', int(42))
    }
  }),

  /** cmake/LinuxSmoke/main.cpp:22: `identity` echoes its argument. */
  'linux-smoke': set({
    identity: args => args[0]
  }),

  /** SDK/Examples/BridgeConsumer/main.cpp:52 RunCoverage bindings. */
  bridge: set({
    probe: (_args, ctx) => {
      bump(ctx, 'Calls')
      return bool(true)
    },
    identity: () => int(2),
    boolean_value: args => bool(intValue(args[0]) !== 0),
    empty_list: () => list()
  })
}

// Same text as formatAtom; kept local so the trace format does not depend on runtime code.
function formatForTrace(a: Atom): string {
  switch (a.t) {
    case 'int':
      return String(a.v)
    case 'float':
      return a.v.toFixed(1)
    case 'bool':
      return a.v ? '1' : '0'
    case 'sym':
      return a.v
    case 'str':
      return `"${a.v}"`
    case 'list':
      return `(${a.v.map(formatForTrace).join(' ')})`
  }
}
