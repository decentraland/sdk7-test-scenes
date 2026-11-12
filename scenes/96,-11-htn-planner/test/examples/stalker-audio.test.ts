import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AudioSource, engine, Transform } from '@dcl/sdk/ecs'
import { StalkerModel } from '../../src/examples/stalker/stalker-model'
import { STALKER_ASSETS } from '../../src/examples/stalker/stalker-audio'
import { StalkerRig } from '../../src/examples/stalker/stalker-rig'
const fresh = () => new StalkerRig({ gaitClips: { walk: { clip: 'PatrolWalk', speed: 1 }, hurry: { clip: 'AggroRun', speed: 0.7 }, run: { clip: 'AggroRun', speed: 2.5 } }, patrol: true, target: () => undefined })
const pose = { position: { x: 3, y: 0, z: 4 }, yaw: 0 }
const agent = { kinematic: { yaw: 0 } }
const heard = (rig: StalkerRig) => rig.onEvent({ type: 'signal', guard: 's', name: 'heard' }, agent)

test('primitive sound follows real rig footfalls and uses positional alternating channels', () => {
  const baseline = [...engine.getEntitiesWith(Transform)].length
  const model = new StalkerModel({ scale: 0.8 }), rig = fresh()
  try {
    model.update(0, rig, pose, true)
    assert.ok(model.audio)
    rig.play('PatrolWalk'); rig.afterTick(3.2)
    model.update(3.2, rig, pose, true)
    assert.equal(model.audio.stepsPlayed, 2, 'long frames emit at most two footfalls')
    for (const source of model.audio.steps) {
      const a = AudioSource.get(source)
      assert.ok(STALKER_ASSETS.steps.walk.includes(a.audioClipUrl))
      assert.equal(a.playing, true)
      assert.equal(a.global, false)
      assert.equal(Transform.get(source).parent, model.root)
    }
    rig.play('AggroRun', 2.5); rig.afterTick(0.8)
    model.update(0.8, rig, pose, true)
    assert.ok(model.audio.steps.some(e => STALKER_ASSETS.steps.run.includes(AudioSource.get(e).audioClipUrl)))
  } finally { model.dispose() }
  assert.equal([...engine.getEntitiesWith(Transform)].length, baseline, 'dispose includes all sound channels')
})

test('voice cues keep old priorities, cooldown and once-per-spawn semantics', () => {
  const model = new StalkerModel({ scale: 0.8 }), rig = fresh()
  try {
    model.update(0, rig, pose, true)
    assert.ok(model.audio)
    heard(rig); model.update(0.1, rig, pose, true)
    assert.equal(AudioSource.get(model.audio.voice).audioClipUrl, STALKER_ASSETS.voice.fear)
    rig.onEvent({ type: 'signal', guard: 's', name: 'noticed', target: 'you' }, agent)
    model.update(0.1, rig, pose, true)
    assert.equal(AudioSource.get(model.audio.voice).audioClipUrl, STALKER_ASSETS.voice.notice)
    heard(rig); model.update(8, rig, pose, true)
    assert.equal(model.audio.linesSaid.length, 2, 'heard remains once per rig')
    rig.onEvent({ type: 'step', guard: 's', name: '!chase', args: [] }, agent)
    rig.onEvent({ type: 'step', guard: 's', name: '!look_around', args: [] }, agent)
    model.update(0, rig, pose, true)
    assert.equal(AudioSource.get(model.audio.voice).audioClipUrl, STALKER_ASSETS.voice.run)
    rig.onEvent({ type: 'signal', guard: 's', name: 'noticed', target: 'you' }, agent)
    model.update(1, rig, pose, true)
    assert.equal(model.audio.linesSaid.length, 3, 'cooldown prevents immediate notice replay')
  } finally { model.dispose() }
})

test('hiding silences sounds and consumes hidden events; replacement rigs do not replay stale cues', () => {
  const model = new StalkerModel({ scale: 0.8 }), rig = fresh()
  try {
    model.update(0, rig, pose, true)
    assert.ok(model.audio)
    heard(rig); rig.play('PatrolWalk'); rig.afterTick(1)
    model.update(1, rig, pose, true)
    assert.ok([...model.audio.steps, model.audio.voice].some(e => AudioSource.getOrNull(e)?.playing))
    model.update(0, rig, pose, false)
    for (const e of [...model.audio.steps, model.audio.voice]) assert.equal(AudioSource.getOrNull(e)?.playing ?? false, false)
    const before = model.audio.stepsPlayed, lines = model.audio.linesSaid.length
    rig.afterTick(5); rig.onEvent({ type: 'signal', guard: 's', name: 'noticed' }, agent)
    model.update(5, rig, pose, false); model.update(0, rig, pose, true)
    assert.equal(model.audio.stepsPlayed, before)
    assert.equal(model.audio.linesSaid.length, lines)
    const next = fresh(); heard(next)
    model.update(0, next, pose, true)
    assert.equal(model.audio.linesSaid.length, lines, 'old cues from a replacement are discarded')
    heard(next); model.update(0, next, pose, true)
    assert.equal(model.audio.linesSaid.length, lines + 1, 'new rig resets once-per-spawn rule')
  } finally { model.dispose() }
})
