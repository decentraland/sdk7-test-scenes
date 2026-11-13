This scene is an **observer** for the scene wearables test scene at 4,25. It shows the local player's
`AvatarEquippedData` as a 3D text (not SDK UI, which only renders for the current scene) at the south edge of 4,27.

Per profile wearable it lists the short name and `visible` / `hidden` / `unset`, plus `unset: N/M` (red when any
is still unset after 5 s, green when all are set), seconds since scene start and how many times the value changed.
The same summary goes to the console with the `[observer]` prefix.

4,26 stays empty, so 4,27 is 2 parcels away from 4,25 and unloads when the load radius drops to 0.

### REPRO

1. Stand on 4,25, edge case "On me: Full AvatarShape". Wear profile items that the override does not use.
2. Debug panel > Landscape > Set Load Radius 0. 4,27 unloads (text disappears).
3. Debug panel > Memory FULL for a few seconds, then Memory NORMAL.
4. Set Load Radius back (4). 4,27 loads fresh. Bug: profile wearables `unset`, staying unset after 60 s.

Control: the same steps without any override, all items are `visible` / `hidden`.
