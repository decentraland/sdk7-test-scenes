// The belief upkeep (GuardAgentOptions.reasoning) in the session viewer: a replan says which upkeep steps ran before
// its plan, on the timeline marker, the timeline line and the run's "why".
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { levelSession, runLevel } from '../../src/playground/headless'
import { AmbushLevel } from '../../src/playground/levels/ambush'
import { indexSession } from '../../tools/viewer/model/session-index'
import { timelineModel } from '../../tools/viewer/model/timeline'
import { reportText, sessionReport } from '../../tools/viewer/model/report'

test('a replan with upkeep: the marker lists its steps; the text report shows them on the timeline line and under why', () => {
  const level = new AmbushLevel()
  runLevel(level, { seconds: 45, record: true })
  const session = levelSession(level)
  const withUpkeep = session.timeline.find(e => e.event.type === 'replan' && (e.event.upkeep?.length ?? 0) > 0)
  assert.ok(withUpkeep, 'level 12: the noise it went to look at is dropped by the upkeep once it hunts the one it saw')
  const markers = timelineModel(indexSession(session)).tracks.flatMap(t => t.markers)
  assert.ok(markers.some(m => (m.upkeep?.length ?? 0) > 0))
  const text = reportText(sessionReport(session, {}), { maxLines: 0 })
  assert.match(text, /upkeep: /)
})
