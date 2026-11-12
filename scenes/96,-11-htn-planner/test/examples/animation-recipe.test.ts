// Execute the actual published recipe against the SDK, not a duplicate implementation.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { runInNewContext } from 'node:vm'
import { createRequire } from 'node:module'
import { Animator, engine, Entity } from '@dcl/sdk/ecs'

type Motion = 'idle' | 'walk' | 'run'
test('HOW-TO Animator driver keeps per-NPC state, avoids steady writes and clears reset on speed-only changes', async () => {
  const root = process.env.HTN_REPO_ROOT ?? process.cwd()
  const doc = readFileSync(path.join(root, 'src/htn-planner/HOW-TO.md'), 'utf8')
  const snippet = Array.from(doc.matchAll(/```ts\r?\n([\s\S]*?)```/g)).find(match => match[1].includes('export function createAnimationDriver'))?.[1]
  assert.ok(snippet)
  const { build }: typeof import('esbuild') = createRequire(path.join(root, 'package.json'))('esbuild')
  const compiled = await build({ stdin: { contents: snippet, loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', write: false, external: ['@dcl/sdk/ecs'], logLevel: 'silent' })
  const module: { exports: { createAnimationDriver?: (entity: Entity, clips: Record<Motion, string>) => (motion: Motion, speed?: number, restart?: boolean) => void } } = { exports: {} }
  runInNewContext(compiled.outputFiles[0].text, { exports: module.exports, module, require: (name: string) => { assert.equal(name, '@dcl/sdk/ecs'); return { Animator } } })
  assert.ok(module.exports.createAnimationDriver)
  const a = engine.addEntity(), b = engine.addEntity()
  const originalPlay = Animator.playSingleAnimation, originalMutable = Animator.getMutable
  let plays = 0, writes = 0
  Animator.playSingleAnimation = (...args) => { plays++; return originalPlay.call(Animator, ...args) }
  Animator.getMutable = (...args) => { writes++; return originalMutable.call(Animator, ...args) }
  try {
    const clips = { idle: 'Idle', walk: 'Walk', run: 'Run' }
    const driveA = module.exports.createAnimationDriver(a, clips), driveB = module.exports.createAnimationDriver(b, clips)
    driveA('walk')
    driveB('walk')
    assert.equal(plays, 2, 'each NPC makes its own first transition')
    const before = writes
    driveA('walk')
    assert.equal(plays, 2)
    assert.equal(writes, before, 'steady animation does not dirty/reset the component')
    driveA('walk', 2)
    const walk = Animator.get(a).states.find(s => s.clip === 'Walk')!
    assert.equal(walk.speed, 2)
    assert.equal(walk.shouldReset, false, 'speed-only update cannot replay the cursor')
    assert.equal(plays, 2)
    driveA('run')
    assert.equal(Animator.get(a).states.find(s => s.clip === 'Run')?.shouldReset, true)
    assert.equal(plays, 3)
    driveA('run', 1, true)
    assert.equal(plays, 4, 'explicit retrigger is the only same-name replay')
    assert.equal(Animator.get(b).states.find(s => s.playing)?.clip, 'Walk')
  } finally {
    Animator.playSingleAnimation = originalPlay
    Animator.getMutable = originalMutable
    engine.removeEntity(a); engine.removeEntity(b)
  }
})
