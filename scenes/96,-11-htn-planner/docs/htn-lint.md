# `htn:lint`: domain-shape lint for HTN domains

A linter for `.domain` files, with JSON for agents and compact text for people. Each finding includes
its location, a self-contained explanation and a suggested fix. Layers run cheapest first:

1. **compile**: the compiler's own diagnostics (`htn:compile --check`: parse, includes, undefined / duplicate /
   wrong-arity symbols, variables). Not repeated by lint.
2. **symbols**: what the compiler does not check: primitives the host has no executor for, unreachable methods,
   unused axioms and constants, a fact read with two arities.
3. **structure**: domain-shape heuristics documented below.

A layer with an error stops the layers after it for that domain (fix the cheap errors first; a broken domain has no
shape worth judging). Code: `scenes/96,-11-htn-planner/tools/lint` (no planner code; it reads the compiler's AST).
Tests: `test/tools/htn-lint.test.ts`.

## Run it

From the scene folder (`scenes/96,-11-htn-planner`), `npm run -s` for no npm banner:

```bash
npm run -s htn:lint -- test/fixtures/reference/stalker_flat.domain  # text (the frozen known-bad stalker)
npm run -s htn:lint -- src/examples --json                         # a folder: every top_level_domain under it
npm run -s htn:lint -- my.domain --rule duplicated-tail --rule max-branches
npm run -s htn:lint -- my.domain --config my-lint.json --strict    # warnings fail too
npm run -s htn:lint -- --list-rules
npm run htn:lint -- --update-baseline                              # after a deliberate change (see Baseline)
```

Exit code: **0** clean or warnings / infos only, **1** errors (or warnings with `--strict`), **2** usage error,
unreadable path or bad config. A folder lints every file that declares `top_level_domain`; include files are linted
through the roots that include them (listed under `skipped`). A finding inside an include shared by several roots is
reported once.

Options: `--json`, `--rule <id>` (repeatable or comma-separated; compile errors are always reported, they stop the
other layers), `--config <file>`, `--no-config`, `--strict`, `-v` / `--verbose` (text: each finding's why and
related places), `--no-metrics` (text), `--list-rules`, `--update-baseline`.

Speed: every shipped domain (53 roots with includes) lints in about 130–145 ms in process, the comparison across
domains included (a few ms: one pass over the declarations); the npm script adds about 1 s for the esbuild bundle.

One run is also the scope of `duplicated-across-domains`: lint the folder (`src`, as CI does) to compare its roots;
a single file has nothing to compare with.

### For an AI agent

1. After every edit of a domain, run `npm run -s htn:lint -- <file> --json`.
2. Read `summary.errors` first, then `findings` in order (compile, symbols, structure).
3. Feed each finding back as it is: `message` (what), `why` (the rule and its evidence), `fix` (what to change),
   `file:line:col`, `method` / `branch`, `related` (the other places involved: the other copies of a tail, the
   branch that shadows this one).
4. Fix errors, rerun; then warnings. Infos are design notes: act on them when you restructure.
5. If the same failure keeps returning, diagnose the cause before restructuring. Compare expected decisions
   and execution over time; see [domain design](htn-guidance.md#domain-design).
6. A suppression needs a reason after `--` (below). Fix real defects; justify a deliberate shape exception
   rather than restructuring correct behaviour merely to silence a heuristic.

## Text output

```
test/fixtures/reference/guard_flat.domain:80:9: warning bookkeeping-branch GuardFlat::behave/0.forget_stale_memory: top-level branch 'forget_stale_memory' only does bookkeeping (!forget) and competes with behaviours for priority
  fix: move this upkeep to the host (facts with a lifetime, a sensor tick) or a separate `reasoning` top-level method; ...
GuardFlat (test/fixtures/reference/guard_flat.domain): methods 3 (top 1), branches 12 (top 8; per method avg 4, max 8), depth 2, 1-step 6 (50%; top 3), primitive-only top 6 (75%), bookkeeping 6/21 prims (29%; top branches 2), duplicated tails 0
htn:lint: 1 domain(s), 0 error(s), 3 warning(s), 2 info(s), 9 ms
```

## JSON (`--json`): the contract

One object, `version: 1`. A field is added without a version change; a field renamed, removed or changed in meaning
bumps `version`.

| Field | Content |
|---|---|
| `version`, `tool` | `1`, `"htn-lint"` |
| `config` | the config file used (display path), or `null` |
| `rules` | the `--rule` filter, or `null` |
| `files[]` | per root domain: `file`, `domain`, `includes[]`, `layers[]` (the layers that ran), `stoppedAt` (`"compile"`, `"symbols"` or `null`), `metrics` (below; `null` if it did not compile), `counts` (`errors`, `warnings`, `infos`, `suppressed`: this root's, its includes included, and the `duplicated-across-domains` findings reported in it) |
| `skipped[]` | `file`, `reason`: files in a folder that are not roots |
| `findings[]` | `rule`, `layer` (`compile`, `symbols`, `structure`, `meta`), `severity` (`error`, `warning`, `info`), `file`, `line`, `col`, `endLine`, `endCol` (1-based, end exclusive), `domain`, `method` (`name/arity`), `branch` (when it applies), `message`, `why`, `fix`, `related[]` (same place fields), `data` (rule-specific details: the tail, the shadowing branch, suggestions...). A `related` place can be in another root's file (`duplicated-across-domains`) |
| `summary` | `files`, `errors`, `warnings`, `infos`, `suppressed` (each finding once), `ms` |

Compile diagnostics have `rule: "compile/<code>"` (the compiler's stable code, e.g. `compile/unknown-method`).

### Metrics (per root domain, includes merged)

The definitions implemented by `tools/lint/metrics.ts`: `methods` / `topMethods` (declarations, overloads apart), `branches`,
`branchesPerMethod` (`avg`, `max`), `topBranches`, `depth` (method levels on the longest direct call chain from a
top-level method, recursion cut, deferred calls not counted), `oneStepBranches` / `oneStepShare` /
`oneStepTopBranches`, `primitiveOnlyTopBranches` / `primitiveOnlyTopShare` (an empty task list is not
primitive-only), `bookkeepingTopBranches` (top-level branches made only of bookkeeping primitives),
`primitiveOccurrences`, `bookkeepingOccurrences` / `bookkeepingShare`, `duplicatedTails` / `longestDuplicatedTail`
(maximal groups of 3 or more identical task heads ending two or more branches), `axioms`, `constants`, `includes`.

Checked against the frozen fixture baselines in the tests: guard, stalker and AAACombatNPC agree on every count, the bookkeeping shares
included (guard 6 of 21, 29%; stalker 26 of 68, 38%; AAACombatNPC 1 of 117: guard and stalker declare their
bookkeeping primitives in `htn-lint.json`, AAACombatNPC goes by the name fallback, which no longer takes its
`!set_cautious_stance` or `!clear_*` actions). The historical guard and stalker baselines are the frozen flat fixtures
since the 2026-10-18 restructure (`test/fixtures/reference/guard_flat.domain`, `stalker_flat.domain`). The stalker
had 5 branches in `after_waypoint` by then (the patrol branches added after the initial measurement); its totals still match (28 branches,
12 one-step). yard_guard matched 05 too (2 of 16, 13%) until its restructure.

## Rules

Severity is the default; every rule can be set to `off`, `info`, `warning` or `error`, with options, in the config,
except `max-branches`, which is a warning at most (below).
The explanations below are self-contained; shape heuristics need domain and host context.

| Rule | Layer | Default | Options | Fires on |
|---|---|---|---|---|
| `unknown-primitive` | symbols | error | (needs `primitives`) | a primitive the host does not register |
| `unreachable-method` | symbols | warning | | a method no top-level method reaches |
| `unused-axiom` | symbols | warning | | an axiom no reachable condition uses |
| `unused-constant` | symbols | warning | | a constant nothing reads |
| `fact-arity-mix` | symbols | warning | `variadic: ["running"]` | a fact read with two argument counts |
| `max-branches` | structure | warning (at most) | `top: 8`, `other: 10` | too many branches in one method |
| `flat-root` | structure | warning | `minBranches: 6`, `maxPrimitiveOnlyShare: 0.5` | a large root of primitive-only branches |
| `bookkeeping-branch` | structure | warning | (`bookkeeping` declared, else by name) | a top-level branch of bookkeeping primitives only |
| `duplicated-tail` | structure | warning | `minLength: 3` | the same steps ending several branches |
| `duplicated-across-domains` | structure | warning | `minLength: 3`, `minSize: 4` | a method or closing steps copied into another root domain |
| `unconditional-not-last` | structure | warning | | an always-true branch before others |
| `shadowed-branch` | structure | warning | | a branch an earlier, more general one always beats |
| `recursion-no-base` | structure | error | | a recursion with no branch that ends it |
| `recursion-not-tail` | structure | warning | | a recursive call with steps after it |
| `order-dependent` | structure | info | | a general branch correct only because specific ones come first |
| `no-fallback` | structure | info | (`checkMethods` exempt) | a top-level method with no always-true last branch |
| `shared-condition` | structure | info | `minCount: 4`, `minShare: 0.4` | the same fact test (arguments and polarity included) in many sibling branches |
| `missing-contract` | structure | off | | a non-top-level method without an adjacent nonempty `// Contract:` comment |
| `bad-suppression` | meta | warning | | a suppression comment naming an unknown rule |

### `missing-contract`

Enable as `"rules": { "missing-contract": "error" }` in an authored domain's file override. Off by default so
existing and verbatim upstream corpora are not retroactively required to adopt our comment convention. Each
non-top-level method, including those in includes, needs its own adjacent `// Contract:` comment describing
entry conditions and outcome. A root's contract belongs in its strategy header. Lint checks presence only;
review the meaning and test applicable re-entry states. Enabling a root checks its included methods too.

### `unknown-primitive`

- **Why.** A primitive needs a matching host executor. Otherwise the host may reject it or run a diagnostic no-op; the domain does not establish the intended action.
- **When.** Only with a `primitives` list for the file (names with `!`, globs allowed). The scene's
  `htn-lint.json` lists the guard's and the stalker's executors; a test checks the lists against `GUARD_ACTIONS`
  and `stalkerActions`.
- **Example.** `(!mvoe_to ?p walk)` → `did you mean '!move_to'?` (`data.suggestions`).
- **Fix.** Use a registered primitive, or register an executor and add it to the list.

### `unreachable-method`

- **Why.** A method no top-level method reaches never plans; check for a typo in a call or a leftover definition.
- **Scope.** Methods declared in the root file, not `top_level_method`, not `base`. Include files are libraries
  that other roots may use, so they are not checked.
- **Fix.** Call it (name and arity must match), mark it `top_level_method` if the host plans it, or delete it.

### `unused-axiom`, `unused-constant`

- **Why.** An axiom no reachable condition uses is dead code that readers may mistake for live vocabulary.
- **Fix.** Use it or delete it.

### `fact-arity-mix`

- **Why.** Facts are keyed by name and argument count: reading one with the wrong arity can silently match no rows. Compare the domain with its fact writers.
- **Example.** `(seen ?t ?p)` in two branches, `(seen ?t)` in a third → the third is flagged.
- **Options.** `variadic`: facts with one arity per kind by design. Default `["running"]`: the agent publishes the
  running step as `(running <action> <args>...)` (`storekeeper.active_plan`).

### `max-branches`

- **Why.** A long branch list can hide priority mistakes. Group related behaviours when it improves readability; the configurable threshold is a review prompt, not a correctness limit.
- **Defaults.** More than 8 branches in a top-level method, more than 10 in a sub-method (upstream's category
  methods have 3–9; no source states a number, these are inferred from the shipped domains).
- **A warning at most, never an error.** A long branch list is a smell, not a bug: the domain plans correctly, and
  the thresholds are inferred, not taken from any source. A config may set it to `warning`, `info` or `off`, and
  change `top` / `other`; `"error"` (top level or in an override) is a config error (exit 2) naming this reason.
  A gate that must fail on it uses `--strict`, which fails on every warning.
- **Fix.** Group branches by intent into tier methods (react, investigate, search, patrol, idle); the root keeps one
  branch per tier, in priority order.

### `flat-root`

- **Why.** Named compound behaviours can make a large root easier to read. Delegation, continuation and a complete one-action decision remain valid; an upkeep unit is deliberately flat.
- **Defaults.** A top-level method with 6 or more branches, more than half of them primitive-only. Small teaching
  domains (`lamp`, `greeter`) are exempt by size.
- **Upkeep units are exempt.** A top-level method named in the option `upkeepMethods` (default `["reasoning"]`) is a
  belief-upkeep unit the host plans before each decision: one-step rules side by side is its shape.
- **Fix.** Root branches call one compound task each; the primitive sequences move into its branches.

### `bookkeeping-branch`

- **Why.** Belief upkeep can compete with behaviours when placed in the decision root. Use the host or a wired reasoning pass and ensure each pass makes progress.
- **What.** A top-level branch whose tasks are all bookkeeping primitives. A write inside a behaviour branch with
  other steps is fine.
- **Which primitives are bookkeeping: the host declares them.** Only the host knows whether `!set_waypoint` is
  memory upkeep or an action, so the config says: `"bookkeeping": ["!forget", "!forget_noise", "!set_waypoint"]`
  (names, globs allowed), at the top level or per override; the lists of every matching layer are merged. A file
  whose config declares both `primitives` and `bookkeeping` has classified every one of its primitives: the others
  are actions. Anything else falls back to the name heuristic.
- **The fallback (by name, narrow on purpose).** `!forget*`, `!remember*`, `!unfocus`, `!refocus`. The original inventory also
  classified `!set_*`, `!clear_*` and `!watch` by name; they are out because they are actions elsewhere: upstream
  AAACombatNPC's `!set_cautious_stance`, `!clear_cover` and `!clear_weapon_jam` (with them its share was 6 of 117,
  the primitive count includes 1), and `!watch` is a verb of looking (AAACombatNPC has `!watch_post`; the stalker's `!watch` is a
  perception switch, so the stalker declares it). SHOP-style `!!name` internal operators would be the natural
  marker, but our compiler rejects the name (`compile/expected-identifier`), so declare instead.
- **Fix.** Move the upkeep to the host (facts with a lifetime, a sensor tick) or a separate `reasoning` top-level
  method; if a behaviour needs the write, make it a step of that behaviour and put the test in its own condition.
- **Upkeep units are exempt.** Branches of a top-level method named in `upkeepMethods` (default `["reasoning"]`) are
  where this upkeep belongs. Set the option if the host names its unit
  otherwise, e.g. `"rules": { "bookkeeping-branch": { "upkeepMethods": ["beliefs"] } }`.

### `duplicated-tail`

- **Why.** Copied step sequences can drift when one copy changes. A parameterised compound task may express the shared tail once.
- **What.** Maximal groups: the same 3 or more task heads (names only) at the end of two or
  more branches of one root domain, any methods; a group is kept when no longer tail is shared by the same
  branches. One finding per group, at its first branch, the others in `related`.
- **Fix.** Extract the steps into a compound task with the values they use as parameters, and call it at the end of
  each branch.

### `duplicated-across-domains`

- **Why.** Copied behaviour can drift across domains. Share it through an include when the domains should evolve together; independent teaching fixtures may intentionally differ.
- **Scope.** Every root domain of one run whose structure layer ran (no error stopped it) and for which the rule is
  not `off`. A declaration is identified by its file and position, so what two roots get from one shared `:include`
  is one declaration, never a duplicate.
- **What, (a) identical methods.** Two methods in different root domains with the same structure: arity, parameter
  kinds (`?inp_` / `?out_` / `?io_`), and per branch its condition and tasks, with variable names abstracted
  (parameters by position, branch variables by first use, `?any_` alike), constants abstracted (`@name`, numbers,
  text, literal lists), symbols kept (`walk` is not `run`); method and branch names ignored, so a renamed copy is
  found. Only methods of at least `minSize` (4) condition literals plus tasks: a one-step `idle` is not worth an
  include.
- **What, (b) shared closing steps.** The same `minLength` (3) or more closing steps in branches that no single root
  has all of: the steps compare by name and argument kind (any variable alike, constants abstracted, symbols kept),
  so `(!wait @catch_pause)` and `(!wait 1.5)` match. Maximal groups, as `duplicated-tail`; the branches of a method
  already reported as identical are not reported again.
- **Where.** One finding per group, at its first place in run order (the others in `related`; `data.kind` is
  `method` or `tail`, `data.domains`, `data.places`, `data.tail`), with the severity and suppressions of the root
  it is reported in, counted in that root's `counts`. Options are read from the config's top level; overrides set
  the severity or turn a root `off`, which takes it out of the comparison.
- **Example.** Before 2026-10-18, guard ↔ yard_guard: `advance_patrol` (identical), `!chase !catch !wait`,
  `!move_to !look_around !forget`, `!move_to !wait &advance_patrol`. Fixed as below: both include
  `src/examples/guard/guard_kit.domain` (`catch_target`, `check_last_seen`, `walk_patrol`, `advance_patrol`, the
  pauses as parameters); a test shows the rule firing again on the frozen flat guard when its exclusion is lifted.
- **Fix.** Move the method (or the steps, as a compound task with the values they use as parameters) into one shared
  file and `(:include ...)` it from each root; where one root needs other values, pass them as parameters, or make
  the shared method `base` and that root's version `overrides`.

### `unconditional-not-last`

- **Why.** First match wins: a branch after an always-true branch is reached only if the earlier tasks fail with branch backtracking enabled.
- **Fix.** Move it last as the fallback, or give it a condition. A deliberate fall-through:
  `// htn-lint-disable-next-line unconditional-not-last -- <why>`.

### `shadowed-branch`

- **Why.** An earlier branch covers this condition. This branch is reached only if the earlier tasks fail with branch backtracking enabled; check that the ordering is intentional.
- **How.** Theta-subsumption over the top-level `and` literals: some renaming of the earlier branch's variables makes
  each of its literals one of this branch's. Method parameters are fixed, `?any_` are fresh, a variable used only
  inside a `not` may only stand for one that is also only inside a `not`, and a condition with a `(call ...)` is
  never compared (a callterm can answer differently the second time). A fully anonymised comparison renames every variable to `?`, which
  flagged one false pair in the stalker (`continue_investigation` / `retarget_investigation`); this does not.
- **Fix.** Move this branch above the general one (most specific first), or add the test that tells it apart.

### `recursion-no-base`

- **Why.** Recursion needs a reachable base branch and progress; otherwise it can only fail or hit the depth limit.
- **Fix.** Add a base branch first (goal reached, list empty); every recursive step changes what it tests.

### `recursion-not-tail`

- **Why.** Steps after a recursive call wait for it and retain call frames. Tail recursion or deferred runtime iteration may reduce that cost.
- **Fix.** Do the per-item steps before the call and the after-the-loop steps in the base branch.

### `order-dependent` (info)

- **Why.** Branch order can express intentional priority. If overlap admits an invalid lower-priority behaviour, encode its eligibility in facts or conditions; otherwise preserve the order.
- **What.** Specific-first pairs (with the subsumption above), one finding per general branch listing
  the specific ones (`data.dependsOn`). The method's last branch is exempt (a fallback is general by design).
- **Fix.** If the branch must not run in their situations, put the reason in its own condition.

### `no-fallback` (info)

- **Why.** An ongoing reactive root usually needs a fallback that lets time pass. Validators and completed goals may deliberately return no plan or an empty plan under their host contract.
- **Fix.** End with an `idle` branch that takes time (not an instant success in a replan loop).

### `shared-condition` (info)

- **Why.** A repeated condition can indicate related behaviours. Factor it into a parent task or axiom when that improves clarity; value-based dispatch may be intentional.
- **Defaults.** The same fact test in at least 4 branches and at least 40% of the method's branches.
  Literal/constant arguments, repeated-variable constraints and positive/negative polarity are part of the test;
  branch-local variable names are normalised, method parameters keep their identities. Distinct `(stage ?me prep)`
  and `(stage ?me cook)` tests are dispatch, not a shared precondition. This remains a syntactic heuristic.
- **Fix.** Group those branches under one compound task whose root branch tests the fact once, or name the test as
  an axiom.

## Suppressions

In `.domain` comments; rule ids space- or comma-separated (none = every rule); the reason after `--`:

```lisp
// htn-lint-disable-next-line unconditional-not-last -- backtracking demo: the next branch runs when this one fails
(try_first () ((risky_step)))

// htn-lint-disable max-branches flat-root -- kept flat for the comparison in level 7
(:method (behave) top_level_method
    ...
)
// htn-lint-enable max-branches flat-root
```

`disable-next-line` covers the next line that is not blank or a comment (a branch's `(name`, a method's
`(:method`: where findings point). `disable` covers until the matching `enable` or the end of the file. Compile
diagnostics cannot be suppressed. A suppressed finding is counted (`counts.suppressed`), not listed.

## Config

JSON. Default: `htn-lint.json` in the scene folder if present; `--config <file>`; `--no-config` for the defaults.

```json
{
  "rules": { "max-branches": { "top": 6 }, "order-dependent": "off", "no-fallback": "warning" },
  "bookkeeping": ["!forget", "!set_waypoint", "!note_*"],
  "checkMethods": ["active_plan"],
  "primitives": ["!move_to", "!wait", "!look_*"],
  "overrides": [
    { "files": ["src/npc/**"], "primitives": ["!move_to", "!wait"] }
  ]
}
```

A rule setting is a severity (`off`, `info`, `warning`, `error`) or an object with `severity` and options.
`checkMethods` and `primitives` replace the inherited list; `bookkeeping` lists are merged (top level and every
matching override: a host adds its own to the shared ones). `overrides[].files` are globs (`*`, `**`,
`?`) relative to the config file's folder; every matching override applies, in order. `checkMethods` are passed to
the compiler too (its `check-method-*` warnings) and exempt from `no-fallback`. An unknown key, rule or severity is a
config error (exit 2).

### The scene's `htn-lint.json`, and why

- **guard and yard_guard (one host, the guard kit), stalker, and the frozen flat guard and stalker**
  (`test/fixtures/reference/guard_flat.domain`, `stalker_flat.domain`, the same hosts): their host primitive lists
  (enables `unknown-primitive`; kept equal to the executor registries by a test) and their bookkeeping primitives:
  guard kit `!forget`, `!forget_noise`, `!set_waypoint`; stalker those plus `!watch`, `!unfocus`, `!refocus` (the baseline's
  classification, so the shares stay 29%, 13% and 38%; a test checks each is one of the host's primitives).
- **The frozen flat fixtures** (`test/fixtures/reference/**`): `duplicated-across-domains` off. They are the before
  shape of the live stalker and guard (2026-10-18), frozen next to them on purpose: the decision-equivalence
  test, the lint known-bad fixture, the before / after teaching pair (their headers). The live domains
  keep the methods the restructure did not touch (`after_waypoint`, `notice_target`, `advance_patrol`) and many tails,
  so with the rule on every live domain would warn about its own past (a test lifts the exclusion and shows it). Every
  other rule stays on there.
- **The canonical `bridge_troll` series** (`src/examples/canon/bridge_troll/**`): `duplicated-across-domains` off.
  Each file is one self-contained step of a tutorial (v1 to v6), so a step repeats what the previous step did and
  changes one thing. The general rule: versions of one example kept side by side for comparison are
  excluded as a group, never one by one.
- **storekeeper**: `checkMethods: ["active_plan"]` (a validator).
- **Canonical examples** (`src/examples/canon/**`): each domain's primitive list (paper prototypes: the primitives
  their story hosts run; `test/examples/canon/canon.test.ts` checks both lists agree), so `unknown-primitive` catches
  a typo in an example meant to be copied.
- **Upstream feature tests** (`test/htn/fixtures/upstream/Domains/Test/**`, `cmake/**`, and the SDK consumer docs
  examples): verbatim copies that exercise one language feature each, so they are not edited. `no-fallback` is off
  (each top-level method is a test case, some expect no plan); `unconditional-not-last`, `shadowed-branch`,
  `recursion-no-base`, `recursion-not-tail` and `unreachable-method` are infos there: they fire on purpose
  (backtracking demos, `deep_failure`, a dead cycle kept for the code generator) and stay visible.
  `duplicated-across-domains` is off there: each test or consumer example is self-contained by design (a fixture
  cannot include another test's file), so they repeat upstream's `!step` scaffolding (`CoreConsumer`,
  `IntegrationConsumer` and `Test/backtracking_policy` share `!step !step !step`), and they are not edited.
- **Upstream hot-reload copy** (`test/htn/fixtures/upstream/HTNHotReloadDemo/**`): `duplicated-across-domains` off.
  Its `Wanderer.domain` is upstream's deliberate copy of `Domains/Wanderer.domain` for the hot-reload test (the
  test rewrites `@REVISION@` in it). Today it stops at compile (its include folder is not copied), so it takes no
  part anyway; the exclusion keeps it so if the includes are copied.
- **`RuntimeBacktrackingDemo`**: `unconditional-not-last` as info (a backtracking demo).
- **No rule is relaxed or suppressed for our guard, stalker and yard_guard**, live or frozen (the frozen ones'
  cross-domain exclusion aside): the frozen flat ones are the known bad examples of the research and the structure
  warnings on them are correct; the live ones have none (`npm run htn:lint -- src`: 0 warnings).

## Baseline

`test/tools/htn-lint.baseline.json`: per file (roots, and includes that have findings) the findings by rule, and each
root's metrics, for every domain under `src/examples`, `test/fixtures/reference` (the frozen flat NPC domains) and
`test/htn/fixtures/upstream`, with the scene config. The test fails on any difference, so a change in a rule, the
config or a shipped domain is deliberate: `npm run htn:lint -- --update-baseline`, then commit the file with the
change. The same test asserts that the whole set lints in under 3 s.

After the lint correction (82 roots, 2026-10-18): 10 errors, 15 warnings, 66 infos. The warnings are the frozen flat
fixtures' and one upstream one; the live NPC domains have none.
- **stalker_flat** (frozen): `max-branches` (21), `flat-root` (18 of 21), 5 × `bookkeeping-branch`,
  4 × `duplicated-tail` (longest 6); infos: `order-dependent` (14 pairs), `shared-condition` (`heard_noise` 10 of 21,
  `noticed` 9 of 21).
- **guard_flat** (frozen): `flat-root` (6 of 8), 2 × `bookkeeping-branch`; infos: `order-dependent`
  (`investigate_last_seen` after `forget_stale_memory`, `listen_to_noise` after `forget_stale_noise` and
  `check_alarming_noise`).
- **stalker** (live): infos only: `order-dependent` (`after_waypoint`'s patrol branches), `shared-condition`
  (`heard_noise` in 5 of 7 upkeep rules).
- **guard** (live): none. **yard_guard** (live): `no-fallback` (`off_duty` needs `bench`).
  Its different `order` values no longer count as a shared test. Before the restructure guard had 4 × `duplicated-across-domains` with yard_guard's
  copies; they share `guard/guard_kit.domain` now.
- **Upstream**: AAACombatNPC one `duplicated-tail` (as in 05); the rest are infos under the profile above. Errors are
  only the compiler fixtures (`HTNDiagnosticTests`, broken on purpose, and the hot-reload copy of Wanderer, whose
  include folder is not copied).

## Limits

- Lint reads shape, not behaviour: it cannot tell a deliberate early plan end, a long-running single action or a
  `!continue` branch from a careless one, and it does not run the planner. Behavioural tests stay mandatory.
- Duplicates across root domains are found only among the roots of one run, and only as whole methods or closing
  steps: a copied sequence in the middle of a branch, or a copy with one step changed, is not.
- Bookkeeping is what the config declares; without a declaration it is a guess by name (four patterns). Declare it.
- Subsumption looks at the top-level `and` literals only; an `or` / `alt` body is one literal.
