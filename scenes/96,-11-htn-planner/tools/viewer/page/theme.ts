// The viewer's figure style: a paper's restrained palette, always colour plus glyph (✓ chosen, × failed, ↶
// backtracked, · not tried, ▶ running), so it reads in greyscale too.
import type { FigStatus } from '../model/plan-tree'

export const INK = '#1f2328'
export const MUTED = '#57606a'
export const FAINT = '#8c959f'
export const RULE = '#d0d7de'
export const PAPER = '#ffffff'
export const SHADE = '#f6f8fa'

export const COLOR: Record<FigStatus, string> = {
  chosen: '#1a7f37',
  failed: '#cf222e',
  backtracked: '#cf222e',
  untried: FAINT,
  running: '#0969da'
}

export const GLYPH: Record<FigStatus, string> = {
  chosen: '✓',
  failed: '×',
  backtracked: '↶',
  untried: '·',
  running: '▶'
}

/** Stroke of a node or edge by status: chosen solid and bold, failed thin red, backtracked dashed red, untried dotted. */
export function stroke(status: FigStatus): { color: string; width: number; dash: string | null } {
  switch (status) {
    case 'chosen':
      return { color: INK, width: 1.8, dash: null }
    case 'failed':
      return { color: COLOR.failed, width: 1.1, dash: null }
    case 'backtracked':
      return { color: COLOR.failed, width: 1.1, dash: '5 3' }
    case 'untried':
      return { color: FAINT, width: 1, dash: '1.5 3' }
    case 'running':
      return { color: COLOR.running, width: 1.6, dash: null }
  }
}

export const AMBER = '#9a6700'
export const BLUE = '#0969da'
export const CHIP_FILL = '#ddf4ff'
export const CHIP_TEXT = '#0a3069'
