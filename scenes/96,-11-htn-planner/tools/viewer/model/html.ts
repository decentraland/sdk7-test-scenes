// The viewer as one self-contained HTML file: the page's CSS and script inlined, the session embedded as JSON in a
// <script type="application/json"> the page reads. Nothing is fetched, so it opens from disk. Pure.

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export interface ViewerPage {
  title: string
  css: string
  /** The page's bundled script (an IIFE). */
  js: string
  /** The session as JSON text ('' for a page that waits for a dropped file). */
  session: string
  /** Where the session came from (shown in the header). */
  source: string
}

/**
 * The page. A `<` in the JSON becomes the JSON escape for it (only strings can hold one, where the escape means the
 * same), and `</script` in the script `<\/script`, so neither can close its element early.
 */
export function viewerHtml(p: ViewerPage): string {
  const json = p.session.replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
  const js = p.js.replace(/<\/script/gi, '<\\/script')
  const css = p.css.replace(/<\/style/gi, '<\\/style')
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(p.title)}</title>`,
    `<style>${css}</style>`,
    '</head>',
    '<body>',
    `<script id="htn-session" type="application/json" data-source="${escapeHtml(p.source)}">${json}</script>`,
    `<script>${js}</script>`,
    '</body>',
    '</html>',
    ''
  ].join('\n')
}

export interface ViewArgs {
  session: string
  out?: string
  open: boolean
  /** `--text`: the report on stdout instead of a page; `--json`: its data. */
  report?: 'text' | 'json'
  /** Report options (with --text / --json only). */
  agents?: string[]
  run?: { agent: string; seq: number }
  at?: number
  verbose?: true
  worldAll?: true
  maxLines?: number
}

export const VIEW_USAGE = `usage: npm run htn:view -- <session.json> [--out file.html] [--open]
       npm run htn:view -- <session.json> --text [--agent <id>]... [--run <agent>:<n> | --at <t>] [--verbose] [--world-all] [--max-lines N]
       npm run htn:view -- <session.json> --json [the same options]
  Writes one self-contained HTML page (no server, no network) that draws a recorded DebugSession: the timeline of
  every agent, the selected run's refinement tree or the domain's AND/OR map, its plan, why it planned, the world.
  Record one with npm run htn:run -- ... --session <file> or npm run htn:level -- <level> --session <file>.
  --out        the page (default: the session's path with .html)
  --open       open it in the default browser
  --text       print a plain-text report instead (for an AI agent): a line per replan of every agent, then by
               default each agent's last run and every failed run as a refinement-tree outline, its plan, its world
  --json       the same report as JSON (the view model's objects)
  --agent      only this agent (repeat for more)
  --run        one run: the agent and the run number the timeline shows (--run b:7, --run "stalker (2):3")
  --at         the run each agent was on at this time (seconds), the plan strip at it
  --verbose    every attempt as recorded, every fold open
  --world-all  every world row (default: the changed ones and those of the tables the planner read)
  --max-lines  cut the text there (default 200, 0: no limit), saying how many lines were left out
exit: 0 written, 2 usage, an unreadable file, not a session, or an agent / run it does not have`

/** Options of the report only. */
const REPORT_ONLY = ['--agent', '--run', '--at', '--verbose', '-v', '--world-all', '--max-lines']

/** The command line, or what is wrong with it. */
export function parseViewArgs(argv: readonly string[]): ViewArgs | { error: string } {
  let session: string | undefined
  let out: string | undefined
  let open = false
  let report: ViewArgs['report']
  const agents: string[] = []
  let run: ViewArgs['run']
  let at: number | undefined
  let verbose = false
  let worldAll = false
  let maxLines: number | undefined
  let reportOnly: string | undefined
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (REPORT_ONLY.includes(a)) reportOnly ??= a
    const value = (): string => argv[++i] ?? ''
    if (a === '--open') open = true
    else if (a === '--out') {
      out = argv[++i]
      if (!out) return { error: '--out needs a file' }
    } else if (a === '--text' || a === '--json') {
      const mode = a === '--text' ? 'text' : 'json'
      if (report && report !== mode) return { error: '--text or --json, not both' }
      report = mode
    } else if (a === '--agent') {
      const v = value()
      if (!v) return { error: '--agent needs an agent id' }
      agents.push(v)
    } else if (a === '--run') {
      const v = value()
      const m = /^(.+):(\d+)$/.exec(v)
      if (!m) return { error: `--run needs <agent>:<run number>, e.g. --run b:7 (got '${v}')` }
      run = { agent: m[1], seq: Number(m[2]) }
    } else if (a === '--at') {
      const v = value()
      if (!/^-?\d+(\.\d+)?$/.test(v)) return { error: `--at needs a time in seconds (got '${v}')` }
      at = Number(v)
    } else if (a === '--max-lines') {
      const v = value()
      if (!/^\d+$/.test(v)) return { error: `--max-lines needs a whole number (got '${v}')` }
      maxLines = Number(v)
    } else if (a === '--verbose' || a === '-v') verbose = true
    else if (a === '--world-all') worldAll = true
    else if (a === '--help' || a === '-h') return { error: '' }
    else if (a.startsWith('--')) return { error: `unknown option ${a}` }
    else if (session !== undefined) return { error: `one session at a time (got ${session} and ${a})` }
    else session = a
  }
  if (session === undefined) return { error: 'which session file?' }
  if (!report && reportOnly) return { error: `${reportOnly} goes with --text or --json` }
  if (report && (out !== undefined || open)) return { error: '--out and --open make the page; --text / --json print to stdout' }
  if (run && at !== undefined) return { error: '--run or --at, not both' }
  const args: ViewArgs = { session, open }
  if (out !== undefined) args.out = out
  if (report) args.report = report
  if (agents.length) args.agents = agents
  if (run) args.run = run
  if (at !== undefined) args.at = at
  if (verbose) args.verbose = true
  if (worldAll) args.worldAll = true
  if (maxLines !== undefined) args.maxLines = maxLines
  return args
}

/** The default page path for a session file: its name with .html. */
export function defaultOut(session: string): string {
  return /\.json$/i.test(session) ? session.replace(/\.json$/i, '.html') : `${session}.html`
}
