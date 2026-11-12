Test scene for masked emotes

## Interactions

All boxes sit in a row at `z = 4`, clicked with the primary action:

| Box | Position | What it does | Expected |
| --- | --- | --- | --- |
| Green | `4,1,4` | Looping upper-body scene emote (`Hanoi_juggler_emote.glb`) | Upper body animates while the player keeps walking, until stopped |
| Yellow | `6,1,4` | Predefined full-body emote (`money`) | Plays once |
| Red | `8,1,4` | `stopEmote` | Whatever is playing stops |
| Blue | `10,1,4` | Non-looping upper-body scene emote (`Fishing_Cast_emote.glb`, `loop: false`) | Plays **once**, then the upper body goes back to locomotion |
| Purple | `12,1,4` | Same clip with `loop: true` | Repeats until the red box is used |

The blue and purple boxes are the pair to check the masked-emote loop flag with: a non-looping
masked emote that restarts by itself means the flag is being ignored.

The crate at `8,0,8` can be picked up (plays a looping upper-body carry emote and attaches the
crate to the left hand, synced to other players) and dropped with the secondary action.
