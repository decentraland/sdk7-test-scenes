import { WORLD_OFFSET, SPAWN_CENTER, SPAWN_CAMERA_TARGET } from './constants'
import { slog } from './state'
import { setupS1Locomotion } from './stations/s1_locomotion'
import { setupS2Jump } from './stations/s2_jump'
import { setupS3Freeze } from './stations/s3_freeze'
import { setupS4Click } from './stations/s4_click'
import { setupS5Hover } from './stations/s5_hover'
import { setupS6GlobalInput } from './stations/s6_global_input'
import { setupS7Camera } from './stations/s7_camera'
import { setupS8Ui } from './stations/s8_ui'
import { setupS9TextEntry } from './stations/s9_text_entry'
import { setupS10Paint } from './stations/s10_paint'
import { setupSceneUi } from './stations/ui_root'

export function main() {
  console.log('[INIT] synthetic-input-showcase starting')
  console.log(
    `[INIT] base parcel 149,149 -- world offset (${WORLD_OFFSET.x}, ${WORLD_OFFSET.y}, ${WORLD_OFFSET.z}); ` +
      'every local (x,z) in this scene maps to world (x+2384, y, z+2384)'
  )
  console.log(
    `[INIT] spawn: local (${SPAWN_CENTER.x}, ${SPAWN_CENTER.y}, ${SPAWN_CENTER.z}) camera target (${SPAWN_CAMERA_TARGET.x}, ${SPAWN_CAMERA_TARGET.y}, ${SPAWN_CAMERA_TARGET.z})`
  )
  console.log(
    '[INIT] station order: S1 locomotion -> S2 jump -> S3 freeze -> S4 click -> S5 hover -> S6 global input -> ' +
      'S7 camera -> S8 UI -> S9 text entry -> S10 paint surface'
  )
  console.log('[INIT] every interactable purpose->entityId mapping and floor "stand here" mark follows below')

  setupS1Locomotion()
  setupS2Jump()
  setupS3Freeze()
  setupS4Click()
  setupS5Hover()
  setupS6GlobalInput()
  setupS7Camera()
  setupS8Ui()
  setupS9TextEntry()
  setupS10Paint()
  // Last: both UI stations render through one ReactEcsRenderer root, which may only be set once.
  setupSceneUi()

  slog('INIT', 'all stations ready -- scene is idempotent, use the RESET ALL world button (or the in-panel one) to rerun freely')
}
