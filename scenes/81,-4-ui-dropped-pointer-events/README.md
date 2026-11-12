# UI Dropped Pointer Events (81,-4)

Reproduction for [unity-explorer#10542](https://github.com/decentraland/unity-explorer/issues/10542): clicks on
scene-UI buttons are randomly lost when the scene tick is slower than the render frame, and more often when the
UI is updated constantly.

The scene shows three target buttons that count their own `onMouseDown`, `onMouseUp`, `onMouseEnter` and
`onMouseLeave` callbacks, plus a counter of the global (entity-less) pointer events of the same clicks. Two controls
recreate the conditions of the report:

- **Tick stall** busy-waits inside the scene tick (0, 40 or 120 ms), so one scene tick spans several render frames.
- **UI churn** re-renders the panel every tick (a bar changes width and colour, a label changes text), like a scene
  that displays live data.

## Steps

1. Run the scene (`npm install`, `npm start`) and open it in the Explorer.
2. Set **Tick stall** to 120 ms and **UI churn** to ON, then press **Reset counters**.
3. Click target **A** 20 times at a normal pace, with the cursor staying on the button.

## Expected

Every target shows `down = up = 20` and `lost = 0`, and `global pointer: down 20`.

## Actual before the fix

`down` falls behind `up` and `lost` grows (the button turns red): the press reached the Explorer but the scene
never received it, so an `onMouseDown` handler never ran. The gap between `global pointer: down` and the button's
`down` is the number of presses the scene saw globally but not on the button. Quick clicks are lost more often
than slow ones, and the loss disappears with the stall at 0 ms.

## Why

Two Explorer defects, both only visible when the scene tick is slower than the frame:

- UI Toolkit pointer events were stored in a single slot per element and drained by a throttled system, so a
  release (or a hover enter/leave caused by the layout churn) arriving before the drain overwrote the press.
- The UI result was stamped with the tick number at drain time, one frame later than the global event of the same
  press, while the SDK's input system treats a result whose timestamp is not newer than the previous batch as
  already seen and discards it.
