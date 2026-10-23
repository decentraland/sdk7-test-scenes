// Panel geometry (px, the Explorer's 1920 x 1080 reference): the panel between the Explorer's chat and the Playgrounds
// menu, the agent list on its left, the tab body on the right. The chat's message area (x 61-407, y 437 down) takes
// clicks even where it is transparent, so the panel starts right of it.
export const PANEL = { left: 414, top: 36, width: 1264, height: 990, padding: 12 }
export const HEADER_H = 34
export const HOST_H = 46
export const LIST_W = 230
export const GAP = 12
export const INNER_W = PANEL.width - 2 * PANEL.padding
export const BODY_H = PANEL.height - 2 * PANEL.padding - HEADER_H - HOST_H - 8
export const BODY_W = INNER_W - LIST_W - GAP
