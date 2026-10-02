// Row formatting for the feedback CSV. Pure functions, no Storage access.

// An empty rating and comment means the player skipped or closed the Question.
export const CSV_HEADER = 'id,timeUtc,version,questionId,questionText,trigger,rating,comment,secondsInScene,playersInScene,address,isGuest,platform'

export type CsvRow = {
  id: string
  serverTs: number
  version: string
  questionId: string
  questionText: string
  trigger: string
  rating: number | null
  comment: string
  secondsInScene: number
  playersInScene: number
  address: string
  isGuest: boolean | null
  platform: string
}

export function formatRow(row: CsvRow): string {
  return [
    row.id,
    // "2026-09-30 12:27:33": parsed as a date-time by Sheets and Excel, unlike ISO with a Z.
    new Date(row.serverTs).toISOString().slice(0, 19).replace('T', ' '),
    row.version,
    row.questionId,
    field(row.questionText),
    field(row.trigger),
    row.rating === null ? '' : `${row.rating}`,
    field(row.comment),
    `${row.secondsInScene}`,
    `${row.playersInScene}`,
    row.address,
    row.isGuest === null ? '' : `${row.isGuest}`,
    field(row.platform)
  ].join(',')
}

// True when `csv` already holds the row with this id. Ids are sanitized to
// [A-Za-z0-9-] and comments never contain a newline, so a row always starts
// with "\n<id>,".
export function hasRow(csv: string, id: string): boolean {
  return csv.includes(`\n${id},`)
}

export function sanitizeId(requestId: string): string {
  return requestId.replace(/[^A-Za-z0-9-]/g, '').slice(0, 40)
}

// Player-supplied text: newlines flattened (one row = one line), a leading
// = + - @ neutralized so spreadsheets don't run it as a formula, and quoted
// when it holds a comma or a quote.
function field(value: string): string {
  let v = value.replace(/[\r\n]+/g, ' ')
  if (/^[=+\-@\t]/.test(v)) v = `'${v}`
  return /[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

// UTF-8 byte length (Storage counts bytes; no TextEncoder/Buffer in the runtime).
export function utf8Length(s: string): number {
  let bytes = 0
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c < 0x80) bytes += 1
    else if (c < 0x800) bytes += 2
    else if (c >= 0xd800 && c <= 0xdbff) {
      bytes += 4
      i++
    } else bytes += 3
  }
  return bytes
}
