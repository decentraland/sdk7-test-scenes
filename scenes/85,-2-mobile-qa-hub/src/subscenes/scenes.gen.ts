// AUTO-GENERATED FILE - DO NOT EDIT.
//
// Source of truth: src/subscenes/<slug>/subscene.json + src/subscenes/<slug>/index.ts
// Regenerate with: npm run subscenes:gen   (also runs on prestart / prebuild / predeploy)
//
// Layout: 64x64m scene, 4x4 grid of 16x16m stages,
// 16 subscenes per page. Slots come from subscene.json ("slot") or are auto-assigned.
import type { SubsceneEntry } from '../hub/types'
import * as sub0 from './_example'

export const subsceneEntries: SubsceneEntry[] = [
  {
    slug: '_example',
    meta: {
      title: 'Example subscene (template)',
      issue: '#0',
      owner: 'qa-hub',
      status: 'done',
      note: 'Copy this folder to register your own subscene. Docs: ADDING-A-SUBCENE.md',
      slot: 15,
      page: 0
    },
    module: sub0
  }
]
