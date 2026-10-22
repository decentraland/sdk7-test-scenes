# HTN domain support for VS Code (local extension)

Highlighting, `//` comments (Ctrl+/), bracket matching and auto-closing for `.domain` files, plus a problem matcher
(`$htn-check`) that turns `npm run htn:compile -- --check` output into squiggles in the Problems view. No language
server.

The grammar is adapted from upstream htn_planner `HTNVSCode/syntaxes/htn.tmLanguage.json` (MIT, see `LICENSE`) and
follows this port's lexer (`tools/htn/lexer.ts`): `//` comments (upstream's grammar and language configuration use
`;`, which the language does not have), strings without escapes, every keyword (`:include :domain :method :axiom
:constants top_level_domain top_level_method base overrides and or alt not call`), `?var` and `?any_` discards,
`@constant`, `!primitive`, `#axiom`, `&deferred`, `Domain::name`, numbers and operators.
`test/tools/vscode-htn.test.ts` checks the grammar against the lexer's keywords.

## Install

Copy (or link) this folder into the VS Code extensions folder, then reload VS Code (**Developer: Reload Window**).
From the scene folder:

```bash
# macOS / Linux / Git Bash
cp -r tools/vscode-htn ~/.vscode/extensions/local.htn-domain-0.1.0
```

```powershell
# Windows PowerShell: a junction keeps it in sync with the repo
New-Item -ItemType Junction -Path "$env:USERPROFILE\.vscode\extensions\local.htn-domain-0.1.0" -Target (Resolve-Path tools\vscode-htn)
```

Or package it: `npx @vscode/vsce package --allow-missing-repository` in this folder, then
`code --install-extension htn-domain-0.1.0.vsix`.

To remove it, delete that folder (or `code --uninstall-extension local.htn-domain`).

## Check the open domain from VS Code

Add a task to `.vscode/tasks.json` (set `cwd` to the folder with the `htn:compile` script), then run it with
**Tasks: Run Task** or bind it to a key:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "HTN: check domain",
      "type": "shell",
      "command": "npm run htn:compile -- --check \"${file}\"",
      "options": { "cwd": "${workspaceFolder}/scenes/96,-11-htn-planner" },
      "problemMatcher": "$htn-check",
      "group": "build"
    }
  ]
}
```

Errors in the file and its includes show up in Problems with their full range, warnings too. To lint a method that
checks the running plan (`activePlan`), append `--check-method active_plan` to the command: a catch-all branch in it
is a `check-method-fallback` warning.
