# Upstream coverage

Upstream: urosidoki/htn_planner @ aec08fa (`vendor/htn_planner/HTNTest/src`). Case files are in `cases/`.
"Ported" means every planning-semantics assertion of the test is transcribed; "partial" names what is left
out. Skip reasons: **codegen** (asserts generated C text/ABI), **C++ API** (host C++ types, registries,
daemons, ownership), **capacity** (generated storage capacity policies), **debugger**, **profiling**,
**memory** (atom allocation diagnostics), **dll** (dynamic modules/hot reload), **lsp** (editor/document
store), **lexer** (token-level checks; the compiler-level outcome is covered elsewhere).

## HTNGeneratedEquivalenceTest.cpp

| Line | Test | Status | Cases |
| --- | --- | --- | --- |
| 542 | ParentAndChildGuardProduceSameFallbackPlan | ported | backtracking.json `backtracking: do_behavior_*` |
| 568 | SupportsIndependentFactAxiomAndBranchFlags | ported (4 modes × 3 methods) | backtracking.json `backtracking mode *` |
| 647 | FixedWithOverflowExceedsInlineCapacityAndCompletesPlan | ported (plan; capacity skipped) | backtracking-policy.json `run` |
| 672 | FixedCapacityExhaustionFailsCleanlyAndStorageRemainsReusable | partial: recovery plan only; capacity exhaustion skipped (capacity) | backtracking-policy.json `run_small` |
| 741 | NoPlanLeavesNoPartialResultAndGeneratedStorageRemainsReusable | ported | backtracking-policy.json `no plan leaves...` |
| 760 | FixedCapacityProducesExpectedPlanWhenCapacityIsSufficient | ported | backtracking-policy.json `run` |
| 776 | GeneratedProducesExpectedResult (AtomList ×9, AAACombatNPC ×8, ComplexScenario ×6, CallTerms ×3, NestedCalls, NumericExpressions ×3, Human ×2) | ported (upstream checks only status/non-empty for several params) | equivalence.json |
| 903 | GeneratedNestedCallsEvaluateDepthFirstLeftToRight | ported | callterms-and-entry.json `nested calls evaluate...` |
| 931–1332 | GeneratedCodeArchitectureTest ×11 | skipped: codegen | |
| 1335 | MissingUnreachedCallTermDoesNotPreventPlanning | ported | callterms-and-entry.json |
| 1351, 1490 | PreparedSlotKeepsDirectRegistryEntry…, DaemonTypeCapacity… | skipped: C++ API (prepared slots, daemon slot capacity) | |
| 1388, 1459 | SharedMemberBindingUsesTheDaemonFromEachPlannerHook, MissingDaemonFailsOnInvocationAndCanRecover | ported | `test/htn/planner/callterms.test.ts` `daemons: …` |
| 1448 | RetainsItsWorldStateForConstAndNonConstAccess | skipped: C++ API | |
| 1513 | MissingReachedCallTermReturnsNoPlan | ported | callterms-and-entry.json |
| 1533 | TopLevelMethodIsSelectedByInternedSymbol | ported | callterms-and-entry.json `top-level method selected...` |
| 1572 | GeneratedCompletedResultSurvivesContextDestructionAndActivePlanChanges | ported (ownership aspects implicit) | callterms-and-entry.json `planning unit: completed result...` |
| 1599 | PerEntityStateAndDaemonsRemainIsolatedUnderStress | partial: one entity, no threads | callterms-and-entry.json `per-entity callterm daemon...` |
| 1705, 1720 | SelfTailRecursive…FastPath, UsesConstOverloads… | skipped: codegen / C++ API | |
| 1817 | EvaluatesValuesRollbackNestedCallsAndFailure | ported | numeric.json `assignment execution: *` |
| 1852 | EvaluatesEveryOperatorInTaskAndCallTermArguments | ported | numeric.json |
| 1886 | EvaluatesEveryOperatorInAxiomArguments | ported | numeric.json |
| 1917 | HandlesAxiomOutputIoMismatchAndInvalidArithmetic | ported | numeric.json |
| 1975 | PrimitiveTaskHeadsAreStoredExplicitlyWithBangPrefix | skipped: debugger metadata (heads keep `!`: implied by every plan case) | |
| 1999 | PlanningUnitUsesGeneratedBackendWhenDefinitionIsConfigured | ported (same as ComplexScenario/Combat) | equivalence.json |
| 2032–2122 | DecompositionStatus…, ABI version, RegistersCompiledFacts…, Incompatible/InvalidLifecycle…, CommonExecutionContext… | skipped: C++ API / ABI | |
| 2140 | GeneratedBindsTopLevelArguments | ported | callterms-and-entry.json |
| 2159 | GeneratedRejectsInvalidTopLevelCallAndRecovers | ported | callterms-and-entry.json |
| 2182 | ReusesPlanningUnitAcrossRepeatedGeneratedExecutions | ported | callterms-and-entry.json `repeated decompositions...` |
| 2217 | PersistentRuntimeIsResetBetweenDifferentWorldStates | ported | callterms-and-entry.json `reloading the world state...` |
| 2271 | ReloadingDatabaseInvalidatesPersistentFactSlotCache | ported (same case) | callterms-and-entry.json `reloading the world state...` |
| 2321–2482, 2698 | GeneratedEventDebuggerTest ×4, BacktrackedConditionsKeepGeneratedMetadataPaths | ported | `test/htn/planner/debugger.test.ts` |
| 2585 | AxiomChoiceBacktrackingRestoresBindingsAndCompletesLifecycle | ported: plan checks (orange taken, banana not), debugger tree | equivalence.json `Human/AxiomBacktracking...`, `test/htn/planner/debugger.test.ts` |
| 2741 | ExecutesLocalIncludedQualifiedRecursiveAndEntryOverloads | ported | overloads.json |
| 2763 | ResolvesDeferredOverloadsByArgumentCount | ported | overloads.json |
| 2782 | PreservesInputOutputIoAndBacktrackingAcrossOverloads | ported | overloads.json |
| 2829 | AssignmentsInitializeParameterSlotsAndRestoreOutputs | ported (24 entries × 2) | axioms.json |
| 2884 | NestedChoicesPreserveBindingsAndBacktrack | ported, incl. the runtime-backtracking BRANCHES block | axioms.json |
| 2976 | BacktrackingResumesWithoutReplayingHostEffects | ported | axioms.json |
| 3090 | ProcessesEveryEntityWithoutNativeStackOverflow (100, 1000) | ported (frame peak/info skipped) | recursion.json `complex_scenario 100/1000 entities` |
| 3108 | NonTailAndMutualRecursionPreservePendingArguments | ported | recursion.json |
| 3137 | DeepFailureRestoresPlanWithoutReplayingCallTerms | ported (native stack bound skipped) | recursion.json |
| 3165 | CapacityFailureLeavesStorageReusable | ported (`depth_exceeded`, maxDepth 8192) | recursion.json `call-frame capacity...` |
| 3184 | CoreReportsCapacityAndResetsDiagnosticsOnReuse | partial: statuses only; execution info skipped | recursion.json `call-frame capacity...` |

## HTNDecompositionTest.cpp

| Line | Test | Status | Cases |
| --- | --- | --- | --- |
| 242–334 | HTNCallTest ×3, HTNTaskTest ×3 | skipped: C++ API (call/task atom helpers; `&`/`!` heads covered by plan formats) | |
| 337 | DoesNotExposePlanOrTaskAliases | skipped: C++ API | |
| 354 (175) | GeneratedUsesFreshWorldStateAndRecoversAfterResolutionFailure | ported | decomposition.json `deferred: Wanderer...` |
| 361 | GeneratedDispatchIncludesDeferredTargetWithoutMakingItTopLevel | partial: `later` not top-level; dispatch codegen skipped | decomposition.json `deferred: &call target...` |
| 424 | RejectsMethodParametersWithoutInputPrefix | ported (message not asserted) | decomposition.json `compiler: * prefix...` |
| 450 | CompilerSyntaxOwnsLinkedDomainData | ported (links, name) | decomposition.json |
| 474 | CompilerLoaderReturnsOwnedSyntaxForIncludedDomain | ported (links, name) | decomposition.json |
| 496, 512 | AcceptsInMemorySource, AcceptsDeclarationsInAnyOrder | ported | decomposition.json |
| 531 | CompilerLoaderReportsLexerErrorLocation | ported | decomposition.json |
| 549 | CompilerSyntaxValidatorRejectsInvalidMethodParameter | ported | decomposition.json |
| 566 | CompilerLoaderReportsIndependentSyntaxErrors | ported | decomposition.json |
| 584 | CompilerParserRejectsIncompleteFormsWithoutExceptions | ported | decomposition.json |
| 599–938 | GeneratedSourceIsDeterministic, backtracking policy/capacity/runtime-support codegen ×8 | skipped: codegen / capacity | |
| 942 | LinksReusableModulesAndGeneratorSeesThem | partial: links (single `has_recent_event` axiom not observable in IR contract) | decomposition.json |
| 985 | ComplexScenarioReallyUsesIncludedCombatModule | partial: links (see 450) | decomposition.json |
| 1060, 1268 | EliteNinja override / constants codegen | partial: links | decomposition.json `EliteNinja override chain` |
| 1083, 1142 | Axiom override qualified call / or short circuit | partial: links (runtime short circuit: axioms.json `qualified_or`) | decomposition.json |
| 1226 | EmptyBaseAxiomGeneratesForInheritedDomain | partial: links | decomposition.json `Grunt` |
| 1291, 1470 | top-level arguments / builtin comparison codegen | partial: links | decomposition.json |
| 1347 | ExactDuplicateDiagnosticsAreSuppressed | skipped: C++ API (diagnostic sink) | |
| 1367–1454 | HTNWorldStateQueryTest ×5 | skipped: C++ API (host world-state store) | |
| 1514 | CompilerRecognizesOnlyTheAnyPrefix | ported | decomposition.json `?any_ ...`, `?company_value`, `?any` |
| 1539 | DistinctSingletonsCompileWithoutGeneratedBindingStorage | partial: links | decomposition.json |
| 1584 | AtomListApiHasSingleNullableElementLookupPath | skipped: C++ API | |
| 1599 | Method overload validation | ported (4) | decomposition.json |
| 1620 | Axiom overload validation | ported (5) | decomposition.json |
| 1642 | LinksEverySignatureAndResolvesIRByArity | partial: links | decomposition.json |
| 1664 | GeneratesNestedMultiSolutionOutputAndIo | partial: links (runtime: axioms.json) | decomposition.json |
| 1713 | GeneratedReturnsSharedErrorCodesAndClearsPreviousFailure | partial: each source fails (error codes are upstream enums) | decomposition.json `compiler: parser error *` |

## Other test files

| File:line | Test | Status | Cases |
| --- | --- | --- | --- |
| HTNRuntimeListTest.cpp:114–265, 314, 351 | 12 runtime-list tests | ported (Full/None param run once; `last_error` text skipped) | runtime-lists.json |
| HTNRuntimeListTest.cpp:271, 287 | ResultsRemainOwned…, OwnedStrings…Released | skipped: memory | |
| HTNRuntimeListTest.cpp:320, 328 | MissingBindings…, MissingInstance… | ported | `test/htn/planner/callterms.test.ts` `runtime lists: …` |
| HTNRuntimeListTest.cpp:337 | InstrumentationModePreservesAbiAndControlsDebugger | skipped: debugger/profiling | |
| HTNRuntimeListTest.cpp:366, 402 | runtime list compiler tests | partial: links / rejects (IR layout skipped) | runtime-lists.json `runtime lists compiler: *` |
| HTNBooleanCallTermTest.cpp:132, 142 | non-boolean results ×6 value types | ported | boolean-callterms.json |
| HTNBooleanCallTermTest.cpp:162, 184, 199, 216 | true/false, 0/1/symbols, deferred, backtracking | ported | boolean-callterms.json |
| HTNBooleanCallTermTest.cpp:173 | FailSilentlyDoesNotReportOrLog | ported | `test/htn/planner/callterms.test.ts` |
| HTNBooleanCallTermTest.cpp:229 | UnboundResultsAndInvocationErrorsAreNotReportedTwice | ported | boolean-callterms.json, `test/htn/planner/callterms.test.ts` |
| HTNBooleanCallTermTest.cpp:248, 286 | demo message, invalid policy | ported (the invalid policy as in HTNMissingCallTermTest.cpp:273) | `test/htn/planner/callterms.test.ts` |
| HTNBooleanCallTermTest.cpp:271 | RejectedOwnedResultsReleaseTheirListNodes | skipped: memory | |
| HTNBooleanCompatibilityTest.cpp:22–61 | atom equality/display/conversion | partial: equality and display in test/htn/atom.test.ts; bool conversion in `test/htn/planner/callterms.test.ts` | |
| HTNBooleanCompatibilityTest.cpp:89 | TypedMemberBindingsAcceptBinaryIntegersAndReportInvalidArguments | ported | `test/htn/planner/callterms.test.ts` |
| HTNBooleanCompatibilityTest.cpp:170–258 | 5 generated-planner tests | ported (world-state storage checks skipped) | boolean-compatibility.json |
| HTNAxiomAssignmentTest.cpp:26–111 | 7 tests | ported (31 compile cases) | compiler.json `axiom assignment: *` |
| HTNAssignmentSyntaxTest.cpp:43–102 | 9 tests | ported (15 compile cases) | compiler.json `assignment syntax: *` |
| HTNNestedCallExpressionTest.cpp:96 | TranslatorEmitsInvocationInsteadOfCallNameValue | partial: links, callterm listed | nested-calls.json |
| HTNNestedCallExpressionTest.cpp:129 | ValuesParticipateInBothOperandsAndEveryOperator | ported | nested-calls.json |
| HTNNestedCallExpressionTest.cpp:168 | MissingPoliciesReasonsCountAndExpressionSource | ported (debugger capture checks: debugger.test.ts) | nested-calls.json `missing callterm in *`, `test/htn/planner/callterms.test.ts` |
| HTNNestedCallExpressionTest.cpp:235 | UnsetKeepsSdkContractForNestedInvocation | ported (the assert is a failed call and one console warning) | `test/htn/planner/callterms.test.ts` |
| HTNNestedCallExpressionTest.cpp:256 | ContinueMoveDebuggerPreservesSourceAndExecution | ported: execution, debugger sources | nested-calls.json, `test/htn/planner/debugger.test.ts` |
| HTNNestedCallExpressionTest.cpp:335 | DebuggerKeepsRetriesSkippedExpressionsAndNestedAssignments | ported: status, call counts, debugger retries and skipped terms | nested-calls.json, `test/htn/planner/debugger.test.ts` |
| HTNNegativeLiteralTest.cpp:36, 68, 183 | lexer tokens, world-state lexer | skipped: lexer | |
| HTNNegativeLiteralTest.cpp:87 | AstIrAndGeneratedC… | partial: links | negative-literals.json |
| HTNNegativeLiteralTest.cpp:149, 169 | malformed / overflow | ported | negative-literals.json |
| HTNNegativeLiteralTest.cpp:251–328 | 5 runtime tests | ported (debugger node checks skipped) | negative-literals.json |
| HTNSharedImplementationTest.cpp:21 | LinkedAliasesShareBodies… | skipped: IR internals | |
| HTNSharedImplementationTest.cpp:67 | MinimalDomainHasOneBodyAndOneTaskInBothModes | partial: links | shared-implementations.json |
| HTNSharedImplementationTest.cpp:160–212, 257, 277 | 7 runtime tests | ported | shared-implementations.json |
| HTNSharedImplementationTest.cpp:230 | DeferredTargetRemainsExternallyCallable… | partial: `dead_deferred_source` name dispatch not expressible | shared-implementations.json |
| HTNSharedImplementationTest.cpp:241 | PruningPreservesValidationOfUnusedCallterms | ported (report order differs: ours methods, then axioms) | shared-implementations.json, `test/htn/planner/callterms.test.ts` |
| HTNSharedImplementationTest.cpp:292 | DebuggerPreservesCallableNames… | skipped: debugger | |
| HTNMissingCallTermTest.cpp:121 | GeneratedCallsReportProvenanceAndPreserveFailureSemantics | ported (missing_binding names no daemon) | missing-callterms.json, `test/htn/planner/callterms.test.ts` |
| HTNMissingCallTermTest.cpp:305, 345 | InitializationValidation…, InitializationMetadata… | ported | missing-callterms.json, `test/htn/planner/callterms.test.ts` |
| HTNMissingCallTermTest.cpp:515 | NestedGeneratedCallReportsCountMismatchOnce | ported | missing-callterms.json (reason `argument_count_mismatch`), `test/htn/planner/callterms.test.ts` |
| HTNMissingCallTermTest.cpp:63, 73, 184, 214, 250, 273, 434 | policy default, both invocation paths, shared registry, Unset, per-execution reports, invalid policy, argument / conversion errors | ported (the two paths: `invokeCallterm` and the planner) | `test/htn/planner/callterms.test.ts` |
| HTNMissingCallTermTest.cpp:373 | InitializationRejectsInvalidDescriptorsAndForeignRegistry | skipped: C++ API (descriptors, ABI) | |
| HTNOverrideRegressionTest.cpp:87–167 | 6 override codegen tests | partial: links | compiler.json `override regression: *` |
| HTNFrontendDiagnosticsTest.cpp:33–195 | 8 tests | ported (lexer token checks skipped) | compiler.json `frontend: *` |
| HTNBooleanSymbolSyntaxTest.cpp:21, 89 | lexer, world-state lexer | skipped: lexer | |
| HTNBooleanSymbolSyntaxTest.cpp:36 | AstIr…KeepSymbolsDistinct… | partial: links (runtime symbol semantics: boolean-compatibility.json) | compiler.json |
| HTNGeneratedInstrumentationTest.cpp:111, 143 | depth 1000 rollback, None capacity failure | ported (same as recursion cases) | recursion.json |
| HTNGeneratedInstrumentationTest.cpp:26, 76, 95 | instrumentation statistics/modes | skipped: codegen | |
| HTNGeneratedOnlyTest.cpp:11 | MissingDefinitionFailsWithInvalidContext | skipped: C++ API | |
| HTNGeneratedOnlyTest.cpp:20 | PlansWithoutParsingDomainAndReusesUnitAfterFailure | ported | backtracking-policy.json `no plan leaves...` |
| HTNWorldStateWriteTest.cpp (10 tests) | typed fact writes, registries, unregistered facts | partial: unregistered and wrong-arity tables listed (`checkFacts`); typed writes and registries are C++ API | `test/htn/planner/runner.test.ts` |
| HTNAtomListTest.cpp (21 tests) | atom/list allocators, C API, calls | skipped: C++ API / memory (split semantics: equivalence.json AtomList) | |
| HTNTypeConversionTest.cpp:66, 79, 91, 105, 181, 205, 251 | native and composite converters, metadata, client-context converters, static / member bindings, shared registry | ported (`sCreateCallWithContext` skipped) | `test/htn/planner/callterms.test.ts` |
| HTNTypeConversionTest.cpp:293 | CoreGeneratedExecutionUsesCurrentContextWithCachedBindings | skipped: C++ API (generated storage); per-run context: :251 | |
| HTNCoreSdkTest.cpp (3 tests) | SDK layout | skipped: C++ API | |
| HTNReachabilityTest.cpp (4 tests) | dead-code emission | skipped: codegen | |
| HTNGeneratedDynamicModuleTest.cpp (3 tests) | dynamic modules | skipped: dll | |
| HTNDomainDocumentStoreTest.cpp (4 tests) | editor document store | skipped: lsp | |
| HTNProfilingTest.cpp (1 test) | Optick capture | skipped: profiling | |

## Docs and SDK examples with explicit results

| Source | Status | Cases |
| --- | --- | --- |
| docs/DOMAIN_LANGUAGE.md:34 Tutorial | ported | docs-and-sdk.json |
| docs/DOMAIN_LANGUAGE.md:585 SpecialMovement | skipped: result stated in prose only (no plan text) | |
| docs/AXIOM_OVERLOADS.md:59 io axiom argument | ported | docs-and-sdk.json |
| README.md:52 GuardNPC | ported (heads only, as stated) | docs-and-sdk.json |
| docs/AAA_COMBAT_NPC_DEMO.md:35 | ported via equivalence AAACombatNPC cases | equivalence.json |
| SDK/Examples/CoreConsumer/main.cpp | ported | docs-and-sdk.json |
| SDK/Examples/IntegrationConsumer/main.cpp | ported | docs-and-sdk.json |
| SDK/Examples/BridgeConsumer/main.cpp | ported (inline-string-capacity check skipped) | docs-and-sdk.json |
| HTNBenchmark run_scenario ×6 | ported via ComplexScenario equivalence cases | equivalence.json |
| HTNHotReloadDemo self-test | skipped: dll/hot reload | |
