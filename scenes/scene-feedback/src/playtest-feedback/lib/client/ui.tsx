import { engine } from '@dcl/sdk/ecs'
import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { Input, Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { isMobile } from '@dcl/sdk/platform'
import { MAX_RATING, NOT_EXPERIENCED, NOT_EXPERIENCED_LABEL, allQuestions } from '../shared/series'
import { scaleLabels } from '../shared/scales'
import {
  acceptIntro,
  askQuestions,
  closeGroup,
  declineIntro,
  feedback,
  giveUpGroup,
  hasAnswer,
  introSpec,
  isCompleted,
  isFirstStep,
  isLastStep,
  isServerAlive,
  nextStep,
  panelOpacity,
  previousStep,
  showIntro,
  retryGroup,
  setComment,
  setRating,
  skipStep,
  submitGroup
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
export function setupUi(debug: boolean): void {
  const ui = () => (
    <UiEntity uiTransform={{ width: '100%', height: '100%', positionType: 'absolute' }}>
      {debug && debugPanel()}
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
      {introSpec() !== null && button('Show intro', () => void showIntro('debug', 'debug'), feedback.phase === 'idle', 'show-intro')}
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
  const editable = feedback.phase === 'open'

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
        {feedback.phase === 'open' && closeButton(closeGroup)}
        {feedback.phase === 'failed' && closeButton(giveUpGroup)}
        {feedback.steps > 1 && (isCompleted() ? completedLabel() : progressBar())}
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
        {feedback.offerNotExperienced && notExperiencedToggle(editable)}

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

// Replaces the progress bar on a Group's last step once it is answered: only Submit is left.
function completedLabel() {
  return (
    <UiEntity uiTransform={{ width: 660, height: 32, alignItems: 'center', margin: { top: 24, bottom: 8 } }}>
      <Label value="COMPLETED" fontSize={18} color={Color4.Green()} />
    </UiEntity>
  )
}

// "I didn't experience this": an answer instead of a rating, Leave feedback only.
function notExperiencedToggle(editable: boolean) {
  const selected = feedback.rating === NOT_EXPERIENCED
  return (
    <UiEntity
      uiTransform={{ height: 36, padding: { left: 16, right: 16 }, margin: { bottom: 12 }, justifyContent: 'center', alignItems: 'center' }}
      uiBackground={{ color: selected ? BUTTON_BG : SKIP_BG }}
      onMouseDown={editable ? () => setRating(NOT_EXPERIENCED) : undefined}
    >
      <Label value={NOT_EXPERIENCED_LABEL} fontSize={16} color={selected ? Color4.White() : MUTED} />
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
            {button('Try again', retryGroup, true, 'retry')}
            {button('Close', giveUpGroup, true, 'close')}
          </UiEntity>
        </UiEntity>
      )
    default:
      return (
        // Left: Skip on the first step (this Question only), Back on later ones.
        // Right: Next, or Submit on the last step; both need a rating or a comment.
        <UiEntity uiTransform={{ width: 660, flexDirection: 'row', justifyContent: 'space-between', margin: { top: 16 } }}>
          {isFirstStep()
            ? button('Skip', skipStep, editable, 'skip', SKIP_BG)
            : button('Back', previousStep, editable, 'back', SKIP_BG)}
          {isLastStep()
            ? button('Submit', submitGroup, editable && hasAnswer(), 'submit')
            : button('Next', nextStep, editable && hasAnswer(), 'next')}
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
