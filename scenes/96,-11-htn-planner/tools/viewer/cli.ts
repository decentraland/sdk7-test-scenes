// npm run htn:view -- <session.json> [--out file.html] [--open]: write the session viewer page for a recorded
// DebugSession; with --text (--json), print its report (model/report.ts) instead. Run by scripts/htn-view.mjs, which
// bundles the page first (not for a report) and passes its script's path in HTN_VIEWER_JS. Exit 0 written, 2 usage,
// an unreadable file, not a session, or an agent / run the session does not have. Never prints a stack trace for a
// user error.
import { spawn } from 'node:child_process'
import * as fs from 'node:fs'
import * as nodePath from 'node:path'
import { parseSession } from '../../src/htn-planner/debug/session'
import type { DebugSession } from '../../src/htn-planner/debug/session'
import { defaultOut, parseViewArgs, VIEW_USAGE, viewerHtml } from './model/html'
import type { ViewArgs } from './model/html'
import { reportOptionError, reportText, sessionReport } from './model/report'
import type { ReportOptions } from './model/report'

/** --text / --json: the report on stdout (exit 2 for an agent or run the session does not have). */
function report(args: ViewArgs, session: DebugSession, file: string): number {
  const opts: ReportOptions = { source: nodePath.basename(file) }
  if (args.agents) opts.agents = args.agents
  if (args.run) opts.run = args.run
  if (args.at !== undefined) opts.at = args.at
  if (args.verbose) opts.verbose = true
  if (args.worldAll) opts.worldAll = true
  const wrong = reportOptionError(session, opts)
  if (wrong) {
    console.error(`htn:view: ${wrong}`)
    return 2
  }
  const r = sessionReport(session, opts)
  process.stdout.write(args.report === 'json' ? `${JSON.stringify(r)}\n` : reportText(r, { maxLines: args.maxLines, verbose: args.verbose === true, worldAll: args.worldAll === true }))
  return 0
}

function main(argv: readonly string[]): number {
  const args = parseViewArgs(argv)
  if ('error' in args) {
    if (args.error) console.error(`htn:view: ${args.error}`)
    console.error(VIEW_USAGE)
    return 2
  }
  const cwd = process.env.INIT_CWD ?? process.cwd()
  const file = nodePath.resolve(cwd, args.session)
  let text: string
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch (e) {
    console.error(`htn:view: cannot read '${args.session}': ${(e as Error).message}`)
    return 2
  }
  let title: string
  try {
    const s = parseSession(text)
    if (args.report) return report(args, s, file)
    const agents = new Set(s.runs.map(r => r.agent)).size
    title = `HTN session · ${s.domain.name} · ${agents} agent${agents === 1 ? '' : 's'}, ${s.runs.length} run${s.runs.length === 1 ? '' : 's'}`
  } catch (e) {
    console.error(`htn:view: ${args.session}: ${(e as Error).message}`)
    return 2
  }
  const root = process.env.HTN_REPO_ROOT ?? process.cwd()
  const js = fs.readFileSync(process.env.HTN_VIEWER_JS ?? '', 'utf8')
  const css = fs.readFileSync(nodePath.join(root, 'tools/viewer/page/style.css'), 'utf8')
  const out = nodePath.resolve(cwd, args.out ?? defaultOut(args.session))
  try {
    fs.writeFileSync(out, viewerHtml({ title, css, js, session: text.trim(), source: nodePath.basename(file) }))
  } catch (e) {
    console.error(`htn:view: cannot write '${out}': ${(e as Error).message}`)
    return 2
  }
  const kb = Math.round(fs.statSync(out).size / 1024)
  console.log(`page: ${out} (${kb} KB)`)
  if (args.open) {
    const opener = process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', `"${out}"`]] : process.platform === 'darwin' ? ['open', [out]] : ['xdg-open', [out]]
    try {
      spawn(opener[0] as string, opener[1] as string[], { detached: true, stdio: 'ignore', shell: process.platform === 'win32', windowsVerbatimArguments: true }).unref()
    } catch {
      console.error(`htn:view: could not open a browser; open ${out} yourself`)
    }
  }
  return 0
}

process.exitCode = main(process.argv.slice(2))
