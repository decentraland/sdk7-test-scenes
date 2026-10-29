import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'

const ROOT = process.env.HTN_REPO_ROOT ?? process.cwd()
for (const script of ['scripts/htn-notices.mjs', 'tools/htn-authoring/notices.mjs']) {
  test(`${script}: unavailable SDK publication API gives actionable compatibility failure`, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'htn-notice-test-'))
    try {
      for (const rel of [script, 'src/htn-planner/LICENSE', 'src/htn-planner/LICENSE.htn_planner']) {
        fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
        fs.copyFileSync(path.join(ROOT, rel), path.join(dir, rel))
      }
      const run = (...args: string[]) => spawnSync(process.execPath, [path.join(dir, script), ...args], { cwd: dir, encoding: 'utf8', windowsHide: true })
      const generated = run()
      assert.equal(generated.status, 0, generated.stdout + generated.stderr)
      const checked = run('--check')
      assert.equal(checked.status, 1)
      assert.match(checked.stderr, /Cannot inspect SDK publishable files/)
      assert.match(checked.stderr, /supported SDK|SDK version/)
      assert.match(checked.stderr, /htn:notices.*--check/)
    } finally {
      assert.equal(path.dirname(dir), os.tmpdir())
      assert.ok(path.basename(dir).startsWith('htn-notice-test-'))
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
}
