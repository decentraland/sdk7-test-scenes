import { readFile } from 'node:fs/promises'
import { bakeNavcatMesh, createNavcatNavigatorFromMesh } from '../src/navigation'
import { readReplayText, replayBakeSettings, replayGeometry, replayNavigation } from '../src/recipes/recipe-creator-behavior-replay'

const file = process.argv[2]
if (!file || process.argv.length !== 3) {
  throw new Error('Usage: pnpm exec tsx scripts/recipe-creator-behavior-replay.ts <Explorer log or replay JSON>')
}
const trace = readReplayText(await readFile(file, 'utf8'))
const nav = createNavcatNavigatorFromMesh(bakeNavcatMesh(replayGeometry(), replayBakeSettings()))
console.log(JSON.stringify(replayNavigation(trace, nav), null, 2))
