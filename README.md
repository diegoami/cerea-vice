# Cerea Vice — driving and navigation prototype

[Game vision](VISION.md) defines the direction and scope. [Loadable districts](MAPS.md) describes the map format, sources and the new real-place pilot.

**Cerea Centro** now offers a [taxi shift](TAXI.md): work from 07:00 to 17:00, collect passengers and follow their requests to nine real places across an expanded neighbourhood with 51 named streets. Completed rides pay a base fare plus a speed bonus. The accelerated day takes about 20 active minutes; the atlas and pause screens stop the clock. Start at the Municipio, where Elena wants a ride to the post office. The library is now just one of several places to learn.

**Harbor District**, the original fictional three-minute hotel journey, remains available from the briefing. Use the district buttons or **LB / RB** (**Q / E**) to switch before starting. The atlas, direction signs, stopped-only information requests and manual position estimates work in both districts. The game loads its map files locally and runs offline. Small street-name plates identify lateral streets at crossings and repeat along longer stretches; larger arrow boards are reserved for major thoroughfares.

[Previously hosted Harbor prototype](https://cerea-vice-harbor-drive.brownclock131.chatgpt.site) (private; may lag the current desktop build).

## Run

Prerequisites: **Node.js 22.12+** (Node 24 also works), npm, and a desktop browser with WebGL 2. A graphical editor, backend, account, and external assets are not required.

```sh
npm install
npm run dev
```

Open `http://localhost:5173`. In a cloud workspace, forward port **5173** and open its browser preview. Vite binds to `127.0.0.1` and checks hostnames by default. For a remote preview, explicitly bind all interfaces and allow the exact gateway hostname: `CEREA_ALLOWED_HOSTS=your-preview.example npm run dev -- --host 0.0.0.0`. The same opt-in applies to `npm run preview`. Its port is fixed at 5173, so it will report an occupied port rather than silently switching away from the preview. Use the forwarded HTTPS URL for controller access; localhost also supports it.

```sh
npm run build       # TypeScript checks (source and tests) and production build → dist/
npm run preview     # Serve the production build on port 4173
npm test            # Input, navigation, parking, driving, and mission checks
```

The project uses a project-local npm cache because some cloud workspaces have an unwritable home directory. Both the cache and `node_modules` are ignored by Git. The production build is a static site; deploy the contents of `dist/` to any static host. A subdirectory deployment may require Vite's `base` option.

## Windows desktop client (including builds made in WSL)

Build and launch the Windows x64 client from WSL:

```sh
npm run desktop:win
```

This rebuilds the Windows package, copies it to a fresh local Windows temporary folder and opens Cerea Centro. Each playtest launch uses an isolated temporary profile and checks that a game window opens. The command remains attached until you close that game window, then removes its temporary bundle and profile. Failed startup also cleans up its own copy; cleanup failures report the retained path. To package without launching:

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

The desktop smoke test covers offline startup, sandbox settings, controller-only start/driving, steering, handbraking, directions, atlas pages and moving-access rejection, frozen reading time, mission reminders, disconnect/pause/reconnect, keyboard fallback, and fullscreen. The Windows x64 bundle has also been launched successfully on the Windows host from a local Windows directory. Physical controller testing and full Windows gameplay validation remain separate checks.

## Controls

| Action                             | Standard controller   | Keyboard                     |
| ---------------------------------- | --------------------- | ---------------------------- |
| Steer                              | Left stick            | A / D or left / right arrows |
| Accelerate                         | Right trigger         | W or up arrow                |
| Brake only                       | Left trigger          | S or down arrow              |
| Forward / reverse (fully stopped)  | B / Circle            | R                            |
| Handbrake                          | X / Square (west face button)  | Space                        |
| Look around                        | Right stick           | Click windshield, move mouse |
| Look forward                       | Right stick press (R3) | C                            |
| Glance left / right                | LB / RB               | Q / E                        |
| Confirm / passenger pickup / dropoff / retry            | A / Cross (south face button) | Enter                   |
| Open / close atlas (while stopped) | Y / Triangle          | T                            |
| Atlas zoom (atlas only)             | RT / LT               | Mouse wheel / + / −          |
| Pan atlas                          | Right stick           | Drag map / I J K L           |
| Atlas overview                     | R3                    | Home / Overview button       |
| Turn atlas page                    | LB / RB               | Q / E                        |
| Move atlas crosshair               | Left stick / D-pad    | WASD / arrow keys            |
| Mark estimated position            | A / Cross             | Enter / click map            |
| Ask for information (road or atlas) | View / Select (PS Share) | F / information button       |
| Erase atlas marker                 | X / Square            | Delete / Backspace           |
| Close atlas                        | B / Circle            | Escape                       |
| Repeat mission and time remaining  | D-pad up              | Tab or M                     |
| Pause / resume                     | Start / Options                 | Escape or P                  |

Connect a controller and press a button so the browser exposes it. The game selects the first connected controller with the browser's `standard` mapping; equivalent PlayStation face buttons work through that mapping. A 16% stick deadzone suppresses drift. Keyboard remains available while a controller is connected. Embedded previews may block the browser Gamepad API; the game falls back to keyboard controls instead of failing to render. Open the preview in a new browser tab to use a controller if the embedded view restricts it. There are no touch controls.

## Looking around

Move the **right stick** to look around independently of steering, including a full 360-degree turn. Release the stick to smoothly return to the forward view. Mouse look returns after 0.4 seconds without movement. Press **R3** or **C** to recenter immediately. Keyboard and mouse players click the windshield to capture the mouse, then move it freely; the pointer is not limited by screen edges. **Escape** releases the mouse and pauses. Opening the atlas also releases the mouse, so its map and buttons remain usable. Mouse capture is never required for controller looking.

The compass continues to show the car’s heading while you look around. LB / RB or Q / E still provide quick held glances. Information uses **View / Select (PS Share)** or **F** both on the road and in the atlas; R3 is reserved for recentering the view.

## Taxi mode

Stop in the current pickup or dropoff area and press **A / Cross / Enter**. Dispatch continues with new customers after every paid ride. The HUD shows passenger, destination, street, shift clock, earnings and the active speed bonus. See [TAXI.md](TAXI.md) for the scoring rules and destination list.

## How to play Harbor District

- Begin in the Harbor lay-by, facing east. Turn gently left to join Harbor Road. Slow down for junctions; holding the handbrake stops quickly. LT / S only brakes, in either direction. At a settled full stop, release the accelerator and press B / Circle or R to switch D (forward) / R (reverse). RT / W accelerates in the selected gear; the dashboard shows it even while stopped.
- Head toward East Quay in the northeast. The Blue Hotel is the tall blue building outside the eastern loop. Its marked forecourt is on the east side of the road.
- Stop **anywhere**, hold still for 0.45 seconds, then press View / Select or F to ask for a short direction hint. Requests while moving only explain that you must stop. No route graphics are created.
- Four marked **P** zones are legal: Harbor lay-by, Market stopping bay, Water Tower lay-by, and Blue Hotel forecourt. A full stop elsewhere is tracked as unsafe, but you may still ask for help there.
- Reach the hotel forecourt and stop fully before the three-minute deadline for success. If time expires, continue driving: stopping at the hotel produces a late-arrival result. Results show elapsed arrival time, unsafe stops, collisions, and direction requests broken down into legal and unsafe stops. Repeated requests at the same stop count separately; rejected moving requests do not count. Retry starts a fresh drive.
- Repeat the objective and time remaining at any speed with D-pad up, Tab, or M. A mission reminder does not request directions or add to the request count.
- Pausing or leaving the browser window freezes the simulation and timer. Resume explicitly when returning.

## Paper atlas

Stop fully for 0.45 seconds, then press **T** or **Y / Triangle** to open the atlas anywhere, including outside a marked parking bay. Requests while moving explain how to stop first. The car and mission timer freeze while reading; closing the atlas resumes the drive.

The first page is a north-up map of the selected district, with street names, landmarks, waterways, railway features and marked stopping bays. The second page has alphabetical place and street indexes with grid references. Choose a street name to open a detailed view, including Via Cordioli. Roads, main landmark footprints, water and parking bays use the same district data as the world. The atlas contains no live car marker, route line or destination arrow. Cerea currently allows stopping anywhere; Harbor retains its marked-bay legal/unsafe distinction.

Zoom from **1× to 8×** with **RT / LT**, **mouse wheel**, **+ / −**, or the on-map buttons. Pan using the **right stick**, **I J K L**, or **dragging the map**. **R3 / Home / Overview** returns to the full district. Left stick / D-pad / arrow keys still move the marker crosshair, with edge scrolling at higher zoom. A short click places a marker; dragging pans without changing it. Labels grow to readable sizes in detailed views, and zoom/pan are retained when closing the atlas or changing its pages.

In the index, use the **right stick up/down** or **I / K** to select a street, then **A / Enter** to locate it on the map. Mouse users can click the street name. Lookup changes the view and crosshair, not your marked position. Left stick / D-pad scrolls the index. Taxi time and bonus timers remain paused throughout. The accelerator must be released after closing the atlas if it was held for zooming.

Use **LB / RB** or **Q / E** to change pages. The page tabs also work with the mouse. Close with **B / Circle**, **T**, **Y / Triangle**, **Escape**, or the close button; **Start** also returns to the road. Driving inputs are ignored while reading. Switching away from the window or disconnecting the controller closes the atlas into the pause screen, requiring an explicit resume.

The atlas marker changes only when you **successfully ask for information while stopped**, or **move it yourself** to where you think you are. Simply driving, parking in a bay, opening the atlas or repeating the mission reminder does not update it. Rejected requests while moving do not update it either. Information can be requested at any settled stop, including outside a legal bay.

A successful View / Select or F information request records that position as a snapshot, labelled **Last information received**. While the atlas is open, press **F**, **View / Select (PS Share)**, or its **Ask for information** button. The directions appear beside the map, the marker updates, and the car and timer stay paused. A / Enter still places your manual estimate in the atlas. Manual placement is labelled **Your estimated position**, which can be wrong. To place an estimate, click the map or move the crosshair with the left stick / D-pad / WASD / arrow keys and press A / Cross / Enter. A new placement moves the existing marker; X / Square / Delete / Backspace erases it. The marker remains fixed until the next successful information request or manual change. A new drive starts with its given starting position: Sosta Municipio in Cerea or Harbor lay-by in Harbor District. It never follows the car or creates a route line.

## Harbor District

For the Cerea pilot and data sources, see [MAPS.md](MAPS.md).

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
    CockpitCamera.ts          Full-circle stick/mouse look, pitch and quick glances
  input/Input.ts              Keyboard + Gamepad API → abstract Actions
  navigation/
    Navigation.ts             Compass, nearest road, graph search, textual hints
    Parking.ts                Settled stop detection, legal zones, unsafe count
  mission/Mission.ts          Deadline, active/overdue/success/late states
  world/
    district.ts               Shared road graph, bounds, parking, spawn
    builders.ts               Reusable primitive buildings and local text signs
    World.ts                  Data-driven Cerea roads, footprints and landmarks
    HarborWorld.ts            Original handcrafted Harbor scenery
    schema.ts                 Loadable district format
    load.ts                   Local JSON loading and district selection
  ui/
    Hud.ts                    Compass, mission, dashboard, briefing/pause/results
    Atlas.ts                  Printed map and place index, without live tracking
    style.css                 Responsive overlay and cockpit presentation
tests/
  input.test.ts               Device mapping, analog inputs, action edges
  systems.test.ts             Topology, hints, stops, deadlines, driving route
```

`Game` coordinates the systems; the car consumes only `Actions`, with no keyboard or controller knowledge. Navigation and mission logic use plain positions, not Three.js objects. World data defines the roads used for both geometry and routing. Dijkstra search routes via the nearest road projection to the selected destination, then describes the next junction and compass direction. Cerea routes honour imported one-way tags; the original Harbor wording is preserved for that district. Heading is included and a safe turnaround is suggested when facing away. No raw coordinates are displayed to the player.

The only runtime dependency is **Three.js**. Vite, TypeScript, Three.js type declarations, and `tsx` (for tests) are development tools. Text signs are generated on local canvases; no network assets, external fonts, realistic textures, or asset pipeline are used. Rendering uses native/HiDPI resolution capped at 1920 internal horizontal pixels, antialiasing and filtered sign textures so small street-name plates remain readable. Flat materials, simple lighting and distance fog retain the economical retro presentation.

## Phase 1 assumptions and limits

- Metres and km/h are approximate arcade units. A 60 Hz fixed simulation handles forward/reverse speed, smoothed steering, drag, and handbraking. It is not a physical vehicle model.
- Buildings, the tower, pumps, trees, and bridge guardrails use simple expanded rectangles for collision response. District boundaries are solid. Signs and canopy supports are decorative. Grass is driveable at reduced speed; sidewalks are forgiving. The bridge stays level with the road, so no vertical vehicle simulation is needed. No road-rule enforcement or traffic exists.
- A vehicle's centre must be at least 1.1 metres inside a marked bay to count as legally parked or arrived. Direction requests need exact zero speed, followed by the brief settling interval. Coasting eventually settles; the handbrake is faster.
- Unsafe stops count once per stopped episode after the car has moved above 1 m/s. Impact counting has a cooldown so one contact does not inflate the count every frame. These are feedback metrics, with no extra penalties.
- The deadline measures active simulation time. Hidden windows pause, and a frame delay contributes at most 0.1 seconds to avoid unstable catch-up after a stalled browser.
- The view supports full 360-degree horizontal looking with the controller right stick or captured mouse, bounded vertical looking and held left/right glances. The car has a 3D interior with a rotating three-spoke steering wheel, analog and digital speed indicators, D/R selector, dashboard, seats and working side mirrors. Mirror views update at 10 Hz. Taxi mode adds a simple waiting passenger and short text requests.
- Drive and taxi-shift progress, markers and earnings live in memory; reloading starts a fresh drive or shift. District selection is stored locally within the current profile. There is no backend or save-game system.
- Automated controller checks use simulated standard gamepad input. Browser and operating-system mappings still warrant testing on a physical controller before a public playtest.

## Next steps

See the [tentative development roadmap](ROADMAP.md) for milestones and playable checkpoints leading to the [game vision](VISION.md).

1. Playtest the taxi shift: pickup/dropoff clarity, route variety, shift pace and bonuses.
2. Tune the expanded district from driving and sign feedback.
3. Add a distinct “Where am I?” request if it improves navigation help.

## Independent review

The project uses an exact-head PR review handoff adapted from Geoclick2027.
See [the review workflow](docs/EXTERNAL_REVIEW.md) and
[the whole-project review brief](docs/whole-project-review.md). A fresh session
of another model family runs `/review-pr`; setup alone does not start a review.
