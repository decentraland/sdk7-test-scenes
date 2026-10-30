// Exercise the opt-in fixture's real CLI wiring; allocation values are not a CI performance gate.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'

const ROOT = process.env.HTN_REPO_ROOT ?? process.cwd()

test('host allocation CLI bundles the typed workload and runs a complete squad update case', () => {
  const env = { ...process.env }
  delete env.NODE_TEST_CONTEXT
  const run = spawnSync(process.execPath, ['scripts/bench/host-allocation.mjs', 'squad-far', '10'], {
    cwd: ROOT, env, encoding: 'utf8', windowsHide: true, timeout: 60_000
  })
  assert.ifError(run.error)
  assert.equal(run.status, 0, run.stderr)
  const result = JSON.parse(run.stdout.trim())
  assert.equal(result.mode, 'squad-far')
  assert.equal(result.n, 10)
  assert.equal(result.warmFrames, 1000)
  assert.equal(result.measuredFrames, 1500)
  assert.match(result.scope, /no engine.update, CRDT serialization, renderer or real raycast answers/)
  // Schema/serialization only: no allocation or timing threshold, which would depend on the host/JIT.
  for (const field of ['bytesPerFrame', 'bytesPerNpcFrame', 'gcCount', 'gcMs']) {
    assert.equal(typeof result[field], 'number', field)
    assert.ok(Number.isFinite(result[field]), field)
  }
})
