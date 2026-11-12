import { stopEmote, triggerEmote } from '~system/RestrictedActions'
import { COLOR, ROW_Z, button, rowTitle } from './layout'
import { formatNow, pushResult } from './resultsHud'

// `stopEmote` used to hand the scene an unresolved promise in the boolean `success` field, so
// a scene branching on it always took the success path. The log prints the runtime type
// alongside the value, which is the whole point of this row.
export function setupStopEmoteButtons() {
  button(12, ROW_Z.emote, COLOR.yellow, 'TRIGGER EMOTE', 'Play the robot emote', () => {
    console.log(`[stopEmote] ${formatNow()} click TRIGGER EMOTE`)
    triggerEmote({ predefinedEmote: 'robot' }).catch((err) => console.error('[stopEmote] triggerEmote failed', err))
  })

  button(20, ROW_Z.emote, COLOR.red, 'STOP EMOTE', 'Stop the emote and report the success value', () => {
    console.log(`[stopEmote] ${formatNow()} click STOP EMOTE`)

    stopEmote({})
      .then(({ success }) => {
        const verdict = `success=${success} typeof=${typeof success}`
        const time = pushResult('STOP EMOTE', typeof success === 'boolean' ? 1 : -1, verdict)
        console.log(`[stopEmote] ${time} ${verdict}`)
      })
      .catch((err) => {
        const time = pushResult('STOP EMOTE', -1, 'RPC_ERROR')
        console.error(`[stopEmote] ${time} stopEmote failed`, err)
      })
  })

  rowTitle('stopEmote — success must be a boolean, not a promise', ROW_Z.emote)
}
