// Diagnostics shared by the HTN compiler stages (Node only).

/**
 * Upstream HTNDiagnosticRecovery (Domain/Diagnostics/HTNDiagnostic.h:16-21): `recoverable` (the rest of the module
 * was still checked), `dependent` (follows from another error, e.g. a duplicate domain id), `fatal` (nothing after it
 * was checked: a lexer error, an unreadable or circular include, a broken file).
 */
export type DiagnosticRecovery = 'recoverable' | 'dependent' | 'fatal'

/** Upstream HTNDiagnostic (HTNDiagnostic.h:23-30) plus a stable code. 1-based; the end is exclusive. */
export interface Diagnostic {
  severity: 'error' | 'warning'
  recovery: DiagnosticRecovery
  code: string // stable kebab-case id, e.g. 'unknown-method', 'reassignment', 'include-not-found'
  message: string
  file: string
  line: number
  col: number
  endLine: number
  endCol: number // exclusive; equal to `col` on the same line for an empty range (an unclosed string at the end)
}

/** 1-based line/column plus 0-based offset, as upstream HTNSourcePosition. */
export interface Pos {
  line: number
  col: number
  offset: number
}

/** A position inside one loaded module (index into the loader's file list), with the end of its range (exclusive). */
export interface Loc extends Pos {
  file: number
  endLine?: number
  endCol?: number
}

export const START: Pos = { line: 1, col: 1, offset: 0 }

/** Upstream HTNSourceText::GetPosition: line/column of a byte offset ('\n' starts a line). */
export function positionOf(text: string, offset: number): Pos {
  const at = Math.min(Math.max(offset, 0), text.length)
  let line = 1
  let lineStart = 0
  for (let i = 0; i < at; i++) {
    if (text.charCodeAt(i) === 10) {
      line++
      lineStart = i + 1
    }
  }
  return { line, col: at - lineStart + 1, offset: at }
}

/** The range of a Loc; a Loc without an end is an empty range at its start. */
export function rangeOf(loc: Pos & { endLine?: number; endCol?: number }) {
  return { line: loc.line, col: loc.col, endLine: loc.endLine ?? loc.line, endCol: loc.endCol ?? loc.col }
}

/** The range from `begin` to `end` (exclusive; default: empty). */
export function rangeBetween(begin: Pos, end: Pos = begin) {
  return { line: begin.line, col: begin.col, endLine: end.line, endCol: end.col }
}

/**
 * Upstream HTNDiagnosticSink::Report (HTNDiagnosticSink.cpp:12-35): recovery can revisit a malformed construct, so
 * an exact duplicate (severity, recovery, file, code, message and range) is dropped.
 */
export function reportDiagnostic(list: Diagnostic[], d: Diagnostic): void {
  const same = (e: Diagnostic) =>
    e.severity === d.severity && e.recovery === d.recovery && e.file === d.file && e.code === d.code &&
    e.message === d.message && e.line === d.line && e.col === d.col && e.endLine === d.endLine && e.endCol === d.endCol
  if (!list.some(same)) list.push(d)
}

/** `file:line:col-endLine:endCol: severity code: message`. */
export function formatDiagnostic(d: Diagnostic): string {
  return `${d.file}:${d.line}:${d.col}-${d.endLine}:${d.endCol}: ${d.severity} ${d.code}: ${d.message}`
}
