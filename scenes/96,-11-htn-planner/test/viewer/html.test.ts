// npm run htn:view: one self-contained HTML page per session (script and style inlined, the session embedded as JSON
// that cannot close its element early), its arguments, and the CLI end to end on a recorded session.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defaultOut, parseViewArgs, viewerHtml } from '../../tools/viewer/model/html'

const ROOT = process.env.HTN_REPO_ROOT ?? process.cwd()

test('the page: style and script inline, the session as JSON a </script> inside cannot end', () => {
  const session = JSON.stringify({ note: 'a </script><b>x</b> & "q"', line: 'a b' })
  const html = viewerHtml({ title: 'T <1>', css: 'body{}', js: 'var s="</script>";', session, source: 'x"y.json' })
  assert.match(html, /^<!doctype html>/)
  assert.match(html, /<title>T &lt;1&gt;<\/title>/)
  assert.equal(html.split('</script>').length - 1, 2, 'only the two real closing tags')
  const json = /<script id="htn-session" type="application\/json" data-source="x&quot;y.json">(.*?)<\/script>/s.exec(html)![1]
  assert.deepEqual(JSON.parse(json), JSON.parse(session), 'the embedded JSON reads back the same')
  assert.ok(html.includes('var s="<\\/script>";'))
})

test('arguments: a session, --out, --open; one session; usage errors', () => {
  assert.deepEqual(parseViewArgs(['s.json']), { session: 's.json', open: false })
  assert.deepEqual(parseViewArgs(['s.json', '--out', 'p.html', '--open']), { session: 's.json', out: 'p.html', open: true })
  for (const bad of [[], ['--out'], ['a.json', 'b.json'], ['a.json', '--nope']]) assert.ok('error' in parseViewArgs(bad), bad.join(' '))
  assert.equal(defaultOut('runs/x.json'), 'runs/x.html')
  assert.equal(defaultOut('x'), 'x.html')
})

test('npm run htn:view: writes the page for a recorded session; a file that is not a session exits 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'htn-view-'))
  try {
    const session = join(dir, 'aaa.json')
    const run = spawnSync(process.execPath, [join(ROOT, 'scripts/htn-run.mjs'), '--world', 'aaa/melee-low-health-retreat', '--session', session], { cwd: ROOT, encoding: 'utf8' })
    assert.equal(run.status, 0, run.stderr)
    const view = spawnSync(process.execPath, [join(ROOT, 'scripts/htn-view.mjs'), session], { cwd: ROOT, encoding: 'utf8' })
    assert.equal(view.status, 0, view.stderr)
    assert.match(view.stdout, /page: .*aaa\.html/)
    const html = readFileSync(join(dir, 'aaa.html'), 'utf8')
    assert.ok(html.includes('"AAACombatNPC"'), 'the session is in the page')
    assert.ok(html.length > 100_000, 'the script (with the layout library) is inlined')
    assert.ok(!/<script[^>]+src=/.test(html) && !/<link[^>]+href=/.test(html), 'nothing to fetch')
    const bad = join(dir, 'bad.json')
    writeFileSync(bad, '{"version": 9}')
    const no = spawnSync(process.execPath, [join(ROOT, 'scripts/htn-view.mjs'), bad], { cwd: ROOT, encoding: 'utf8' })
    assert.equal(no.status, 2)
    assert.match(no.stderr, /not a DebugSession: version 9/)
    assert.ok(!existsSync(join(dir, 'bad.html')))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
