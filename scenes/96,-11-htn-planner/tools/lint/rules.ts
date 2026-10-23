// htn:lint rules after the compile layer. Each finding gives a location, explanation and concrete fix.
// Layers run cheapest first: symbols, then structure. Reference: docs/htn-lint.md.
import type { Branch, Cond, Method } from '../htn/ast'
import type { Loc } from '../htn/diagnostics'
import type { EffectiveConfig, RuleConfig, Severity, SeverityCaps } from './config'
import { nameMatcher } from './config'
import { isBookkeepingOnly, isPrimitiveOnly } from './metrics'
import type { TailGroup } from './metrics'
import { crossDomainDuplicates } from './corpus'
import type { CorpusDomain, DupPlace } from './corpus'
import { condValues, directComponents, reachableMethods, taskHead, unconditional, walkCond, walkValue } from './model'
import type { Decl, DomainModel } from './model'
import { condShape, subsumes } from './subsume'
import type { CondShape } from './subsume'

export type Layer = 'compile' | 'symbols' | 'structure'

export interface Place {
  loc: Loc
  method?: Decl<Method>
  branch?: string
  /** Corpus rules: the index of the root domain (CorpusDomain) the place is in. */
  at?: number
}

export interface RawFinding extends Place {
  message: string
  fix: string
  related?: Place[]
  data?: Record<string, unknown>
}

export interface RuleContext {
  model: DomainModel
  config: EffectiveConfig
  options: Record<string, unknown>
  bookkeeping: (head: string) => boolean
  tails: TailGroup[]
  source(file: number): string
}

export interface RuleDef {
  id: string
  layer: Exclude<Layer, 'compile'>
  severity: Severity | 'off'
  options: Record<string, unknown>
  why: string
  /** The highest severity a config may set, and why (a config asking for more is a config error). */
  cap?: { max: Severity; why: string }
  /** A rule over one root domain. */
  run?(ctx: RuleContext): RawFinding[]
  /**
   * A rule over every root domain of the run that reached it (its structure layer ran, the rule is not off for it),
   * after they are all linted; each place says its domain (`at`).
   */
  runCorpus?(domains: CorpusDomain[], options: Record<string, unknown>): RawFinding[]
}

const num = (ctx: RuleContext, key: string): number => {
  const v = ctx.options[key]
  return typeof v === 'number' ? v : Number(v)
}
const list = (ctx: RuleContext, key: string): string[] => {
  const v = ctx.options[key]
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}
/** Top-level methods that are not upkeep units (`upkeepMethods`, default `reasoning`): upkeep is their job. */
const decisionTops = (ctx: RuleContext): number[] => {
  const upkeep = new Set(list(ctx, 'upkeepMethods'))
  return ctx.model.top.filter(id => !upkeep.has(ctx.model.methods[id].decl.name))
}
const quote = (names: string[], max = 6) => names.slice(0, max).map(n => `'${n}'`).join(', ') + (names.length > max ? `, … (${names.length} in all)` : '')
const at = (method: Decl<Method>, branch?: Branch): Place => (branch ? { loc: branch.loc, method, branch: branch.name } : { loc: method.decl.loc, method })

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = tmp
    }
  }
  return row[b.length]
}

/** Per method: the shape of each branch condition, cached on the AST node (a new AST per lint run). */
const shapes = new WeakMap<Method, CondShape[]>()
function shapesOf(method: Method): CondShape[] {
  let s = shapes.get(method)
  if (!s) {
    const params = new Set(method.params.map(p => p.name))
    s = method.branches.map(b => condShape(b, params))
    shapes.set(method, s)
  }
  return s
}

/** A contract belongs to the adjacent // comment block, not another method or the domain header. */
function hasContract(source: string, line: number): boolean {
  const lines = source.split(/\r?\n/)
  const comments: string[] = []
  for (let i = line - 2; i >= 0; i--) {
    const text = lines[i].trim()
    if (!text) continue
    if (!text.startsWith('//')) break
    comments.unshift(text.slice(2).trim())
  }
  const start = comments.findIndex(s => /^Contract:/.test(s))
  return start >= 0 && comments.slice(start).join(' ').slice('Contract:'.length).trim().length > 0
}

/** Compare fact tests, not predicate names: stage(prep) and stage(cook) are different tests. */
function factTests(b: Branch, params: ReadonlySet<string>): Map<string, string> {
  const out = new Map<string, string>()
  walkCond(b.cond, (n, negated) => {
    if (n.kind !== 'fact') return
    const shape = condShape({ ...b, cond: n }, params)
    const vars = new Map<string, number>()
    const key = JSON.stringify([negated, shape.literals], (name, value) => {
      if (name !== 'v') return value
      if (!vars.has(value)) vars.set(value, vars.size)
      return vars.get(value)
    })
    out.set(key, `${n.name}/${n.args.length}`)
  })
  return out
}

export const RULES: RuleDef[] = [
  {
    id: 'missing-contract',
    layer: 'structure',
    severity: 'off',
    options: {},
    why: 'A compound task needs its entry conditions and outcome written down; lint checks presence, review checks meaning. Enable for authored domains, not verbatim fixtures.',
    run(ctx) {
      return ctx.model.methods.filter(m => !m.decl.topLevel && !hasContract(ctx.source(m.decl.loc.file), m.decl.loc.line))
        .map(m => ({
          ...at(m),
          message: `compound task '${m.sig}' has no adjacent nonempty // Contract: comment`,
          fix: 'write // Contract: above this method: what it needs, what it achieves, and any re-entry assumptions'
        }))
    }
  },
  // ---------------------------------------------------------------- symbols
  {
    id: 'unknown-primitive',
    layer: 'symbols',
    severity: 'error',
    options: {},
    why: 'A primitive needs a matching host executor. Otherwise the host may reject it or run a diagnostic no-op; the domain does not establish the intended action.',
    run(ctx) {
      const known = ctx.config.primitives
      if (!known) return []
      const isKnown = nameMatcher(known)
      const seen = new Map<string, { place: Place; count: number }>()
      for (const m of ctx.model.methods)
        for (const b of m.decl.branches)
          for (const t of b.tasks) {
            if (t.kind !== 'prim') continue
            const head = taskHead(t)
            if (isKnown(head)) continue
            const entry = seen.get(head)
            if (entry) entry.count++
            else seen.set(head, { place: { loc: t.loc, method: m, branch: b.name }, count: 1 })
          }
      const plain = known.filter(k => !/[*?]/.test(k))
      return [...seen.entries()].map(([head, { place, count }]) => {
        const near = plain.map(k => ({ k, d: editDistance(k, head) })).filter(x => x.d <= Math.max(2, Math.floor(head.length / 4))).sort((a, b) => a.d - b.d)
        return {
          ...place,
          message: `primitive '${head}' is not in the host's primitive list${count > 1 ? ` (used ${count} times)` : ''}`,
          fix: near.length
            ? `did you mean '${near[0].k}'? Otherwise register an executor for '${head}' in the host and add it to "primitives" in the lint config`
            : `use one of the host's primitives (${quote(plain, 10)}), or register an executor for '${head}' and add it to "primitives" in the lint config`,
          data: { primitive: head, occurrences: count, suggestions: near.slice(0, 3).map(x => x.k) }
        }
      })
    }
  },
  {
    id: 'unreachable-method',
    layer: 'symbols',
    severity: 'warning',
    options: {},
    why: 'A method no top-level method reaches never plans; check for a typo in a call or a leftover definition.',
    run(ctx) {
      const reach = reachableMethods(ctx.model)
      const callers = new Map<number, number[]>()
      ctx.model.methods.forEach(m => [...ctx.model.direct[m.id], ...ctx.model.deferred[m.id]].forEach(c => callers.set(c, [...(callers.get(c) ?? []), m.id])))
      return ctx.model.methods
        .filter(m => m.module === ctx.model.root && !m.decl.topLevel && !m.decl.isBase && !reach.has(m.id))
        .map(m => {
          const from = (callers.get(m.id) ?? []).map(id => ctx.model.methods[id].decl.name)
          return {
            ...at(m),
            message: from.length
              ? `method '${m.sig}' is called only from methods no top-level method reaches (${quote(from)})`
              : `method '${m.sig}' is never called`,
            fix: `call it from the branch that needs it (name and arity must match: ${m.sig}), mark it top_level_method if the host plans it directly, or delete it`
          }
        })
    }
  },
  {
    id: 'unused-axiom',
    layer: 'symbols',
    severity: 'warning',
    options: {},
    why: 'An axiom no reachable condition uses is dead code that readers may mistake for live vocabulary.',
    run(ctx) {
      const reach = reachableMethods(ctx.model)
      const used = new Set<number>()
      const queue: number[] = []
      const visitCond = (c: Cond | null) =>
        walkCond(c, n => {
          if (n.kind !== 'axiom') return
          const id = ctx.model.resolveAxiom(n.name, n.args.length)
          if (id !== undefined && !used.has(id)) {
            used.add(id)
            queue.push(id)
          }
        })
      for (const id of reach) for (const b of ctx.model.methods[id].decl.branches) visitCond(b.cond)
      while (queue.length) visitCond(ctx.model.axioms[queue.pop() as number].decl.body)
      return ctx.model.axioms
        .filter(a => a.module === ctx.model.root && !a.decl.isBase && !used.has(a.id))
        .map(a => ({
          loc: a.decl.loc,
          message: `axiom '#${a.sig}' is not used by any condition a top-level method reaches`,
          fix: `use it in a condition, (#${a.decl.name} ...), or delete it`
        }))
    }
  },
  {
    id: 'unused-constant',
    layer: 'symbols',
    severity: 'warning',
    options: {},
    why: 'A named constant nothing reads suggests a tuning value that is not wired in.',
    run(ctx) {
      const used = new Set<string>()
      const visit = (c: Cond | null) => walkCond(c, n => condValues(n).forEach(v => walkValue(v, x => x.kind === 'const' && used.add(x.name))))
      for (const m of ctx.model.methods)
        for (const b of m.decl.branches) {
          visit(b.cond)
          for (const t of b.tasks) t.args.forEach(v => walkValue(v, x => x.kind === 'const' && used.add(x.name)))
        }
      for (const a of ctx.model.axioms) visit(a.decl.body)
      return ctx.model.root.groups
        .filter(g => !g.isBase)
        .flatMap(g => g.constants)
        .filter(c => !used.has(c.name))
        .map(c => ({ loc: c.loc, message: `constant '@${c.name}' is never used`, fix: `use @${c.name} where its literal value is written, or delete it` }))
    }
  },
  {
    id: 'fact-arity-mix',
    layer: 'symbols',
    severity: 'warning',
    // `running`: the agent publishes the running step as (running <action> <args>...), one arity per action.
    options: { variadic: ['running'] },
    why: 'Facts are keyed by name and argument count: reading one with the wrong arity can silently match no rows. Compare the domain with its fact writers.',
    run(ctx) {
      const byName = new Map<string, Map<number, { count: number; place: Place }>>()
      for (const m of ctx.model.methods)
        for (const b of m.decl.branches)
          walkCond(b.cond, n => {
            if (n.kind !== 'fact') return
            const arities = byName.get(n.name) ?? new Map()
            byName.set(n.name, arities)
            const e = arities.get(n.args.length)
            if (e) e.count++
            else arities.set(n.args.length, { count: 1, place: { loc: n.loc, method: m, branch: b.name } })
          })
      const variadic = new Set(Array.isArray(ctx.options.variadic) ? ctx.options.variadic.map(String) : [])
      const out: RawFinding[] = []
      for (const [name, arities] of byName) {
        if (arities.size < 2 || variadic.has(name)) continue
        const sorted = [...arities.entries()].sort((a, b) => b[1].count - a[1].count || a[0] - b[0])
        const [main] = sorted[0]
        for (const [arity, { count, place }] of sorted.slice(1))
          out.push({
            ...place,
            message: `fact '${name}' is read with ${arity} argument(s) here (${count}×) but with ${main} elsewhere (${sorted[0][1].count}×)`,
            fix: `use one arity for '${name}' (${name}/${main}), or give the other shape its own fact name; a fact with one arity per kind by design goes in the rule's "variadic" option`,
            related: [sorted[0][1].place],
            data: { fact: name, arities: Object.fromEntries(sorted.map(([a, e]) => [a, e.count])) }
          })
      }
      return out
    }
  },
  // ---------------------------------------------------------------- structure
  {
    id: 'max-branches',
    layer: 'structure',
    severity: 'warning',
    options: { top: 8, other: 10 },
    why: 'A long branch list can hide priority mistakes. Group related behaviours when it improves readability; the configurable threshold is a review prompt, not a correctness limit.',
    cap: {
      max: 'warning',
      why: 'a smell, not a bug: a long branch list plans correctly, and the thresholds are inferred from the shipped domains, no source states a number; --strict fails on warnings'
    },
    run(ctx) {
      return ctx.model.methods.flatMap(m => {
        const limit = num(ctx, m.decl.topLevel ? 'top' : 'other')
        const n = m.decl.branches.length
        if (n <= limit) return []
        return [
          {
            ...at(m),
            message: `method '${m.decl.name}' has ${n} branches (limit ${limit} for a ${m.decl.topLevel ? 'top-level' : 'sub'} method)`,
            fix: m.decl.topLevel
              ? 'group the branches by intent into 3-8 tier methods (e.g. react, investigate, search, patrol, idle); the root keeps one branch per tier, in priority order'
              : 'split it by situation into sub-methods, or move the shared tests into a parent branch',
            data: { branches: n, limit }
          }
        ]
      })
    }
  },
  {
    id: 'flat-root',
    layer: 'structure',
    severity: 'warning',
    options: { minBranches: 6, maxPrimitiveOnlyShare: 0.5, upkeepMethods: ['reasoning'] },
    why: 'Named compound behaviours can make a large root easier to read. Delegation, continuation and a complete one-action decision remain valid; an upkeep unit is deliberately flat.',
    run(ctx) {
      return decisionTops(ctx).flatMap(id => {
        const m = ctx.model.methods[id]
        const bs = m.decl.branches
        if (bs.length < num(ctx, 'minBranches')) return []
        const flat = bs.filter(isPrimitiveOnly)
        const share = flat.length / bs.length
        if (share <= num(ctx, 'maxPrimitiveOnlyShare')) return []
        return [
          {
            ...at(m),
            message: `${flat.length} of ${bs.length} branches of top-level method '${m.decl.name}' call only primitives: a flat priority list`,
            fix: 'make each root branch call one compound task (a tier such as (combat ?target) or (investigate ?pos)) and move the primitive sequences into that task\'s branches',
            data: { primitiveOnly: flat.length, branches: bs.length, share: Math.round(share * 100) / 100 }
          }
        ]
      })
    }
  },
  {
    id: 'bookkeeping-branch',
    layer: 'structure',
    severity: 'warning',
    options: { upkeepMethods: ['reasoning'] },
    why: 'Belief upkeep can compete with behaviours when placed in the decision root. Use the host or a wired reasoning pass and ensure each pass makes progress.',
    run(ctx) {
      return decisionTops(ctx).flatMap(id => {
        const m = ctx.model.methods[id]
        return m.decl.branches
          .filter(b => isBookkeepingOnly(b, ctx.bookkeeping))
          .map(b => ({
            ...at(m, b),
            message: `top-level branch '${b.name}' only does bookkeeping (${b.tasks.map(taskHead).join(' ')}) and competes with behaviours for priority`,
            fix: 'move this upkeep to the host (facts with a lifetime, a sensor tick) or a separate `reasoning` top-level method; if a behaviour needs the write, make it a step inside that behaviour and put the test in its own condition',
            data: { tasks: b.tasks.map(taskHead) }
          }))
      })
    }
  },
  {
    id: 'duplicated-tail',
    layer: 'structure',
    severity: 'warning',
    options: { minLength: 3 },
    why: 'Copied step sequences can drift when one copy changes. A parameterised compound task may express the shared tail once.',
    run(ctx) {
      const min = num(ctx, 'minLength')
      return ctx.tails
        .filter(g => g.heads.length >= min)
        .map(g => {
          const [first, ...rest] = g.branches
          return {
            ...at(first.method, first.branch),
            message: `the same ${g.heads.length} steps (${g.heads.join(' ')}) end ${g.branches.length} branches: ${quote(g.branches.map(r => `${r.method.decl.name}.${r.branch.name}`))}`,
            fix: `extract them into one compound task, e.g. (:method (<name> <the values they use>) (do () (${g.heads.map(h => `(${h} ...)`).join(' ')}))), and call it at the end of each branch`,
            related: rest.map(r => at(r.method, r.branch)),
            data: { tail: g.heads, branches: g.branches.map(r => `${r.method.decl.name}.${r.branch.name}`) }
          }
        })
    }
  },
  {
    id: 'duplicated-across-domains',
    layer: 'structure',
    severity: 'warning',
    options: { minLength: 3, minSize: 4 },
    why: 'Copied behaviour can drift across domains. Share it through an include when the domains should evolve together; independent teaching fixtures may intentionally differ.',
    runCorpus(domains, options) {
      const opt = (key: string) => Number(options[key])
      const at = (p: DupPlace): Place => (p.branch ? { loc: p.branch.loc, method: p.method, branch: p.branch.name, at: p.domain } : { loc: p.method.decl.loc, method: p.method, at: p.domain })
      const label = (p: DupPlace) => `${domains[p.domain].model.root.name}::${p.method.decl.name}${p.branch ? `.${p.branch.name}` : ''}`
      return crossDomainDuplicates(domains, { minLength: opt('minLength'), minSize: opt('minSize') }).map(g => {
        const [first, ...rest] = g.places
        const names = g.domains.map(i => domains[i].model.root.name)
        const data = { kind: g.kind, domains: names, places: g.places.map(label), ...(g.kind === 'tail' ? { tail: g.heads } : {}) }
        if (g.kind === 'method')
          return {
            ...at(first),
            message: `method '${first.method.sig}' is the same in ${names.length} root domains (${names.join(', ')}), up to variable names and constants: ${quote(g.places.map(label))}`,
            fix: `move it into one shared file, e.g. (:domain Shared ...) with this method, (:include "<shared>.domain") it from each root and delete the copies; where a root needs different values, pass them as parameters or give the shared one \`base\` and that root an \`overrides\``,
            related: rest.map(at),
            data
          }
        return {
          ...at(first),
          message: `the same ${g.heads.length} closing steps (${g.heads.join(' ')}) end branches in ${names.length} root domains (${names.join(', ')}): ${quote(g.places.map(label))}`,
          fix: `extract them into one compound task in a shared :include file, e.g. (:method (<name> <the values they use>) (do () (${g.heads.map(h => `(${h} ...)`).join(' ')}))), include it from each root and call it at the end of each branch`,
          related: rest.map(at),
          data
        }
      })
    }
  },
  {
    id: 'unconditional-not-last',
    layer: 'structure',
    severity: 'warning',
    options: {},
    why: 'First match wins: a branch after an always-true branch is reached only if the earlier tasks fail with branch backtracking enabled.',
    run(ctx) {
      return ctx.model.methods.flatMap(m => {
        const bs = m.decl.branches
        return bs.slice(0, -1).flatMap((b, i) => {
          if (!unconditional(b)) return []
          const later = bs.slice(i + 1).map(x => x.name)
          return [
            {
              ...at(m, b),
              message: `branch '${b.name}' always holds, so the ${later.length} branch(es) after it (${quote(later)}) run only if its tasks fail and the backtracking mode is 'branches'`,
              fix: `move '${b.name}' last as the fallback, or give it a condition; if the fall-through is deliberate, add // htn-lint-disable-next-line unconditional-not-last -- <why> above it`,
              data: { later }
            }
          ]
        })
      })
    }
  },
  {
    id: 'shadowed-branch',
    layer: 'structure',
    severity: 'warning',
    options: {},
    why: 'An earlier branch covers this condition. This branch is reached only if the earlier tasks fail with branch backtracking enabled; check that the ordering is intentional.',
    run(ctx) {
      return ctx.model.methods.flatMap(m => {
        const bs = m.decl.branches
        const s = shapesOf(m.decl)
        return bs.flatMap((b, j) => {
          const i = bs.findIndex((a, k) => k < j && !unconditional(a) && subsumes(s[k], s[j]))
          if (i < 0) return []
          const a = bs[i]
          return [
            {
              ...at(m, b),
              message: `branch '${b.name}' holds only where the earlier '${a.name}' also holds (every test of '${a.name}' is in '${b.name}'), so '${a.name}' always wins`,
              fix: `move '${b.name}' above '${a.name}' (most specific first), or add to '${b.name}' the test that tells it apart`,
              related: [at(m, a)],
              data: { shadowedBy: a.name }
            }
          ]
        })
      })
    }
  },
  {
    id: 'recursion-no-base',
    layer: 'structure',
    severity: 'error',
    options: {},
    why: 'Recursion needs a reachable base branch and progress; otherwise it can only fail or hit the depth limit.',
    run(ctx) {
      const scc = directComponents(ctx.model)
      return scc.members.flatMap((group, g) => {
        if (!scc.recursive[g]) return []
        const inGroup = new Set(group)
        const hasBase = group.some(id =>
          ctx.model.methods[id].decl.branches.some(b => !b.tasks.some(t => t.kind === 'method' && inGroup.has(ctx.model.resolveTask(t) ?? -1)))
        )
        if (hasBase) return []
        const m = ctx.model.methods[group[0]]
        const names = group.map(id => ctx.model.methods[id].decl.name)
        return [
          {
            ...at(m),
            message: `every branch of ${quote(names)} calls back into ${names.length > 1 ? 'the cycle' : `'${m.decl.name}'`}: no branch ends the recursion`,
            fix: 'add a base branch first (the goal reached, the list empty) whose tasks do not recurse; make every recursive step change the state that branch tests',
            data: { cycle: names }
          }
        ]
      })
    }
  },
  {
    id: 'recursion-not-tail',
    layer: 'structure',
    severity: 'warning',
    options: {},
    why: 'Steps after a recursive call wait for it and retain call frames. Tail recursion or deferred runtime iteration may reduce that cost.',
    run(ctx) {
      const scc = directComponents(ctx.model)
      const out: RawFinding[] = []
      for (const m of ctx.model.methods) {
        const g = scc.of[m.id]
        if (!scc.recursive[g]) continue
        const inGroup = new Set(scc.members[g])
        for (const b of m.decl.branches)
          b.tasks.forEach((t, k) => {
            if (k === b.tasks.length - 1 || t.kind !== 'method' || !inGroup.has(ctx.model.resolveTask(t) ?? -1)) return
            out.push({
              loc: t.loc,
              method: m,
              branch: b.name,
              message: `recursive call '${t.name}' is step ${k + 1} of ${b.tasks.length} in branch '${b.name}', not the last`,
              fix: 'make the recursive call the last task: do the per-item steps before it, and the after-the-loop steps in the base branch',
              data: { step: k + 1, steps: b.tasks.length }
            })
          })
      }
      return out
    }
  },
  {
    id: 'order-dependent',
    layer: 'structure',
    severity: 'info',
    options: {},
    why: 'Branch order can express intentional priority. If overlap admits an invalid lower-priority behaviour, encode its eligibility in facts or conditions; otherwise preserve the order.',
    run(ctx) {
      return ctx.model.methods.flatMap(m => {
        const bs = m.decl.branches
        const s = shapesOf(m.decl)
        return bs.slice(0, -1).flatMap((b, j) => {
          if (unconditional(b)) return []
          const earlier = bs.filter((a, i) => i < j && !unconditional(a) && subsumes(s[j], s[i]) && !subsumes(s[i], s[j]))
          if (!earlier.length) return []
          return [
            {
              ...at(m, b),
              message: `branch '${b.name}' also holds wherever the earlier ${quote(earlier.map(a => a.name))} hold${earlier.length > 1 ? '' : 's'}: it relies on coming after ${earlier.length > 1 ? 'them' : 'it'}`,
              fix: `if '${b.name}' must not run in their situations, say so in its own condition (the negated test, or a fact the host keeps), so that no reorder can break it`,
              related: earlier.map(a => at(m, a)),
              data: { dependsOn: earlier.map(a => a.name) }
            }
          ]
        })
      })
    }
  },
  {
    id: 'no-fallback',
    layer: 'structure',
    severity: 'info',
    options: {},
    why: 'An ongoing reactive root usually needs a fallback that lets time pass. Validators and completed goals may deliberately return no plan or an empty plan under their host contract.',
    run(ctx) {
      return ctx.model.top.flatMap(id => {
        const m = ctx.model.methods[id]
        const bs = m.decl.branches
        if (!bs.length || unconditional(bs[bs.length - 1]) || ctx.config.checkMethods.includes(m.decl.name)) return []
        return [
          {
            ...at(m, bs[bs.length - 1]),
            message: `top-level method '${m.decl.name}' has no always-true last branch: when nothing matches, there is no plan`,
            fix: 'end it with a fallback branch, (idle () ((!wait 1.0))), that takes time rather than succeeding instantly; if no plan is the intended answer (a validator), list the method in "checkMethods"'
          }
        ]
      })
    }
  },
  {
    id: 'shared-condition',
    layer: 'structure',
    severity: 'info',
    options: { minCount: 4, minShare: 0.4 },
    why: 'A repeated condition can indicate related behaviours. Factor it into a parent task or axiom when that improves clarity; value-based dispatch may be intentional.',
    run(ctx) {
      return ctx.model.methods.flatMap(m => {
        const bs = m.decl.branches
        const need = Math.max(num(ctx, 'minCount'), Math.ceil(num(ctx, 'minShare') * bs.length))
        const by = new Map<string, { fact: string; list: Branch[] }>()
        const params = new Set(m.decl.params.map(p => p.name))
        for (const b of bs) for (const [key, fact] of factTests(b, params)) {
          const entry = by.get(key)
          if (entry) entry.list.push(b)
          else by.set(key, { fact, list: [b] })
        }
        return [...by.values()]
          .filter(({ list }) => list.length >= need)
          .map(({ fact, list }) => ({
            ...at(m),
            message: `the same test of '${fact}' appears in ${list.length} of ${bs.length} branches of '${m.decl.name}'`,
            fix: `group those branches under one compound task whose branch in '${m.decl.name}' tests '${fact.split('/')[0]}' once, or name the shared test as an axiom`,
            related: list.map(b => at(m, b)),
            data: { fact, branches: list.map(b => b.name) }
          }))
      })
    }
  }
]

export const RULE_IDS = new Set(RULES.map(r => r.id))

/** Per rule, the highest severity a config may give it (parseConfig's `caps`). */
export const RULE_CAPS: SeverityCaps = Object.fromEntries(RULES.flatMap(r => (r.cap ? [[r.id, r.cap]] : [])))

export function ruleDefaults(): Record<string, RuleConfig> {
  return Object.fromEntries(RULES.map(r => [r.id, { severity: r.severity, options: { ...r.options } }]))
}
