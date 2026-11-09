import * as fs from 'node:fs'
import path from 'node:path'
import { formatTask } from '../../src/htn-planner/htn/atom'
import { decompose } from '../../src/htn-planner/htn/planner'
import { PlanTraceRecorder } from '../../src/htn-planner/htn/trace'
import { buildSession } from '../../src/htn-planner/debug/session'
import { Rng } from '../../src/htn-planner/npc/rng'
import { Stage } from '../../src/htn-testing/paper'
import { InvalidWorldError, InvariantConfigError } from '../htn/world-invariants'
import { loadConsumer } from './load'
import type { ConsumerManifest } from './manifest'

const USAGE = `Usage: node scripts/htn-check.mjs <game.tests.ts> [--seed <uint32>] [--case <name>] [--json] [--session <directory>]
Manifest default-exports ConsumerManifest; all paths resolve beside it. Expectations must be written before the first run.
Exit 0: expectations match; 1: mismatch/runtime failure; 2: config/compile error; 3: unexpected invalid_world.
--session writes one portable DebugSession per recorded case; text and JSON reports include traces.`
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
export function runCheck(manifest: ConsumerManifest, baseDir: string, args: readonly string[]): number {
  const json = args.includes('--json')
  let seed = 1, selected: string | undefined, sessionDir: string | undefined
  try {
    for (let i = 0; i < args.length; i++) {
      const a = args[i]
      if (a === '--json') continue
      if (a === '--help') { console.log(USAGE); return 0 }
      const v = args[++i]
      if (v === undefined) throw new Error(a + ' needs a value')
      if (a === '--seed' && /^\d+$/.test(v) && Number(v) <= 0xffffffff) seed = Number(v)
      else if (a === '--case') selected = v
      else if (a === '--session') sessionDir = path.resolve(baseDir, v)
      else throw new Error('unknown option or invalid value: ' + a)
    }
    const loaded = loadConsumer(manifest, baseDir)
    const results: { name: string; kind: string; status: string; matches: boolean; plan?: string[]; trace?: string[]; expected: unknown; diagnostics?: string[]; error?: string; session?: string }[] = []
    const writeSession = (name: string, session: unknown): string | undefined => {
      if (!sessionDir || session === undefined) return undefined
      fs.mkdirSync(sessionDir, { recursive: true })
      // Use position, not author-controlled case names, as the filename.
      const file = path.join(sessionDir, `case-${results.length + 1}.json`)
      fs.writeFileSync(file, JSON.stringify(session))
      return file
    }
    for (const s of loaded.scenarios.filter(s => !selected || s.name === selected)) {
      try {
        const world = loaded.world(s), diagnostics: string[] = []
        const recorder = new PlanTraceRecorder(loaded.domain)
        const result = decompose(loaded.domain, world, s.method, s.args ?? [], {
          ...loaded.bindings(world, seed), mode: s.mode, trace: recorder,
          calltermErrorPolicy: 'report', onDiagnostic: d => diagnostics.push(d.message)
        })
        const plan = result.plan.map(p => formatTask(p.name, p.args))
        results.push({ name: s.name, kind: 'scenario', status: result.status,
          matches: result.status === s.expect.status && same(plan, s.expect.plan) && diagnostics.length === 0,
          plan, expected: s.expect, diagnostics,
          session: writeSession(s.name, buildSession({ domain: loaded.domain, agents: [{ id: s.name, recorder, world }] })) })
      } catch (error) {
        if (error instanceof InvariantConfigError) throw error
        const status = error instanceof InvalidWorldError ? 'invalid_world' : 'runtime_error'
        results.push({ name: s.name, kind: 'scenario', status, matches: status === s.expect.status,
          expected: s.expect, error: (error as Error).message })
      }
    }
    for (const s of (manifest.stories ?? []).filter(s => !selected || s.name === selected)) {
      const story = { ...s, station: 'game', blurb: s.name, play: () => {} }
      const stage = new Stage(story, { domain: id => id === 'game' ? loaded.domain : undefined,
        scenario: (_id, name) => { const scenario = loaded.scenarios.find(s => s.name === name); return scenario ? loaded.world(scenario) : undefined },
        record: sessionDir !== undefined,
        validate: (_id, world, agent) => loaded.invariants?.assert(world, `${s.name}/${agent}`) })
      try {
        s.play(stage, { seed, rng: new Rng(seed), bindings: (w, ownSeed = seed) => loaded.bindings(w, ownSeed) })
        for (const a of stage.agents) a.validateWorld()
        const matches = same(stage.trace, s.expect) && !stage.trace.some(t => /(^|: )(problem:|diagnostic:)/.test(t))
        results.push({ name: s.name, kind: 'story', status: 'completed', matches, trace: stage.trace, expected: s.expect,
          session: writeSession(s.name, stage.session()) })
      } catch (error) {
        if (error instanceof InvariantConfigError) throw error
        results.push({ name: s.name, kind: 'story', status: error instanceof InvalidWorldError ? 'invalid_world' : 'runtime_error',
          matches: false, trace: stage.trace, expected: s.expect, error: (error as Error).message })
      }
    }
    if (!results.length) throw new Error(selected ? 'unknown case: ' + selected : 'manifest contains no cases')
    const exit = results.some(r => !r.matches && r.status === 'invalid_world') ? 3 : results.some(r => !r.matches) ? 1 : 0
    const report = { version: 1, status: exit === 0 ? 'passed' : 'failed', seed, warnings: loaded.warnings, results }
    if (json) console.log(JSON.stringify(report))
    else {
      console.log(`HTN checks: ${report.status}; seed ${seed}`)
      for (const r of results) {
        console.log(`${r.matches ? 'PASS' : 'FAIL'} ${r.name}: ${r.status}`)
        for (const line of r.plan ?? r.trace ?? []) console.log('  ' + line)
        if (!r.matches) console.log('  expected: ' + JSON.stringify(r.expected))
        if (r.error) console.log('  ' + r.error)
        if (r.session) console.log('  session: ' + r.session)
      }
    }
    return exit
  } catch (error) {
    if (json) console.log(JSON.stringify({ version: 1, status: 'config_error', error: (error as Error).message }))
    else console.error('htn:check: ' + (error as Error).message)
    return 2
  }
}
