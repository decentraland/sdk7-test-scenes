import { createHud } from './hud'
import { createSideArea, createTrack } from './track'

// Locomotion measurement track. It adds no AvatarModifierArea, InputModifier or AvatarLocomotionSettings, so the
// player moves at each explorer's default speeds.
export function main() {
  createTrack()
  createSideArea()
  createHud()
}
