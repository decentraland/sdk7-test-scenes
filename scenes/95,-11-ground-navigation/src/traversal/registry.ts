import { chainedJumps, runupJump } from './fixtures/jumps'
import { contestedLadder } from './fixtures/ladder'
import { ledgeTransfer, mantleClearance } from './fixtures/mantles'
import { interruptedJump } from './fixtures/recovery'
import type { TraversalScenario } from './types'

export const TRAVERSAL_SCENARIOS: readonly TraversalScenario[] = [
  runupJump,
  chainedJumps,
  mantleClearance,
  contestedLadder,
  interruptedJump,
  ledgeTransfer
]
