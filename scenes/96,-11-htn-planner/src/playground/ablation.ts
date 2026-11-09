// Ablations of a playground level: the same brain with one parameter changed (after Metta-AI/cogame-collab-cooking's
// baselines, "the SAME brain with one parameter changed"), so a feature's benefit can be measured next to its cost
// (docs/htn-level-metrics.md; the cost is the bench, docs/htn-guidance.md). A level runs one ablation at a time
// (LevelSim.ablation, set before init()); null is the level as it is, and an ablation that is off changes nothing.
//
// The general ones come first: LevelSim implements them for every level whose NPCs have the feature (their domain
// reads the fact, their setup turns it on), so a new level gets them for free. A level adds its own on top
// (LevelSim.levelAblations: the squad planner of level 11, the light of level 12). Pure, no SDK.
import type { DomainIR } from '../htn-planner'
import type { AgentSetup } from './sim'

/** One ablation: its name (`--ablate <name>`) and the one change it makes, a line for the tables and the docs. */
export interface Ablation {
  name: string
  change: string
}

/** The general ablations, by name. */
export const GENERAL_ABLATIONS = {
  no_hearing: 'the NPCs hear no sound: every noise is dropped before they tick (a level may keep a noise that is no sound, LevelSim.isSound)',
  no_memory: 'the NPCs forget a lost target at once: last_seen is cleared before every plan (one more replan when it goes)',
  no_presence: 'no presence sense (smell): PerceptionConfig.presenceRadius 0',
  no_budget: 'no shared planning budget: every replan runs the frame it is due (LevelSim.planBudget null)',
  no_active_plan: 'no running-plan check (GuardAgentOptions.activePlan unset): the level replans on every change of its facts instead'
} as const

export type GeneralAblation = keyof typeof GENERAL_ABLATIONS

const reads = (domain: DomainIR, fact: string) => domain.facts.includes(fact)

/**
 * The general ablations that change something for these NPCs: hearing where a domain reads heard_noise or alert and
 * the level hands its NPCs noises; memory where a domain reads last_seen; presence where a setup senses it; the
 * budget where the level has one; the running-plan check where a setup has it.
 */
export function generalAblations(setups: readonly AgentSetup[], level: { hearsNoises: boolean; hasBudget: boolean }): Ablation[] {
  const applies: Record<GeneralAblation, boolean> = {
    no_hearing: level.hearsNoises && setups.some(s => reads(s.domain, 'heard_noise/4') || reads(s.domain, 'alert/1')),
    no_memory: setups.some(s => reads(s.domain, 'last_seen/3')),
    no_presence: setups.some(s => (s.perception?.presenceRadius ?? 0) > 0),
    no_budget: level.hasBudget,
    no_active_plan: setups.some(s => s.activePlan !== undefined)
  }
  return (Object.keys(GENERAL_ABLATIONS) as GeneralAblation[]).filter(n => applies[n]).map(name => ({ name, change: GENERAL_ABLATIONS[name] }))
}

/** A setup with the general ablation `name` applied (the setup itself when it changes nothing there). */
export function ablateSetup(setup: AgentSetup, name: string | null): AgentSetup {
  if (name === 'no_presence' && setup.perception?.presenceRadius) return { ...setup, perception: { ...setup.perception, presenceRadius: 0 } }
  if (name === 'no_active_plan' && setup.activePlan !== undefined) return { ...setup, activePlan: undefined }
  return setup
}
