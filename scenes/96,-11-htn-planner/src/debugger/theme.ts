// The debugger's visual language, as hex colours for rich text and glyphs: colour plus glyph always (✓ chosen,
// × failed, ↺ retry, · untried, ▶ running, orange for a branch whose condition held but whose tasks failed or a step
// cut short), tokens coloured the way Decima's HTN window does (facts green, ?vars orange, calls blue). Pure.
import type { TitleTokenKind } from '../htn-planner'

export type Status = 'chosen' | 'failed' | 'abandoned' | 'retry' | 'untried' | 'running'

export const GLYPH: Record<Status, string> = {
  chosen: '✓',
  failed: '×',
  abandoned: '×',
  retry: '↺',
  untried: '·',
  running: '▶'
}

export const STATUS_HEX: Record<Status, string> = {
  chosen: '#5BD075',
  failed: '#FF6B6B',
  abandoned: '#FFA44D',
  retry: '#FFB347',
  untried: '#8A8F98',
  running: '#5AB0FF'
}

/** Title tokens (upstream TitleTokenKind): the head of a literal (a fact or a comparison) green, ?vars orange. */
export const TOKEN_HEX: Record<TitleTokenKind, string> = {
  normal: '#C9CED6',
  result: '#7EE787',
  var: '#FFA657',
  const: '#D2A8FF',
  string: '#A5D6FF',
  call: '#79C0FF'
}

export const HEX = {
  text: '#C9D1D9',
  dim: '#8B949E',
  faint: '#6E7681',
  value: '#F0F3F6',
  method: '#79C0FF',
  branch: '#E6EDF3',
  added: '#56D364',
  removed: '#F85149',
  changed: '#E3B341',
  warn: '#FFD866'
}

/** `<` opens a tag in rich text; one before a digit or a space cannot ("<1 ms", "(< ?hp 20)") and stays. */
export function escapeRich(s: string): string {
  return s.replace(/<(?![\d\s])/g, '‹')
}

export const colored = (hex: string, text: string) => `<color=${hex}>${escapeRich(text)}</color>`

/** Cut to `n` characters with an ellipsis. */
export const clip = (s: string, n: number) => (s.length > n ? s.slice(0, Math.max(0, n - 1)) + '…' : s)
