# Cerea Vice — Phase 1

[Game vision](VISION.md) defines the long-term direction and scope. This README describes the current fictional-district prototype; real-world geography and a stopped-only atlas are planned.

[Play the hosted prototype](https://cerea-vice-harbor-drive.brownclock131.chatgpt.site) (private; sign in with the owner's ChatGPT account).

A small first-person driving and navigation experiment in **Harbor District**. Find the Blue Hotel on East Quay and stop in its forecourt within three minutes. Navigate using street signs, a permanent compass, a water tower, the red Old Market, and a yellow service station. There is no minimap, route line, or destination arrow.

## Run

Prerequisites: **Node.js 22.12+** (Node 24 also works), npm, and a desktop browser with WebGL 2. A graphical editor, backend, account, and external assets are not required.

```sh
npm install
npm run dev
```

Open `http://localhost:5173`. In a cloud workspace, forward port **5173** and open its browser preview. Vite listens on `0.0.0.0` and accepts cloud preview hostnames. Its port is fixed at 5173, so it will report an occupied port rather than silently switching away from the preview. Use the forwarded HTTPS URL for controller access; localhost also supports it.

```sh
npm run build       # TypeScript checks and production build → dist/
npm run preview     # Serve the production build on port 4173
npm test            # Input, navigation, parking, driving, and mission checks
```

The project uses a project-local npm cache because some cloud workspaces have an unwritable home directory. Both the cache and `node_modules` are ignored by Git. The production build is a static site; deploy the contents of `dist/` to any static host. A subdirectory deployment may require Vite's `base` option.

## Windows desktop client (including builds made in WSL)

Build the Windows x64 client from WSL:

```sh
npm ci
npm run desktop:package:win
```

The complete application is in `release/Cerea Vice-win32-x64/`. Copy that whole folder to a local Windows directory, open it in Windows Explorer, and run **cerea-vice.exe**. Keep all files in the folder together; copying the executable alone will not work. Launching a local Windows copy also avoids WSL network-path launch problems. The packaged game runs offline and requires neither Node.js nor a Vite server on the player's machine. This is an unsigned portable development build, without an installer or automatic updates.

To find the folder's Windows path from WSL:

```sh
wslpath -w "$PWD/release/Cerea Vice-win32-x64"
```

Connect the controller to **Windows**, then press a button in the game window. A standard Xbox-style or PlayStation controller mapped by Chromium works through the existing Gamepad API. The briefing and pause screens show connection status. Unplugging a detected controller pauses the drive; reconnect and press A / Cross or Enter to resume. Reconnecting alone does not resume the drive. Start / Options can begin, pause, and resume the drive. F11 or Alt+Enter toggles fullscreen; close the window or use Alt+F4 to quit on Windows.

For local development on a native desktop OS, `npm run desktop` builds and launches the app; `npm run desktop:package` packages for that host OS. Running these commands inside WSL creates or launches a **Linux** app; use `desktop:package:win` for Windows. The desktop shell loads only bundled game assets through a secure custom origin, with renderer Node access disabled and sandboxing enabled.

Desktop verification uses simulated standard controller input:

```sh
npm test
npm run test:desktop                  # On a graphical desktop
# Headless Linux with Xvfb and an installed window manager:
xvfb-run -a sh -c 'xfwm4 --compositor=off & npm run test:desktop'
```

The desktop smoke test covers offline startup, sandbox settings, controller-only start/driving, steering, handbraking, directions, mission reminders, disconnect/pause/reconnect, keyboard fallback, and fullscreen. The Windows x64 bundle has also been launched successfully on the Windows host from a local Windows directory. Physical controller testing and full Windows gameplay validation remain separate checks.

## Controls

| Action                             | Standard controller   | Keyboard                     |
| ---------------------------------- | --------------------- | ---------------------------- |
| Steer                              | Left stick            | A / D or left / right arrows |
| Accelerate                         | Right trigger         | W or up arrow                |
| Brake, then reverse                | Left trigger          | S or down arrow              |
| Handbrake                          | X / Square (west face button)  | Space                        |
| Glance left / right                | LB / RB               | Q / E                        |
| Start / request directions / retry | A / Cross (south face button) | F or Enter                   |
| Repeat mission and time remaining  | D-pad up              | Tab or M                     |
| Pause / resume                     | Start / Options                 | Escape or P                  |

Connect a controller and press a button so the browser exposes it. The game selects the first connected controller with the browser's `standard` mapping; equivalent PlayStation face buttons work through that mapping. A 16% stick deadzone suppresses drift. Keyboard remains available while a controller is connected. Embedded previews may block the browser Gamepad API; the game falls back to keyboard controls instead of failing to render. Open the preview in a new browser tab to use a controller if the embedded view restricts it. There are no touch controls.

## How to play

- Begin in the Harbor lay-by, facing east. Turn gently left to join Harbor Road. Slow down for junctions; holding the handbrake stops quickly. Holding the brake trigger/key after braking engages reverse.
- Head toward East Quay in the northeast. The Blue Hotel is the tall blue building outside the eastern loop. Its marked forecourt is on the east side of the road.
- Stop **anywhere**, hold still for 0.45 seconds, then press A / F to ask for a short direction hint. Requests while moving only explain that you must stop. No route graphics are created.
- Four marked **P** zones are legal: Harbor lay-by, Market stopping bay, Water Tower lay-by, and Blue Hotel forecourt. A full stop elsewhere is tracked as unsafe, but you may still ask for help there.
- Reach the hotel forecourt and stop fully before the three-minute deadline for success. If time expires, continue driving: stopping at the hotel produces a late-arrival result. Results show elapsed arrival time, unsafe stops, collisions, and direction requests broken down into legal and unsafe stops. Repeated requests at the same stop count separately; rejected moving requests do not count. Retry starts a fresh drive.
- Repeat the objective and time remaining at any speed with D-pad up, Tab, or M. A mission reminder does not request directions or add to the request count.
- Pausing or leaving the browser window freezes the simulation and timer. Resume explicitly when returning.

## District

The handcrafted 160 × 160 metre road grid has a perimeter loop, four T-junctions, and a four-way Central Crossroads. Roads are Harbor Road (south), Tower Lane (north), Market Street (west and central east–west), Central Avenue (central north–south), and East Quay (east). North is world −Z, east is +X. The district is deterministic and uses no random generation.

Every junction approach has a roadside direction board showing left, straight, or right arrows for the onward streets, with nearby landmarks below the street names. Arrows face the approaching driver; the backs of these boards are blank.

Three signed areas provide additional orientation: Harbor Ward in the southwest, Old Town to the north and centre, and Waterfront along the east. Tower Lane crosses a small canal bridge; the southern part of Market Street crosses an unused harbor railway spur. These are fixed environmental cues, with no train, signal, or bridge simulation. Direction hints include the current area. The Blue Hotel is in Waterfront.

## Architecture

```text
src/
  main.ts                     Entry point and WebGL fallback
  game/Game.ts                Render loop, fixed simulation steps, screen states
  driving/
    Car.ts                    Arcade acceleration, steering, reverse, collisions
    CockpitCamera.ts          First-person forward view and bumper/key glance
  input/Input.ts              Keyboard + Gamepad API → abstract Actions
  navigation/
    Navigation.ts             Compass, nearest road, graph search, textual hints
    Parking.ts                Settled stop detection, legal zones, unsafe count
  mission/Mission.ts          Deadline, active/overdue/success/late states
  world/
    district.ts               Shared road graph, bounds, parking, spawn
    builders.ts               Reusable primitive buildings and local text signs
    World.ts                  Hand-placed geometry, landmarks, solid obstacles
  ui/
    Hud.ts                    Compass, mission, dashboard, briefing/pause/results
    style.css                 Responsive overlay and cockpit presentation
tests/
  input.test.ts               Device mapping, analog inputs, action edges
  systems.test.ts             Topology, hints, stops, deadlines, driving route
```

`Game` coordinates the systems; the car consumes only `Actions`, with no keyboard or controller knowledge. Navigation and mission logic use plain positions, not Three.js objects. World data defines the roads used for both geometry and routing. Dijkstra search routes via the nearest road projection to a hotel node on East Quay, then describes the next junction and compass direction. Heading is included and a safe turnaround is suggested when facing away. No raw coordinates are displayed to the player.

The only runtime dependency is **Three.js**. Vite, TypeScript, Three.js type declarations, and `tsx` (for tests) are development tools. Text signs are generated on local canvases; no network assets, external fonts, realistic textures, or asset pipeline are used. Rendering is capped at 960 internal horizontal pixels, with nearest-neighbour scaling, flat materials, simple lighting, and distance fog.

## Phase 1 assumptions and limits

- Metres and km/h are approximate arcade units. A 60 Hz fixed simulation handles forward/reverse speed, smoothed steering, drag, and handbraking. It is not a physical vehicle model.
- Buildings, the tower, pumps, trees, and bridge guardrails use simple expanded rectangles for collision response. District boundaries are solid. Signs and canopy supports are decorative. Grass is driveable at reduced speed; sidewalks are forgiving. The bridge stays level with the road, so no vertical vehicle simulation is needed. No road-rule enforcement or traffic exists.
- A vehicle's centre must be at least 1.1 metres inside a marked bay to count as legally parked or arrived. Direction requests need exact zero speed, followed by the brief settling interval. Coasting eventually settles; the handbrake is faster.
- Unsafe stops count once per stopped episode after the car has moved above 1 m/s. Impact counting has a cooldown so one contact does not inflate the count every frame. These are feedback metrics, with no extra penalties.
- The deadline measures active simulation time. Hidden windows pause, and a frame delay contributes at most 0.1 seconds to avoid unstable catch-up after a stalled browser.
- The view is fixed forward with a held left/right glance. The steering wheel is a lightweight HUD element, with no full interior, sound, suspension, traffic, NPCs, or dialogue.
- All state lives in memory. Reloading resets the drive. No storage API, save system, backend, paid service, or multiplayer is present.
- Automated controller checks use simulated standard gamepad input. Browser and operating-system mappings still warrant testing on a physical controller before a public playtest.

## Next steps — Phase 2

1. Playtest navigation and handling on physical controllers; measure wrong turns, direction requests, and whether players recognize landmarks.
2. Tune sign placement, junction approaches, braking distances, and the mission deadline from those sessions.
3. Add a few generic destination objectives behind the existing mission interface, without committing to a detective, taxi, or delivery theme.
4. Add simple engine/turning audio and more distinct street silhouettes if they improve orientation.
5. Add an atlas that can be consulted only while stopped, as defined in the [game vision](VISION.md).
