import { engine } from '@dcl/sdk/ecs'
import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { Input, Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { isMobile } from '@dcl/sdk/platform'
import { MAX_RATING, NOT_EXPERIENCED, NOT_EXPERIENCED_LABEL, allQuestions } from '../shared/series'
import { SCALES, ScaleLabels, scaleLabels } from '../shared/scales'
import {
  acceptIntro,
  askQuestions,
  closeGroup,
  declineIntro,
  feedback,
  giveUpGroup,
  hasAnswer,
  introAvatar,
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
import { isWallet } from './owner'

// The designer's palette (Figma: MVP Creators Feedback, DCL design system), as seen in
// the design's renders. Opaque on purpose: the explorer blends translucent colours in
// linear space, so the design's Black 40% / White 10% come out much lighter in game.
const PANEL = Color4.fromHexString('#481a77ff')
const SNOW = Color4.fromHexString('#fcfcfcff') // text
const RUBY = Color4.fromHexString('#e84c59ff') // primary button
const MYTHIC = Color4.fromHexString('#ff4bedff') // avatar circle
const SILVER = Color4.fromHexString('#a09ba8ff') // secondary text, placeholders
const SECONDARY = Color4.fromHexString('#3c1752ff') // secondary button
const TILE = Color4.fromHexString('#592f84ff') // tiles, empty bar
const WHITE_50 = Color4.create(1, 1, 1, 0.5) // avatar border
const TILE_SELECTED = Color4.fromHexString('#6e4596ff')
const GRASS = Color4.fromHexString('#28ac00ff') // COMPLETED
// The glow images at full strength come out over twice as bright as in the design.
const GLOW_TINT = Color4.create(1, 1, 1, 0.4)
const INK = Color4.fromHexString('#161518ff') // text typed in the input
const TRANSPARENT = Color4.create(0, 0, 0, 0)
// A disabled button: the enabled one at half strength over the panel, worked out here.
// Not opacity: the explorer ignores an opacity an element is created with (only a later
// change to it shows), so a button that opens disabled looked enabled.
const RUBY_DISABLED = Color4.fromHexString('#983368ff')
const SECONDARY_DISABLED = Color4.fromHexString('#421864ff')
const SNOW_DISABLED = Color4.fromHexString('#a28bbaff')
// Not in the design yet.
const DEBUG_BG = Color4.create(0.2, 0.2, 0.25, 0.9)
const WARN = Color4.fromHexString('#ff9d3aff')

// Images live outside src/: the scene's .dclignore leaves src/ out of the deploy.
const ASSETS = 'assets/playtest-feedback/'
// Bottom-right, as in the design's 1920x1080 frame.
const PANEL_POSITION = { right: 25, bottom: 54 }
// Textures that fill a rounded element: nine-slices, not stretch. The explorer draws a
// stretch texture on its own, ignoring the element's border radius and padding; nine-slices
// is the element's own background. Zero slices: the whole image, stretched.
const FILL = { top: 0, bottom: 0, left: 0, right: 0 }
// Measured against the design: the explorer draws top-aligned text ~5 px lower than
// Figma, and an Input adds its own inner padding (~10 left, ~8 top).
const TEXT_NUDGE = 5
const INPUT_INSET = { left: 10, top: 8 }

// Own renderer next to the scene's: setUiRenderer stays free for the creator's UI.
export function setupUi(debug: boolean): void {
  const ui = () => (
    <UiEntity uiTransform={{ width: '100%', height: '100%', positionType: 'absolute' }}>
      {debug && debugPanel()}
      {debug && showScaleGallery && scaleGallery()}
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
      {button('Scale labels', () => (showScaleGallery = !showScaleGallery), true, 'scale-gallery')}
    </UiEntity>
  )
}

// Every scale's labels as tiles, plain (left) and selected (right): to check that each
// label fits its tile. Built-in scales plus this scene's own.
let showScaleGallery = false
function scaleGallery() {
  const seen = new Set<string>()
  const sets: ScaleLabels[] = []
  for (const labels of [...Object.values(SCALES), ...allQuestions().map((q) => scaleLabels(q.scale))]) {
    const key = labels.join('|')
    if (!seen.has(key)) {
      seen.add(key)
      sets.push(labels)
    }
  }
  const row = (labels: ScaleLabels, selected: boolean, key: string) => (
    <UiEntity key={key} uiTransform={{ width: 500, flexDirection: 'row', margin: { bottom: 8 } }}>
      {labels.map((label, i) => tile(i + 1, label, selected, undefined))}
    </UiEntity>
  )
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: 40, left: 360 },
        flexDirection: 'column',
        padding: 20,
        borderRadius: 24
      }}
      uiBackground={{ color: PANEL }}
    >
      {sets.map((labels, i) => (
        <UiEntity key={`set-${i}`} uiTransform={{ flexDirection: 'row' }}>
          {row(labels, false, 'plain')}
          {spacer('gap', 24)}
          {row(labels, true, 'selected')}
        </UiEntity>
      ))}
    </UiEntity>
  )
}

// --- The panel: the design's purple card, bottom-right ------------------------------
// The shell both panels share: background, the two glows, the close button.
function panel(
  key: string,
  padding: { top: number; bottom: number },
  onClose: (() => void) | null,
  children: ReactEcs.JSX.Element[],
  opacity = 1
) {
  return (
    <UiEntity
      key={key}
      uiTransform={{
        positionType: 'absolute',
        position: PANEL_POSITION,
        width: 600,
        borderRadius: 24,
        overflow: 'hidden',
        flexDirection: 'column',
        alignItems: 'center',
        padding: { top: padding.top, bottom: padding.bottom, left: 50, right: 50 },
        // The fade after saving: starts at 1, so the explorer applies it (see RUBY_DISABLED).
        opacity
      }}
      uiBackground={{ color: PANEL }}
    >
      {glow('glow-top.png', 226, 182, { top: 0, right: 0 })}
      {glow('glow-bottom.png', 600, 273, { bottom: 0, left: 0 })}
      {children}
      {onClose && iconClose(onClose)}
    </UiEntity>
  )
}

// The design's soft glows, exported as images: there are no gradients in scene UI.
function glow(file: string, width: number, height: number, position: { top?: number; right?: number; bottom?: number; left?: number }) {
  return (
    <UiEntity
      key={file}
      uiTransform={{ positionType: 'absolute', position, width, height }}
      uiBackground={{ textureMode: 'stretch', texture: { src: ASSETS + file }, color: GLOW_TINT }}
    />
  )
}

// The design's close button: 40x40 in the top-right corner, a 20x20 icon.
function iconClose(onClick: () => void) {
  return (
    <UiEntity
      key="close"
      uiTransform={{
        positionType: 'absolute',
        position: { top: 7, right: 7 },
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center'
      }}
      onMouseDown={onClick}
    >
      <UiEntity
        uiTransform={{ width: 20, height: 20 }}
        uiBackground={{ textureMode: 'stretch', texture: { src: ASSETS + 'close.png' } }}
      />
    </UiEntity>
  )
}

// --- The Intro: before the Questions, asks whether the player wants to give feedback --
function introPanel() {
  const intro = introSpec()
  if (!intro) return null
  // Without a picture (none set, or the owner not found yet) the circle keeps its place.
  const picture = introAvatar()
  const withAvatar = intro.avatar !== null
  return panel('intro', { top: 50, bottom: 50 }, declineIntro, [
    withAvatar ? avatar(picture) : spacer('no-avatar', 0),
    <Label
      key="title"
      value={intro.title}
      fontSize={20}
      color={SNOW}
      textAlign="middle-center"
      textWrap="wrap"
      uiTransform={{ width: 500, minHeight: 24, margin: { top: withAvatar ? 24 : 0 } }}
    />,
    <Label
      key="text"
      value={intro.text}
      fontSize={16}
      color={SNOW}
      textAlign="middle-center"
      textWrap="wrap"
      uiTransform={{ width: 500, minHeight: 38, margin: { top: 32 } }}
    />,
    <UiEntity key="ctas" uiTransform={{ flexDirection: 'row', justifyContent: 'center', margin: { top: 44 } }}>
      {cta('skip', declineIntro, { kind: 'secondary', width: 190, key: 'intro-skip' })}
      {spacer('intro-gap', 20)}
      {cta('give feedback', acceptIntro, { kind: 'primary', width: 190, arrow: 'right', key: 'intro-yes' })}
    </UiEntity>
  ])
}

// The creator's picture in a circle, as the design's ProfilePic. A wallet address: the
// explorer fetches that profile's face itself; anything else is an image path or URL.
function avatar(source: string | null) {
  const texture =
    source === null
      ? null
      : isWallet(source)
        ? { avatarTexture: { userId: source.toLowerCase() } }
        : { texture: { src: source } }
  return (
    <UiEntity
      key="avatar"
      uiTransform={{ width: 60, height: 60, borderRadius: 30, borderWidth: 3, borderColor: WHITE_50 }}
      uiBackground={{ color: MYTHIC }}
    >
      {texture && (
        <UiEntity
          uiTransform={{ width: '100%', height: '100%', borderRadius: 27 }}
          uiBackground={{ textureMode: 'nine-slices', textureSlices: FILL, ...texture }}
        />
      )}
    </UiEntity>
  )
}

// --- The Question -------------------------------------------------------------------
function questionPanel() {
  const q = feedback.question
  if (!q) return null
  const editable = feedback.phase === 'open'
  const onClose = feedback.phase === 'open' ? closeGroup : feedback.phase === 'failed' ? giveUpGroup : null
  const labels = scaleLabels(q.scale)

  return panel(
    'question',
    { top: 60, bottom: 50 },
    onClose,
    [
      ...(feedback.steps > 1 ? [isCompleted() ? completedLabel() : progressBar()] : []),
      <Label
        key="title"
        value={q.text}
        fontSize={20}
        color={SNOW}
        textAlign="top-left"
        textWrap="wrap"
        uiTransform={{ width: 500, minHeight: 24, margin: { top: (feedback.steps > 1 ? 32 : 0) - TEXT_NUDGE } }}
      />,
      <UiEntity key="tiles" uiTransform={{ width: 500, flexDirection: 'row', margin: { top: 40 + TEXT_NUDGE } }}>
        {Array.from({ length: MAX_RATING }, (_, i) =>
          tile(i + 1, labels[i], i + 1 === feedback.rating, editable ? () => setRating(i + 1) : undefined)
        )}
      </UiEntity>,
      ...(feedback.offerNotExperienced ? [notExperiencedToggle(editable)] : []),
      ...(feedback.withComment ? [commentField(q.commentPrompt ?? '', editable)] : []),
      footer(editable)
    ],
    panelOpacity()
  )
}

// "1/3": where the player is in the Group. Only for Groups of two or more.
const PROGRESS_WIDTH = 465
function progressBar() {
  return (
    <UiEntity
      key="progress"
      uiTransform={{ width: 500, height: 10, flexDirection: 'row', alignItems: 'center' }}
    >
      <UiEntity
        uiTransform={{ width: PROGRESS_WIDTH, height: 10, borderRadius: 5 }}
        uiBackground={{ color: TILE }}
      >
        <UiEntity
          uiTransform={{ width: (PROGRESS_WIDTH * feedback.step) / feedback.steps, height: 10, borderRadius: 5 }}
          uiBackground={{ textureMode: 'nine-slices', textureSlices: FILL, texture: { src: ASSETS + 'progress-fill.png' } }}
        />
      </UiEntity>
      <Label
        value={`${feedback.step}/${feedback.steps}`}
        fontSize={16}
        color={SNOW}
        // As in the design: 12 after the bar, left-aligned; a wider count runs on to the right.
        textAlign="middle-left"
        textWrap="nowrap"
        uiTransform={{ width: 500 - PROGRESS_WIDTH - 12, height: 10, margin: { left: 12 } }}
      />
    </UiEntity>
  )
}

// Replaces the progress bar on a Group's last step once it is answered: only Submit is left.
function completedLabel() {
  return (
    <UiEntity key="completed" uiTransform={{ width: 500, height: 10, alignItems: 'center' }}>
      <Label value="✔ COMPLETED" fontSize={12} color={GRASS} textAlign="middle-left" uiTransform={{ height: 10 }} />
    </UiEntity>
  )
}

// A tile: the face and its scale label. The selected one gets a ruby border and a bold
// label; every tile keeps a border, transparent when not selected, so nothing shifts.
// (The design's pink glow around it has no equivalent: scene UI has no shadows.)
const FACES = ['😞', '🙁', '😐', '🙂', '🤩']
// An emoji glyph renders ~1.3x its font size: 23 shows as the design's 30.
const FACE_SIZE = 23
function tile(value: number, label: string, selected: boolean, onClick: (() => void) | undefined) {
  const lines = labelLines(label)
  return (
    <UiEntity
      key={value}
      uiTransform={{
        flexGrow: 1,
        flexBasis: 0,
        height: 84,
        margin: { left: value === 1 ? 0 : 16 },
        flexDirection: 'column',
        alignItems: 'center',
        // The design's 12 a side is too narrow for long words in the explorer's SemiBold;
        // labelLines() does the design's line breaks instead.
        padding: { top: 5, bottom: 1, left: 0, right: 0 },
        borderRadius: 6,
        borderWidth: 3,
        borderColor: selected ? RUBY : TRANSPARENT
      }}
      uiBackground={{ color: selected ? TILE_SELECTED : TILE }}
      onMouseDown={onClick}
    >
      <Label value={FACES[value - 1]} fontSize={FACE_SIZE} textAlign="middle-center" uiTransform={{ width: 30, height: 30 }} />
      <Label
        value={selected ? `<b>${lines.join('\n')}</b>` : lines.join('\n')}
        fontSize={labelSize(lines)}
        color={SNOW}
        textAlign="top-center"
        // labelLines() places the breaks; no wrapping of its own, so a bold label grows a
        // little instead of losing its last letter to a new line.
        textWrap="nowrap"
        uiTransform={{ width: '100%', height: 34, margin: { top: 8 - TEXT_NUDGE } }}
      />
    </UiEntity>
  )
}

// A scale label as in the design: a phrase of 9+ characters goes on two lines, split
// where they come out most even ("Very\ndifficult"; "A little" stays whole); a single
// word never breaks.
const LABEL_SIZE = 14
// About this many characters fit a tile's width at LABEL_SIZE, bold included.
const LABEL_FIT = 9.5
function labelLines(label: string): string[] {
  const words = label.split(' ')
  if (words.length < 2 || label.length < 9) return [label]
  let best: string[] = [label]
  let bestLongest = Infinity
  for (let i = 1; i < words.length; i++) {
    const lines = [words.slice(0, i).join(' '), words.slice(i).join(' ')]
    const longest = Math.max(lines[0].length, lines[1].length)
    if (longest < bestLongest) {
      best = lines
      bestLongest = longest
    }
  }
  return best
}

// Smaller type for a word too long for the tile ("Uncomfortable"), the same whether
// selected or not, so selecting never resizes it.
function labelSize(lines: string[]): number {
  const longest = Math.max(...lines.map((l) => l.length))
  return Math.min(LABEL_SIZE, Math.floor((LABEL_SIZE * LABEL_FIT) / longest))
}

// "I didn't experience this": an answer instead of a rating, Leave feedback only.
function notExperiencedToggle(editable: boolean) {
  const selected = feedback.rating === NOT_EXPERIENCED
  return (
    <UiEntity
      key="not-experienced"
      uiTransform={{
        height: 32,
        padding: { left: 16, right: 16 },
        margin: { top: 16 },
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center'
      }}
      uiBackground={{ color: selected ? RUBY : TILE }}
      onMouseDown={editable ? () => setRating(NOT_EXPERIENCED) : undefined}
    >
      <Label value={NOT_EXPERIENCED_LABEL} fontSize={14} color={SNOW} />
    </UiEntity>
  )
}

// The design's input: white, rounded, the prompt as placeholder.
function commentField(prompt: string, editable: boolean) {
  return (
    <Input
      key="comment"
      placeholder={prompt}
      placeholderColor={SILVER}
      color={INK}
      value={feedback.comment}
      onChange={setComment}
      disabled={!editable}
      fontSize={16}
      textAlign="top-left"
      uiTransform={{
        width: 500,
        height: 86,
        margin: { top: 24 },
        padding: { top: 13 - INPUT_INSET.top, left: 16 - INPUT_INSET.left, right: 16 - INPUT_INSET.left },
        borderRadius: 12,
        borderWidth: 0,
        borderColor: TRANSPARENT
      }}
      uiBackground={{ color: SNOW }}
    />
  )
}

function footer(editable: boolean) {
  const row = (children: ReactEcs.JSX.Element[]) => (
    <UiEntity
      key="footer"
      uiTransform={{
        width: 500,
        height: 46,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        margin: { top: 44 }
      }}
    >
      {children}
    </UiEntity>
  )
  switch (feedback.phase) {
    case 'sending':
      return row([status('Sending…', SILVER)])
    case 'saved':
      return row([status('Thanks for your feedback!', SNOW)])
    case 'failed':
      return row([
        status('Could not save.', WARN),
        <UiEntity key="retry-row" uiTransform={{ flexDirection: 'row' }}>
          {cta('close', giveUpGroup, { kind: 'secondary', key: 'close' })}
          {spacer('retry-gap', 16)}
          {cta('try again', retryGroup, { kind: 'primary', key: 'retry' })}
        </UiEntity>
      ])
    default:
      // Left: Skip on the first step (this Question only), Back on later ones.
      // Right: Next, or Submit on the last step; both need a rating or a comment.
      return row([
        isFirstStep()
          ? cta('skip', skipStep, { kind: 'secondary', width: 125, enabled: editable, key: 'skip' })
          : cta('back', previousStep, { kind: 'secondary', width: 125, arrow: 'left', enabled: editable, key: 'back' }),
        isLastStep()
          ? cta('submit', submitGroup, { kind: 'primary', enabled: editable && hasAnswer(), key: 'submit' })
          : cta('next', nextStep, { kind: 'primary', arrow: 'right', enabled: editable && hasAnswer(), key: 'next' })
      ])
  }
}

function status(text: string, color: Color4) {
  return <Label key="status" value={text} fontSize={16} color={color} textAlign="middle-left" uiTransform={{ height: 46 }} />
}

// --- Building blocks ----------------------------------------------------------------

// The design's buttons, 46 high: primary (ruby, bold) and secondary (dark). Without a
// width, as wide as the text plus 29 a side. Disabled: dimmed.
type CtaOptions = {
  kind: 'primary' | 'secondary'
  key: string
  width?: number
  arrow?: 'left' | 'right'
  enabled?: boolean
}
function cta(text: string, onClick: () => void, { kind, key, width, arrow, enabled = true }: CtaOptions) {
  const caps = text.toUpperCase()
  const background = kind === 'primary' ? (enabled ? RUBY : RUBY_DISABLED) : enabled ? SECONDARY : SECONDARY_DISABLED
  const color = enabled ? SNOW : SNOW_DISABLED
  return (
    <UiEntity
      key={key}
      uiTransform={{
        width,
        height: 46,
        padding: width === undefined ? { left: 29, right: 29 } : undefined,
        borderRadius: 12,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center'
      }}
      uiBackground={{ color: background }}
      onMouseDown={enabled ? onClick : undefined}
    >
      {arrow === 'left' && arrowIcon('left', color)}
      <Label value={kind === 'primary' ? `<b>${caps}</b>` : caps} fontSize={14} color={color} />
      {arrow === 'right' && arrowIcon('right', color)}
    </UiEntity>
  )
}

// One chevron image; the left one is it mirrored through its UVs.
const MIRRORED = [1, 0, 1, 1, 0, 1, 0, 0]
function arrowIcon(side: 'left' | 'right', color: Color4) {
  // The design's gap: 20 after the text (NEXT ›), 10 before it (‹ BACK).
  return (
    <UiEntity
      uiTransform={{ width: 8, height: 13, margin: side === 'right' ? { left: 20 } : { right: 10 } }}
      uiBackground={{
        textureMode: 'stretch',
        texture: { src: ASSETS + 'arrow-right.png' },
        color,
        uvs: side === 'left' ? MIRRORED : undefined
      }}
    />
  )
}

function spacer(key: string, width: number) {
  return <UiEntity key={key} uiTransform={{ width, height: 1 }} />
}

// Debug buttons only.
function button(text: string, onClick: () => void, enabled: boolean, key: string) {
  return (
    <UiEntity
      key={key}
      uiTransform={{
        width: 180,
        height: 40,
        margin: 4,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center'
      }}
      uiBackground={{ color: enabled ? RUBY : RUBY_DISABLED }}
      onMouseDown={enabled ? onClick : undefined}
    >
      <Label value={text} fontSize={16} color={SNOW} />
    </UiEntity>
  )
}
