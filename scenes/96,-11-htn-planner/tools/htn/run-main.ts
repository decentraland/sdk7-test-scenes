// Entry of `npm run htn:run` (scripts/htn-run.mjs bundles it): tools/htn/run.ts on the process's arguments.
import { runCli } from './run'

process.exitCode = runCli(process.argv.slice(2), {
  out: text => process.stdout.write(text + '\n'),
  err: text => process.stderr.write(text + '\n'),
  cwd: process.env.INIT_CWD ?? process.cwd()
})
