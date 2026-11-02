import ReactEcs, { Button, Label, UiEntity, type JSX } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { activeEntry, backToHub, entries, openSubscene } from './state'
import { slotLabel } from './layout'
import type { SubsceneEntry, SubsceneStatus } from './types'

const PANEL_BG = Color4.create(0.05, 0.06, 0.09, 0.92)
const ROW_BG = Color4.create(0.13, 0.15, 0.2, 1)
const TITLE = Color4.create(0.95, 0.96, 1, 1)
const MUTED = Color4.create(0.62, 0.68, 0.8, 1)
const ACCENT = Color4.create(0.24, 0.52, 0.94, 1)

const PAGE_SIZE = 8
let page = 0

function statusColor(status: SubsceneStatus): Color4 {
  if (status === 'done') return Color4.create(0.18, 0.62, 0.36, 1)
  if (status === 'in-review') return Color4.create(0.24, 0.52, 0.94, 1)
  return Color4.create(0.9, 0.62, 0.16, 1)
}

function refsOf(entry: SubsceneEntry): string {
  const { issue, pr } = entry.meta
  return pr === undefined ? issue : `${issue} / ${pr}`
}

function pageCount(): number {
  return Math.max(1, Math.ceil(entries().length / PAGE_SIZE))
}

function SubsceneRow(props: { entry: SubsceneEntry }): JSX.Element {
  const { meta } = props.entry
  return (
    <Button
      value={`${refsOf(props.entry)}  ${meta.title}\n${meta.owner} · ${meta.status} · ${slotLabel(meta.slot)}`}
      fontSize={13}
      color={TITLE}
      textAlign="middle-left"
      uiTransform={{
        width: '100%',
        height: 56,
        margin: { bottom: 6 },
        padding: { left: 10, right: 10, top: 6, bottom: 6 }
      }}
      uiBackground={{ color: ROW_BG }}
      onMouseDown={() => openSubscene(props.entry.slug)}
    />
  )
}

function Pagination(): JSX.Element {
  const total = pageCount()
  return (
    <UiEntity uiTransform={{ flexDirection: 'row', width: '100%', height: 40, margin: { top: 4 } }}>
      <Button
        value="‹"
        fontSize={18}
        uiTransform={{ width: 56, height: 40, margin: { right: 6 } }}
        uiBackground={{ color: ROW_BG }}
        onMouseDown={() => {
          page = (page - 1 + total) % total
        }}
      />
      <Label
        value={`page ${page + 1} / ${total}`}
        fontSize={13}
        color={MUTED}
        textAlign="middle-center"
        uiTransform={{ flexGrow: 1, height: 40 }}
      />
      <Button
        value="›"
        fontSize={18}
        uiTransform={{ width: 56, height: 40, margin: { left: 6 } }}
        uiBackground={{ color: ROW_BG }}
        onMouseDown={() => {
          page = (page + 1) % total
        }}
      />
    </UiEntity>
  )
}

function HubPanel(): JSX.Element {
  const all = entries()
  const total = pageCount()
  if (page >= total) page = 0
  const visible = all.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)

  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { left: 16, top: 16 },
        width: 430,
        flexDirection: 'column',
        padding: 12
      }}
      uiBackground={{ color: PANEL_BG }}
    >
      <Label
        value="Mobile QA hub"
        fontSize={20}
        color={TITLE}
        textAlign="middle-left"
        uiTransform={{ width: '100%', height: 28 }}
      />
      <Label
        value={`${all.length} subscene(s) · one issue/PR each · choose one to isolate it`}
        fontSize={12}
        color={MUTED}
        textAlign="middle-left"
        uiTransform={{ width: '100%', height: 20, margin: { bottom: 10 } }}
      />

      {visible.map((entry) => (
        <SubsceneRow entry={entry} />
      ))}

      {all.length === 0 ? (
        <Label
          value="No subscenes yet. Copy src/subscenes/_example/ and run npm run subscenes:gen"
          fontSize={13}
          color={MUTED}
          textAlign="middle-left"
          uiTransform={{ width: '100%', height: 40 }}
        />
      ) : null}

      {total > 1 ? <Pagination /> : null}

      <Label
        value="Tip: every subscene is unmounted when you leave it, so nothing piles up."
        fontSize={11}
        color={MUTED}
        textAlign="middle-left"
        uiTransform={{ width: '100%', height: 32, margin: { top: 8 } }}
      />
    </UiEntity>
  )
}

function SubscenePanel(props: { entry: SubsceneEntry }): JSX.Element {
  const { meta } = props.entry
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { left: 16, top: 16 },
        width: 430,
        flexDirection: 'column',
        padding: 12
      }}
      uiBackground={{ color: PANEL_BG }}
    >
      <Button
        value="◀  Back to hub"
        fontSize={15}
        color={TITLE}
        uiTransform={{ width: '100%', height: 48, margin: { bottom: 10 } }}
        uiBackground={{ color: ACCENT }}
        onMouseDown={backToHub}
      />
      <Label
        value={`${refsOf(props.entry)}  ${meta.title}`}
        fontSize={17}
        color={TITLE}
        textAlign="middle-left"
        uiTransform={{ width: '100%', height: 26 }}
      />
      <Label
        value={`${meta.owner} · ${slotLabel(meta.slot)}`}
        fontSize={12}
        color={MUTED}
        textAlign="middle-left"
        uiTransform={{ width: '100%', height: 20 }}
      />
      <UiEntity uiTransform={{ flexDirection: 'row', width: '100%', height: 26, margin: { top: 6, bottom: 6 } }}>
        <Label
          value={meta.status}
          fontSize={12}
          color={TITLE}
          textAlign="middle-center"
          uiTransform={{ width: 100, height: 24, padding: 2 }}
          uiBackground={{ color: statusColor(meta.status) }}
        />
      </UiEntity>
      {meta.note === undefined ? null : (
        <Label
          value={meta.note}
          fontSize={12}
          color={MUTED}
          textAlign="top-left"
          uiTransform={{ width: '100%', height: 44 }}
        />
      )}
      <Label
        value="Only this subscene is mounted. Press Back to unmount it and return to the hub."
        fontSize={11}
        color={MUTED}
        textAlign="middle-left"
        uiTransform={{ width: '100%', height: 32, margin: { top: 4 } }}
      />
    </UiEntity>
  )
}

/** Single UI entry point, rendered every frame by React-ECS. */
export function HubUi(): JSX.Element {
  const entry = activeEntry()
  return entry === null ? <HubPanel /> : <SubscenePanel entry={entry} />
}

/** Resets the list page (used when the hub is re-entered). */
export function resetUiPage(): void {
  page = 0
}
