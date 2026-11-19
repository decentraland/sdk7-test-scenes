import { createHud } from './hud'
import { createCourse } from './course'
import { createTrack } from './track'

// Locomotion measurement track and geometry course. It adds no AvatarModifierArea, InputModifier or AvatarLocomotionSettings, so the
// player moves at each explorer's default speeds.
export function main() {
  createTrack()
  createCourse()
  createHud()
}
