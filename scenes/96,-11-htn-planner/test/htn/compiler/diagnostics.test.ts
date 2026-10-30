// Negative cases: located diagnostics with stable codes. Expectations come from upstream
// HTNTest/src/HTNFrontendDiagnosticsTest.cpp, HTNAssignmentSyntaxTest.cpp, HTNNegativeLiteralTest.cpp
// and the validator rules in HTNFramework/src/Translator/HTNCompilerDomainValidator.cpp.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decompose, formatTask, sym, WorldState } from '../../../src/htn-planner'
import { VALID_DOMAIN, compile, describe as show, errors, locate, withBranch } from './helpers'

/** Asserts compilation fails and the first error has `code` (and the location of `at`, if given). */
function rejects(source: string, code: string, at?: string, files: Record<string, string> = {}, file = 'Root.domain') {
  const result = compile(source, files)
  assert.equal(result.ok, false, `expected ${code}, compiled fine:\n${source}`)
  const first = errors(result)[0]
  assert.ok(first, 'has an error')
  assert.equal(first.code, code, show(result))
  assert.ok(first.message.length > 0)
  if (at !== undefined) {
    const text = file === 'Root.domain' ? source : files[file]
    assert.deepEqual({ file: first.file, line: first.line, col: first.col }, { file, ...locate(text, at) }, show(result))
  }
  return first
}

function accepts(source: string, files: Record<string, string> = {}) {
  const result = compile(source, files)
  assert.ok(result.ok, show(result))
  return result.ir
}

const valueDomain = (value: string) =>
  '(:domain Negative top_level_domain\n    (:method (run) top_level_method\n        (branch () ((!value ' + value + ')))))'

test('negative literals and arithmetic operators are accepted (HTNFrontendDiagnosticsTest:33)', () => {
  accepts(
    '(:domain Root top_level_domain (:method (run) top_level_method (ready ' +
      '(and (= ?value -2) (== (- ?value 1) -3) (< -0.5 0.0)) ' +
      '((!act -1 -1.0 -123.456 (- 5 2) (- 1.0) (-- 1.5) (-2 -0.5))))))'
  )
})

test('malformed signed values have located diagnostics (HTNNegativeLiteralTest:149)', () => {
  for (const [value, code] of [
    ['-', 'expected-literal'],
    ['-.', 'invalid-negative-literal'],
    ['-abc', 'invalid-negative-literal'],
    ['--1', 'invalid-negative-literal'],
    ['- 1', 'expected-literal']
  ]) {
    const d = rejects(valueDomain(value), code, value)
    assert.match(d.message, /negative literal/)
  }
})

test('numeric overflow is "Number out of bounds" at the literal (HTNNegativeLiteralTest:169)', () => {
  for (const value of ['-2147483649', '2147483648', '-9999999999999999999999999999999999999999999999999.0']) {
    const d = rejects(valueDomain(value), 'number-out-of-bounds', value)
    assert.equal(d.message, 'Number out of bounds')
  }
  accepts(valueDomain('-2147483648'))
  accepts(valueDomain('2147483647'))
})

test('lexical errors keep CRLF locations (HTNFrontendDiagnosticsTest:112)', () => {
  const prefix = '(:domain Root top_level_domain\r\n  (:method (run) top_level_method (ready () ((!act '
  const cases: [string, string, string, boolean][] = [
    ['$))))', 'unrecognized-character', 'not recognized', false],
    ['"unclosed', 'unterminated-string', 'end of the string', true],
    ['999999999999999999999999))))', 'number-out-of-bounds', 'Number out of bounds', false],
    ['999999999999999999999999999999999999999999999999.0))))', 'number-out-of-bounds', 'Number out of bounds', false]
  ]
  for (const [tail, code, message, atEnd] of cases) {
    const source = prefix + tail
    const result = compile(source)
    assert.equal(result.ok, false)
    const d = errors(result)[0]
    assert.equal(d.code, code)
    assert.ok(d.message.includes(message), d.message)
    const expected = atEnd ? { line: 2, col: source.length - source.indexOf('\n') } : { line: 2, col: prefix.length - prefix.indexOf('\n') }
    assert.deepEqual({ line: d.line, col: d.col }, expected)
  }
})

test('comments run to the physical end of file (HTNFrontendDiagnosticsTest:69)', () => {
  for (const suffix of ['//', '// comment without newline', '// comment\n', '// comment\r\n']) accepts(VALID_DOMAIN + suffix)
})

test('malformed sources fail with located diagnostics (HTNFrontendDiagnosticsTest:94)', () => {
  const cases: [string, string][] = [
    ['', 'expected-domain'],
    ['// no domain', 'expected-domain'],
    ['(:domain Root top_level_domain', 'unclosed-list'],
    ['(:domain Root top_level_domain (:method (run) top_level_method (broken)))', 'expected-branch'],
    ['(:domain Root top_level_domain (:unknown))', 'unknown-declaration'],
    [VALID_DOMAIN + '\n(extra)', 'trailing-source']
  ]
  for (const [source, code] of cases) {
    const d = rejects(source, code)
    assert.equal(d.file, 'Root.domain')
    assert.ok(d.line >= 1)
  }
  rejects(VALID_DOMAIN + '\n(extra)', 'trailing-source', '(extra)')
})

test('include directive syntax errors point at the offending text (HTNFrontendDiagnosticsTest:139)', () => {
  const cases: [string, string, string][] = [
    ['(:include bad)', 'bad', 'expected-include-path'],
    ['(:include "unterminated', '"', 'unterminated-include-path'],
    ['(:include "")', '"', 'expected-include-path'],
    ['(:include "Base.domain" bad)', 'bad', 'expected-include-end']
  ]
  for (const [directive, marker, code] of cases) {
    const source = '// header\r\n  ' + directive
    const result = compile(source)
    assert.equal(errors(result).length, 1, show(result))
    rejects(source, code, marker)
  }
})

test('includes ignore comment and string contents; late includes are misplaced (HTNFrontendDiagnosticsTest:172)', () => {
  const files = { 'Base.domain': '(:domain Base base)// no final newline' }
  accepts(
    '// (:include ignored)\r\n(:include // path follows\r\n "Base.domain" // closing follows\r\n)\r\n' +
      '(:domain Root top_level_domain (:method (run) top_level_method (ready () ((!act "(:include")))))' +
      '// (:include also ignored)',
    files
  )
  rejects(VALID_DOMAIN + '\r\n  (:include "Base.domain")', 'misplaced-include', '(:include', files)
})

test('include failures point to the responsible file (HTNFrontendDiagnosticsTest:195)', () => {
  const root = '// header\r\n  (:include "Base.domain")\r\n' + VALID_DOMAIN
  const cases: [string, string, string][] = [
    ['// child\r\n (:include "Root.domain")\r\n(:domain Base base)', 'include-cycle', '(:include'],
    ['// child\r\n (:include "__htn_missing_diagnostic_fixture__.domain")\r\n(:domain Base base)', 'include-not-found', '(:include'],
    ['// child\r\n(:domain Base base $)', 'unrecognized-character', '$']
  ]
  for (const [child, code, marker] of cases) {
    const files = { 'Base.domain': child, 'Root.domain': root }
    const result = compile(root, files)
    assert.equal(errors(result).length, 1, show(result))
    rejects(root, code, marker, files, 'Base.domain')
  }
})

test('a missing include from the root is include-not-found at the directive', () => {
  rejects('(:include "Nope.domain")\n' + VALID_DOMAIN, 'include-not-found', '(:include')
})

test('includes are loaded once (diamond), relative to the including file', () => {
  const files = {
    'Shared.domain': '(:domain Shared base (:method (shared) (b () ((!shared)))))',
    'Left.domain': '(:include "Shared.domain")\n(:domain Left base (:method (left) (b () ((shared)))))',
    'Right.domain': '(:include "Shared.domain")\n(:domain Right base (:method (right) (b () ((shared)))))'
  }
  const ir = accepts(
    '(:include "Left.domain")\n(:include "Right.domain")\n' +
      '(:domain Root top_level_domain (:method (run) top_level_method (b () ((left) (right)))))',
    files
  )
  assert.deepEqual(
    ir.methods.map(m => `${m.domain}::${m.name}`),
    ['Shared::shared', 'Left::left', 'Right::right', 'Root::run']
  )
})

test('an included domain cannot be top_level_domain or declare top_level_method', () => {
  rejects('(:include "Base.domain")\n' + VALID_DOMAIN, 'included-top-level-domain', undefined, {
    'Base.domain': '(:domain Base top_level_domain (:method (x) top_level_method (b () ())))'
  })
  rejects('(:include "Base.domain")\n' + VALID_DOMAIN, 'top-level-method-in-include', '(:method', {
    'Base.domain': '(:domain Base base (:method (x) top_level_method (b () ())))'
  }, 'Base.domain')
})

test('root must be top_level_domain with at least one top_level_method', () => {
  rejects('(:domain Root (:method (run) (b () ())))', 'root-not-top-level', '(:domain')
  rejects('(:domain Root top_level_domain (:method (run) (b () ())))', 'no-top-level-method', '(:domain')
})

test('assignment: explicit forms are accepted (HTNAssignmentSyntaxTest)', () => {
  for (const condition of [
    '(= ?value (call get_entity_position ?inp_entity))',
    '(= ?value main_threat)',
    '(= ?value (+ 2 3))',
    '(value ?value) (== ?value 3)',
    '(alt (and (= ?value 1)) (and (= ?value 2)))',
    '(or (and (= ?value 1)) (and (= ?value 2)))'
  ])
    accepts(withBranch(condition, '(!result ?value)'))
})

test('assignment: implicit call binding and malformed assignments are rejected', () => {
  rejects(withBranch('(?value (call get_entity_position ?inp_entity))'), 'implicit-assignment')
  for (const condition of ['(= 3 4)', '(= ?value)', '(= ?value 1 2)'])
    rejects(withBranch(condition, '(!result ?value)'), 'invalid-assignment')
})

test('assignment: reassignment, prior use, self-reference, use inside not (HTNAssignmentSyntaxTest:75-94)', () => {
  for (const condition of [
    '(value ?value) (= ?value 3)',
    '(= ?value 1) (= ?value 2)',
    '(= ?value (+ ?value 1))',
    '(not (value ?value)) (= ?value 2)',
    '(alt (and (= ?value 1)) (and (= ?other 2))) (= ?value 3)'
  ]) {
    const d = rejects(withBranch(condition, '(!result ?value)'), 'reassignment')
    assert.match(d.message, /already been declared or used/)
  }
  rejects(withBranch('(= ?inp_entity 2) (value ?value)', '(!result ?value)'), 'assignment-to-input', '(= ?inp_entity')
})

test('axiom parameters: out_/io_ may be assigned once, inp_ never (ASSIGNMENT.md)', () => {
  const domain = (axiom: string) =>
    `(:domain Root top_level_domain\n  (:method (run) top_level_method (b (and (#pick 1 ?x ?y)) ((!r ?x ?y))))\n  ${axiom})`
  accepts(domain('(:axiom (pick ?inp_a ?out_b ?io_c) (and (= ?out_b ?inp_a) (= ?io_c 2)))'))
  accepts(domain('(:axiom (pick ?inp_a ?out_b ?io_c) (alt (and (= ?out_b 1) (= ?io_c 1)) (and (= ?out_b 2) (= ?io_c 2))))'))
  rejects(domain('(:axiom (pick ?inp_a ?out_b ?io_c) (and (= ?inp_a 1) (= ?out_b 1) (= ?io_c 1)))'), 'assignment-to-input')
  rejects(domain('(:axiom (pick ?inp_a ?out_b ?io_c) (and (= ?out_b 1) (= ?out_b 2) (= ?io_c 1)))'), 'reassignment')
  rejects(domain('(:axiom (pick ?inp_a ?out_b ?io_c) (and (fact ?out_b) (= ?out_b 2) (= ?io_c 1)))'), 'reassignment')
  rejects(domain('(:axiom (pick ?inp_a ?b ?io_c) (and (f ?b ?io_c)))'), 'invalid-parameter-prefix', '?b')
})

test('parameters: methods take ?inp_ only; signatures take variables only', () => {
  rejects('(:domain Root top_level_domain (:method (run ?out_x) top_level_method (b () ())))', 'invalid-parameter-prefix', '?out_x')
  rejects('(:domain Root top_level_domain (:method (run 1) top_level_method (b () ())))', 'expected-parameter-variable')
  rejects('(:domain Root top_level_domain (:axiom (a) top_level_method ()) ' + VALID_DOMAIN.slice(31), 'invalid-axiom-visibility')
})

test('# in a task list is rejected with the deferred-call hint', () => {
  const d = rejects(withBranch('(ok)', '(#select ?inp_entity)'), 'axiom-prefix-in-task-list', '(#select')
  assert.match(d.message, /'&' for deferred method calls/)
})

test('unknown variables: tasks, comparisons, callterms, lists; known-anywhere is enough', () => {
  rejects(withBranch('(ok)', '(!attack ?missing)'), 'unknown-variable', '?missing')
  rejects(withBranch('(== ?missing 1)'), 'unknown-variable', '?missing')
  rejects(withBranch('(call check ?missing)'), 'unknown-variable', '?missing')
  rejects(withBranch('(fact (pair ?missing 1))'), 'unknown-variable', '?missing')
  // Upstream DeclareVariables is order-insensitive: a later fact makes the name known.
  accepts(withBranch('(== ?late 1) (later ?late)'))
})

test('discarded ?any_ variables: once per scope, never consumed', () => {
  accepts(withBranch('(presence ?inp_entity ?any_factor ?any_friend)'))
  accepts(withBranch('(a ?any_x) (alt (and (b ?x)) (and (c ?x)))'))
  rejects(withBranch('(presence ?any_x) (other ?any_x)'), 'discard-reused')
  rejects(withBranch('(presence ?any_x)', '(!use ?any_x 1)'), 'discard-consumed', '?any_x 1')
  rejects(withBranch('(presence ?any_x) (== ?any_x 1)'), 'discard-consumed')
  rejects(withBranch('(= ?any_x 1)'), 'discard-consumed')
  rejects(withBranch('(presence ?any_x) (split_list (1 2) ?any_x ?rest)'), 'discard-consumed')
  // Upstream compiles a discard nested in a value to an always-unbound read; we reject it.
  rejects(withBranch('(presence ?any_x) (fact (wrap ?any_x))'), 'discard-consumed', '?any_x))')
})

// D5 (src/htn-planner/htn/README.md, Planner limitations). A fact or split_list argument is matched against an atom reference
// (BuildGeneratedStaticFactMatch, HTNCCodeGenerator.cpp:838-855; split :1270-1272); an arithmetic value there fails
// translation: "Arithmetic expression '...' cannot be used in this generated value context" (:643-657, :671-674).
// One with a call or a runtime list inside is lowered into a hidden assignment first (HTNCompilerIRBuilder.cpp
// HasNestedAssignmentCall :504-515, AddCondition :574-604), so it is accepted, as calls and runtime lists are.
test('arithmetic as a fact or split_list argument is an error at the expression (D5)', () => {
  for (const [condition, expr] of [
    ['(pair (+ ?inp_entity 1) ?y)', '(+ ?inp_entity 1)'],
    ['(pair ?y (- 3))', '(- 3)'],
    ['(split_list (+ 1 2) ?a ?b)', '(+ 1 2)'],
    ['(split_list (1 2) ?a (* ?inp_entity 2))', '(* ?inp_entity 2)']
  ]) {
    const source = withBranch(condition)
    const d = rejects(source, 'arithmetic-argument', expr)
    const at = locate(source, expr)
    assert.deepEqual([d.endLine, d.endCol], [at.line, at.col + expr.length], condition)
    assert.ok(d.message.includes(`'${expr}'`), d.message)
  }
  accepts(withBranch('(pair (+ (call f ?inp_entity) 1) ?y)'))
  accepts(withBranch('(pair (call f (+ ?inp_entity 1)) ?y)'))
  accepts(withBranch('(pair (?inp_entity (+ ?inp_entity 1)) ?y)'))
  accepts(withBranch('(#ax (+ ?inp_entity 1))').replace('(:method', '(:axiom (ax ?inp_v) (and (v ?inp_v)))\n  (:method'))
  accepts(withBranch('(= ?v (+ ?inp_entity 1)) (pair ?v ?y)'))
})

// D11 (src/htn-planner/htn/README.md, Planner limitations). Upstream's validator checks discards only in facts, calls, comparisons,
// split_list and tasks (HTNCompilerDomainValidator.cpp:157-200, no axiom case), but its code generator fails an
// axiom call with a discard in an ?out_/?io_ position ("Generated axiom variable output has no caller/parameter
// slot", HTNCCodeGenerator.cpp:2334-2340). Ours reports discard-consumed at that argument.
test('?any_ as an axiom ?out_ / ?io_ argument is discard-consumed at the call site (D11)', () => {
  const axioms = `(:domain Root top_level_domain
  (:axiom (nearest ?inp_from ?out_place ?out_moves) (and (place ?out_place) (= ?out_moves 3)))
  (:axiom (count ?io_n) (and (= ?io_n 3)))
  (:axiom (seen ?inp_who) (and (saw ?inp_who)))
`
  for (const [call, discard] of [
    ['(#nearest 1 ?p ?any_moves)', '?any_moves'],
    ['(#count ?any_n)', '?any_n']
  ]) {
    const source = axioms + `  (:method (m) top_level_method (b (and ${call}) ((!go))) (f () ((!stuck)))))`
    const d = rejects(source, 'discard-consumed', discard + ')')
    const at = locate(source, discard + ')')
    assert.deepEqual([d.endLine, d.endCol], [at.line, at.col + discard.length], call)
    assert.ok(d.message.includes(`'${discard}'`), d.message)
  }
  // Also inside an axiom body, and through a qualified call.
  rejects(
    axioms + '  (:axiom (wrap ?out_p) (and (#nearest 1 ?out_p ?any_m)))\n  (:method (m) top_level_method (b () ((!go)))))',
    'discard-consumed',
    '?any_m)'
  )
  rejects(axioms + '  (:method (m) top_level_method (b (and (#Root::count ?any_n)) ((!go)))))', 'discard-consumed', '?any_n)')
  // An ?inp_ discard is accepted: an unbound input, as upstream passes NULL (a body fact reading it then fails).
  const ok = compile(axioms + '  (:method (m) top_level_method (b (and (#nearest ?any_from ?p ?moves)) ((!go ?p))) (f (and (#seen ?any_who)) ((!bad)))))')
  assert.ok(ok.ok, show(ok))
  const world = new WorldState()
  world.add('place', sym('counter'))
  const plan = () => decompose(ok.ir, world, 'm', []).plan.map(s => formatTask(s.name, s.args))
  assert.deepEqual(plan(), ['!go counter'])
  world.clearAll()
  world.add('saw', sym('x'))
  assert.deepEqual(plan(), [])
})

test('`()` is rejected in a value position but valid as a condition body', () => {
  rejects(withBranch('(ok)', '(!act ())'), 'empty-literal-list', '())')
  rejects(withBranch('(fact ())'), 'empty-literal-list')
  accepts('(:domain Root top_level_domain (:method (run) top_level_method (b () ())))')
})

test('condition shape errors', () => {
  rejects('(:domain Root top_level_domain (:method (run) top_level_method (b (fact) ())))', 'expected-condition-body')
  rejects(withBranch('(Base::fact 1)'), 'qualified-fact')
  rejects(withBranch('(ok)', '(!Base::act)'), 'qualified-primitive-task')
  rejects(withBranch('(split_list (1 2) ?a)'), 'invalid-split-arity')
  rejects(withBranch('(== 1)'), 'invalid-comparison-arity')
  rejects(withBranch('(== (% 1) 1)'), 'invalid-arithmetic-arity')
  rejects(withBranch('(== (++ 1 2) 1)'), 'invalid-arithmetic-arity')
  rejects(withBranch('(not (a) (b))'), 'invalid-not-condition')
  rejects(withBranch('()'), 'expected-condition')
})

test('unknown method/axiom and arity mismatches', () => {
  rejects(withBranch('(ok)', '(nope 1)'), 'unknown-method', '(nope')
  rejects(withBranch('(ok)', '(&nope)'), 'unknown-method', '(&nope')
  rejects(withBranch('(ok)', '(run)'), 'arity-mismatch', '(run)')
  rejects(withBranch('(#nope)'), 'unknown-axiom', '(#nope')
  rejects(withBranch('(#a 1)') + '', 'unknown-axiom')
  const withAxiom = (call: string) =>
    `(:domain Root top_level_domain (:axiom (a) (and (f))) (:method (run) top_level_method (b (and ${call}) ())))`
  accepts(withAxiom('(#a)'))
  rejects(withAxiom('(#a 1)'), 'arity-mismatch', '(#a 1)')
  rejects(withAxiom('(#Other::a)'), 'unknown-axiom')
})

test('unknown constant', () => {
  rejects(withBranch('(ok)', '(!act @missing)'), 'unknown-constant', '@missing')
  rejects(withBranch('(== (+ @missing 1) 2)'), 'unknown-constant', '@missing')
})

test('constants must be literal entries', () => {
  rejects('(:domain Root top_level_domain (:constants C (x ?y)) ' + VALID_DOMAIN.slice(31), 'expected-constant', '(x ?y)')
  rejects('(:domain Root top_level_domain (:constants C (x (a ?y))) ' + VALID_DOMAIN.slice(31), 'expected-constant-literal')
})

test('duplicate signatures are rejected; other arities are overloads', () => {
  rejects(
    '(:domain Root top_level_domain (:method (run) top_level_method (b () ())) (:method (run) (c () ())))',
    'duplicate-signature'
  )
  rejects(
    '(:domain Root top_level_domain (:method (run) top_level_method (b () ((m 1)))) (:method (m ?inp_a) (b () ())) (:method (m ?inp_b) (b () ())))',
    'duplicate-signature'
  )
  rejects(
    '(:domain Root top_level_domain (:axiom (a ?inp_x) ()) (:axiom (a ?out_x) ()) (:method (run) top_level_method (b () ())))',
    'duplicate-signature'
  )
  rejects('(:include "Base.domain")\n(:domain Root top_level_domain (:method (act) (b () ())) (:method (run) top_level_method (b () ((act)))))', 'duplicate-signature', '(:method (act)', {
    'Base.domain': '(:domain Base base (:method (act) base (b () ())))'
  })
  rejects('(:domain Root top_level_domain (:constants (a 1) (a 2)) (:method (run) top_level_method (b () ())))', 'duplicate-constant', '(a 2)')
})

test('overrides need a matching base declaration in a base domain', () => {
  const files = {
    'Base.domain': '(:domain Base base (:method (act) base (b () ())) (:method (plain) (b () ())) (:constants C base (speed 1)))',
    'NotBase.domain': '(:domain NotBase (:method (act) (b () ())))'
  }
  const root = (decl: string, include = 'Base.domain') =>
    `(:include "${include}")\n(:domain Root top_level_domain ${decl} (:method (run) top_level_method (b () ())))`
  accepts(root('(:method (act) overrides Base (b () ()))'), files)
  rejects(root('(:method (act ?inp_x) overrides Base (b () ()))'), 'invalid-override', '(:method (act ?inp_x)', files)
  rejects(root('(:method (plain) overrides Base (b () ()))'), 'invalid-override', undefined, files)
  rejects(root('(:method (act) overrides Missing (b () ()))'), 'invalid-override', undefined, files)
  rejects(root('(:method (act) overrides NotBase (b () ()))', 'NotBase.domain'), 'invalid-override', undefined, files)
  rejects(root('(:method (act2) base (b () ()))'), 'base-outside-base-domain', '(:method (act2)', files)
  rejects(root('(:constants C2 overrides Base (other 2))'), 'invalid-override', '(other 2)', files)
  rejects(root('(:constants C2 overrides NotBase (speed 2))', 'NotBase.domain'), 'invalid-override', '(:constants', files)
})

test('recursive axiom dependency cycles are rejected; recursive methods are fine', () => {
  const d = rejects(
    '(:domain Root top_level_domain (:axiom (a) (and (#b))) (:axiom (b) (and (#a))) (:method (run) top_level_method (x (and (#a)) ())))',
    'axiom-cycle'
  )
  assert.match(d.message, /a\/0 -> b\/0 -> a\/0/)
  rejects('(:domain Root top_level_domain (:axiom (a ?inp_x) (or (f ?inp_x) (#a ?inp_x))) (:method (run) top_level_method (x () ())))', 'axiom-cycle')
  // Calling another arity of the same name is fine without a cycle (AXIOM_OVERLOADS.md).
  accepts('(:domain Root top_level_domain (:axiom (a) (and (#a 1))) (:axiom (a ?inp_x) (and (f ?inp_x))) (:method (run) top_level_method (x (and (#a)) ())))')
  accepts('(:domain Root top_level_domain (:method (run ?inp_n) top_level_method (x (and (> ?inp_n 0)) ((run (-- ?inp_n)))) (y () ())))')
})

test('CRLF sources: semantic errors keep line/column', () => {
  const source = '(:domain Root top_level_domain\r\n  (:method (run) top_level_method\r\n    (b () ((!act ?missing)))))\r\n'
  rejects(source, 'unknown-variable', '?missing')
})

test('several independent errors are all reported', () => {
  const result = compile(
    '(:domain Root top_level_domain\n (:method (run) top_level_method (b () ((!a ?x) (nope))))\n (:method (other) (b () ((!c ?y)))))'
  )
  assert.deepEqual(
    errors(result).map(d => d.code),
    ['unknown-variable', 'unknown-variable', 'unknown-method']
  )
})
