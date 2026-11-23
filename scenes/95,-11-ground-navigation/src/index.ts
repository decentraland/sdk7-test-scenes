import { mountGroundLab } from './ground-lab'
import { mountTraversalPlayground } from './traversal/playground'
import { TRAVERSAL_SCENARIOS } from './traversal/registry'

export function main() {
  mountTraversalPlayground(TRAVERSAL_SCENARIOS, mountGroundLab)
}
