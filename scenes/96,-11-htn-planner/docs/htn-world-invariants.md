# World invariants in tests

A plan can be correct for impossible facts. Define the host's consistency rules separately from behaviour,
then reject invalid worlds before interpreting the plan. These checks are opt-in Node tooling, not added to
`decompose`, `PlanRunner`, production NPCs or the live viewer.

## Define and run checks

Beside `kitchen.domain`, add `kitchen.invariants.domain`. Each zero-argument top-level method is one named
invariant: a successful empty plan means valid; `no_plan` means a violation. Use facts, comparisons and axioms.
All method task lists must be empty, and host callterms are forbidden. At least one check is required.
An unconditional success branch would disable that check: review the rules and give each a violating fixture.

```lisp
(:domain KitchenChecks top_level_domain
    (:method (one_location_per_item) top_level_method
        (valid
            (and
                (not (and
                    (location ?item ?a)
                    (location ?item ?b)
                    (!= ?a ?b)
                ))
            )
            ()
        )
    )
)
```

This rule assumes item **identities**. Do not apply it to food types: two cooks may both hold an onion.
Missing facts are allowed by this particular rule; add a separate presence/arity/state rule when the host
requires one. Decide whether fixtures represent the complete world or a partial observation first.

From `scenes/96,-11-htn-planner`:

```sh
npm run -s htn:run -- kitchen.domain act --world case.worldstate --json
# Automatically uses kitchen.invariants.domain if present.
npm run -s htn:run -- kitchen.domain act --world case.worldstate --invariants checks.domain --json
```

An explicit `--invariants` file overrides discovery and must exist. Exit **3**, `invalid_world`, names all
violated checks; no plan or session is produced. Exit **2**, `invariant_error`, means the checks could not be
used (compile/configuration/arity/evaluation error); it never counts as a valid world. Valid checks add
`worldValidation: {status: "passed", file: ...}` to a normal run report. Without a sidecar, behaviour stays unchanged.
Checks always use full backtracking, independent of the behaviour run's `--mode`.

## Fixtures and host stories

The canonical catalogue discovers sidecars, compiles them once, and rejects contradictory `.worldstate` fixtures
as catalogue problems. `npm test` fails on those problems. The canonical test helper checks modified scenario
worlds too. `htn:run --world <station>/<case>` uses that station's checks.

`htn:run --story <station>/<story>` / `playStory` use each participating station's sidecar. Checks run after
sensing, before executing a step, after its completed effects/sensors and dropped-plan callback, and at story end.
They are not called between individual writes in one callback: an atomic handoff can temporarily contain two
owners while the old owner is removed. Invalid state throws with the story/agent context.
A story uses station sidecars; `--invariants` overrides are deliberately rejected for this multi-domain route.

For a custom Node harness, compile once with `loadWorldInvariants(domainFile)` from
`tools/htn/world-invariants.ts`, then call `checks?.assert(world, context)` at the same stable boundaries.
Direct `new Stage(...)` users can provide `StageEnv.validate`; direct planner calls are not intercepted.

Working example: `src/examples/canon/soup_kitchen/soup_kitchen.invariants.domain` enforces one content value per
holder. Existing kitchen scenarios and host stories exercise it. Regression tests in
`test/tools/world-invariants.test.ts` cover location, ownership, stage conflicts, atomic handoffs, invalid validators,
CLI discovery/override and catalogue rejection. They distinguish item identity from item type.

## Limits and cost

Only declared rules are checked. This does not prove that the strategy, independent expected plan, physical
simulation or all possible host states are correct. It does not repair facts or add ownership to a domain that
has no such concept. Keep semantic reviews and shared-host stories.

Checks allocate and run extra decompositions; join-heavy rules may be expensive. Compilation is outside the
check loop. CLI checks run during each world setup; the runner's planner-only timing excludes this setup cost.
Measure total validation plus planning separately if considering a live integration. No production planner code
or benchmark baseline changes are needed for this test-only feature.

Validation on this revision: 2285/2285 tests, including 13 world-invariant regressions; scene, tools and viewer
TypeScript checks. The lint baseline adds one zero-finding validator (83 domains;
existing fixture findings unchanged). No production planner code was changed.
