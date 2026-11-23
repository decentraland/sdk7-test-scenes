import { resolve } from 'node:path'
import { writeFixtures } from './fixtures'

const directory = resolve(process.argv[2] ?? '.comparison')
console.log(await writeFixtures(directory))
