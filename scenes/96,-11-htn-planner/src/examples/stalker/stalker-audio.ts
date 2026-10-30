// Optional spatial sound adapter for the primitive demo; rig/domain logic never references assets.
import { AudioSource, engine, Entity, Transform } from '@dcl/sdk/ecs'
import { StalkerRig, VoiceGate, VoiceRules } from './stalker-rig'

const DIR = 'assets/stalker/'
export const STALKER_ASSETS = {
  /** One step each, cut from a footsteps take: four for a walk, four harder ones for a run. */
  steps: {
    walk: [1, 2, 3, 4].map(i => `${DIR}stalker-step-walk-${i}.ogg`),
    run: [1, 2, 3, 4].map(i => `${DIR}stalker-step-run-${i}.ogg`)
  },
  /** "Mmm, your fear. It tastes delicious." / "Run, little one! It only makes the hunt more... enjoyable." */
  voice: { notice: `${DIR}stalker-voice-notice.ogg`, fear: `${DIR}stalker-voice-fear.ogg`, run: `${DIR}stalker-voice-run.ogg` }
}
/** Its lines: it noticed you (at most every 20 s), heard something (once a spawn), lost you in a chase (once a spawn).
 *  None on the catch: that line is long and the run ends there. */
export const STALKER_VOICE: VoiceRules = {
  lines: { noticed: STALKER_ASSETS.voice.notice, heard: STALKER_ASSETS.voice.fear, lost: STALKER_ASSETS.voice.run },
  seconds: { [STALKER_ASSETS.voice.notice]: 5.71, [STALKER_ASSETS.voice.fear]: 6.79, [STALKER_ASSETS.voice.run]: 8.86 },
  once: ['heard', 'lost'],
  every: { noticed: 20 },
  urgency: { heard: 0, noticed: 1, lost: 2 }
}
const STEP_MIX = { walk: { volume: 0.9, pitch: 0.9 }, hurry: { volume: 0.95, pitch: 0.95 }, run: { volume: 1, pitch: 1 } }
/** No two steps alike: a fixed round of pitch offsets (no random numbers in the scene). */
const STEP_JITTER = [0, -0.03, 0.025, -0.012, 0.035, -0.02, 0.01]
const STEP_SOURCES = 2

export class StalkerAudio {
  readonly steps: Entity[] = []
  readonly voice: Entity
  stepsPlayed = 0
  readonly linesSaid: string[] = []
  private readonly gate = new VoiceGate(STALKER_VOICE)
  private rig: StalkerRig | null = null
  private stepsSeen = 0
  private cueSeen = 0
  private nextSource = 0
  private clock = 0

  constructor(parent: Entity, height: number) {
    for (let i = 0; i < STEP_SOURCES; i++) {
      const e = engine.addEntity()
      Transform.create(e, { parent, position: { x: 0, y: 0.3, z: 0 } })
      this.steps.push(e)
    }
    this.voice = engine.addEntity()
    Transform.create(this.voice, { parent, position: { x: 0, y: height * 0.85, z: 0 } })
  }

  update(dt: number, rig: StalkerRig, shown: boolean): void {
    this.clock += Math.max(0, dt)
    if (rig !== this.rig) {
      this.stop()
      this.rig = rig
      this.stepsSeen = rig.steps
      this.cueSeen = rig.cueSeq
      this.gate.reset()
    }
    if (!shown) {
      this.stop()
      this.stepsSeen = rig.steps
      this.cueSeen = rig.cueSeq
      return
    }
    // At most two steps per frame: a long frame never bursts every missed footfall.
    for (let i = 0, n = Math.min(2, rig.steps - this.stepsSeen); i < n; i++) {
      const k = this.stepsPlayed++
      const clips = rig.stepGait === 'walk' ? STALKER_ASSETS.steps.walk : STALKER_ASSETS.steps.run
      const mix = STEP_MIX[rig.stepGait]
      const source = this.steps[this.nextSource]
      this.nextSource = (this.nextSource + 1) % this.steps.length
      this.play(source, clips[k % clips.length], mix.volume, mix.pitch * (1 + STEP_JITTER[k % STEP_JITTER.length]))
    }
    this.stepsSeen = rig.steps
    for (const cue of rig.cues) {
      if (cue.seq <= this.cueSeen) continue
      const url = this.gate.say(cue.cue, this.clock)
      if (url) { this.play(this.voice, url, 1, 1); this.linesSaid.push(url) }
    }
    this.cueSeen = rig.cueSeq
  }

  private play(entity: Entity, url: string, volume: number, pitch: number): void {
    // The SDK helper re-emits a complete source even for an identical repeat of the same clip.
    AudioSource.playSound(entity, url)
    const source = AudioSource.getMutable(entity)
    source.volume = volume
    source.pitch = pitch
    source.loop = false
    source.global = false
  }
  private stop(): void {
    for (const e of this.steps) if (AudioSource.getOrNull(e)?.playing) AudioSource.stopSound(e)
    if (AudioSource.getOrNull(this.voice)?.playing) AudioSource.stopSound(this.voice)
  }
  dispose(): void {
    this.stop()
    for (const e of this.steps) engine.removeEntity(e)
    engine.removeEntity(this.voice)
  }
}
