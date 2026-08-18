import { TESTS } from '../tests'
import { RAYCAST_SUITE } from './raycast'
import { TWEEN_SUITE } from './tween'
import { TestFn } from './types'

// The one table both runners dispatch through, so the client column and the server
// column are provably running the same function for a given row.
const SUITE: Record<string, TestFn> = { ...TWEEN_SUITE, ...RAYCAST_SUITE }

export function suiteFn(index: number): TestFn | undefined {
  const test = TESTS[index]
  return test ? SUITE[test.id] : undefined
}

export * from './types'
