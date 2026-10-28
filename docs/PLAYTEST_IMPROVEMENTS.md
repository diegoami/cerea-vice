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

Validation on 27 October 2026 (updated for the rc.3 startup-quote correction):

- `npm test`: 91/91 checks passed, including dispatch reachability/variation,
  long collection quotes, saved offer/ride/receipts, corrupt-save rejection,
  passenger presence and remapped input context isolation.
- TypeScript/Vite production build passed. Vite retains the existing warning
  about a main chunk above 500 kB; it is not a build failure.
- The prescribed Xvfb/xfwm4 desktop suite passed 12/12 scenarios: offline
  controller driving, atlas knowledge and frozen clocks, fare accept/decline,
  keyboard/L3 capture and conflicts, Electron close/relaunch persistence,
  damaged saves, small-window layout, translated coordinates and tile recovery.
- Windows x64 packaging passed. This session did not run a physical controller
  or a full Windows close/relaunch gameplay check; those remain owner checks.

Generated screenshots include `passenger-beside-driver.png`, `cerea-briefing.png`,
`cerea-settings.png`, and `cerea-atlas.png` in ignored `test-results/`.
The portable bundle is in ignored `release/Cerea Vice-win32-x64/`.

The independent rc.1 review identified settings-button focus trapping keyboard
resume, stale collection quotes in dispatch notices, unintended X/Delete fare
declines, and the stale test count above. Rc.2 reserves Enter/Escape/P for
keyboard resume, uses Space for settings actions, refreshes and restores quoted
notices from fare state while retaining payout feedback, and gives B/Backspace
a dedicated decline action. Regression checks cover each case. The rc.1 review
covers `e96e5c4bc07dab7f68867fb1504d854fbd0871f9`; substantive fixes need an
independent recheck. Physical Windows/controller checks remain with the owner.

The rc.2 recheck confirmed the prior fixes and identified an initial unquoted
price while scenery loads. Rc.3 withholds guarantees in both radio and objective
text until the full quote is ready at a settled stop. Restoring an older pending
unquoted save also refreshes its notice. A held-tile desktop fixture verifies
the startup interval and the eventual €72.22 collection-inclusive quote; clocks,
quote timing, fare calculation and payout rules are unchanged. The rc.2 recheck
covered `687231ad1b3b299d3732b7711c88de639ea3e9d9` and explicitly recorded an
owner-approved same-session continuation by the non-OpenAI reviewer.

## 0.9 follow-up: free driving, fare list and boarding walks

The 0.8.0-rc.3 Windows playtest asked for fares on demand rather than an
automatic offer, and for passengers who arrive instead of standing at every
stop. These follow-ups to #11 and #7 supersede the single-offer modal and the
permanent waiting figures. Rules for players are in [TAXI.md](../TAXI.md).

Decisions taken in this pass:

- **Clock.** Free driving uses the normal shift clock. A separate untimed mode
  would let players learn the map without spending the working day, but it
  would make positioning before a request free; the conservative choice keeps
  one clock. Pause, the atlas and the fare list freeze it as before.
- **Request.** *Request fares* is a driving binding (default O / D-pad down),
  shown in help, the dashboard prompt and hints with the active binding, and
  editable in Change controls with conflict reporting, persistence and Restore
  defaults. D-pad left/right/down became bindable for this; Start stays
  reserved. 0.8 profiles keep their bindings and receive the first free key of
  O, H, V, X, B, N. A request is refused while moving, while scenery loads, after
  17:00, and while a ride is accepted (no overlapping assignments).
- **List.** Four distinct reachable fares, never the same passenger twice and
  avoiding the last accepted pair, from the existing seeded generator: the first
  fare of each list is the 0.8 single-offer draw for the same random state.
  Every entry is quoted, with the existing formula and collection supplement,
  from the stopped position where the list is issued, so no unquoted price is
  shown (rc.3's withholding rule now applies to migrated 0.8 offers). Authored
  test fixtures list the next authored fares in order.
- **Refresh.** A list is issued only by a request when none is waiting, and
  replaced only by the explicit *New list* (Y / N) command. Accepting removes the
  whole list. Closing (B / Backspace), reopening, pausing (Start / Escape, which
  resumes to the road), saving and loading keep identities and quotes; a closed
  list never reopens by itself. The list uses fixed menu controls like the atlas
  and ignores its inputs until everything held from driving is released.
- **Boarding.** Stopped service at the accepted pickup commits the ride and
  starts a 5.5-second sequence: the passenger appears at a doorway (the first
  building face along a line away from the road through the bay) or, without
  one, at open unpaved ground about four metres past the bay, walks to the
  passenger door, around the bonnet or boot when they start on the driver's side,
  and lowers into the seat. The taxi is held, gear changes wait, and the
  speed-bonus clock starts when they are seated, so payouts are unchanged.
  Dropoff pays at once, clears the seat and plays a 4-second walk away.
- **Synchronisation.** Mission timers, not render time, drive both walks, so
  pause, atlas and scenery loading freeze them. One figure exists per walking
  passenger, outside tile batches, positioned through the render origin each
  frame. Saves store boarding progress (and require a stationary taxi); loading
  resumes the same walk, and the seat shows the passenger only when it ends.
  The departure walk is not saved. Restart, shift end and loading clear stale
  figures. Decorative people are untouched.
- **Saves.** Version 2 adds the list, its serial, the last accepted pair and
  boarding progress. Version 1 saves migrate: a pending offer becomes a one-fare
  list (unquoted offers are quoted at the next stopped request), an accepted ride
  stays accepted. Validation rejects duplicate or future fare identities,
  oversized lists, a list alongside an accepted ride, and boarding without a
  ride, before touching the live game.

Open questions for owner playtesting: whether free driving should be untimed,
the number of listed fares, the boarding walk length (fast for the 14 m bays,
up to about 3 m/s), D-pad down / O comfort, and the walk's readability from the
driver's seat. Walks avoid buildings, water and the taxi body, not decorative
props. No physical controller or Windows close/relaunch gameplay check was run
in this pass.

Validation on 28 October 2026 for 0.9.0-rc.1 (Node 24, WSL):

- `npm test`: 98/98 checks passed, including no automatic offers, stable
  request/close/reopen and save/load of the list, accept versus close/new-list
  payouts, remapped Request fares with conflicts and 0.8 profile migration,
  context isolation of held inputs, the boarding walk through rebasing, reload
  and save/resume, clear arrival paths at every Cerea and outskirts stop, 0.8
  save migration and an unchanged atlas marker.
- TypeScript/Vite production build passed, with the existing >500 kB chunk
  warning.
- The prescribed Xvfb/xfwm4 desktop suite passed 12/12 scenarios, now covering
  the fare list by keyboard, mouse and simulated controller, a remapped request
  key, saving and loading during a boarding walk, and Electron relaunch.
  `passenger-arriving.png` and `cerea-fare-board.png` are written to ignored
  `test-results/`.
- Not run: Windows packaging/launch, a physical controller, and a Windows
  close/relaunch gameplay check; these remain owner checks.
