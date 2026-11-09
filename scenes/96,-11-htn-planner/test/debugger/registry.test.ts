// The debug registry (src/debugger/registry.ts): sources list their hosts as they are now.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { WorldState } from '../../src/htn-planner'
import { DebugHost, DebugRegistry, nearestHost } from '../../src/debugger/registry'
import { aaaCombatDomain } from '../../src/examples/upstream/generated/AAACombatNPC.htn'

const host = (id: string, x: number, entity?: number): DebugHost => ({
  id,
  label: id,
  group: 'g',
  domain: aaaCombatDomain,
  recorder: null,
  world: new WorldState(),
  entity,
  position: () => ({ x, y: 0, z: 0 }),
  status: () => ({ state: 'idle', lastStatus: '', reason: '', current: '', steps: [], done: [] })
})

test('sources are read live; removing one drops its hosts', () => {
  const r = new DebugRegistry()
  let crew = [host('a', 0, 512)]
  const v0 = r.version
  const remove = r.add(() => crew)
  r.add(() => [host('station', 10)])
  assert.ok(r.version > v0)
  assert.deepEqual(r.hosts().map(h => h.id), ['a', 'station'])
  crew = [host('a', 0, 600), host('b', 3)] // a Reset rebuilt the crew
  assert.deepEqual(r.hosts().map(h => h.id), ['a', 'b', 'station'])
  assert.equal(r.find('b')?.id, 'b')
  assert.equal(r.byEntity(600)?.id, 'a')
  assert.equal(r.find(null), undefined)
  remove()
  assert.deepEqual(r.hosts().map(h => h.id), ['station'])
})

test('nearestHost: on the ground plane, within a radius', () => {
  const hosts = [host('a', 0), host('b', 5), host('c', 20)]
  assert.equal(nearestHost(hosts, { x: 4, y: 9, z: 0 })?.id, 'b')
  assert.equal(nearestHost(hosts, { x: 50, y: 0, z: 0 }, 10), undefined)
})

test('areas: a source added with its map area lists it with its hosts; removing it drops both', () => {
  const r = new DebugRegistry()
  r.add(() => [host('runner', 0)])
  const remove = r.add(() => [host('a', 1), host('b', 2)], { label: 'pad', half: { x: 14, z: 13 } })
  const areas = r.areas()
  assert.equal(areas.length, 1)
  assert.equal(areas[0].area.label, 'pad')
  assert.deepEqual(areas[0].hosts.map(h => h.id), ['a', 'b'])
  remove()
  assert.equal(r.areas().length, 0)
})
