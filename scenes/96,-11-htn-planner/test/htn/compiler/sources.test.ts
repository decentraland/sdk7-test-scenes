// Source ranges and the debugger-only names in the IR (version 2), checked against upstream's parser ranges
// (HTNCompilerDomainSyntaxParser.cpp): a declaration, branch or task spans its whole form (Source(inForm.Range):
// :414, :456, :565, :582); a condition ends at the end of its last item (:278, :296, :310, :385), and/or/alt and
// comparisons start at the keyword or operator (:277, :309), everything else at the `(`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { CondIR, DomainIR, SourceLoc } from '../../../src/htn-planner/htn/ir'
import { HTN_IR_VERSION } from '../../../src/htn-planner/htn/ir'
import { compile, describe as show, locate } from './helpers'

const TEXT = `(:domain Root top_level_domain
  (:constants (speed 2.5))
  (:method (run ?inp_e) top_level_method
    (go
      (and (pos ?inp_e ?any_cell ?p) (not (blocked ?p)) (> ?p 1) (split_list_front (1 2) ?h ?t) (#near ?p))
      ((!move ?p @speed) (Root::step ?p))))
  (:method (step ?inp_x)
    (only () ((!done))))
  (:axiom (near ?inp_p)
    (or (spot ?inp_p) (call wide ?inp_p)))
)
`

function ir(): DomainIR {
  const r = compile(TEXT)
  assert.ok(r.ok, show(r))
  return r.ir
}

/** The range of `needle` (single line): begin at its first character, end just after it. */
function span(needle: string, from = 0): Omit<SourceLoc, 'file'> {
  const at = locate(TEXT, needle, from)
  return { line: at.line, col: at.col, endLine: at.line, endCol: at.col + needle.length }
}
const strip = (s: SourceLoc | undefined) => (s ? { line: s.line, col: s.col, endLine: s.endLine, endCol: s.endCol } : s)

test('IR version 2 carries source ranges', () => {
  assert.equal(HTN_IR_VERSION, 2)
  assert.equal(ir().version, 2)
})

test('conditions: and from its keyword, others from "(", each ending at its last item', () => {
  const d = ir()
  const cond = d.methods[0].branches[0].cond as Extract<CondIR, { k: 'and' }>
  const andText = 'and (pos ?inp_e ?any_cell ?p) (not (blocked ?p)) (> ?p 1) (split_list_front (1 2) ?h ?t) (#near ?p)'
  assert.deepEqual(strip(cond.source), span(andText))
  const [fact, not, cmp, split, axiom] = cond.items
  assert.deepEqual(strip(fact.source), span('(pos ?inp_e ?any_cell ?p'))
  assert.deepEqual(strip(not.source), span('(not (blocked ?p)'))
  assert.deepEqual(strip((not as Extract<CondIR, { k: 'not' }>).item.source), span('(blocked ?p'))
  assert.deepEqual(strip(cmp.source), span('> ?p 1'))
  assert.deepEqual(strip(split.source), span('(split_list_front (1 2) ?h ?t'))
  assert.deepEqual(strip(axiom.source), span('(#near ?p'))
  const or = d.axioms[0].cond as Extract<CondIR, { k: 'or' }>
  assert.deepEqual(strip(or.source), span('or (spot ?inp_p) (call wide ?inp_p)'))
  assert.equal(or.source?.file, 'Root.domain')
})

test('declarations, branches and tasks span their whole form', () => {
  const d = ir()
  const branch = d.methods[0].branches[0]
  const [move, step] = branch.tasks
  assert.deepEqual(strip(move.source), span('(!move ?p @speed)'))
  assert.deepEqual(strip(step.source), span('(Root::step ?p)'))
  assert.deepEqual(strip(d.methods[1].branches[0].source), span('(only () ((!done)))'))
  assert.deepEqual(strip(d.methods[1].source), { ...span('(:method (step ?inp_x)'), endLine: 8, endCol: 25 })
  assert.deepEqual(strip(d.axioms[0].source), { ...span('(:axiom (near ?inp_p)'), endLine: 10, endCol: 43 })
  const go = strip(branch.source)!
  assert.deepEqual([go.line, go.col, go.endLine, go.endCol], [4, 5, 6, 43])
})

test('names the debugger shows: constants, discards, split_list_front, qualified calls', () => {
  const d = ir()
  const branch = d.methods[0].branches[0]
  const [fact, , , split] = (branch.cond as Extract<CondIR, { k: 'and' }>).items
  assert.deepEqual((fact as Extract<CondIR, { k: 'fact' }>).args[1], { k: 'discard', name: '?any_cell' })
  assert.equal((split as Extract<CondIR, { k: 'split' }>).name, 'split_list_front')
  const [move, step] = branch.tasks
  assert.deepEqual(move.args[1], { k: 'lit', v: { t: 'float', v: 2.5 }, c: 'speed' })
  assert.equal(step.k === 'method' && step.name, 'Root::step')
})
