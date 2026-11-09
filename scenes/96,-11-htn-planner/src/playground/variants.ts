// Domain variants of a playground level: the same level and host with another domain for its NPCs (and the host
// options that domain needs), so two shapes of one brain can be run and compared side by side (`npm run htn:level --
// <level> --variant <name|all> --metrics`, `node scripts/htn-variant-diff.mjs`). A variant names, per live domain,
// the domain that replaces it; a level whose NPCs run none of those domains has nothing to change. Set
// LevelSim.variant before init(); null (the default) is the level as it is.
// The scene registers no variant: a variant is a tool for proving a restructure (docs/htn-guidance.md, Domain design:
// equivalence, then a random visitor), so its domains live with the tools. The one registered today is 'flat', the
// frozen "before" shape of the stalker and the guard (test/fixtures/reference/variant.ts; the experiment behind it:
// docs/htn-level-metrics.md, Domain variants). Pure, no SDK.
import type { DomainIR } from '../htn-planner'
import type { AgentSetup } from './sim'

/** What a variant puts in place of one live domain: the domain and the host options it needs (absent: none). */
export interface VariantDomain {
  domain: DomainIR
  /** GuardAgentOptions.reasoning for it (its belief upkeep method); absent: no upkeep. */
  reasoning?: string
  /** AgentSetup.chosenDepth: where its behaviour branch names are; absent: 1, the root's branch. */
  chosenDepth?: number
}

export interface DomainVariant {
  name: string
  change: string
  /** By the live domain's name (DomainIR.name). */
  replaces: Readonly<Record<string, VariantDomain>>
}

const variants: DomainVariant[] = []

/** The registered variants (registerDomainVariant). */
export const DOMAIN_VARIANTS: readonly DomainVariant[] = variants

/** Makes a variant known to every level (once per name: a second registration replaces the first). */
export function registerDomainVariant(variant: DomainVariant): void {
  const at = variants.findIndex(v => v.name === variant.name)
  if (at >= 0) variants[at] = variant
  else variants.push(variant)
}

export function findVariant(name: string): DomainVariant | undefined {
  return variants.find(v => v.name === name)
}

/** The variants that change something for these NPCs. */
export function variantsFor(setups: readonly AgentSetup[]): DomainVariant[] {
  return variants.filter(v => setups.some(s => v.replaces[s.domain.name] !== undefined))
}

/**
 * A setup with variant `name` applied (the setup itself when the variant does not replace its domain). The variant's
 * domain comes with its own host options: its reasoning and chosenDepth replace the setup's, absent ones are unset.
 */
export function variantSetup(setup: AgentSetup, name: string | null): AgentSetup {
  const replace = name === null ? undefined : findVariant(name)?.replaces[setup.domain.name]
  if (replace === undefined) return setup
  const out: AgentSetup = { ...setup, domain: replace.domain }
  delete out.reasoning
  delete out.chosenDepth
  if (replace.reasoning !== undefined) out.reasoning = replace.reasoning
  if (replace.chosenDepth !== undefined) out.chosenDepth = replace.chosenDepth
  return out
}
