# Autonomous opening

Adapted from [Oravitsa v0.3.0-alpha.2](https://github.com/diegoami/oravitsa/tree/v0.3.0-alpha.2),
particularly `scenes/opening/opening.gd` and `demo_bot.gd`. Cerea Vice keeps its own
Three.js world, car, cockpit, dashboard, typeface and palette.

Launch runs a disposable taxi driver. Start freezes that simulation and opens the
briefing with rules and the current remapped controls. Begin game is a separate
confirmation: every key, standard controller button/axis and pointer contact must
be released before the car, mission, atlas and cockpit reset for actual play. Opening
listeners are aborted on handoff; renderer resizing remains attached for gameplay.
Continue saved shift remains available on the frozen briefing and loads paused as
before. District changes open that district's demo. Region crossings during a real
shift retain the existing seamless continuation.

The driver requests an ordinary dispatch list at a settled stop, chooses a short
collection, deliberately serves pickups/dropoffs and waits for boarding. Planning
uses directed road connections and service bays. Steering evaluates short predictions
with the production car physics and collision index, then sends ordinary pedals and
steering to the actual car. Reversing requires the normal stopped gear change.
Waypoint-distance improvement detects lack of progress and circling; failed streets
are temporarily avoided and replanned. A bounded collision-aware local search finds detours around obstructions, with a reachable retreat if the destination
cannot currently be approached. Boarding and successful service count as progress.
No car pose, collision rule, fare, boarding delay, atlas knowledge or shift timer is
changed for the bot. After the shift or Harbor journey completes it keeps exploring,
retaining receipts and score. There is no timed reset or replay.

The demo cannot save, request player information, change the atlas or cross regions.
It bypasses the player's fare-list UI by calling the same stopped request, selection
and service methods; it does not call the dispatch-history persistence wrapper.
Only explicit player settings edits and district selection persist during the opening.
No map or save format changes are required.

## Verification

`tests/demo.test.ts` uses the actual car, mission, parking and complete world collision
geometry (only canvas painting is stubbed). Its deterministic Cerea run covers 1,340
simulation seconds, including the 1,200-second shift and continued exploration. It
completed five fares, earned €39.08 and drove about 5.7 km. A separate enclosure test
requires recovery and resumed travel after the obstruction is removed. Another test leaves a road obstruction in place and requires a completed fare beyond it; boarding must
not trigger recovery. Harbor must complete its legacy hotel journey and keep exploring.
The bot can still collide and recover; it is not a perfect human driver.

`desktop/opening.test.mjs` exercises the rendered flow, gameplay-input isolation,
unchanged storage during the demo, frozen rules, held/repeated Enter, keyboard and
controller scrolling, remapped instructions, held acceleration at confirmation,
fresh score/session, listener removal, save/load and resizing in all three stages.
`npm run test:browser` runs the same checks in Chromium against the production
browser build, plus controller-only Start/confirmation, touch scrolling at 390×844
and a held pointer at confirmation. It requires Playwright Chromium
(`npx playwright install chromium`) or `CEREA_BROWSER_EXECUTABLE` pointing to an
installed Chromium binary.
Screenshots under ignored `test-results/opening-*` support native render inspection.
Existing desktop gameplay regressions enter through Start and retain their original
settings, controller, atlas, streaming and persistence assertions. The desktop command
runs the opening and gameplay files serially to avoid overlapping X servers.

Physical controllers, a full manual Windows playthrough, and physical touch devices require
owner playtesting. Simulated gamepads do not replace that. Sustained autonomy is
covered in Cerea and Harbor; long unattended play on every streamed region and every
random dispatch seed is not established by these checks.

Local verification on 2026-11-05 used Node 24.21, `npm ci`, `npm test`
(175 passing tests at that run), `npm run build`, and the documented Xvfb/xfwm4
`npm run test:desktop` command. The full desktop run passed 20/22 initially.
After correcting test waits for software-rendered scrolling and the deliberate
release handoff, the opening, transient retry and timeout cases passed in a serial
focused rerun (3/3). Together those runs cover all 22 desktop cases. The final
four autonomous-driver tests also passed separately after adding the persistent
obstruction case. A build still reports Vite's existing large-chunk warning.

`npm run desktop:package:win` also succeeded. `desktop/windows-opening-smoke.mjs`
(also available through `npm run test:windows-opening` on WSL or Windows) copied
that bundle into its own temporary Windows directory and profile, confirmed
an actual window, observed the autonomous driver carrying a passenger, checked
unchanged storage, froze the rules and confirmed the fresh zero-earnings handoff.
Native Chromium screenshots were inspected (`opening-windows-demo.png` and
`opening-windows-playing.png`). Only that test process was closed and its temporary
profile/bundle removed; the normal Windows profile was not used. This is a startup
and opening-flow check, not a full manual Windows playthrough.
