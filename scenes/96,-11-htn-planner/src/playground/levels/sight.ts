// Level 5: the guard sees the tester in the yard and replans: chase, then search where it was last seen.
import { v3 } from '../../htn-planner'
import { act, AgentSetup, expect, LevelInfo, Marker, TesterStep, wait, walk } from '../sim'
import { GuardLevel, inYard, yardMarkers } from './guard-yard'

export class SightLevel extends GuardLevel {
  readonly info: LevelInfo = {
    id: 'sight',
    number: 5,
    title: 'Senses change facts; the NPC replans',
    source: 'guard/guard.domain',
    lesson: [
      'Seen inside the yard -> (target_visible ...) -> chase, catch.',
      'Out of sight -> (last_seen ...) -> investigate, then forget.',
      'Nothing -> patrol, with &advance_patrol picking the next point.'
    ],
    watch: '"replan:" line: each perception change makes a new plan'
  }
  private catchesAtMark = 0

  spots() {
    return { exit: v3(-12.5, 0, -10.5), centre: v3(-1, 0, 0) }
  }
  protected agentSetup(): AgentSetup {
    return this.guardSetup()
  }
  protected testerVisible() {
    return inYard(this.tester.position)
  }
  protected testerStart() {
    return v3(-12.5, 0, -10.5)
  }
  protected testerScript(): TesterStep[] {
    return [
      expect('nobody in the yard -> patrol', () => this.doing('patrol'), 40, 'the guard patrols'),
      walk(v3(-9, 0, -7.8), 'sneaking in'),
      walk(() => this.inFrontOf(this.agent), 'in front of it...'),
      expect('sees the tester -> chase_visible_target', () => this.doing('chase_visible_target'), 15, 'standing in its view'),
      walk('exit', 'run out of the yard!', 7),
      expect('lost -> investigate_last_seen', () => this.doing('investigate_last_seen'), 6),
      expect('gave up -> patrol', () => this.doing('patrol'), 25, 'safe outside'),
      act('', () => (this.catchesAtMark = this.catches)),
      walk(v3(-9, 0, -7.8), 'once more, and I stay'),
      walk(() => this.inFrontOf(this.agent), 'standing still this time'),
      expect('chase again', () => this.doing('chase_visible_target'), 15),
      expect('caught -> !catch', () => this.catches > this.catchesAtMark, 15, 'it got me'),
      walk('exit', 'walking out', 4),
      wait(2, 'phew')
    ]
  }
  markers(): Marker[] {
    return yardMarkers(true)
  }
}
