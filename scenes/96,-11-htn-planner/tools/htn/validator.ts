// Semantic validation of the loaded modules. Port of upstream
// Translator/HTNCompilerDomainValidator.cpp and Parser/HTNAssignmentScope.h.
import { signature } from './ast'
import type { Axiom, Cond, Domain, Method, Value } from './ast'
import { rangeOf, reportDiagnostic } from './diagnostics'
import type { Diagnostic, DiagnosticRecovery, Loc } from './diagnostics'

export interface ValidationContext {
  modules: Domain[] // post-order, root last
  files: string[]
  diagnostics: Diagnostic[]
  requireTopLevelRoot: boolean
}

const isDiscard = (name: string) => name.startsWith('any_')

export function validateModules(ctx: ValidationContext): boolean {
  const { modules, files } = ctx
  let valid = true
  // Recoverable, except a duplicate domain id: dependent (upstream HTNCompilerDomainValidator.cpp:33, :469).
  const error = (loc: Loc, code: string, message: string, recovery: DiagnosticRecovery = 'recoverable') => {
    reportDiagnostic(ctx.diagnostics, { severity: 'error', recovery, code, message, file: files[loc.file] ?? '', ...rangeOf(loc) })
    valid = false
  }
  const failed = (name: string) => modules.some(m => m.failedNames.has(name))
  const root = modules[modules.length - 1]

  if (ctx.requireTopLevelRoot && !root.isTopLevel) error(root.loc, 'root-not-top-level', 'Root domain must be top_level_domain')
  const domainIds = new Set<string>()
  let topLevelMethods = 0
  for (const module of modules) {
    if (domainIds.has(module.name)) error(module.loc, 'duplicate-domain', `Duplicate domain id '${module.name}'`, 'dependent')
    domainIds.add(module.name)
    if (module !== root && module.isTopLevel)
      error(module.loc, 'included-top-level-domain', 'Included domain cannot be top_level_domain')
    for (const method of module.methods) {
      if (method.topLevel) topLevelMethods++
      if (module !== root && method.topLevel)
        error(
          method.loc,
          'top-level-method-in-include',
          `Included domain '${module.name}' cannot declare top_level_method '${method.name}'`
        )
      for (const param of method.params)
        if (!param.name.startsWith('inp_'))
          error(
            param.loc,
            'invalid-parameter-prefix',
            `Method '${method.name}' parameter '?${param.name}' must use the inp_ prefix`
          )
      validateMethodVariables(method, error)
    }
    for (const axiom of module.axioms) {
      validateAssignments(axiom.body, axiom.params, true, error)
      const variables = new Set(axiom.params.map(p => p.name))
      declareVariables(axiom.body, variables)
      validateConditionVariables(axiom.body, variables, new Set(), error)
    }
    for (const axiom of module.axioms)
      for (const param of axiom.params)
        if (!param.name.startsWith('inp_') && !param.name.startsWith('out_') && !param.name.startsWith('io_'))
          error(
            param.loc,
            'invalid-parameter-prefix',
            `Axiom '${axiom.name}' parameter '?${param.name}' must use an inp_, out_ or io_ prefix`
          )
  }
  if (ctx.requireTopLevelRoot && root.isTopLevel && topLevelMethods === 0 && !root.failedNames.size)
    error(root.loc, 'no-top-level-method', 'Root top_level_domain has no top_level_method')

  validateOverrideChains(modules, error)

  // Compound/deferred calls: by `name/arity` or `Domain::name/arity`.
  const methodSigs = new Set<string>()
  const methodNames = new Set<string>()
  for (const module of modules)
    for (const method of module.methods) {
      for (const name of [method.name, `${module.name}::${method.name}`]) {
        methodSigs.add(signature(name, method.params.length))
        methodNames.add(name)
      }
    }
  for (const module of modules)
    for (const method of module.methods)
      for (const branch of method.branches)
        for (const task of branch.tasks) {
          if (task.kind === 'prim' || methodSigs.has(signature(task.name, task.args.length))) continue
          if (failed(task.name.split('::').pop()!)) continue // its declaration already failed to parse
          error(
            task.loc,
            methodNames.has(task.name) ? 'arity-mismatch' : 'unknown-method',
            `${task.kind === 'defer' ? 'Deferred' : 'Compound'} method call '${task.name}' cannot be resolved at link time: ` +
              `no overload accepts ${task.args.length} argument(s)`
          )
        }

  const axiomSigs = new Set<string>()
  const axiomNames = new Set<string>()
  for (const module of modules)
    for (const axiom of module.axioms)
      for (const name of [axiom.name, `${module.name}::${axiom.name}`]) {
        axiomSigs.add(signature(name, axiom.params.length))
        axiomNames.add(name)
      }
  const checkAxiomCalls = (cond: Cond | null) => {
    if (!cond) return
    if (cond.kind === 'axiom' && !axiomSigs.has(signature(cond.name, cond.args.length)) && !failed('#' + cond.name.split('::').pop()))
      error(
        cond.loc,
        axiomNames.has(cond.name) ? 'arity-mismatch' : 'unknown-axiom',
        `Axiom call '${cond.name}' cannot be resolved at link time: no overload accepts ${cond.args.length} argument(s)`
      )
    for (const child of children(cond)) checkAxiomCalls(child)
  }
  for (const module of modules) {
    for (const method of module.methods) for (const branch of method.branches) checkAxiomCalls(branch.cond)
    for (const axiom of module.axioms) checkAxiomCalls(axiom.body)
  }
  validateAxiomCycles(modules, error)
  return valid
}

type Report = (loc: Loc, code: string, message: string) => void

export function children(cond: Cond): Cond[] {
  return cond.kind === 'and' || cond.kind === 'or' || cond.kind === 'alt' ? cond.children : cond.kind === 'not' ? [cond.child] : []
}

/** Upstream Condition::Arguments in AST order (assignment: the initializer; comparison: both sides). */
export function conditionArguments(cond: Cond): Value[] {
  switch (cond.kind) {
    case 'fact':
    case 'axiom':
    case 'call':
    case 'split':
      return cond.args
    case 'assign':
      return [cond.expr]
    case 'cmp':
      return [cond.a, cond.b]
    default:
      return []
  }
}

function collectUses(value: Value, uses: string[]): void {
  if (value.kind === 'var') uses.push(value.name)
  if (value.kind === 'call' || value.kind === 'arith') for (const arg of value.args) collectUses(arg, uses)
  if (value.kind === 'list') for (const item of value.items) collectUses(item, uses)
}

// HTNValidateAssignmentScope: a destination must not be declared or mentioned earlier on its path.
function validateAssignments(cond: Cond | null, params: { name: string }[], isAxiom: boolean, report: Report): void {
  // Axiom output/IO parameters declare slots that their first use may initialize.
  const seen = new Set(
    params.map(p => p.name).filter(name => !isAxiom || (!name.startsWith('out_') && !name.startsWith('io_')))
  )
  const inputs = new Set(params.map(p => p.name).filter(name => name.startsWith('inp_')))
  const visit = (node: Cond, seen: Set<string>) => {
    const uses: string[] = []
    for (const arg of conditionArguments(node)) collectUses(arg, uses)
    for (const use of uses) seen.add(use)
    if (node.kind === 'assign') {
      const dest = node.dest.name
      if (seen.has(dest))
        report(
          node.loc,
          inputs.has(dest) ? 'assignment-to-input' : 'reassignment',
          `Assignment destination '?${dest}' has already been declared or used; assignment must declare a fresh variable`
        )
      seen.add(dest)
    }
    const entry = new Set(seen)
    for (const child of children(node)) {
      if (node.kind === 'or' || node.kind === 'alt' || node.kind === 'not') {
        const branch = new Set(entry)
        visit(child, branch)
        // A later declaration cannot reuse a name mentioned in any alternative.
        for (const name of branch) seen.add(name)
      } else visit(child, seen)
    }
  }
  if (cond) visit(cond, seen)
}

/** Every variable a condition can bind anywhere (upstream DeclareVariables): order-insensitive. */
function declareVariables(cond: Cond | null, variables: Set<string>): void {
  if (!cond) return
  switch (cond.kind) {
    case 'fact':
    case 'axiom':
      for (const arg of cond.args) if (arg.kind === 'var') variables.add(arg.name)
      break
    case 'assign':
      variables.add(cond.dest.name)
      break
    case 'split':
      for (const arg of cond.args.slice(1)) if (arg.kind === 'var') variables.add(arg.name)
      break
    case 'call':
    case 'cmp':
      break
    default:
      for (const child of children(cond)) declareVariables(child, variables)
  }
}

function validateValueUse(value: Value, variables: Set<string>, usage: string, report: Report): void {
  if (value.kind === 'var' && !variables.has(value.name))
    report(value.loc, 'unknown-variable', `Unknown variable '${value.name}' used by ${usage}.`)
  if (value.kind === 'call')
    for (const arg of value.args) validateValueUse(arg, variables, `call expression '${value.name}'`, report)
  if (value.kind === 'arith') for (const arg of value.args) validateValueUse(arg, variables, usage, report)
  if (value.kind === 'list') for (const item of value.items) validateValueUse(item, variables, 'a runtime list element', report)
}

function checkDiscardUse(value: Value | undefined, usage: string, report: Report): void {
  if (value && value.kind === 'var' && isDiscard(value.name))
    report(
      value.loc,
      'discard-consumed',
      `Singleton variable '?${value.name}' may only be used as a fact argument; it is never bound and cannot be consumed by ${usage}.`
    )
}

function validateConditionVariables(cond: Cond | null, variables: Set<string>, singletons: Set<string>, report: Report): void {
  if (!cond) return
  // Fact/axiom arguments may bind bare variables, but nested list elements are reads.
  if (cond.kind === 'fact' || cond.kind === 'axiom')
    for (const arg of cond.args)
      if (arg.kind !== 'var') validateValueUse(arg, variables, 'a fact or axiom value argument', report)
  switch (cond.kind) {
    case 'fact':
      for (const arg of cond.args)
        if (arg.kind === 'var' && isDiscard(arg.name)) {
          if (singletons.has(arg.name))
            report(arg.loc, 'discard-reused', `Singleton variable '?${arg.name}' may only appear once in the same scope.`)
          singletons.add(arg.name)
        }
      break
    case 'axiom':
      break
    case 'assign':
    case 'call': {
      const usage = cond.kind === 'assign' ? 'an assignment' : `callterm '${cond.name}'`
      for (const arg of conditionArguments(cond)) {
        checkDiscardUse(arg, usage, report)
        validateValueUse(arg, variables, usage, report)
      }
      if (cond.kind === 'assign') checkDiscardUse(cond.dest, 'an assignment destination', report)
      break
    }
    case 'cmp':
    case 'split':
      conditionArguments(cond).forEach((arg, i) => {
        const usage = cond.kind === 'cmp' ? 'a built-in comparison' : i === 0 ? 'split_list input' : 'split_list output'
        checkDiscardUse(arg, usage, report)
        validateValueUse(arg, variables, usage, report)
      })
      break
    default:
      for (const child of children(cond)) validateConditionVariables(child, variables, singletons, report)
  }
}

function validateMethodVariables(method: Method, report: Report): void {
  const params = method.params.map(p => p.name)
  for (const branch of method.branches) {
    const variables = new Set(params)
    validateAssignments(branch.cond, method.params, false, report)
    declareVariables(branch.cond, variables)
    validateConditionVariables(branch.cond, variables, new Set(), report)
    for (const task of branch.tasks) {
      const usage = `${task.kind === 'prim' ? 'primitive task' : task.kind === 'defer' ? 'deferred call' : 'compound task'} '${task.name}'`
      for (const arg of task.args) {
        checkDiscardUse(arg, usage, report)
        validateValueUse(arg, variables, usage, report)
      }
    }
  }
}

function validateOverrideChains(modules: Domain[], report: Report): void {
  const baseDomains = new Map<string, boolean>()
  for (const module of modules) if (!baseDomains.has(module.name)) baseDomains.set(module.name, module.isBase)

  const qualifiedConstants = new Set<string>()
  const constantOwner = new Map<string, string>()
  const constantSpecialization = new Map<string, boolean>()

  type Decl = Method | Axiom
  const overrideState = () => ({
    qualified: new Map<string, Decl>(),
    owner: new Map<string, string>(),
    specialization: new Map<string, boolean>()
  })
  const axiomState = overrideState()
  const methodState = overrideState()

  const validateOverride = (module: Domain, decl: Decl, kind: string, state: ReturnType<typeof overrideState>) => {
    const key = signature(decl.name, decl.params.length)
    const qualifiedId = `${module.name}::${key}`
    if (decl.isBase && !module.isBase) {
      report(
        decl.loc,
        'base-outside-base-domain',
        `${kind} '${qualifiedId}' is declared base but domain '${module.name}' is not a base domain`
      )
      return
    }
    if (state.qualified.has(qualifiedId)) {
      report(decl.loc, 'duplicate-signature', `Duplicate ${kind} declaration '${qualifiedId}'`)
      return
    }
    if (decl.overrides) {
      const baseQualifiedId = `${decl.overrides}::${key}`
      const base = state.qualified.get(baseQualifiedId)
      if (
        !base ||
        !baseDomains.get(decl.overrides) ||
        !state.specialization.get(baseQualifiedId) ||
        base.params.length !== decl.params.length ||
        state.owner.get(key) !== decl.overrides
      ) {
        report(decl.loc, 'invalid-override', `Invalid ${kind} override '${qualifiedId}' of '${baseQualifiedId}'`)
        return
      }
      state.specialization.set(qualifiedId, module.isBase)
    } else {
      if (state.owner.has(key)) {
        report(decl.loc, 'duplicate-signature', `${kind} '${decl.name}' already exists in domain '${state.owner.get(key)}'`)
        return
      }
      state.specialization.set(qualifiedId, decl.isBase)
    }
    state.qualified.set(qualifiedId, decl)
    state.owner.set(key, module.name)
  }

  for (const module of modules) {
    for (const group of module.groups) {
      const groupId = `${module.name}::${group.name}`
      if (group.isBase && !module.isBase) {
        report(
          group.loc,
          'base-outside-base-domain',
          `Constants block '${groupId}' is declared base but domain '${module.name}' is not a base domain`
        )
        continue
      }
      if (group.overrides && !baseDomains.get(group.overrides)) {
        report(group.loc, 'invalid-override', `Constants block '${groupId}' overrides missing or non-base domain '${group.overrides}'`)
        continue
      }
      for (const constant of group.constants) {
        const qualifiedId = `${module.name}::${constant.name}`
        if (!group.overrides) {
          if (constantOwner.has(constant.name)) {
            report(
              constant.loc,
              'duplicate-constant',
              `Constant '${constant.name}' already exists in domain '${constantOwner.get(constant.name)}'`
            )
            continue
          }
          constantSpecialization.set(qualifiedId, group.isBase)
        } else {
          const baseQualifiedId = `${group.overrides}::${constant.name}`
          if (
            !qualifiedConstants.has(baseQualifiedId) ||
            !constantSpecialization.get(baseQualifiedId) ||
            constantOwner.get(constant.name) !== group.overrides
          ) {
            report(constant.loc, 'invalid-override', `Invalid constant override '${qualifiedId}' of '${baseQualifiedId}'`)
            continue
          }
          constantSpecialization.set(qualifiedId, module.isBase)
        }
        qualifiedConstants.add(qualifiedId)
        constantOwner.set(constant.name, module.name)
      }
    }
    for (const axiom of module.axioms) validateOverride(module, axiom, 'Axiom', axiomState)
    for (const method of module.methods) validateOverride(module, method, 'Method', methodState)
  }
}

// Upstream checks the linked axiom list (qualified aliases, then effective declarations); an
// unqualified call targets the effective (last in post-order) declaration of that signature.
function validateAxiomCycles(modules: Domain[], report: Report): void {
  interface Node {
    id: string
    axiom: Axiom
  }
  const nodes: Node[] = []
  const byId = new Map<string, number>()
  const effective = new Map<string, Axiom>()
  for (const module of modules) for (const axiom of module.axioms) effective.set(signature(axiom.name, axiom.params.length), axiom)
  const add = (id: string, axiom: Axiom) => {
    if (!byId.has(id)) byId.set(id, nodes.length)
    nodes.push({ id, axiom })
  }
  for (const module of modules)
    for (const axiom of module.axioms) add(signature(`${module.name}::${axiom.name}`, axiom.params.length), axiom)
  for (const module of modules)
    for (const axiom of module.axioms) {
      const sig = signature(axiom.name, axiom.params.length)
      if (effective.get(sig) === axiom) add(sig, axiom)
    }
  const calls = (cond: Cond | null, out: string[]) => {
    if (!cond) return
    if (cond.kind === 'axiom') out.push(signature(cond.name, cond.args.length))
    for (const child of children(cond)) calls(child, out)
  }
  const states = nodes.map(() => 0)
  const stack: number[] = []
  const visit = (index: number): boolean => {
    states[index] = 1
    stack.push(index)
    const out: string[] = []
    calls(nodes[index].axiom.body, out)
    for (const call of out) {
      const target = byId.get(call)
      if (target === undefined) continue
      if (states[target] === 0) {
        if (!visit(target)) return false
      } else if (states[target] === 1) {
        const cycle = stack.slice(stack.indexOf(target)).map(i => nodes[i].id)
        const smallest = cycle.reduce((best, id, i) => (id < cycle[best] ? i : best), 0)
        const rotated = [...cycle.slice(smallest), ...cycle.slice(0, smallest)]
        report(nodes[index].axiom.loc, 'axiom-cycle', `Cyclic axiom dependency: ${[...rotated, rotated[0]].join(' -> ')}`)
        return false
      }
    }
    stack.pop()
    states[index] = 2
    return true
  }
  for (let i = 0; i < nodes.length; i++) if (states[i] === 0 && !visit(i)) return
}
