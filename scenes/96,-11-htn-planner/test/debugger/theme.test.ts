// Rich-text escaping (src/debugger/theme.ts): a '<' that could open a tag is defused, a '<' before a digit or a space
// (a time under the clock step, a comparison) is not a tag and stays.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { colored, escapeRich } from '../../src/debugger/theme'

test('escapeRich: tags defused, "<1 ms" and "(< ?hp 20)" kept', () => {
  assert.equal(escapeRich('<b>x</b> <color=#fff>'), '‹b>x‹/b> ‹color=#fff>')
  assert.equal(escapeRich('last <1 ms'), 'last <1 ms')
  assert.equal(escapeRich('(< ?hp 20)'), '(< ?hp 20)')
  assert.equal(escapeRich('(<= ?hp 20)'), '(‹= ?hp 20)')
  assert.equal(colored('#fff', '<1 ms'), '<color=#fff><1 ms</color>')
})
