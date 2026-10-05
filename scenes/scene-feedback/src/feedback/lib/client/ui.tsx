import { engine } from '@dcl/sdk/ecs'
import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { Input, Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { isMobile } from '@dcl/sdk/platform'
import { MAX_RATING, allQuestions } from '../shared/series'
import { scaleLabels } from '../shared/scales'
import {
  acceptIntro,
  askQuestions,
  declineIntro,
  dismissFeedback,
  feedback,
  giveUpFeedback,
  hasAnswer,
  introSpec,
  isLastStep,
  isServerAlive,
  panelOpacity,
  resetIntro,
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
const PROGRESS = Color4.fromHexString('#f2a65aff')
const SKIP_BG = Color4.create(1, 1, 1, 0.15)

// Own renderer next to the scene's: setUiRenderer stays free for the creator's UI.
export function setupUi(debug: boolean, buttonQuestionId: string | null): void {
  const ui = () => (
    <UiEntity uiTransform={{ width: '100%', height: '100%', positionType: 'absolute' }}>
      {debug && debugPanel()}
      {buttonQuestionId !== null && feedbackButton(buttonQuestionId)}
      {feedback.phase === 'intro' && introPanel()}
      {feedback.phase !== 'idle' && feedback.phase !== 'intro' && questionPanel()}
    </UiEntity>
  )
  ReactEcsRenderer.addUiRenderer(engine.addEntity(), ui, {
    virtualWidth: isMobile() ? 1600 : 1920,
    virtualHeight: isMobile() ? 720 : 1080
  })
}

// --- Debug: one button per Question. For the creator, not for players. -------------
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
      {allQuestions().map((q) =>
        button(
          `Ask ${q.id}`,
          () => void askQuestions([q.id], 'debug', { repeat: true, source: 'debug' }),
          alive && feedback.phase === 'idle',
          q.id
        )
      )}
      {introSpec() !== null && button('Reset intro', resetIntro, feedback.phase === 'idle', 'reset-intro')}
    </UiEntity>
  )
}

// --- "Leave feedback": the player asks for the Question themselves ------------------
// Hidden while a Question is on screen; dimmed until the server is up, so a press
// always opens the Question right away. repeat: the player chose to answer, so every
// press counts. Below the explorer's top-right HUD, level with the debug panel.
function feedbackButton(questionId: string) {
  if (feedback.phase !== 'idle') return null
  const enabled = isServerAlive()
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: 120, right: 24 },
        width: 200,
        height: 48,
        justifyContent: 'center',
        alignItems: 'center'
      }}
      uiBackground={{ color: enabled ? BUTTON_BG : DISABLED }}
      onMouseDown={enabled ? () => void askQuestions([questionId], 'feedback-button', { repeat: true, source: 'player' }) : undefined}
    >
      <Label value="Leave feedback" fontSize={20} color={enabled ? Color4.White() : MUTED} />
    </UiEntity>
  )
}

// --- The Intro: once per visit, before the first Question the game asks -------------
function introPanel() {
  const intro = introSpec()
  if (!intro) return null
  return (
    <UiEntity
      uiTransform={{ width: '100%', height: '100%', positionType: 'absolute', justifyContent: 'center', alignItems: 'center' }}
    >
      <UiEntity
        uiTransform={{ width: 720, flexDirection: 'column', alignItems: 'center', padding: 28 }}
        uiBackground={{ color: PANEL_BG }}
      >
        {closeButton(declineIntro)}
        {intro.image !== undefined && (
          <UiEntity
            uiTransform={{ width: 96, height: 96, margin: { top: 16, bottom: 8 } }}
            uiBackground={{ textureMode: 'stretch', texture: { src: intro.image } }}
          />
        )}
        <Label
          value={intro.title}
          fontSize={28}
          color={Color4.White()}
          textWrap="wrap"
          uiTransform={{ width: 600, height: 60, margin: { top: 16 } }}
        />
        <Label value={intro.text} fontSize={20} color={Color4.White()} textWrap="wrap" uiTransform={{ width: 600, height: 80 }} />
        <UiEntity uiTransform={{ flexDirection: 'row', margin: { top: 16 } }}>
          {button('Skip', declineIntro, true, 'intro-skip', SKIP_BG)}
          {button('Give feedback', acceptIntro, true, 'intro-yes')}
        </UiEntity>
      </UiEntity>
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
      <UiEntity
        uiTransform={{ width: 720, flexDirection: 'column', alignItems: 'center', padding: 28 }}
        uiBackground={{ color: PANEL_BG }}
      >
        {editable && closeButton(dismissFeedback)}
        {feedback.steps > 1 && progressBar()}
        <Label
          value={q.text}
          fontSize={26}
          color={Color4.White()}
          textWrap="wrap"
          uiTransform={{ width: 660, height: 80 }}
        />

        <UiEntity uiTransform={{ flexDirection: 'row', margin: { top: 12, bottom: 16 } }}>
          {Array.from({ length: MAX_RATING }, (_, i) => star(i + 1, scaleLabels(q.scale)[i], editable))}
        </UiEntity>

        {feedback.withComment && (
          <Input
            placeholder={q.commentPrompt}
            value={feedback.comment}
            onChange={setComment}
            disabled={!editable}
            fontSize={20}
            uiTransform={{ width: 660, height: 90 }}
            uiBackground={{ color: Color4.create(1, 1, 1, 0.95) }}
          />
        )}

        {footer(editable)}
      </UiEntity>
    </UiEntity>
  )
}

// "1/3": where the player is in the Group. Only for Groups of two or more.
const PROGRESS_WIDTH = 600
function progressBar() {
  return (
    <UiEntity uiTransform={{ width: 660, height: 32, flexDirection: 'row', alignItems: 'center', margin: { top: 24, bottom: 8 } }}>
      <UiEntity uiTransform={{ width: PROGRESS_WIDTH, height: 10 }} uiBackground={{ color: DISABLED }}>
        <UiEntity
          uiTransform={{ width: (PROGRESS_WIDTH * feedback.step) / feedback.steps, height: 10 }}
          uiBackground={{ color: PROGRESS }}
        />
      </UiEntity>
      <Label value={`${feedback.step}/${feedback.steps}`} fontSize={20} color={Color4.White()} uiTransform={{ width: 60 }} />
    </UiEntity>
  )
}

// A star with its scale label underneath. Unselected stars are the same emoji,
// dimmed with opacity: a colour emoji ignores the Label's colour tint.
function star(value: number, label: string, editable: boolean) {
  const lit = value <= feedback.rating
  const selected = value === feedback.rating
  return (
    <UiEntity
      key={value}
      uiTransform={{ width: 120, flexDirection: 'column', alignItems: 'center', margin: { left: 4, right: 4 } }}
      onMouseDown={editable ? () => setRating(value) : undefined}
    >
      <UiEntity
        uiTransform={{ width: 72, height: 72, justifyContent: 'center', alignItems: 'center', opacity: lit ? 1 : 0.25 }}
      >
        <Label value="⭐" fontSize={48} />
      </UiEntity>
      <Label
        value={label}
        fontSize={15}
        color={selected ? Color4.White() : MUTED}
        textAlign="middle-center"
        textWrap="wrap"
        uiTransform={{ width: 120, height: 40 }}
      />
    </UiEntity>
  )
}

// × is U+00D7 (Latin-1), present in every font — no tofu risk.
function closeButton(onClick: () => void) {
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
      onMouseDown={onClick}
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
            {button('Close', giveUpFeedback, true, 'close')}
          </UiEntity>
        </UiEntity>
      )
    default:
      return (
        <UiEntity uiTransform={{ margin: { top: 16 } }}>
          {button(hasAnswer() ? (isLastStep() ? 'Submit' : 'Next') : 'Skip', sendResponse, editable, 'send')}
        </UiEntity>
      )
  }
}

function status(text: string, color: Color4) {
  return <Label value={text} fontSize={20} color={color} uiTransform={{ height: 44, margin: { top: 16 } }} />
}

function button(text: string, onClick: () => void, enabled: boolean, key: string, color: Color4 = BUTTON_BG) {
  return (
    <UiEntity
      key={key}
      uiTransform={{ width: 180, height: 48, margin: 6, justifyContent: 'center', alignItems: 'center' }}
      uiBackground={{ color: enabled ? color : DISABLED }}
      onMouseDown={enabled ? onClick : undefined}
    >
      <Label value={text} fontSize={20} color={enabled ? Color4.White() : MUTED} />
    </UiEntity>
  )
}
