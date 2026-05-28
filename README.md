# PolyHesi

A small browser-based Three.js driving prototype inspired by night highway runs.
It now starts from a street-meet parking lot and connects to a static closed highway loop with continuous traffic.

## Run

Requires Node.js 20.19 or newer.

```bash
npm install
npm run dev
```

PowerShell may block the npm shim on some Windows machines. In that case:

```powershell
npm.cmd install
npm.cmd run dev
```

`npm run dev` starts the Node/Express server with Vite middleware so the login API and the game run on the same origin. Without `MONGODB_URI`, local development uses a temporary in-memory store; set `.env` from `.env.example` to test against MongoDB.

## Render

- Build command: `npm install && npm run build`
- Start command: `npm start`
- Required env vars: `MONGODB_URI`, `SESSION_SECRET`, `ADMIN_PASSWORD`, `TEST_PASSWORD`
- Optional env var: `MONGODB_DB=polyhesi`

The app seeds only the fixed `nova` admin user and the fixed `test` player user. Registration is not exposed.

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
- Mobile: use the on-screen L/R, GAS, BRK, HB, E, G, CAM, and RST controls; drag on the game view to look around
