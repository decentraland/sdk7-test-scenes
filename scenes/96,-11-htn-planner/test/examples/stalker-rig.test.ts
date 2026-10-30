// The stalker's body controller (src/examples/stalker/stalker-rig.ts): clips, the head, footfalls in time with the
// walk and run clips, cues for its voice; and the voice gate. On level 12's NPC and on its own.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { footfallsBetween, StalkerRig, STALKER_CYCLES, VoiceGate } from '../../src/examples/stalker/stalker-rig'
import { AmbushLevel } from '../../src/playground/levels/ambush'
import { v3 } from '../../src/htn-planner'

const GAIT = {
  walk: { clip: 'PatrolWalk' as const, speed: 2 },
  hurry: { clip: 'AggroRun' as const, speed: 0.7 },
  run: { clip: 'AggroRun' as const, speed: 2.5 }
}
const agent = (yaw = 0) => {
  const rows: Record<string, unknown[]> = {}
  return { kinematic: { position: v3(0, 0, 0), yaw }, blackboard: { world: { rows: (name: string) => rows[name] ?? [] } } }
}

test('footfalls: two touch-downs a cycle, counted once each however the frames fall', () => {
  assert.equal(footfallsBetween(0, 1), 2)
  assert.equal(footfallsBetween(0, 0.47), 0)
  assert.equal(footfallsBetween(0, 0.48), 1)
  assert.equal(footfallsBetween(0.48, 0.97), 0)
  assert.equal(footfallsBetween(0.97, 3.5), 6) // 0.972 1.472 ... 3.472
  let n = 0
  for (let p = 0; p < 10; p += 0.013) n += footfallsBetween(p, p + 0.013)
  assert.equal(n, 20)
})

test('rig: the walk clip steps in time with its speed, the run steps faster; a hurry is a slower run', () => {
  const rig = new StalkerRig({ gaitClips: GAIT, patrol: true, target: () => undefined })
  rig.play('PatrolWalk', 2)
  for (let i = 0; i < 96; i++) rig.afterTick(1 / 30) // 3.2 s at speed 2: two cycles
  assert.equal(rig.steps, 4)
  assert.equal(rig.stepGait, 'walk')
  rig.play('AggroRun', 2.5)
  for (let i = 0; i < 30; i++) rig.afterTick(1 / 30) // 1 s at 2.5: 3.125 cycles of 0.8 s
  assert.equal(rig.steps, 4 + 6)
  assert.equal(rig.stepGait, 'run')
  rig.play('AggroRun', 0.7)
  rig.afterTick(STALKER_CYCLES.AggroRun! / 0.7)
  assert.equal(rig.stepGait, 'hurry')
  const before = rig.steps
  rig.play('PatrolIdle')
  rig.afterTick(5)
  assert.equal(rig.steps, before, 'standing: no steps')
})

test('rig: on its round the head scans while it walks; a requested look wins; a run holds it straight', () => {
  const rig = new StalkerRig({ gaitClips: GAIT, patrol: true, target: () => undefined })
  const a = agent(0) as never
  rig.play('PatrolWalk', 2)
  let most = 0
  for (let i = 0; i < 300; i++) {
    rig.beforeTick(1 / 30, a)
    most = Math.max(most, Math.abs(rig.gaze.degrees))
  }
  assert.ok(most > 30 && most <= 90, `scan reached ${most.toFixed(0)} deg`)
  rig.lookYaw(80)
  for (let i = 0; i < 60; i++) rig.beforeTick(1 / 30, a)
  assert.ok(Math.abs(rig.gaze.degrees - 80) < 1, 'the look the domain asks for')
  assert.ok(Math.abs(rig.sightYaw({ kinematic: { yaw: 0 } }) - (80 * Math.PI) / 180) < 0.02, 'the sight turns with the head')
  rig.play('AggroRun', 2.5)
  rig.beforeTick(1 / 30, a)
  assert.equal(rig.gaze.degrees, 0)
})

test('rig: cues from the agent\'s events (noticed, heard, the first chase only, caught); a one-shot clip restarts', () => {
  const rig = new StalkerRig({ gaitClips: GAIT, patrol: true, target: () => undefined })
  const a = agent(1)
  rig.onEvent({ type: 'signal', guard: 's', name: 'heard' }, a)
  rig.onEvent({ type: 'signal', guard: 's', name: 'noticed', target: 'you' }, a)
  assert.equal(rig.attentionYaw, 1, 'keeps the bearing it saw you at')
  rig.onEvent({ type: 'step', guard: 's', name: '!chase', args: [] }, a)
  assert.equal(rig.attentionYaw, null)
  rig.onEvent({ type: 'step', guard: 's', name: '!chase', args: [] }, a)
  rig.onEvent({ type: 'catch', guard: 's', target: 'you' }, a)
  assert.deepEqual(rig.cues.map(c => c.cue), ['heard', 'noticed', 'chase', 'caught'])
  assert.equal(rig.cueSeq, 4)
  const starts = rig.clipStarts
  rig.play('HeadTurnLeft')
  rig.play('HeadTurnLeft')
  rig.play('PatrolIdle')
  rig.play('PatrolIdle', 2)
  assert.equal(rig.clipStarts, starts + 3)
})

test('rig: a chase that ends in anything but a catch cues lost (the target got away)', () => {
  const rig = new StalkerRig({ gaitClips: GAIT, patrol: true, target: () => undefined })
  const a = agent(1)
  rig.onEvent({ type: 'step', guard: 's', name: '!chase', args: [] }, a)
  rig.onEvent({ type: 'step', guard: 's', name: '!chase', args: [] }, a)
  rig.onEvent({ type: 'step', guard: 's', name: '!move_to', args: [] }, a)
  rig.onEvent({ type: 'step', guard: 's', name: '!look_around', args: [] }, a)
  assert.deepEqual(rig.cues.map(c => c.cue), ['chase', 'lost'])
  rig.onEvent({ type: 'step', guard: 's', name: '!chase', args: [] }, a)
  rig.onEvent({ type: 'step', guard: 's', name: '!catch', args: [] }, a)
  assert.deepEqual(rig.cues.map(c => c.cue), ['chase', 'lost'], 'a chase ending in the catch is not lost')
})

test('voice gate: one line at a time, more urgent cuts in, once-per-spawn and a cooldown', () => {
  const gate = new VoiceGate({
    lines: { heard: 'fear.ogg', chase: 'run.ogg' },
    seconds: { 'fear.ogg': 6.8, 'run.ogg': 8.9 },
    once: ['heard'],
    every: { chase: 20 },
    urgency: { heard: 0, chase: 1 }
  })
  assert.equal(gate.say('noticed', 0), null, 'no line for it')
  assert.equal(gate.say('heard', 0), 'fear.ogg')
  assert.equal(gate.say('heard', 10), null, 'once per spawn')
  assert.equal(gate.say('chase', 1), 'run.ogg', 'more urgent: cuts in')
  assert.equal(gate.say('chase', 15), null, 'cooldown')
  assert.equal(gate.say('chase', 21), 'run.ogg')
  gate.reset()
  assert.equal(gate.say('heard', 22), 'fear.ogg', 'a new spawn')
  assert.equal(gate.say('chase', 23), 'run.ogg', 'the cooldown starts over with the spawn')
})

test('level 12: the rig drives the clip, the head and the steps of its NPC from what the domain does', () => {
  const l = new AmbushLevel().init()
  l.testerPaused = true
  l.stepOut()
  for (let i = 0; i < 30 * 5; i++) l.update(1 / 30)
  assert.equal(l.rig.clip, 'PatrolWalk')
  assert.ok(l.rig.steps >= 4, `${l.rig.steps} steps in 5 s`)
  let peered = false
  for (let i = 0; i < 30 * 30 && !peered; i++) {
    l.update(1 / 30)
    peered = l.agent.currentAction === '!peer' && Math.abs(l.rig.gaze.degrees) > 45
  }
  assert.ok(peered, 'at the crossing the head turns well round')
  assert.equal(l.rig.clip, 'PatrolIdle')
})
