// The frozen "before" domains as a level variant, 'flat' (src/playground/variants.ts): a level's stalker and guards on
// stalker_flat.domain / guard_flat.domain, without belief upkeep, their branch names at the root. Imported by the
// tools that compare the live shape against them (scripts/htn-level.ts `--variant flat`, scripts/htn-variant-diff.ts)
// and by the tests of the variant mechanism; the scene never imports it. Why the fixtures exist: their headers.
import { registerDomainVariant } from '../../../src/playground/variants'
import { guardDomain } from '../../../src/examples/guard/guard.htn'
import { stalkerDomain } from '../../../src/examples/stalker/stalker.htn'
import { guardFlatDomain } from './guard_flat.htn'
import { stalkerFlatDomain } from './stalker_flat.htn'

export const FLAT_VARIANT = 'flat'

registerDomainVariant({
  name: FLAT_VARIANT,
  change: 'stalker / guard in the frozen before shape (test/fixtures/reference): a flat root with bookkeeping branches, no belief upkeep unit',
  replaces: {
    [stalkerDomain.name]: { domain: stalkerFlatDomain },
    [guardDomain.name]: { domain: guardFlatDomain }
  }
})
