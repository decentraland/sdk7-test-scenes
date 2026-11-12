// The viewer's refinement tree (task -> branch tried -> subtasks, Nau's figure): built over upstream's Normal /
// Verbose projection (viewRows), a branch is a card whose lines are its precondition with values, chosen / failed /
// backtracked after its condition held / not tried; failed subtrees fold to "× N attempts", the failure path of a
// failed run stays open.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { int, sym } from '../../src/htn-planner/htn/atom'
import { FigNode, failureCause, figNodes, nodeLabel, planTree } from '../../tools/viewer/model/plan-tree'
import { planned } from './helpers'

const FIG = `(:domain Fig top_level_domain
  (:method (run) top_level_method
    (script (and (scripted ?o)) ((!do_script ?o)))
    (fight (and (enemy ?e) (not (dead ?e)) (dist ?e ?d) (< ?d 5)) ((!announce) (attack ?e)))
    (idle () ((!wait 1))))
  (:method (attack ?inp_e)
    (melee (and (weapon melee)) ((!swing ?inp_e)))
    (ranged (and (weapon ranged) (ammo ?n) (> ?n 0)) ((!shoot ?inp_e)))
    (punch () ((!punch ?inp_e)))))`

const FIG_FACTS = [
  ['enemy', int(1)],
  ['enemy', int(2)],
  ['dead', int(1)],
  ['dist', int(2), int(3)],
  ['weapon', sym('ranged')],
  ['ammo', int(0)]
] as const

/** The figure as text: `glyph title (sub)`, card lines under it with `|`, children indented; a fold says so. */
function dump(root: FigNode): string[] {
  const glyph = { chosen: '✓', failed: '×', backtracked: '↶', untried: '·', running: '▶' } as const
  const out: string[] = []
  const walk = (n: FigNode, depth: number) => {
    const pad = '  '.repeat(depth)
    out.push(`${pad}${glyph[n.status]} ${n.title}${n.sub ? ` (${n.sub})` : ''}${n.children.length && !n.open ? ` [+${n.hiddenFailures}]` : ''}`)
    for (const l of n.lines)
      out.push(`${pad}  |${'  '.repeat(l.depth)} ${glyph[l.status]} ${l.text}${l.retries ? ` ↺${l.retries}` : ''}${l.note ? ` — ${l.note}` : ''}`)
    if (n.open) for (const c of n.children) walk(c, depth + 1)
  }
  walk(root, 0)
  return out
}

test('a succeeded run: the root task, each branch tried as a card with its precondition, subtasks, untried branches', () => {
  const p = planned(FIG, FIG_FACTS, 'run')
  const root = planTree(p.run, p.graph)!
  assert.deepEqual(dump(root), [
    '✓ run',
    '  × script',
    '    | × scripted(?o) — no rows',
    '  ✓ fight',
    '    | ✓ enemy(2) ↺2',
    '    | ✓ ¬ dead(2) ↺2',
    '    | ✓ dist(2, 3)',
    '    | ✓ 3 < 5',
    '    ✓ announce',
    '    ✓ attack(2)',
    '      × melee',
    '        | × weapon(melee) — 1 row, none match',
    '      × ranged',
    '        | ✓ weapon(ranged)',
    '        | ✓ ammo(0) ↺2',
    '        | × 0 > 0',
    '      ✓ punch',
    '        ✓ punch(2)',
    '  · not tried (idle)'
  ])
  assert.equal(root.kind, 'task')
  const kinds = figNodes(root).map(n => n.kind)
  assert.deepEqual([...new Set(kinds)].sort(), ['branch', 'step', 'task', 'untried'])
})

test('Verbose lists every attempt as recorded (terms pre-created by their conjunction first), Normal one per term', () => {
  const p = planned(FIG, FIG_FACTS, 'run')
  const fight = planTree(p.run, p.graph, { mode: 'verbose' })!.children[1]
  assert.deepEqual(
    fight.lines.map(l => `${l.status} ${l.text}`),
    ['chosen enemy(1)', 'failed ¬ dead(1)', 'chosen dist(2, 3)', 'chosen 3 < 5', 'chosen enemy(2)', 'chosen ¬ dead(2)']
  )
  const ranged = planTree(p.run, p.graph, { mode: 'verbose' })!.children[1].children[1].children[1]
  assert.deepEqual(
    ranged.lines.map(l => `${l.status} ${l.text}${l.note ? ' — ' + l.note : ''}`),
    ['chosen weapon(ranged)', 'chosen ammo(0)', 'failed 0 > 0', 'failed ammo(?n) — 1 row, none match']
  )
})

test('a term never reached shows in Verbose only, in grey', () => {
  const p = planned(
    `(:domain Short top_level_domain
  (:method (go) top_level_method
    (first (and (a) (b) (c)) ((!one)))
    (other () ((!two)))))`,
    [['b']],
    'go'
  )
  const normal = planTree(p.run, p.graph)!.children[0]
  assert.deepEqual(normal.lines.map(l => `${l.status} ${l.text}`), ['failed a'])
  const verbose = planTree(p.run, p.graph, { mode: 'verbose' })!.children[0]
  assert.deepEqual(verbose.lines.map(l => `${l.status} ${l.text}`), ['failed a', 'untried b', 'untried c'])
})

const BACKTRACK = `(:domain Back top_level_domain
  (:method (go) top_level_method
    (pick (and (item ?x)) ((use ?x)))
    (none () ((!give_up))))
  (:method (use ?inp_x)
    (ok (and (usable ?inp_x)) ((!use ?inp_x)))))`

test('a branch whose condition held but whose subtasks failed: backtracked, its subtree folded to × N attempts', () => {
  const p = planned(BACKTRACK, [['item', sym('a')]], 'go')
  assert.equal(p.run.status, 'succeeded')
  const root = planTree(p.run, p.graph)!
  assert.deepEqual(dump(root), ['✓ go', '  ↶ pick [+1]', '    | ✓ item(a)', '  ✓ none', '    ✓ give_up'])
  const pick = root.children[0]
  assert.equal(pick.key, `n${pick.node}`)
  const opened = planTree(p.run, p.graph, { open: new Map([[pick.key, true]]) })!
  assert.deepEqual(dump(opened).slice(1, 4), ['  ↶ pick', '    | ✓ item(a)', '    × use(a) [+1]'])
})

test('a failed run keeps its failure path open: every branch down to the last one that failed', () => {
  const p = planned(
    `(:domain Fail top_level_domain
  (:method (go) top_level_method
    (pick (and (item ?x)) ((use ?x))))
  (:method (use ?inp_x)
    (ok (and (usable ?inp_x)) ((!use ?inp_x)))))`,
    [['item', sym('a')]],
    'go'
  )
  assert.equal(p.run.status, 'no_plan')
  assert.deepEqual(dump(planTree(p.run, p.graph)!), [
    '× go',
    '  ↶ pick',
    '    | ✓ item(a)',
    '    × use(a)',
    '      × ok',
    '        | × usable(a) — no rows'
  ])
  const cause = failureCause(planTree(p.run, p.graph)!)!
  assert.deepEqual([cause.task, cause.branch, cause.line?.text, cause.line?.note], ['use(a)', 'ok', 'usable(a)', 'no rows'], 'why it failed: the last branch tried and its term')
  const fig = planned(FIG, FIG_FACTS, 'run')
  assert.equal(failureCause(planTree(fig.run, fig.graph)!)?.branch, 'ranged', 'a succeeded run: its last failure')
})

test('an empty run has no tree; a run without nodes never throws', () => {
  const p = planned(FIG, FIG_FACTS, 'run')
  assert.equal(planTree({ ...p.run, nodes: [] }, p.graph), null)
})

test('a variable a held literal left unbound reads as a wildcard; a failed one keeps its name', () => {
  const node = (succeeded: boolean) => ({
    id: 0,
    parent: -1,
    kind: 'fact' as const,
    ref: 0,
    name: '(target_visible ?target ?any_position)',
    tokens: [],
    started: true,
    completed: true,
    succeeded,
    before: [],
    after: [{ name: 'target', value: sym('tester') }],
    children: []
  })
  assert.equal(nodeLabel(node(true)), 'target_visible(tester, _)')
  assert.equal(nodeLabel({ ...node(false), after: [], before: [] }), 'target_visible(?target, _)', 'a discard is _ either way')
})

test('three or more branches in a row that failed at their precondition read as one card, a line each', () => {
  const p = planned(
    `(:domain Many top_level_domain
  (:method (go) top_level_method
    (one (and (a)) ((!x)))
    (two (and (b ?v) (> ?v 3)) ((!x)))
    (three (and (c)) ((!x)))
    (four () ((!y)))
    (five () ((!z)))))`,
    [['b', int(1)]],
    'go'
  )
  const root = planTree(p.run, p.graph)!
  assert.deepEqual(dump(root), [
    '✓ go',
    '  × 3 branches failed (their preconditions did not hold) [+3]',
    '    | × one: a — no rows',
    '    | × two: 1 > 3',
    '    | × three: c — no rows',
    '  ✓ four',
    '    ✓ y',
    '  · not tried (five)'
  ])
  const group = root.children[0]
  assert.equal(group.kind, 'failures')
  assert.deepEqual(group.children.map(c => c.title), ['one', 'two', 'three'])
  const opened = planTree(p.run, p.graph, { open: new Map([[group.key, true]]) })!
  assert.equal(dump(opened)[5], '    × one')
})
