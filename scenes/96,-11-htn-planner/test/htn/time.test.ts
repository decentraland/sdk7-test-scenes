import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nowMs } from '../../src/htn-planner/htn/time'

test('planning clock uses performance.now when callable and falls back to Date.now otherwise', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'performance')
  const dateNow = Date.now
  try {
    Date.now = () => 456
    Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => 123 } })
    assert.equal(nowMs(), 123)
    Object.defineProperty(globalThis, 'performance', { configurable: true, value: undefined })
    assert.equal(nowMs(), 456)
    Object.defineProperty(globalThis, 'performance', { configurable: true, value: {} })
    assert.equal(nowMs(), 456)
  } finally {
    Date.now = dateNow
    if (descriptor) Object.defineProperty(globalThis, 'performance', descriptor)
    else Reflect.deleteProperty(globalThis, 'performance')
  }
})
