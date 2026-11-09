// Entry of `npm run htn:lint` (scripts/htn-lint.mjs bundles it): tools/lint/cli.ts on the process's arguments.
import { runCli } from './cli'

process.exitCode = runCli(process.argv.slice(2), {
  out: text => process.stdout.write(text + '\n'),
  err: text => process.stderr.write(text + '\n'),
  cwd: process.env.INIT_CWD ?? process.cwd(),
  sceneRoot: process.env.HTN_REPO_ROOT ?? process.cwd()
})
