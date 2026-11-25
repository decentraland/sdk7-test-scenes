// Required runs are part of the research catalogue. They stay independent of the
// fixture registry so removing a variant cannot silently drop its assertions.
export const TRAVERSAL_CASE_REQUIREMENTS: readonly {
  id: string; scenario: string; variants: readonly string[]; coverage?: 'specified'
}[] = [
  { id: 'GAME-T01', scenario: 'run-up-jump', variants: ['ready', 'side-on', 'side-on-minus', 'side-on-plus', 'wall'], coverage: 'specified' },
  { id: 'TALK-T01', scenario: 'run-up-jump', variants: ['ready', 'too-slow', 'build-speed'], coverage: 'specified' },
  { id: 'GAME-T03', scenario: 'run-up-jump', variants: ['clear-beam', 'moving-beam'], coverage: 'specified' },
  { id: 'TALK-T04', scenario: 'chained-jumps', variants: ['room-to-brake', 'short-landing'], coverage: 'specified' },
  { id: 'EXEC-T16', scenario: 'chained-jumps', variants: ['room-to-brake', 'close-waypoints', 'close-waypoints-60hz'], coverage: 'specified' },
  { id: 'GAME-T13', scenario: 'contested-ladder', variants: ['front-approach', 'side-approach', 'behind-approach'], coverage: 'specified' },
  { id: 'EXEC-T07', scenario: 'contested-ladder', variants: ['solo', 'clear', 'clear-reversed', 'cancel-reservation'], coverage: 'specified' },
  { id: 'EXEC-T08', scenario: 'contested-ladder', variants: ['blocked-exit', 'exit-timeout'], coverage: 'specified' },
  { id: 'GAME-T15', scenario: 'contested-ladder', variants: ['beam-exit-open', 'beam-exit-blocked'], coverage: 'specified' },
  { id: 'GAME-T08', scenario: 'mantle-clearance', variants: ['clear', 'wrong-ledge'], coverage: 'specified' },
  {
    id: 'TALK-T07', scenario: 'mantle-clearance', variants: [
      'clear', 'missing-grip', 'low-opening', 'narrow-landing',
      'no-grip-low', 'no-grip-narrow', 'low-narrow', 'all-blocked', 'remove-handhold'
    ],
    coverage: 'specified'
  },
  { id: 'TALK-T10', scenario: 'mantle-clearance', variants: ['window-low', 'window-high'], coverage: 'specified' },
  { id: 'TALK-T11', scenario: 'ledge-transfer', variants: ['clear', 'missing-transfer'], coverage: 'specified' },
  { id: 'SDK-T04', scenario: 'ledge-transfer', variants: ['rotating-grip'] },
  { id: 'EXEC-T01', scenario: 'interrupted-jump', variants: ['clear', 'cancel-before', 'cancel-airborne'], coverage: 'specified' },
  { id: 'EXEC-T14', scenario: 'interrupted-jump', variants: ['clear', 'remove-landing'], coverage: 'specified' },
  { id: 'SDK-T01', scenario: 'interrupted-jump', variants: ['stale-probe'] },
  { id: 'GAME-17', scenario: 'elevator-boarding', variants: ['ready', 'missed', 'disabled', 'wait'], coverage: 'specified' },
]

export function traversalCaseIds(scenario: string, variant: string): string[] {
  return TRAVERSAL_CASE_REQUIREMENTS
    .filter((entry) => entry.scenario === scenario && entry.variants.includes(variant))
    .map(({ id }) => id)
}
