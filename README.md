# PolyHesi

A small browser-based Three.js driving prototype inspired by night highway runs.
It now starts from a street-meet parking lot and connects to a static closed highway loop with continuous traffic.

## Run

```bash
npm install
npm run dev
```

PowerShell may block the npm shim on some Windows machines. In that case:

```powershell
npm.cmd install
npm.cmd run dev
```

## Controls

- `W` / `ArrowUp`: throttle
- `S` / `ArrowDown` / `Space`: brake
- `A` / `D` or arrow keys: steer
- Drag the mouse or hold `Q` / `E`: rotate camera
- `T`: toggle no clip
- `Y`: toggle no clip + remodel
- In remodel: mouse look is always active over the canvas; point the crosshair at a model, right click to edit, drag the XYZ axes to move it
- Remodel toolbox: create a box, delete the selected piece, and use the Debug panel for snap-to-grid settings
- No clip vertical movement: `Space` up, `Ctrl` down, `Shift` boost
- `R`: restart
