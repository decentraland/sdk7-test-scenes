// HTN domain compiler (Node only, never bundled into the scene): .domain source -> linked DomainIR.
// TS port of the upstream front end (lexer, parser, loader with includes, validator, linker).
// Stages: lexer.ts -> parser.ts -> loader.ts -> validator.ts -> linker.ts (-> check-methods.ts, on request); emit.ts
// renders a module after reachability.ts removes unreachable declarations.
import * as fs from 'node:fs'
import type { DomainIR } from '../../src/htn-planner/htn/ir'
import type { WorldState } from '../../src/htn-planner/htn/world-state'
import type { Domain } from './ast'
import { lintCheckMethods } from './check-methods'
import type { Diagnostic } from './diagnostics'
import { emitDomainModule as emit } from './emit'
import type { EmitOptions } from './emit'
import { linkModules } from './linker'
import { pruneUnreachable } from './reachability'
import { loadModules } from './loader'
import { validateModules } from './validator'
import { parseWorldStateText } from './worldstate'

export type { Diagnostic } from './diagnostics'
export type { EmitOptions } from './emit'
export { formatDiagnostic } from './diagnostics'
export { WorldStateParseError } from './worldstate'
export { emitWorldStateModule } from './emit'

export interface CompileOptions {
  /** Reads an include. Default: fs.readFileSync(path, 'utf8'). Paths resolve relative to the including file. */
  readFile?: (path: string) => string
  /**
   * Top-level methods that check the running plan (GuardAgentOptions.activePlan): each branch of theirs that accepts
   * any running step is a `check-method-fallback` warning, a name that is not a top-level method with no arguments a
   * `check-method-unknown` warning. Upstream marks no method as a check (docs/USE_CASES.md:8-9), so name them here.
   */
  checkMethods?: readonly string[]
}

export type CompileResult =
  | { ok: true; ir: DomainIR; diagnostics: Diagnostic[]; files: string[] } // diagnostics: warnings only; files: linked sources
  | { ok: false; diagnostics: Diagnostic[] } // at least one error

const defaultReadFile = (path: string) => fs.readFileSync(path, 'utf8')

/** Compile the root domain file and its includes. */
export function compileDomainFile(path: string, options?: CompileOptions): CompileResult {
  const readFile = options?.readFile ?? defaultReadFile
  let source: string
  try {
    source = readFile(path)
  } catch {
    return {
      ok: false,
      diagnostics: [
        // Upstream HTNCompilerDomainLoader.cpp:261: fatal, no range.
        { severity: 'error', recovery: 'fatal', code: 'file-not-found', message: `Could not read domain '${path}'`, file: path, line: 1, col: 1, endLine: 1, endCol: 1 }
      ]
    }
  }
  return compileDomainSource(path, source, options)
}

/** Compile from source text; `path` names the file for diagnostics and include resolution. */
export function compileDomainSource(path: string, source: string, options?: CompileOptions): CompileResult {
  return compileWithModules(path, source, options).result
}

/**
 * compileDomainSource plus the parsed modules it loaded (the AST, includes first, root last; empty after a fatal
 * error) and their file list. For tools that read the source shape, e.g. htn:lint (tools/lint).
 */
export function compileWithModules(path: string, source: string, options?: CompileOptions): { result: CompileResult; modules: Domain[]; files: string[] } {
  const loaded = loadModules(path, source, options?.readFile ?? defaultReadFile)
  const diagnostics = loaded.diagnostics
  const done = (result: CompileResult) => ({ result, modules: loaded.ok ? loaded.modules : [], files: loaded.files })
  if (!loaded.ok || loaded.modules.length === 0) return done({ ok: false, diagnostics })
  // Upstream stops after syntax errors; we keep validating the declarations that did parse
  // (as the upstream HTNDiagnosticTests README expects) but never link a module set with errors.
  const syntaxOk = !diagnostics.some(d => d.severity === 'error')
  const valid = validateModules({ modules: loaded.modules, files: loaded.files, diagnostics, requireTopLevelRoot: true })
  if (!valid || !syntaxOk) return done({ ok: false, diagnostics })
  const ir = linkModules(loaded.modules, loaded.files, diagnostics)
  if (!ir) return done({ ok: false, diagnostics })
  if (options?.checkMethods?.length) lintCheckMethods(ir, loaded.files, options.checkMethods, diagnostics)
  return done({ ok: true, ir: pruneUnreachable(ir), diagnostics, files: loaded.files })
}

/**
 * Render a DomainIR as a TS module: `export const <exportName>: DomainIR = {...}`.
 * `options.irImportPath` (default '../htn/ir') is the specifier of src/htn-planner/htn/ir relative to the output file.
 */
export function emitDomainModule(ir: DomainIR, exportName: string, options?: EmitOptions): string {
  return emit(ir, exportName, options)
}

/** Parse an upstream .worldstate file (one fact per line: `name arg arg...`, `//` comments). Throws WorldStateParseError. */
export function parseWorldState(source: string, into: WorldState): void {
  parseWorldStateText(source, into)
}
