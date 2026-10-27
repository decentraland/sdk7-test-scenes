import { Entity, engine, PlayerIdentityData } from '@dcl/sdk/ecs'
import { syncEntity } from '@dcl/sdk/network'
import { Storage } from '@dcl/sdk/server'
import { StorageProbe } from './storage-probe'

// Same shape as the old flush(): fresh read, append, write the whole value back in place. Only while players are in:
// that is when the feedback server flushes.
const ROUND_MS = 10_000
const LOG_KEY = 'storage-probe-log'
const OWNER_KEY = 'storage-probe-owner' // { id, at } of the last instance that wrote
// past this the log starts over: the feedback parts that lost rows were ~8 KB
const LOG_MAX_BYTES = 16 * 1024
// another instance wrote the owner key this recently: it is running now
const OTHER_ALIVE_MS = 3 * ROUND_MS

const instance = Math.floor(Math.random() * 36 ** 4).toString(36).padStart(4, '0')
let probeEntity: Entity
let seq = 0
let lastLine = ''
let lastWritten = 0
let busy = false
let acc = 0

export function startProbe(): void {
  probeEntity = engine.addEntity()
  StorageProbe.create(probeEntity, {
    instance,
    rounds: 0,
    otherInstances: 0,
    shortReads: 0,
    nullReads: 0,
    staleReadBacks: 0,
    errors: 0,
    bytes: 0,
    lastIssue: ''
  })
  syncEntity(probeEntity, [StorageProbe.componentId])
  console.log(`[PROBE] instance ${instance} started`)
  engine.addSystem((dt) => {
    acc += dt * 1000
    if (acc < ROUND_MS || busy || !anyPlayer()) return
    acc = 0
    busy = true
    void round().finally(() => (busy = false))
  })
}

async function round(): Promise<void> {
  const probe = () => StorageProbe.getMutable(probeEntity)
  const issue = (counter: 'otherInstances' | 'shortReads' | 'nullReads' | 'staleReadBacks', text: string) => {
    probe()[counter]++
    probe().lastIssue = `${new Date().toISOString().slice(11, 19)} ${text}`
    console.log(`[PROBE] ${instance} ${counter}: ${text}`)
  }
  try {
    // H1
    const owner = await Storage.get<{ id: string; at: number }>(OWNER_KEY, { fresh: true })
    if (owner && owner.id !== instance && Date.now() - owner.at < OTHER_ALIVE_MS) {
      issue('otherInstances', `instance ${owner.id} wrote ${Math.round((Date.now() - owner.at) / 1000)} s ago`)
    }
    await Storage.set(OWNER_KEY, { id: instance, at: Date.now() })

    const read = await Storage.get<string>(LOG_KEY, { fresh: true })
    // H3
    if (read === null && lastWritten > 0) issue('nullReads', `null, last write was ${lastWritten} B`)
    // H2 (or H1, if an instance was counted above): our own last line is gone
    if (read !== null && lastLine && !read.includes(lastLine)) {
      issue('shortReads', `read ${read.length} B without our last line, last write was ${lastWritten} B`)
    }

    seq++
    lastLine = `${instance} ${seq} ${new Date().toISOString()}`
    const base = read ?? ''
    const value = base.length + lastLine.length > LOG_MAX_BYTES ? lastLine : base ? `${base}\n${lastLine}` : lastLine
    if (!(await Storage.set(LOG_KEY, value))) throw new Error('Storage.set returned false')
    lastWritten = value.length

    // H2 right after the write
    const back = await Storage.get<string>(LOG_KEY, { fresh: true })
    if (back === null || !back.includes(lastLine)) {
      issue('staleReadBacks', `read-back ${back === null ? 'null' : `${back.length} B`} right after writing ${value.length} B`)
    }
    probe().rounds++
    probe().bytes = value.length
    if (probe().rounds % 6 === 0) console.log(`[PROBE] ${instance} ${JSON.stringify(StorageProbe.get(probeEntity))}`)
  } catch (e) {
    probe().errors++
    probe().lastIssue = `${new Date().toISOString().slice(11, 19)} error: ${e}`
    console.log(`[PROBE] ${instance} error:`, e)
  }
}

function anyPlayer(): boolean {
  for (const _ of engine.getEntitiesWith(PlayerIdentityData)) return true
  return false
}
