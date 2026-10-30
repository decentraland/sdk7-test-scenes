// HTN planner for SDK7 NPCs: the public API. Setup and prepared authoring tools: README.md beside this file.
// Layers:
//  - htn/  the planner: DomainIR (compiled .domain), WorldState facts, decompose / PlanRunner. Pure, no SDK.
//  - npc/  simulation helpers plus SDK adapters for bodies, scene systems, clocks, noise and raycasts.
// Adapter contracts and usage: npc/README.md.
export { Atom, bool, float, formatAtom, formatTask, int, list, str, sym, vec3 } from './htn/atom'
export { DomainIR, HTN_IR_VERSION, SourceLoc } from './htn/ir'
export {
  atomToBool,
  AtomType,
  CALLTERM_TYPES,
  callSites,
  CallSite,
  callterm,
  calltermDiagnostic,
  calltermMessage,
  CallTermDaemons,
  CallTermErrorInfo,
  CallTermErrorPolicy,
  CallTermErrorReason,
  CallTermInvocation,
  CallTermRegistry,
  CallTermSite,
  CallTermSource,
  CallTermType,
  CallTermTypeName,
  CallTermTypeSpec,
  CallTermValue,
  CallTermWarnings,
  invokeCallterm,
  InvokeCalltermOptions,
  listCallterms,
  memberCallterm,
  reportCalltermError,
  validateCallterms,
  Vec3Value,
  withSignature
} from './htn/callterms'
export {
  BacktrackingMode,
  CallTerm,
  decompose,
  decomposeDeferred,
  DecompositionResult,
  DecompositionStatus,
  ExecutionInfo,
  missingCallterms,
  newPlanStats,
  PlannerOptions,
  PlanRunner,
  PlanStats,
  PlanStep,
  PlanTracer,
  Resolution,
  RuntimeDiagnostic,
  TraceScope
} from './htn/planner'
export {
  Binding,
  BranchAttempt,
  branchAttempts,
  chosenBindings,
  chosenBranchName,
  chosenPath,
  DebugNode,
  formatBindings,
  formatBound,
  formatCond,
  NodeKind,
  PlanRun,
  PlanTraceRecorder,
  RecorderOptions,
  rootMethod,
  skipRuns
} from './htn/trace'
export {
  attemptLines,
  conditionFailures,
  formatWhyNot,
  termLine,
  whyNode,
  WhyAttempt,
  WhyNot,
  whyNot,
  WhyNotInput,
  WhyOutcome,
  WhyTerm,
  WhyVerdict
} from './htn/why-not'
export { DriftItem, FactSource, formatDrift, PlanDrift, planDrift, snapshotRows } from './htn/plan-drift'
export { DomainGraph, domainGraph, GraphAxiom, GraphBranch, GraphCond, GraphMethod, GraphTask } from './htn/domain-graph'
export { Title, TitleToken, TitleTokenKind } from './htn/titles'
export { ViewMode, ViewRow, viewRows, ViewState } from './htn/trace-view'
export {
  buildSession,
  DEBUG_SESSION_VERSION,
  DebugSession,
  latestPlan,
  parseSession,
  sessionGraph,
  SessionAgent,
  SessionDiff,
  SessionInput,
  SessionRun,
  SessionWorld
} from './debug/session'
export { AgentHistory, agentHistory, AgentHistoryOptions, AgentLogEntry, entryCount, EventRing, eventKey } from './npc/history'
export { addFacts, FactRow, snapshotWorld, WorldDiff, worldDiff, WorldFacts, WorldSnapshot, WorldState } from './htn/world-state'

export {
  ActionContext,
  ActionExecutor,
  ActionFactory,
  ActionRegistry,
  ActionStatus,
  AgentDiagnosticCode,
  atomName,
  atomNumber,
  atomVec3,
  DEFAULT_TUNING,
  GUARD_ACTIONS,
  GuardEvent,
  GuardTuning,
  ReplanEvent,
  ReplanTrigger,
  instant,
  speedForGait,
  timed
} from './npc/actions'
export { ACTIVE_PLAN_FACT, BEGIN_PLAN, END_PLAN, factChanges, GuardAgent, GuardAgentOptions, GuardMode, newPlanningMetrics, PlannerFactory, PlanningMetrics, PlanRunnerLike, RUNNING_FACT, runningRow, VOLATILE_FACTS } from './npc/agent'
export { GuardBlackboard, Memory, NoiseMemory } from './npc/blackboard'
export {
  createCapsuleBody,
  GuardBody,
  GuardHandle,
  GuardPlannerFactory,
  GuardSpec,
  GuardSquad,
  GuardSquadOptions,
  MODE_COLORS,
  plannerFor,
  playerTargets,
  possessEntityBody,
  quaternionYaw,
  SquadDecision,
  SquadPlannerOptions,
  SquadPlanningOptions
} from './npc/guard-scene'
export { AlertLevel, DEFAULT_HEARING, Hearing, HearingConfig, HearingResult, HeardNoise } from './npc/hearing'
export { FLAT_GROUND, Kinematic, MoveParams, normalizeYaw, settle, stepToward, Terrain, turnToward } from './npc/movement'
export { emitNoise, noiseBus, retainPlayerNoise } from './npc/noise-scene'
export { sceneClock, SIM_CLOCK_PRIORITY } from './npc/clock-scene'
export { MAX_SUBSTEPS, SimClock, SimClockOptions, splitSteps, TIME_SCALES } from './npc/sim-clock'
export { DEFAULT_SEED, Rng } from './npc/rng'
export { NoiseBus, NoiseEvent, NoiseInput, NoiseKind, NOISE_LOUDNESS, PlayerNoiseTracker } from './npc/noise'
export { PlanBudget, PlanBudgetOptions, PlanBudgetStats } from './npc/plan-budget'
export {
  Box,
  CLEAR_LINE_OF_SIGHT,
  DEFAULT_PERCEPTION,
  GeometricLineOfSight,
  aimOf,
  eyeOf,
  inViewCone,
  LineOfSight,
  Perception,
  PerceptionConfig,
  PerceptionResult,
  SeenTarget,
  LostTarget,
  SenseKind,
  sightRange,
  TargetSample,
  TargetSense
} from './npc/perception'
export { RaycastLineOfSight, RaycastLineOfSightOptions } from './npc/raycast-los'
export { angleDiff, copy, DEG, distance, distanceXZ, v3, Vec3, yawTo } from './npc/vec'
