// Check methods (CompileOptions.checkMethods, `--check-method <name>`): top-level methods the host runs to judge the
// running plan (GuardAgentOptions.activePlan, upstream docs/USE_CASES.md:32-34). Upstream marks nothing in the domain
// (USE_CASES.md:8-9: `active_plan` is an ordinary top-level method name), so the caller names them. Warnings, after
// linking: a branch that accepts any running step (the agent's run-time rule, src/htn-planner/htn/check-method.ts),
// a name that is not a top-level method with no arguments (the agent would not check at all).
import * as nodePath from 'node:path'
import { ACCEPTS_ANYTHING, acceptingBranches } from '../../src/htn-planner/htn/check-method'
import type { DomainIR, SourceLoc } from '../../src/htn-planner/htn/ir'
import { reportDiagnostic } from './diagnostics'
import type { Diagnostic } from './diagnostics'

/** `files`: the loader's file list (root last), as the linker got it; SourceLoc.file is relative to the root's folder. */
export function lintCheckMethods(ir: DomainIR, files: string[], names: readonly string[], diagnostics: Diagnostic[]): void {
  const rootFile = files[files.length - 1]
  const rootDir = nodePath.dirname(rootFile)
  const fileOf = (loc: SourceLoc) => files.find(f => nodePath.relative(rootDir, f).replace(/\\/g, '/') === loc.file) ?? rootFile
  const warn = (code: string, message: string, loc: SourceLoc | undefined) =>
    reportDiagnostic(diagnostics, {
      severity: 'warning',
      recovery: 'recoverable',
      code,
      message,
      ...(loc === undefined
        ? { file: rootFile, line: 1, col: 1, endLine: 1, endCol: 1 }
        : { file: fileOf(loc), line: loc.line, col: loc.col, endLine: loc.endLine, endCol: loc.endCol })
    })
  for (const name of names) {
    const id = ir.topLevel[name]?.[0]
    if (id === undefined) {
      // Point at a method of that name if there is one (another arity, or not top-level), the root one first.
      const named = ir.methods.filter(m => m.name === name)
      const decl = named.find(m => m.domain === ir.name) ?? named[0]
      warn('check-method-unknown', `Check method '${name}' is not a top-level method of domain '${ir.name}' with no arguments`, decl?.source)
      continue
    }
    for (const branch of acceptingBranches(ir.methods[id]))
      warn('check-method-fallback', `Check method '${name}': branch '${branch.name}' ${ACCEPTS_ANYTHING}`, branch.source)
  }
}
