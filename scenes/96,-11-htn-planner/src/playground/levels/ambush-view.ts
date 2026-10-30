// Level 12's body in the scene: the stalker model (src/examples/stalker/stalker-model.ts) as the station's NPC view,
// driven by the level's rig; its name and step above its head, the debugger's label above those.
import { TextAlignMode } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { StalkerModel } from '../../examples/stalker/stalker-model'
import type { LevelSim } from '../sim'
import { NpcView, text } from '../station'
import { AMBUSH, AmbushLevel } from './ambush'

export function stalkerView(parent: Parameters<typeof text>[0], level: LevelSim): NpcView {
  const l = level as AmbushLevel
  const model = new StalkerModel({ parent, scale: AMBUSH.model.scale })
  const top = model.height + 0.2
  return {
    entity: model.hit,
    label: text(model.root, Vector3.create(0, top + 0.45, 0), '', 1.6, TextAlignMode.TAM_BOTTOM_CENTER, true),
    bubble: text(model.root, Vector3.create(0, top, 0), '', 2, TextAlignMode.TAM_BOTTOM_CENTER, true),
    overlayHeight: top + 1.6,
    render: (m, present, dt) => model.update(dt, l.rig, m.agent.kinematic, present)
  }
}
