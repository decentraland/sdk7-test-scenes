import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { Input, Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { isMobile } from '@dcl/sdk/platform'
import { MAX_RATING, QUESTIONS } from '../shared/questions'
import {
  askQuestion,
  closeFeedback,
  dismissFeedback,
  feedback,
  hasAnswer,
  isServerAlive,
  panelOpacity,
  sendResponse,
  setComment,
  setRating
} from './state'

const PANEL_BG = Color4.create(0.05, 0.08, 0.16, 0.92)
const MUTED = Color4.create(1, 1, 1, 0.6)
const DISABLED = Color4.create(1, 1, 1, 0.12)
const BUTTON_BG = Color4.fromHexString('#3a6df0ff')
const DEBUG_BG = Color4.create(0.2, 0.2, 0.25, 0.9)
const WARN = Color4.fromHexString('#ff9d3aff')

export function setupUi(): void {
  ReactEcsRenderer.setUiRenderer(uiComponent, {
    virtualWidth: isMobile() ? 1600 : 1920,
    virtualHeight: isMobile() ? 720 : 1080
  })
}

const uiComponent = () => (
  <UiEntity uiTransform={{ width: '100%', height: '100%', positionType: 'absolute' }}>
    {debugPanel()}
    {feedback.phase !== 'idle' && questionPanel()}
  </UiEntity>
)

// --- Debug: one button per Question. For us, not for players. ----------------------
function debugPanel() {
  const alive = isServerAlive()
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: 120, left: 24 },
        flexDirection: 'column',
        padding: 12
      }}
      uiBackground={{ color: DEBUG_BG }}
    >
      <Label
        value={alive ? 'DEBUG · server online' : 'DEBUG · server waking up…'}
        fontSize={16}
        color={alive ? Color4.Green() : WARN}
        uiTransform={{ height: 26 }}
      />
      {QUESTIONS.map((q) =>
        button(`Ask ${q.id}`, () => askQuestion(q.id, 'debug'), alive && feedback.phase === 'idle', q.id)
      )}
    </UiEntity>
  )
}

// --- The Question -------------------------------------------------------------------
function questionPanel() {
  const q = feedback.question
  if (!q) return null
  const editable = feedback.phase === 'open' || feedback.phase === 'failed'

  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: '100%',
        positionType: 'absolute',
        justifyContent: 'center',
        alignItems: 'center',
        opacity: panelOpacity()
      }}
    >
      <UiEntity uiTransform={{ width: 720, flexDirection: 'column', alignItems: 'center', padding: 28 }} uiBackground={{ color: PANEL_BG }}>
        {editable && closeButton()}
        <Label value={q.text} fontSize={26} color={Color4.White()} textWrap="wrap" uiTransform={{ width: 660, height: 80 }} />

        <UiEntity uiTransform={{ flexDirection: 'row', margin: { top: 12, bottom: 16 } }}>
          {Array.from({ length: MAX_RATING }, (_, i) => star(i + 1, editable))}
        </UiEntity>

        <Input
          placeholder={q.commentPrompt}
          value={feedback.comment}
          onChange={setComment}
          disabled={!editable}
          fontSize={20}
          uiTransform={{ width: 660, height: 90 }}
          uiBackground={{ color: Color4.create(1, 1, 1, 0.95) }}
        />

        {footer(editable)}
      </UiEntity>
    </UiEntity>
  )
}

// Unselected stars are the same emoji, dimmed with opacity: a colour emoji
// ignores the Label's colour tint.
function star(value: number, editable: boolean) {
  const lit = value <= feedback.rating
  return (
    <UiEntity
      key={value}
      uiTransform={{ width: 72, height: 72, margin: 6, justifyContent: 'center', alignItems: 'center', opacity: lit ? 1 : 0.25 }}
      onMouseDown={editable ? () => setRating(value) : undefined}
    >
      <Label value="⭐" fontSize={48} />
    </UiEntity>
  )
}

// × is U+00D7 (Latin-1), present in every font — no tofu risk.
function closeButton() {
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: 8, right: 8 },
        width: 44,
        height: 44,
        justifyContent: 'center',
        alignItems: 'center'
      }}
      onMouseDown={dismissFeedback}
    >
      <Label value="×" fontSize={34} color={MUTED} />
    </UiEntity>
  )
}

function footer(editable: boolean) {
  switch (feedback.phase) {
    case 'sending':
      return status('Sending…', MUTED)
    case 'saved':
      return status('Thanks for your feedback!', Color4.Green())
    case 'failed':
      return (
        <UiEntity uiTransform={{ flexDirection: 'column', alignItems: 'center', margin: { top: 16 } }}>
          <Label value="Could not save. Try again?" fontSize={18} color={WARN} uiTransform={{ height: 28 }} />
          <UiEntity uiTransform={{ flexDirection: 'row' }}>
            {button('Try again', sendResponse, true, 'retry')}
            {button('Close', closeFeedback, true, 'close')}
          </UiEntity>
        </UiEntity>
      )
    default:
      return (
        <UiEntity uiTransform={{ margin: { top: 16 } }}>
          {button(hasAnswer() ? 'Submit' : 'Skip', sendResponse, editable, 'send')}
        </UiEntity>
      )
  }
}

function status(text: string, color: Color4) {
  return <Label value={text} fontSize={20} color={color} uiTransform={{ height: 44, margin: { top: 16 } }} />
}

function button(text: string, onClick: () => void, enabled: boolean, key: string) {
  return (
    <UiEntity
      key={key}
      uiTransform={{ width: 180, height: 48, margin: 6, justifyContent: 'center', alignItems: 'center' }}
      uiBackground={{ color: enabled ? BUTTON_BG : DISABLED }}
      onMouseDown={enabled ? onClick : undefined}
    >
      <Label value={text} fontSize={20} color={enabled ? Color4.White() : MUTED} />
    </UiEntity>
  )
}
