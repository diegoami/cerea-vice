# Windows playtest follow-up

Tracked in milestones [0.7](https://github.com/diegoami/cerea-vice/milestone/1)
(#6 text, #7 people, #10 controls) and
[0.8](https://github.com/diegoami/cerea-vice/milestone/2)
(#8 dispatch, #9 saves, #11 offers, #12 long fares).

The interface bundles VT323 under the SIL OFL, uses larger text and a restrained
cream/mint computer palette, and lets longer menus scroll. The UI stays at screen
resolution in Sharp, 270p and 540p modes. Atlas label sizes grow from 14 to 24
screen pixels as the player zooms, with street ownership and knowledge unchanged.

Clothed faceted people replace the earlier sticks. Taxi-stop people are separate
from static/tiled batches: the active pickup figure disappears while its matching
passenger occupies the adjacent seat. Mission state governs this presence after
load, tile eviction and origin rebasing. Decorative people remain independent;
there is no new collision or navigation assistance. Dropoff clears the seat;
pedestrian walking/boarding animations are outside this pass.

Driving bindings can be captured from keyboard or standard controller, with
conflict reporting and restore defaults. B remains the default gear control;
L3 is available. Fixed atlas/menu controls, Escape and Start provide recovery.
Driving keys and buttons must be released after returning from a reading/menu context.
Controller automation checks behavior; it cannot establish physical comfort.

New shifts draw reachable pickup/destination pairs with a seeded generator,
avoiding immediate duplicate pairs. With storage available, consecutive new shifts
also avoid repeating their opening pair. Authored fixtures remain available to tests.
Offers are read while stopped, freeze time, and show guaranteed pay before
acceptance. Declining requests another offer without a penalty. Accepted trips
still require deliberate stopped pickup and dropoff. Neither fare changes nor
saves change the atlas marker to the car's true position.

One manual save per district retains pose/gear/speed, shift/bonus clocks, receipts,
information counts, current offer/ride and generator state, and atlas knowledge.
Version/map signatures and domain validation reject incompatible or corrupt
data before changing the live game. Load returns paused and uses the normal
scenery readiness gate. Windows keeps its profile in
`%LOCALAPPDATA%\CereaVice\profile`, outside disposable playtest bundles; portable
Windows copies share this location. Browser storage remains local to the origin.

The guaranteed fare is the existing €4 + €1.20/km, with €25/km for the part of
the ride beyond 1 km and for the part of a quoted collection route beyond 1 km.
The declining speed bonus remains up to €6. Collection supplements are fixed
before acceptance and only pay on completed rides. The hamlet examples are:

| Directed ride | Distance | Guarantee, starting at pickup | Prior guarantee |
| --- | ---: | ---: | ---: |
| Municipio → Test Hamlet | 2,249.67 m | €37.94 | €6.70 |
| Test Hamlet → Municipio | 2,458.50 m | €43.41 | €6.95 |

At an assumed 8 m/s plus 60 seconds for service/navigation, guarantees alone
yield about €6.67 and €7.09 per active minute. An offer requiring a long journey
to collect also pays the quoted collection supplement. These are transparent
initial game-balance assumptions; real controller journeys and return demand
still need owner playtesting.

Validation on 27 October 2026:

- `npm test`: 86/86 checks passed, including dispatch reachability/variation,
  long collection quotes, saved offer/ride/receipts, corrupt-save rejection,
  passenger presence and remapped input context isolation.
- TypeScript/Vite production build passed. Vite retains the existing warning
  about a main chunk above 500 kB; it is not a build failure.
- The prescribed Xvfb/xfwm4 desktop suite passed 10/10 scenarios: offline
  controller driving, atlas knowledge and frozen clocks, fare accept/decline,
  keyboard/L3 capture and conflicts, Electron close/relaunch persistence,
  damaged saves, small-window layout, translated coordinates and tile recovery.
- Windows x64 packaging passed. This session did not run a physical controller
  or a full Windows close/relaunch gameplay check; those remain owner checks.

Generated screenshots include `passenger-beside-driver.png`, `cerea-briefing.png`,
`cerea-settings.png`, and `cerea-atlas.png` in ignored `test-results/`.
The portable bundle is in ignored `release/Cerea Vice-win32-x64/`.
