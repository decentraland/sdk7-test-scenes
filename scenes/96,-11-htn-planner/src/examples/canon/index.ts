// Canonical example domains adapted from the public sources in each domain header and THIRD_PARTY_NOTICES.md.
// Paper prototypes (paper.ts), not scene levels. Their scenarios are data, read from disk by
// tools/htn/canon.ts (worlds/<domain stem>/*.worldstate); their stories are code, registered here. Run any of them:
// `npm run htn:run -- --list`, `--world <station>/<scenario>`, `--story <station>/<story>`. One line per example;
// append yours (docs/htn-guidance.md, "Adding a canonical example").
import type { Story } from './paper'
import { ARREST_STORIES } from './arrest_team/stories'
import { TROLL_STORIES } from './bridge_troll/stories'
import { CLASSIC_STORIES } from './classics/stories'
import { CRAFTING_STORIES } from './crafting/stories'
import { CREATURE_STORIES } from './creatures/stories'
import { DOOR_HELPER_STORIES } from './door_helper/stories'
import { FETCHER_STORIES } from './fetcher/stories'
import { INFILTRATOR_STORIES } from './infiltrator/stories'
import { SENTRY_STORIES } from './sentry_turret/stories'
import { SERVICE_BOT_STORIES } from './service_bots/stories'
import { SOUP_STORIES } from './soup_kitchen/stories'
import { SWARM_STORIES } from './swarm/stories'
import { VILLAGER_STORIES } from './villager_day/stories'

export const CANON_STORIES: Story[] = [
  ...TROLL_STORIES,
  ...CLASSIC_STORIES,
  ...CRAFTING_STORIES,
  ...CREATURE_STORIES,
  ...SERVICE_BOT_STORIES,
  ...DOOR_HELPER_STORIES,
  ...FETCHER_STORIES,
  ...SENTRY_STORIES,
  ...SWARM_STORIES,
  ...VILLAGER_STORIES,
  ...ARREST_STORIES,
  ...INFILTRATOR_STORIES,
  ...SOUP_STORIES
]
