// Callterm contract of the HTN planner (TS port of urosidoki/htn_planner Core/HTNCallTermRegistry.h,
// HTNCallTermBinding.h, HTNCallTermError.h, HTNTypeConversion.h; docs/MISSING_CALLTERMS.md, docs/TYPE_CONVERSION.md).
// - Raw callterms: `(args, context, call?) => Atom | undefined`, as before (upstream Registry.Bind(id, fn)).
// - Typed bindings: `callterm(params, fn, returns?)` (HTN_CALLTERM_BIND), `memberCallterm(daemon, ...)`
//   (HTN_CALLTERM_BIND_MEMBER, the instance from PlannerOptions.daemons), `withSignature(signature, fn)`
//   (Registry.Bind(id, fn, signature)). They check arity and atom types before the function runs and convert
//   arguments and the result, reporting upstream's reasons.
// - The error policy: Unset / FailSilently / Report (`reportCalltermError`, HTNCallTerm_ReportError), the reasons
//   and their provenance (CallTermErrorInfo, HTNCallTermErrorInfo). Like upstream, nothing here throws: a
//   misconfigured policy fails the call normally (upstream's release build) and warns once (its debug assert).
// - Callterms must not throw (upstream MISSING_CALLTERMS.md:108): there is no catch, a host exception propagates.
// - Call-site validation (`validateCallterms`, ValidateGeneratedCallTerms) and the standard list callterms
//   (`listCallterms`, AIHtnListDaemon).
// Ships in the scene bundle: ES2020, no module-level mutable state.
import { float, int, list, vec3 as vec3Atom, type Atom } from './atom'
import type { CondIR, DomainIR, ExprIR, SourceLoc, TermIR } from './ir'
import type { RuntimeDiagnostic } from './planner'

/** An atom's representation: upstream HTNAtomType without UNBOUND (a callterm function never gets an unbound argument). */
export type AtomType = Atom['t']

/**
 * An argument's type in a callterm error: an atom type, or 'unbound' (upstream HTN_ATOM_TYPE_UNBOUND) for an unbound
 * variable passed to the call (upstream passes NULL).
 */
export type ArgumentType = AtomType | 'unbound'

/**
 * Upstream HTNCallTermErrorPolicy, a direct option of each execution (PlannerOptions.calltermErrorPolicy).
 * - 'unset' (the default, as upstream's zero-initialized descriptor): valid callterms run normally; an invocation
 *   error is a configuration bug: the call fails normally and nothing is reported (upstream's release build); in
 *   place of upstream's debug assert, the first one per runner logs a console.warn.
 * - 'fail_silently': the call fails, nothing is reported or logged.
 * - 'report': onDiagnostic receives one report per failed invocation, then the call fails; without onDiagnostic
 *   the call fails and the first one warns, as for 'unset' (upstream asserts "Report policy requires a callterm
 *   error callback"). An invalid value behaves the same way.
 * The library never throws for a callterm error.
 */
export type CallTermErrorPolicy = 'unset' | 'fail_silently' | 'report'

/**
 * Upstream HTNCallTermErrorReason (HTNCallTermError.h:19-30), in its order. A callterm that throws has no reason:
 * callterms must not throw (MISSING_CALLTERMS.md:108), and an exception propagates out of plan() unchanged.
 */
export type CallTermErrorReason =
  | 'not_registered' // the name is absent from options.callterms
  | 'missing_binding' // the name is there, with no function (`{ name: undefined }`)
  | 'missing_instance' // a member callterm whose daemon options.daemons lacks
  | 'argument_count_mismatch' // a typed binding's arity does not match the call
  | 'argument_type_mismatch' // an argument's atom type does not match the signature
  | 'argument_conversion_failed' // a converter rejected an argument that passed the signature check
  | 'return_conversion_failed' // the function ran, its result could not be converted
  | 'non_boolean_condition_result' // a standalone `(call ...)` condition returned a non-bool atom

/** Upstream HTNCallTermSource: where the `(call ...)` is. `domain`: the domain that declares it. */
export interface CallTermSource {
  domain?: string
  file: string
  line: number
  col: number
}

/** Ours, on top of upstream's provenance: the method branch or the axiom whose body holds the call. */
export type CallTermSite =
  | { kind: 'method'; domain: string; method: string; branch: string }
  | { kind: 'axiom'; domain: string; axiom: string }

/** Upstream HTNCallTermErrorInfo (HTNCallTermError.h:55-69); a field is absent where upstream has UINT32_MAX / null. */
export interface CallTermErrorInfo {
  name: string
  reason: CallTermErrorReason
  /** The daemon a member callterm needs (DaemonID). */
  daemon?: string
  source?: CallTermSource
  site?: CallTermSite
  /** Zero-based; only for errors about one argument. */
  argumentIndex?: number
  /** A typed binding's arity. */
  expectedArgumentCount?: number
  actualArgumentCount?: number
  expectedType?: AtomType
  actualType?: ArgumentType
  /** A converter's type name ('int32', 'bool', a custom type's name...). */
  expectedTypeName?: string
}

/**
 * The invocation a callterm runs in (upstream HTNCallTermArguments' context and SetError). Valid only during the
 * call: the engine reuses it.
 */
export interface CallTermInvocation {
  readonly name: string
  /** options.context: upstream's client context (GetClientContext). */
  readonly context: unknown
  /** A member callterm's daemon instance (options.daemons[daemon]); undefined otherwise. */
  readonly daemon: unknown
  /**
   * Record a failure; only the first one counts. The call then fails and the engine reports it once, through the
   * policy, after the callterm returns (whatever it returned). Typed bindings use it for their checks.
   */
  setError(reason: CallTermErrorReason, argumentIndex?: number, expectedType?: AtomType, expectedTypeName?: string): void
}

/**
 * A host function invoked during decomposition. Its arguments are always bound: a domain that passes an unbound
 * variable (`(call f ?x)`, ?x unbound) still invokes the callterm, as upstream passes NULL, but the invoker fails it
 * before the function runs (upstream's typed bindings: argument_type_mismatch, or argument_conversion_failed for an
 * 'any' parameter; raw ones: argument_type_mismatch, ours, where upstream's function gets NULL). Return the result atom, or `undefined` for an ordinary failed
 * call (no report: the enclosing condition fails, or a task argument fails that task attempt); to fail with a
 * reported error, call `call.setError(...)`. Must not throw (upstream MISSING_CALLTERMS.md:108): the planner does
 * not catch, so an exception escapes plan() / decompose() unchanged, mid-decomposition. May run several times per
 * decomposition and is not rolled back by backtracking. `args` is the engine's array, reused for the next call: read
 * it during the call, copy it to keep it (the atoms in it are values and may be kept). Plain functions work as raw
 * bindings; the binding helpers below attach `signature` / `daemon`.
 */
export interface CallTerm {
  (args: readonly Atom[], context: unknown, call?: CallTermInvocation): Atom | undefined
  /** A typed binding's signature (HTNCallTermSignature): one atom type per parameter, undefined = any atom. */
  readonly signature?: readonly (AtomType | undefined)[]
  /** A member binding's daemon id: its instance comes from PlannerOptions.daemons. */
  readonly daemon?: string
}

/** A planner's callterms by name (upstream's registry). `undefined`: declared, with no function (MissingBinding). */
export type CallTermRegistry = Readonly<Record<string, CallTerm | undefined>>

/** Instances for member callterms, by daemon id (upstream HTNCallTermBindingContext::SetDaemon). */
export type CallTermDaemons = Readonly<Record<string, unknown>>

// ---------------------------------------------------------------------------------------------------------------
// Type conversion (HTNTypeConversion.h, TYPE_CONVERSION.md)

/**
 * How a typed binding reads an argument and writes its result (upstream HTNTypeTraits + HTNTypeConverter).
 * `undefined` from either converter is a conversion failure, so `T` should not include undefined. Both get the
 * planner's client context (options.context), like upstream's converters (TYPE_CONVERSION.md).
 */
export interface CallTermType<T> {
  /** Reported as expectedTypeName (HTNTypeTraits::Name). */
  readonly name: string
  /** The one atom representation of T (HasFixedAtomType), checked before fromAtom; undefined accepts any atom. */
  readonly atom?: AtomType
  fromAtom(atom: Atom, context: unknown): T | undefined
  toAtom(value: T, context: unknown): Atom | undefined
}

export interface Vec3Value {
  x: number
  y: number
  z: number
}

const INT32_MIN = -2147483648
const INT32_MAX = 2147483647
const isAtom = (v: unknown): v is Atom => typeof v === 'object' && v !== null && typeof (v as { t?: unknown }).t === 'string'
const numberOf = (a: Atom | undefined): number | undefined => (a !== undefined && (a.t === 'int' || a.t === 'float') ? a.v : undefined)

/** Upstream's bool conversion: BOOL, or INT exactly 0 / 1 (HTNTypeConversion.h:205-214). */
export function atomToBool(a: Atom): boolean | undefined {
  if (a.t === 'bool') return a.v
  return a.t === 'int' && (a.v === 0 || a.v === 1) ? a.v === 1 : undefined
}

/**
 * The built-in converters, upstream's native ones: int32, float, bool, std::string, HtnSymbol, HTNAtomList and
 * HTNAtom (any). Strict like upstream: an INT is not a float, a symbol is not a string; only bool also reads INT
 * 0 / 1. Plus `vec3` (ours, the port's position convention, a list of 3 numbers), like upstream's custom
 * Vector3 / Cell converters over a list (DemoGridTerrain.h:35).
 */
export const CALLTERM_TYPES = {
  int: {
    name: 'int32',
    atom: 'int',
    fromAtom: a => (a.t === 'int' ? a.v : undefined),
    toAtom: v => (typeof v === 'number' && Number.isInteger(v) && v >= INT32_MIN && v <= INT32_MAX ? int(v) : undefined)
  } as CallTermType<number>,
  float: {
    name: 'float',
    atom: 'float',
    fromAtom: a => (a.t === 'float' ? a.v : undefined),
    toAtom: v => (typeof v === 'number' && Number.isFinite(Math.fround(v)) ? float(v) : undefined)
  } as CallTermType<number>,
  bool: {
    name: 'bool',
    atom: 'bool',
    fromAtom: atomToBool,
    toAtom: v => (typeof v === 'boolean' ? { t: 'bool', v } : undefined)
  } as CallTermType<boolean>,
  str: {
    name: 'string',
    atom: 'str',
    fromAtom: a => (a.t === 'str' ? a.v : undefined),
    toAtom: v => (typeof v === 'string' ? { t: 'str', v } : undefined)
  } as CallTermType<string>,
  sym: {
    name: 'HtnSymbol',
    atom: 'sym',
    fromAtom: a => (a.t === 'sym' ? a.v : undefined),
    toAtom: v => (typeof v === 'string' ? { t: 'sym', v } : undefined)
  } as CallTermType<string>,
  list: {
    name: 'HTNAtomList',
    atom: 'list',
    fromAtom: a => (a.t === 'list' ? a.v : undefined),
    toAtom: v => (Array.isArray(v) && v.every(isAtom) ? list(...v) : undefined)
  } as CallTermType<readonly Atom[]>,
  vec3: {
    name: 'vec3',
    atom: 'list',
    fromAtom: a => {
      if (a.t !== 'list' || a.v.length !== 3) return undefined
      const x = numberOf(a.v[0])
      const y = numberOf(a.v[1])
      const z = numberOf(a.v[2])
      return x === undefined || y === undefined || z === undefined ? undefined : { x, y, z }
    },
    toAtom: v =>
      typeof v === 'object' && v !== null && [v.x, v.y, v.z].every(n => typeof n === 'number' && Number.isFinite(n))
        ? vec3Atom(v.x, v.y, v.z)
        : undefined
  } as CallTermType<Vec3Value>,
  any: {
    name: 'HTNAtom',
    fromAtom: a => a,
    toAtom: v => (isAtom(v) ? v : undefined)
  } as CallTermType<Atom>
}

export type CallTermTypeName = keyof typeof CALLTERM_TYPES
/** A parameter or result type: a built-in by name, or a converter of your own. */
export type CallTermTypeSpec = CallTermTypeName | CallTermType<any>
/** The TS value a type spec converts to. */
export type CallTermValue<S> = S extends CallTermTypeName
  ? (typeof CALLTERM_TYPES)[S] extends CallTermType<infer V> ? V : never
  : S extends CallTermType<infer V> ? V : never
export type CallTermValues<P extends readonly CallTermTypeSpec[]> = { -readonly [K in keyof P]: CallTermValue<P[K]> }

const typeOf = (s: CallTermTypeSpec): CallTermType<unknown> =>
  (typeof s === 'string' ? CALLTERM_TYPES[s] : s) as CallTermType<unknown>

// ---------------------------------------------------------------------------------------------------------------
// Bindings (HTNCallTermBinding.h, HTNCallTermRegistry.h:172-225)

/**
 * A typed callterm (upstream HTN_CALLTERM_BIND): `params` declares the arity and each argument's type; the call
 * fails before `fn` runs on a wrong count (argument_count_mismatch), a wrong atom type (argument_type_mismatch;
 * a `bool` parameter also takes INT 0 / 1) or a converter that rejects the atom (argument_conversion_failed).
 * `fn` gets the converted values, then the invocation (context, daemon); it returns a value of `returns` (default
 * 'any': an Atom), or `undefined` for an ordinary failure (no report). A value `returns` cannot convert is
 * return_conversion_failed, after `fn` ran.
 *
 *   callterm(['int', 'int'], (a, b) => a < b, 'bool')
 */
export function callterm<const P extends readonly CallTermTypeSpec[], const R extends CallTermTypeSpec = 'any'>(
  params: P,
  fn: (...args: [...CallTermValues<P>, CallTermInvocation]) => CallTermValue<R> | undefined,
  returns?: R
): CallTerm {
  return bindTyped(params, returns, (values, call) => (fn as (...a: unknown[]) => unknown)(...values, call))
}

/**
 * A typed member callterm (upstream HTN_CALLTERM_BIND_MEMBER): like `callterm`, and `fn` first gets the instance
 * of `daemon` from PlannerOptions.daemons; without one the call fails before anything else is checked
 * (missing_instance). One registry can serve many planners, each with its own daemons.
 */
export function memberCallterm<D, const P extends readonly CallTermTypeSpec[], const R extends CallTermTypeSpec = 'any'>(
  daemon: string,
  params: P,
  fn: (instance: D, ...args: [...CallTermValues<P>, CallTermInvocation]) => CallTermValue<R> | undefined,
  returns?: R
): CallTerm {
  return bindTyped(
    params,
    returns,
    (values, call) => (fn as (...a: unknown[]) => unknown)(call.daemon, ...values, call),
    daemon
  )
}

/**
 * A raw callterm with a declared signature (upstream Registry.Bind(id, fn, signature)): the count and atom types
 * are checked as for `callterm` (a 'bool' slot also takes INT 0 / 1, passed as the original atom), then `fn` gets
 * the atoms. `undefined` in the signature accepts any atom.
 */
export function withSignature(signature: readonly (AtomType | undefined)[], fn: CallTerm): CallTerm {
  const sig = signature.slice()
  const bound: CallTerm = (args, context, call) => {
    if (!validateArguments(sig, args, call, false)) return undefined
    return fn(args, context, call)
  }
  return Object.assign(bound, { signature: sig as readonly (AtomType | undefined)[] })
}

function bindTyped(
  params: readonly CallTermTypeSpec[],
  returns: CallTermTypeSpec | undefined,
  run: (values: unknown[], call: CallTermInvocation) => unknown,
  daemon?: string
): CallTerm {
  const types = params.map(typeOf)
  const result = typeOf(returns ?? 'any')
  const signature = types.map(t => t.atom)
  const bound: CallTerm = (args, context, call) => {
    const inv = call ?? detachedInvocation(context)
    if (!validateArguments(signature, args, inv, true)) return undefined
    const given = args as readonly (Atom | undefined)[]
    const values: unknown[] = new Array(types.length)
    // Left to right, stopping at the first failure (HTNCallTermBinding.h:283-291). An unbound argument reaches here
    // only for a parameter of no fixed atom type: upstream's converter gets NULL and fails (HTNTypeConversion.h:98).
    for (let i = 0; i < types.length; i++) {
      const t = types[i]
      const a = given[i]
      const v = a === undefined ? undefined : t.fromAtom(a, context)
      if (v === undefined) {
        inv.setError('argument_conversion_failed', i, t.atom, t.name)
        return undefined
      }
      values[i] = v
    }
    const value = run(values, inv)
    if (value === undefined) return undefined // an unbound result: an ordinary failure
    const atom = result.toAtom(value, context)
    if (atom === undefined) inv.setError('return_conversion_failed', undefined, result.atom, result.name)
    return atom
  }
  return Object.assign(bound, daemon === undefined ? { signature } : { signature, daemon })
}

/**
 * Upstream ValidateArguments (HTNCallTermRegistry.cpp:152-178): count, then each fixed atom type in order; an unbound
 * argument (upstream NULL, HTN_ATOM_TYPE_UNBOUND) mismatches a fixed type. `converted`: a typed binding, whose
 * converters then fail an unbound argument of no fixed type; for a raw one (withSignature) that is a mismatch too,
 * so its function never gets one.
 */
function validateArguments(
  signature: readonly (AtomType | undefined)[],
  args: readonly (Atom | undefined)[],
  call: CallTermInvocation | undefined,
  converted: boolean
): boolean {
  if (args.length !== signature.length) {
    call?.setError('argument_count_mismatch')
    return false
  }
  for (let i = 0; i < signature.length; i++) {
    const expected = signature[i]
    const a = args[i]
    if (a === undefined) {
      if (expected === undefined && converted) continue
      call?.setError('argument_type_mismatch', i, expected)
      return false
    }
    if (expected === undefined || a.t === expected) continue
    if (expected === 'bool' && atomToBool(a) !== undefined) continue
    call?.setError('argument_type_mismatch', i, expected)
    return false
  }
  return true
}

/** For a binding a host calls directly, with no planner: errors make it fail, with nobody to report them. */
function detachedInvocation(context: unknown): CallTermInvocation {
  return { name: '', context, daemon: undefined, setError() {} }
}

// ---------------------------------------------------------------------------------------------------------------
// Invocation and the error policy (HTNCallTermRegistry.cpp:39-84, HTNCallTermError.h:76-90)

const hasOwn = Object.prototype.hasOwnProperty
const NO_ARGS: readonly Atom[] = Object.freeze([]) as readonly Atom[]

/**
 * Upstream InvokeEntry: resolve the name (not_registered, missing_binding, missing_instance), run the callterm
 * (not guarded: a callterm must not throw), keep the first error it records. One per engine, reused for every call; also the
 * CallTermInvocation the callterm receives. Internal: the engine and invokeCallterm use it.
 */
export class CallTermInvoker implements CallTermInvocation {
  name = ''
  context: unknown = undefined
  daemon: unknown = undefined
  /** The last invocation's error, undefined when it had none. */
  reason: CallTermErrorReason | undefined = undefined
  private args: readonly (Atom | undefined)[] = NO_ARGS
  private entry: CallTerm | undefined = undefined
  private argumentIndex: number | undefined = undefined
  private expectedType: AtomType | undefined = undefined
  private expectedTypeName: string | undefined = undefined

  setError(reason: CallTermErrorReason, argumentIndex?: number, expectedType?: AtomType, expectedTypeName?: string): void {
    if (this.reason !== undefined) return
    this.reason = reason
    this.argumentIndex = argumentIndex
    this.expectedType = expectedType
    this.expectedTypeName = expectedTypeName
  }

  /** `args`: an element is undefined for an unbound variable the domain passes (upstream NULL). */
  invoke(
    callterms: CallTermRegistry,
    daemons: CallTermDaemons | undefined,
    name: string,
    args: readonly (Atom | undefined)[],
    context: unknown
  ): Atom | undefined {
    this.name = name
    this.context = context
    this.daemon = undefined
    this.args = args
    this.reason = undefined
    this.argumentIndex = undefined
    this.expectedType = undefined
    this.expectedTypeName = undefined
    if (!hasOwn.call(callterms, name)) {
      this.entry = undefined
      this.reason = 'not_registered'
      return undefined
    }
    const fn = callterms[name]
    this.entry = fn
    if (typeof fn !== 'function') {
      this.reason = 'missing_binding'
      return undefined
    }
    const daemon = fn.daemon
    if (daemon !== undefined) {
      const instance = daemons !== undefined && hasOwn.call(daemons, daemon) ? daemons[daemon] : undefined
      if (instance === undefined || instance === null) {
        this.reason = 'missing_instance'
        return undefined
      }
      this.daemon = instance
    }
    if (fn.signature === undefined) {
      // Ours: upstream hands a raw callterm the NULL atom (reading it is undefined behavior); ours fails the call
      // as a typed binding does, so the function never gets an unbound argument.
      for (let i = 0; i < args.length; i++) {
        if (args[i] !== undefined) continue
        this.setError('argument_type_mismatch', i)
        return undefined
      }
    }
    const result = fn(args as readonly Atom[], context, this)
    return this.reason === undefined ? result : undefined
  }

  /** The last invocation's error as a report (allocates: only build it to report). Call only after an error. */
  info(): CallTermErrorInfo {
    const reason = this.reason ?? 'not_registered'
    const info: CallTermErrorInfo = { name: this.name, reason, actualArgumentCount: this.args.length }
    const fn = this.entry
    if (typeof fn === 'function') {
      if (fn.daemon !== undefined) info.daemon = fn.daemon
      if (fn.signature !== undefined) info.expectedArgumentCount = fn.signature.length
    }
    const i = this.argumentIndex
    if (i !== undefined) {
      info.argumentIndex = i
      if (i < this.args.length) info.actualType = this.args[i]?.t ?? 'unbound'
    }
    if (this.expectedType !== undefined) info.expectedType = this.expectedType
    if (this.expectedTypeName !== undefined) info.expectedTypeName = this.expectedTypeName
    return info
  }
}

const WARN_UNSET = 1
const WARN_INVALID = 2
const WARN_NO_SINK = 4

/**
 * Which policy warnings were printed, one bit per condition: our stand-in for upstream's debug asserts
 * (HTNCallTermError.h:82-88), since a scene cannot abort. One per engine (each PlanRunner, each decompose call),
 * so a misconfigured planner warns once per condition, not once per call.
 */
export class CallTermWarnings {
  private printed = 0

  /** The warning condition of `policy` / `sink` (0: the error is reported, or silent by choice). */
  static condition(policy: CallTermErrorPolicy | undefined, sink: unknown): number {
    if (policy === 'fail_silently') return 0
    if (policy === 'report') return sink === undefined ? WARN_NO_SINK : 0
    return policy === undefined || policy === 'unset' ? WARN_UNSET : WARN_INVALID
  }

  /** True when an error would be neither reported nor warned about: the caller can skip building its info. */
  quiet(policy: CallTermErrorPolicy | undefined, sink: unknown): boolean {
    const c = CallTermWarnings.condition(policy, sink)
    return c === 0 ? policy === 'fail_silently' : (this.printed & c) !== 0
  }

  /** Print the warning for `condition` with the error that raised it, once; later calls do nothing. */
  warn(condition: number, policy: unknown, info: CallTermErrorInfo): void {
    if ((this.printed & condition) !== 0) return
    this.printed |= condition
    const what =
      condition === WARN_UNSET
        ? 'Configure the callterm error policy explicitly (PlannerOptions.calltermErrorPolicy)'
        : condition === WARN_NO_SINK
          ? 'Report policy requires a callterm error callback (onDiagnostic)'
          : `Invalid callterm error policy '${String(policy)}'`
    // The SDK7 scene console types only log / error: warn where the runtime has it, else log (never throw here).
    const c = console as { warn?: (message: string) => void; log(message: string): void }
    const text = `[htn] ${what}. Callterm errors fail the call, unreported; shown once. First: ${calltermMessage(info)}`
    if (typeof c.warn === 'function') c.warn(text)
    else c.log(text)
  }
}

/**
 * Upstream HTNCallTerm_ReportError: dispatch one callterm error by policy; then the call fails normally.
 * 'fail_silently' does nothing; 'report' calls `sink` with a RuntimeDiagnostic. 'unset', an invalid policy, or
 * 'report' without a sink: upstream asserts in debug builds and does nothing in release builds; ours does nothing
 * but print a console.warn naming the error, once per `warnings` and condition (default: a fresh `warnings`, so
 * every call warns). Never throws.
 */
export function reportCalltermError(
  policy: CallTermErrorPolicy | undefined,
  sink: ((d: RuntimeDiagnostic) => void) | undefined,
  info: CallTermErrorInfo,
  warnings: CallTermWarnings = new CallTermWarnings()
): void {
  const condition = CallTermWarnings.condition(policy, sink)
  if (condition !== 0) warnings.warn(condition, policy, info)
  else if (sink !== undefined && policy === 'report') sink(calltermDiagnostic(info))
}

const REASON_TEXT: Record<CallTermErrorReason, string> = {
  not_registered: 'not registered',
  missing_binding: 'no callable bound',
  missing_instance: 'daemon instance missing',
  argument_count_mismatch: 'argument count mismatch',
  argument_type_mismatch: 'incompatible argument type',
  argument_conversion_failed: 'argument conversion failed',
  return_conversion_failed: 'return conversion failed',
  non_boolean_condition_result: 'non-boolean condition result'
}

/** A one-line text for a callterm error, after upstream's demo reporter (HTNDemoCallTermReporting.h:24-53). */
export function calltermMessage(info: CallTermErrorInfo): string {
  const n = info.name
  const where = info.source === undefined ? '' : ` at ${info.source.file}:${info.source.line}:${info.source.col}`
  switch (info.reason) {
    case 'not_registered':
      return `Callterm '${n}' is not registered${where}`
    case 'missing_binding':
      return `Callterm '${n}' has no callable bound${where}`
    case 'missing_instance':
      return `Callterm '${n}' needs daemon '${info.daemon ?? '?'}', which has no instance${where}`
    case 'argument_count_mismatch':
      return `Callterm '${n}' takes ${info.expectedArgumentCount ?? '?'} argument(s), got ${info.actualArgumentCount ?? '?'}${where}`
    case 'argument_type_mismatch':
      return `Callterm '${n}' argument ${(info.argumentIndex ?? 0) + 1}: expected ${info.expectedType ?? 'a bound value'}, got ${info.actualType}${where}`
    case 'argument_conversion_failed':
      return `Callterm '${n}' argument ${(info.argumentIndex ?? 0) + 1}: conversion to ${info.expectedTypeName ?? info.expectedType} failed${where}`
    case 'return_conversion_failed':
      return `Callterm '${n}' result: conversion from ${info.expectedTypeName ?? info.expectedType ?? 'its value'} failed${where}`
    case 'non_boolean_condition_result':
      return `Standalone callterm '${n}' returned ${info.actualType}, expected bool${where}. A standalone callterm is a ` +
        `condition: bind or compare its result explicitly, e.g. (= ?result (call ${n} ...))`
  }
}

/**
 * The RuntimeDiagnostic for a callterm error: code 'missing_callterm' (not_registered, missing_binding,
 * missing_instance), 'non_boolean_condition_result', or 'callterm_error' (the others); `callterm` and
 * `calltermError` always set.
 */
export function calltermDiagnostic(info: CallTermErrorInfo): RuntimeDiagnostic {
  const code =
    info.reason === 'not_registered' || info.reason === 'missing_binding' || info.reason === 'missing_instance'
      ? 'missing_callterm'
      : info.reason === 'non_boolean_condition_result'
        ? 'non_boolean_condition_result'
        : 'callterm_error'
  const d: RuntimeDiagnostic = { code, message: calltermMessage(info), callterm: info.name, calltermError: info }
  if (info.source !== undefined) d.source = { file: info.source.file, line: info.source.line, col: info.source.col }
  return d
}

export interface InvokeCalltermOptions {
  callterms?: CallTermRegistry
  daemons?: CallTermDaemons
  context?: unknown
  calltermErrorPolicy?: CallTermErrorPolicy
  onDiagnostic?: (d: RuntimeDiagnostic) => void
  /** Provenance for the report, if any (upstream Execute's HTNCallTermSource). */
  source?: CallTermSource
}

/**
 * Invoke one callterm outside a decomposition, under the same checks and policy as the planner (upstream
 * HTNCallTermRegistry::Execute). For host tests of bindings. `undefined`: the call failed.
 */
export function invokeCallterm(name: string, args: readonly Atom[], options: InvokeCalltermOptions = {}): Atom | undefined {
  const invoker = new CallTermInvoker()
  const result = invoker.invoke(options.callterms ?? {}, options.daemons, name, args, options.context)
  if (invoker.reason === undefined) return result
  if (options.calltermErrorPolicy === 'fail_silently') return undefined
  const info = invoker.info()
  if (options.source !== undefined) info.source = options.source
  reportCalltermError(options.calltermErrorPolicy, options.onDiagnostic, info)
  return undefined
}

// ---------------------------------------------------------------------------------------------------------------
// Call sites and validation (HTNCallTermRegistry.h:232-236, .cpp:86-111; MISSING_CALLTERMS.md:167-203)

/** A `(call ...)` in the domain: a standalone condition or a value. */
export type CallNode = Extract<CondIR, { k: 'call' }> | Extract<ExprIR, { k: 'call' }>

export interface CallSite {
  name: string
  node: CallNode
  site: CallTermSite
  source?: CallTermSource
}

/**
 * Every `(call ...)` of the domain, once per source position (shared bodies are listed once), in IR order:
 * methods (each branch's condition, then its tasks' arguments), then axioms; an outer call before its arguments.
 * Unreachable branches included (upstream callterm_requirements).
 */
export function callSites(domain: DomainIR): CallSite[] {
  const out: CallSite[] = []
  const seen = new Set<string>()
  walkCalls(domain, (node, site) => {
    const s = node.source
    if (s !== undefined) {
      const key = `${node.name}@${s.file}:${s.line}:${s.col}`
      if (seen.has(key)) return
      seen.add(key)
    }
    out.push({ name: node.name, node, site, source: s === undefined ? undefined : sourceOf(s, site.domain) })
  })
  // Compiler-pruned bodies still contribute their original validation requirements and source positions.
  for (const entry of domain.prunedCallSites ?? []) out.splice(entry.index, 0, entry.call)
  return out
}

/**
 * Upstream ValidateGeneratedCallTerms: check every call site without running anything, for not_registered,
 * missing_binding and missing_instance in that order; one report per failing site (a name called at three places
 * reports three times). Empty: every call site is bound. No argument type checks; no error policy.
 */
export function validateCallterms(
  domain: DomainIR,
  callterms: CallTermRegistry | undefined,
  daemons?: CallTermDaemons
): CallTermErrorInfo[] {
  const out: CallTermErrorInfo[] = []
  const registry = callterms ?? {}
  for (const c of callSites(domain)) {
    const reason = checkEntry(registry, daemons, c.name)
    if (reason === undefined) continue
    const info: CallTermErrorInfo = { name: c.name, reason, site: c.site }
    const fn = registry[c.name]
    if (typeof fn === 'function' && fn.daemon !== undefined) info.daemon = fn.daemon
    if (c.source !== undefined) info.source = c.source
    out.push(info)
  }
  return out
}

/** Upstream CheckEntry (HTNCallTermRegistry.cpp:72-84). */
function checkEntry(callterms: CallTermRegistry, daemons: CallTermDaemons | undefined, name: string): CallTermErrorReason | undefined {
  if (!hasOwn.call(callterms, name)) return 'not_registered'
  const fn = callterms[name]
  if (typeof fn !== 'function') return 'missing_binding'
  if (fn.daemon === undefined) return undefined
  const instance = daemons !== undefined && hasOwn.call(daemons, fn.daemon) ? daemons[fn.daemon] : undefined
  return instance === undefined || instance === null ? 'missing_instance' : undefined
}

/** Call node → where it is, for reports. Built on the first error of an engine. */
export function callSiteIndex(domain: DomainIR): Map<CallNode, CallSite> {
  const index = new Map<CallNode, CallSite>()
  walkCalls(domain, (node, site) => {
    if (!index.has(node)) {
      const s = node.source
      index.set(node, { name: node.name, node, site, source: s === undefined ? undefined : sourceOf(s, site.domain) })
    }
  })
  return index
}

const sourceOf = (s: SourceLoc, domain: string): CallTermSource => ({ domain, file: s.file, line: s.line, col: s.col })

function walkCalls(domain: DomainIR, visit: (node: CallNode, site: CallTermSite) => void): void {
  let site: CallTermSite
  const expr = (e: TermIR): void => {
    switch (e.k) {
      case 'call':
        visit(e, site)
        e.args.forEach(expr)
        return
      case 'list':
        e.items.forEach(expr)
        return
      case 'arith':
        e.args.forEach(expr)
        return
    }
  }
  const cond = (c: CondIR | null): void => {
    if (c === null) return
    switch (c.k) {
      case 'and':
      case 'or':
      case 'alt':
        c.items.forEach(cond)
        return
      case 'not':
        cond(c.item)
        return
      case 'fact':
      case 'axiom':
        c.args.forEach(expr)
        return
      case 'call':
        visit(c, site)
        c.args.forEach(expr)
        return
      case 'assign':
        expr(c.expr)
        return
      case 'cmp':
        expr(c.a)
        expr(c.b)
        return
      case 'split':
        expr(c.list)
        expr(c.a)
        expr(c.b)
        return
    }
  }
  for (const m of domain.methods) {
    for (const b of m.branches) {
      site = { kind: 'method', domain: m.domain, method: m.name, branch: b.name }
      cond(b.cond)
      for (const t of b.tasks) t.args.forEach(expr)
    }
  }
  for (const a of domain.axioms) {
    site = { kind: 'axiom', domain: a.domain, axiom: a.name }
    cond(a.cond)
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Standard list callterms (HTNFramework/src/AI/AIHtnListDaemon.cpp:8-53)

/**
 * Upstream AIHtnListDaemon::BindCallTerms, typed like upstream's static bindings: `list_add list value` (a copy
 * with value appended), `list_remove_at list index`, `list_get list index` (a negative or out-of-range index is an
 * ordinary failure), `list_size list` (int), `list_clear list` (an empty list). Spread into your callterms.
 */
export const listCallterms: Readonly<Record<'list_add' | 'list_remove_at' | 'list_get' | 'list_size' | 'list_clear', CallTerm>> = {
  list_add: callterm(['list', 'any'], (items, value) => list(...items, value)),
  list_remove_at: callterm(['list', 'int'], (items, index) =>
    index < 0 || index >= items.length ? undefined : list(...items.slice(0, index), ...items.slice(index + 1))),
  list_get: callterm(['list', 'int'], (items, index) => (index < 0 ? undefined : items[index])),
  list_size: callterm(['list'], items => items.length, 'int'),
  list_clear: callterm(['list'], () => list())
}
