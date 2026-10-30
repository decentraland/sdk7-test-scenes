// The upstream gallery, one station per upstream example domain, in pad order: one line each, comment a line out
// and its pad is gone.
import type { GalleryStation } from '../stations'
import { aaaStation } from './aaa'
import { wandererStation } from './wanderer'
import { ninjasStation } from './ninjas'
import { complexStation } from './complex'
import { comparisonsStation } from './comparisons'
import { runtimeBacktrackingStation } from './runtime-backtracking'
import { hierarchicalStation } from './hierarchical'
import { policyStation } from './policy'
import { humanStation } from './human'
import { includeStation } from './include'

export const GALLERY_STATIONS: GalleryStation[] = [
  aaaStation,
  wandererStation,
  ninjasStation,
  complexStation,
  comparisonsStation,
  runtimeBacktrackingStation,
  hierarchicalStation,
  policyStation,
  humanStation,
  includeStation
]
