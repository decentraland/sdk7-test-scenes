import { engine, InputAction, PointerEventType, pointerEventsSystem, PointerEventsResult } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import * as C from '../constants'
import { createSign, createReadout, createBox, setBoxColor, COLORS } from '../lib'
import { counters, slog, logEntity, onReset } from '../state'

type Row = { label: string; action: InputAction; get: () => number; inc: () => void }

export function setupS6GlobalInput() {
  const sign = createSign(C.S6_SIGN, 'S6 -- GLOBAL INPUT BOARD\npress_input fan-out + suppression', COLORS.info)
  logEntity('S6 sign', sign)

  const board = createReadout(C.S6_BOARD, 'booting...')
  logEntity('S6 board', board.entity)

  const rows: Row[] = [
    { label: 'IA_POINTER', action: InputAction.IA_POINTER, get: () => counters.globalPointer, inc: () => counters.globalPointer++ },
    { label: 'IA_PRIMARY', action: InputAction.IA_PRIMARY, get: () => counters.globalPrimary, inc: () => counters.globalPrimary++ },
    { label: 'IA_SECONDARY', action: InputAction.IA_SECONDARY, get: () => counters.globalSecondary, inc: () => counters.globalSecondary++ },
    { label: 'IA_ACTION_3', action: InputAction.IA_ACTION_3, get: () => counters.globalAction3, inc: () => counters.globalAction3++ },
    { label: 'IA_ACTION_4', action: InputAction.IA_ACTION_4, get: () => counters.globalAction4, inc: () => counters.globalAction4++ },
    { label: 'IA_ACTION_5', action: InputAction.IA_ACTION_5, get: () => counters.globalAction5, inc: () => counters.globalAction5++ },
    { label: 'IA_ACTION_6', action: InputAction.IA_ACTION_6, get: () => counters.globalAction6, inc: () => counters.globalAction6++ },
    { label: 'IA_JUMP', action: InputAction.IA_JUMP, get: () => counters.globalJump, inc: () => counters.globalJump++ },
    { label: 'IA_FORWARD', action: InputAction.IA_FORWARD, get: () => counters.globalForward, inc: () => counters.globalForward++ },
    { label: 'IA_BACKWARD', action: InputAction.IA_BACKWARD, get: () => counters.globalBackward, inc: () => counters.globalBackward++ },
    { label: 'IA_LEFT', action: InputAction.IA_LEFT, get: () => counters.globalLeft, inc: () => counters.globalLeft++ },
    { label: 'IA_RIGHT', action: InputAction.IA_RIGHT, get: () => counters.globalRight, inc: () => counters.globalRight++ },
    { label: 'IA_WALK', action: InputAction.IA_WALK, get: () => counters.globalWalk, inc: () => counters.globalWalk++ }
  ]

  const suppressionTarget = createBox(C.S6_SUPPRESSION_TARGET, Vector3.create(1.2, 1.2, 1.2), COLORS.charge)
  logEntity('S6 suppression target (IA_PRIMARY, entity-bound)', suppressionTarget)
  pointerEventsSystem.onPointerDown(
    {
      entity: suppressionTarget,
      opts: { button: InputAction.IA_PRIMARY, hoverText: 'press_input PRIMARY aimed here (entity-bound)', maxDistance: 16 }
    },
    () => {
      counters.entityPrimary++
      setBoxColor(suppressionTarget, COLORS.active)
      slog(
        'S6-GLOBAL',
        `entity-bound PRIMARY on suppression target (#${counters.entityPrimary}) -- global PRIMARY should NOT increment this frame`
      )
      refresh()
    }
  )

  function refresh() {
    const lines = rows.map((r) => `${r.label}: ${r.get()}`)
    board.setText(
      'SCENE-ROOT BROADCAST COUNTS\n' +
        lines.join('  ') +
        `\n\nSUPPRESSION DEMO -- aim press_input at the target below:\n` +
        `scene-root PRIMARY: ${counters.globalPrimary}   entity PRIMARY: ${counters.entityPrimary}\n` +
        `(press_input PRIMARY aimed at the target increments entity-only; unaimed increments scene-root-only)`
    )
  }
  refresh()

  onReset(() => {
    setBoxColor(suppressionTarget, COLORS.charge)
    refresh()
  })

  // MEASURED ON THE SCENE ROOT'S OWN PointerEventsResult, read directly. `inputSystem.isTriggered` CANNOT
  // measure the root: without an entity it answers from EVERY entity's results, and passing engine.RootEntity
  // does not help because RootEntity is 0 and the SDK's `if (entity)` treats it as "no entity" (JS falsy zero)
  // — the same all-entities scan either way, so an entity-bound event always satisfied it and three live runs
  // misread that as "suppression is broken". Reading the root's grow-only set is the only true measurement.
  let lastRootTimestampSeen = 0
  engine.addSystem(() => {
    let changed = false
    let maxTimestamp = lastRootTimestampSeen
    for (const cmd of PointerEventsResult.get(engine.RootEntity)) {
      if (cmd.timestamp <= lastRootTimestampSeen) continue
      if (cmd.timestamp > maxTimestamp) maxTimestamp = cmd.timestamp
      if (cmd.state !== PointerEventType.PET_DOWN) continue
      const row = rows.find((r) => r.action === cmd.button)
      if (!row) continue
      row.inc()
      slog('S6-GLOBAL', `${row.label} scene-root broadcast -- count now ${row.get()}`)
      changed = true
    }
    lastRootTimestampSeen = maxTimestamp
    if (changed) refresh()
  })

  slog(
    'S6-GLOBAL',
    'station ready -- press_input any action for the scene-root count; press_input aimed at the suppression target (entityId or x/y/z) for the entity-bound half'
  )
}
