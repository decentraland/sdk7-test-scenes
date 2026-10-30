// Every playground of the scene, in menu order (the Playgrounds button, src/spawn/ui.tsx): one line each, comment a
// line out and it is gone from the menu. Levels 1-9 go from a one-branch plan to a crowd; in 10 the domain checks
// the running step, in 11 a squad planner gives the orders, 12 is an ambush with an asset-free animated primitive body. The reference zones run every upstream example. Each
// level is a file in src/playground/levels, each gallery station a file in src/examples/upstream/gallery.
import { zonePlayground } from './demo/upstream-zone'
import { GALLERY_STATIONS } from './examples/upstream/gallery'
import { LAB_STATIONS } from './examples/upstream/lab'
import { AmbushLevel } from './playground/levels/ambush'
import { stalkerView } from './playground/levels/ambush-view'
import { CourierLevel } from './playground/levels/courier'
import { CrowdLevel } from './playground/levels/crowd'
import { GreeterLevel } from './playground/levels/greeter'
import { HearingLevel } from './playground/levels/hearing'
import { HelloLevel } from './playground/levels/hello'
import { LampLevel } from './playground/levels/lamp'
import { OrdersLevel } from './playground/levels/orders'
import { SightLevel } from './playground/levels/sight'
import { SquadLevel } from './playground/levels/squad'
import { StalkerLevel } from './playground/levels/stalker'
import { StorekeeperLevel } from './playground/levels/storekeeper'
import { levelPlayground } from './playground/station'
import type { Playground } from './spawn/spawner'

const GALLERY_TITLE =
  '<b>UPSTREAM EXAMPLES</b>  (urosidoki/htn_planner domains)\neach pad plays its scenarios by itself; orange: step  blue: walking  red: no plan'
const LAB_TITLE = '<b>LANGUAGE LAB</b>  (upstream test domains, docs and SDK examples)\nscenarios and expected plans from the upstream tests'

export const LEVELS = [
  levelPlayground(() => new HelloLevel()),
  levelPlayground(() => new LampLevel()),
  levelPlayground(() => new GreeterLevel()),
  levelPlayground(() => new CourierLevel()),
  levelPlayground(() => new SightLevel()),
  levelPlayground(() => new HearingLevel()),
  levelPlayground(() => new StalkerLevel()),
  levelPlayground(() => new SquadLevel()),
  levelPlayground(() => new CrowdLevel()),
  levelPlayground(() => new StorekeeperLevel()),
  levelPlayground(() => new OrdersLevel()),
  levelPlayground(() => new AmbushLevel(), { view: stalkerView })
]

export const PLAYGROUNDS: Playground[] = [
  ...LEVELS,
  zonePlayground('gallery', 'Gallery', GALLERY_STATIONS, GALLERY_TITLE),
  zonePlayground('lab', 'Language lab', LAB_STATIONS, LAB_TITLE)
]
