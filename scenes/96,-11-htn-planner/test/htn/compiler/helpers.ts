// Shared helpers for compiler tests (not a test file itself).
import * as nodePath from 'node:path'
import { compileDomainSource } from '../../../tools/htn/compiler'
import type { CompileResult, Diagnostic } from '../../../tools/htn/compiler'
import { positionOf } from '../../../tools/htn/diagnostics'

export const REPO_ROOT: string = process.env.HTN_REPO_ROOT ?? process.cwd()
export const FIXTURES = nodePath.join(REPO_ROOT, 'test/htn/fixtures/upstream')

/** Compile `source` as Root.domain; `files` provides includes by file name. */
export function compile(source: string, files: Record<string, string> = {}): CompileResult {
  return compileDomainSource('Root.domain', source, {
    readFile: path => {
      const name = nodePath.basename(path)
      if (!(name in files)) throw new Error(`no such file ${path}`)
      return files[name]
    }
  })
}

export function errors(result: CompileResult): Diagnostic[] {
  return result.diagnostics.filter(d => d.severity === 'error')
}

export function describe(result: CompileResult): string {
  return result.diagnostics.map(d => `${d.file}:${d.line}:${d.col}: ${d.code}: ${d.message}`).join('\n')
}

/** 1-based line/col of the first occurrence of `needle` in `text`. */
export function locate(text: string, needle: string, from = 0): { line: number; col: number } {
  const offset = text.indexOf(needle, from)
  if (offset < 0) throw new Error(`'${needle}' not found`)
  const { line, col } = positionOf(text, offset)
  return { line, col }
}

/** Wrap a branch condition (inside `(and ...)`) and task list in a one-method root domain. */
export function withBranch(condition: string, tasks = '(!done)'): string {
  return `(:domain Root top_level_domain\n  (:method (run ?inp_entity) top_level_method\n    (ready (and ${condition}) (${tasks}))))\n`
}

export const VALID_DOMAIN = '(:domain Root top_level_domain (:method (run) top_level_method (ready () ((!act)))))'
