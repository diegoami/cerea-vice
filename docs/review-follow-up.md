# PR #1 review follow-up — v0.6.1

The independent Claude Code / Sonnet 5.5 review covered
`c3269a1e0c5158560606d40fe6c8ecf9a2224faa`. Its findings were checked against that
head before making the following changes. This response is implementer work;
it is not a new independent approval.

| Finding | Disposition and evidence |
| --- | --- |
| F1 — continuous current-road readout | Confirmed conflict with the navigation vision. Removed the live road label and nearest-road lookup from the dashboard; a static car badge replaces it. Stopped information requests still provide a snapshot. VISION now makes this explicit. The Cerea desktop test rejects the live-location element. |
| F2 — cropped right mirror | Confirmed. Moved the right mirror forward and adjusted the left housing to keep both usable. A projection regression checks every housing corner at 4:3, 1280×900, 1440×900 and 16:9; desktop views were inspected too. |
| F3 — temporary Windows copies retained | Confirmed. The launcher now stays attached until its own game exits and removes its own bundle/profile in finally, including failed startup. Brief retries allow Chromium handles to close; failures report the retained path. A dedicated Windows game was opened, closed and checked for removal; an invalid-executable fixture verified failure cleanup. Other playtests and pre-existing folders are not swept. |
| F4 — unchecked tests / navigation coverage | Reproduced all six TypeScript errors and corrected the test types/fixture. The build now checks tests as well as src; Node types are an explicit dev dependency. Added Cerea turn/one-way and dynamic-target information regressions. Game screen transitions remain covered by actual Electron scenarios rather than a new unit-level Game model; that unit-test coverage gap remains a possible follow-up. |
| F5 — incomplete reviewer guards | Confirmed the pattern gaps. Added denies for force removal in either argument order, -f, short review approval/change flags and rg preprocessors. The installed OpenCode 2.1.4 loads these rules; nine alternate command forms were checked as denied, with ordinary owned-worktree removal still allowed. These remain tool guards, not a security sandbox. |
| F6 — exposed dev server / unrestricted hosts | Confirmed. Dev and preview now bind loopback with host checking. Remote previews require explicit --host and an exact CEREA_ALLOWED_HOSTS allowlist, documented in README. Raw HTTP checks verified localhost/explicit-host 200 and untrusted-host 403. |
| F7 — unescaped place-index fields | Confirmed. Escaped place names, street text and area names in the index; validate landmark road/kind, feature names and optional road classes. Regression tests cover escaped hostile markup and invalid map text. |
| F8 — conflicting missing-width defaults | Confirmed latent inconsistency, with no bundled-map impact. Rendering, atlas, paving and sign/plate clearance now share roadWidth(), with an 8 m fallback. A widthless-road regression checks atlas width and paving boundaries. |
| F9 — stale metadata | Confirmed. The HTML description now describes the default Cerea taxi game. |

Validation: 45 unit tests pass, src and tests type-check, production build
passes (existing bundle-size advisory), and all three headless Electron
scenarios pass. The Cerea scenario was repeated after final mirror refinement.
Windows packaging and launcher success/failure cleanup were exercised using
isolated test copies, without closing an existing user's game. Physical
controller testing remains outside this automated verification.

A fresh independent review is required at the new PR head. The review-only PR
still targets the empty baseline; main is unchanged. To integrate after the
owner accepts the review, create an ordinary task branch from main and
cherry-pick the separate workflow-adoption commit `b0e5fbd` plus the review-fix
commit, then open a PR against main. Do not integrate the artificial empty
baseline/merge commits or merge PR #1 as a substitute for that integration.

## Work package A follow-up

The ordinary integration PR #2 already brought the reviewed v0.6.1 tree onto
main. This task starts from that main and uses a new task branch; it neither
updates nor uses the whole-project review branches.

A adds unit-level tests that call the real `Game` transition methods with
browser/render/UI boundaries stubbed: atlas and pause freeze mission time,
only successful stopped requests or deliberate atlas placement write markers,
and held atlas triggers/gear actions cannot leak into driving. Existing
Electron scenarios continue to cover actual DOM/input integration. A separate
presentation scenario covers picture settings, controller selection without
resuming, both mirrors and the separated OSM/controller text.

The bottom-right credit now sits above the dashboard rather than sharing the
controller/ESC line. Physical controller and actual Windows launch/gameplay
checks remain outstanding for this task. See [A presentation notes](PRESENTATION.md)
for measurements, generated asset provenance and current limits. None of this
is an independent review or acceptance of work packages B/C.

## PR #3 independent review follow-up

The Claude Code / Sonnet 5.5 review covered exact head
`a07ea1f6b4f5b91afb6718d1c7fa3399cdd008e9` against main
`4c3479c2a505d874e7199d1ec43eb33f911e7f61`. It requested rework for three
SHOULD findings, with no MUST-FIX and no observed protected-rule violation.

| Finding | Disposition |
| --- | --- |
| S1 — throwing localStorage property prevents startup | Confirmed: Game evaluated the getter outside the readSettings catch. Storage acquisition is now lazy inside that catch, preserving defaults/in-memory settings if reads or writes are blocked. Unit tests cover getter/read exceptions; Electron reloads with a throwing window.localStorage getter and starts normally. |
| S2 — keyboard movement arms controller settings, hijacking Enter | Confirmed: atlasMoveY combined keyboard and gamepad input. Input now supplies separate controller settings navigation/confirm edges and keyboard-confirm state. Game uses that source-specific menu input; keyboard Enter remains start/resume. Regressions cover W/S/arrows, controller A, and keyboard Enter with a controller connected. |
| S3 — credit overlaps stopped interaction prompt | Confirmed: moving credit above the footer put it in the prompt band. Attribution now has central space inside the dashboard. The desktop test checks against prompt, controller text, both dashboard groups and navigation text at 960×640, 1280×900, 1440×900 and 1920×1080. |
| M1 — non-colliding scenery / cars on verge | Retained deliberately as cosmetic scenery; adding collisions would change the requested gameplay contract. Clarified that trees and lamps also have no collisions and cars are verge dressing rather than simulated kerbside parking. |
| M2 — focused selects swallow Enter/Escape | Confirmed and fixed with S2: those keys leave the select and bubble to game input, while ordinary form editing stays local. Visible keyboard instructions and focused-select desktop regressions were added. |
| M3 — unapproved CC0 dedication | Removed the dedication and PR claim. Original generated asset provenance remains recorded; no project licence is chosen on the owner's behalf. |
| M4 — default 540p path coverage | Main Cerea offline/controller/atlas/taxi scenario now stays at the actual 540p default, rather than forcing Sharp. The separate presentation scenario checks 270p and Sharp. Game unit tests still intentionally stub browser/render/HUD boundaries. |
| M5 — screen-space sky | Documented as a visual limitation: the backdrop's horizon band stays fixed when pitching the camera. No sky or rendering rewrite was made during review follow-up. |

The reviewer reproduced the default's lower frame time but observed noisy
software-GPU samples. The recorded A measurements remain historical samples,
not a precise general performance guarantee. This follow-up changes storage,
menu input and DOM layout, not world geometry, render resolution or taxi rules;
no additional rendering-performance claim is made. Physical controller,
actual Windows gameplay and audio listening remain outstanding. Substantive
input/startup fixes require another independent review of the new head; no
reviewer is started or selected, and no PR is merged here.

Follow-up validation: Node 24.21.0, `npm ci` (0 vulnerabilities), all 57 unit
tests, source/test type-check and production build pass. All five required
Xvfb/xfwm4 Electron scenarios pass together (about 131 seconds), including
throwing-storage startup, keyboard movement followed by Enter, focused-select
Enter/Escape, default-540p taxi/atlas integration, controller settings and
attribution separation at all four sizes. Screenshots were refreshed, including
`test-results/cerea-credit-layout.png`; generated artifacts remain ignored.
The initial sandboxed npm ci failed with esbuild EPERM, and a test attempt
before successful installation could not load tsx. Retrying installation with
subprocess permissions succeeded; no final checks failed or were skipped.

## A accepted; B is separate

The clean re-review of A covered `7aa24a10c15f7102cab74539a1b8e68f32b59bf6`
and reported no findings. The owner subsequently authorized merging PR #3 and
continuing to B. Main's merge is `c3ffdeeee0cdedc0b68be00a3890499fa1199cc7`.
B starts there on its own task branch and requires its own independent review.
The whole-project review branches are untouched, and C has not started.

B keeps the protected transition/input tests and adds indexed-versus-exhaustive
spatial/sign/path checks, concurrently live district systems, and local-frame
precision and desktop checks at 25 km. The normal diagnostics overlay remains
off; its opt-in output contains timings/counts only. See
[the B architecture and measurements](SCALABILITY.md). Physical controller,
actual Windows launch/gameplay, audio listening and Windows GPU profiling remain
outstanding/manual for B as well.

## PR #4 independent review follow-up

The Claude Code / Sonnet 5.5 review covered exact B head
`f44e71f83c5b77c0e17f9490e78397f5a9860b32` against main
`c3ffdeeee0cdedc0b68be00a3890499fa1199cc7`. It found no MUST-FIX or SHOULD
items, one MINOR issue and three notes. Independent comparisons against the
exact base found matching routes, hints, nearest roads, paving, collisions,
boards, plates and props; its CPU benchmarks reproduced the measured speedups.

| Item | Disposition |
| --- | --- |
| M1 — spreading large bounds arrays exceeds argument limits | Confirmed in both grid construction and rectBounds with 150,000 entries: both threw RangeError. Bounds now accumulate in loops without spreading vertices/items into function arguments. Regression checks build/query a 150,000-item grid and bound 150,000-vertex outer polygons and holes; empty-grid behaviour remains unchanged. |
| N1 — module-level material/street-texture caches | Retained: keys are pure colour/text values, not active-district state, and no current disposal/mutation can invalidate another context. Future streaming still needs resource-lifetime/memory measurement; no claim is made for that here. |
| N2 — translated Harbor can mix collider frames | Added an explicit early guard when the legacy Harbor renderer would require a nonzero anchor. The supported authored Harbor data stays unchanged. A regression checks that normal Harbor binds and a 25 km translated Harbor is rejected clearly. Generic Cerea translation support is unchanged. |
| N3 — factory startup overhead | No change: the reviewer measured it as negligible and did not identify a defect. No unrelated factory rewrite is included. |

Historical CPU/frame samples remain historical; this follow-up removes a
constructor argument limit and guards an unsupported legacy input, rather than
changing the measured scene or query algorithms. No new performance or
multi-town memory/load-time claim is made. A fresh exact-head review handoff
will accompany the pushed fix; no reviewer is selected/started and B remains
unmerged. Package C has not started.

Follow-up validation: clean install (0 vulnerabilities), all 65 unit tests,
source/test type-check and production build pass, with the existing bundle-size
advisory. All six required Xvfb/xfwm4 Electron scenarios pass together (~113 s),
including original Harbor and the translated Cerea fixture. Initial sandboxed
npm ci hit esbuild EPERM, and a premature reproduction attempt lacked tsx;
installation with subprocess permissions succeeded before both failures were
reproduced on the reviewed code and then covered by passing regressions. No
final automated checks failed or were skipped. Physical controller, real
Windows gameplay, audio listening and Windows GPU measurements remain manual
and outstanding; generated screenshots/artifacts remain ignored.

## B accepted; C is separate

The clean B follow-up review covered `dc64ce2a04729da62d891d259354ad6a9728213e`.
It found no blockers, verified the large-grid fix and repeated identical old/new
outputs. Small translations of the authored Harbor fixture remain unsupported,
as documented. The owner then authorized merging PR #4 and continuing; main's
merge is `ebd93fc93217f0f40654a0e1acc259a65d4819b8`.

C starts from that merge on a new task branch. It adds an opt-in tiled renderer,
explicitly fictional countryside/hamlet fixture, layered next-region directions
and reproducible sizing/rendering diagnostics. The original maps and prior
navigation/input/taxi constraints remain protected. C's loading gate freezes
simulation time and never moves atlas knowledge. It requires its own exact-head
independent review; no reviewer is started/chosen and C is not merged.
See [the C report](TILED_PROTOTYPE.md) for the measured feasibility and limits.

C validation: 74 unit tests, source/test build and all seven required Electron
scenarios pass. Repeated offline exports are byte-identical (56 JSON files).
The new Game unit test covers a scenery-load simulation gate without marker
writes; the prototype desktop scenario covers controller View/Y/A, free atlas
reading, deliberate estimates corrected by information, and unchanged knowledge
after driving. A zero-length portal-leg comparison bug found in a hamlet
screenshot was fixed with unit and actual return-hint regressions. Final serial
profiles and ten-copy logical sizing are in the C report; real Windows/GPU,
physical controller and audio checks remain outstanding. C is not merged.

## PR #5 independent review follow-up

Claude Code / Sonnet 5.5 reviewed exact C head
`5077517cef214896963b368a6962ee11ec978034` against main
`ebd93fc93217f0f40654a0e1acc259a65d4819b8`. It requested rework for one
SHOULD item, with one MINOR item and no MUST-FIX. The independent data,
routing, collision, hint, ownership, export and lab comparisons matched the
prototype's claims; its normal-play and physical-drive limitations remain.

| Finding | Disposition and evidence |
| --- | --- |
| S1 — transient tile failure permanently freezes the session; misleading reload instruction | Confirmed directly on the reviewed code: one failed request remained excluded after another update, leaving one attempt and ready=false. Wanted failed tiles now retry at 0.5/1/2/4 s, then an 8 s cap, without tight loops or retries after close/outside the wanted set. Successful builds clear active failure state while retaining historical diagnostics. Local requests bypass the response cache. The UI says automatic retry and restart if persistent, rather than referring to a nonexistent desktop Reload menu. Unit tests use a deterministic clock; an Electron regression aborts the first tile request, allows recovery while paused, checks frozen time and explicit controller resume without restarting. |
| M1 — tile IDs do not prove bounds/coverage consistency | Canonical integer IDs now determine all four 250 m bounds. Unsafe coordinates/aliases such as -0_0, duplicate IDs, moved/overlapping bounds, out-of-grid tiles and missing rectangle cells are rejected. Unique canonical cells plus the expected grid count establish non-overlap and complete prototype coverage. New tests reject shifted bounds, overlaps, aliases and removed cells; the committed manifest remains unchanged. |

The successful scene/query algorithms and geometry are unchanged. Historical
C measurements describe the original reviewed samples; no new speedup is
claimed. The no-store retry policy can affect local read timing, so any fresh
load profile is recorded separately rather than silently replacing earlier
numbers. The review still did not include a physical end-to-end drive of the
link, physical controller, real Windows gameplay/audio or Windows GPU checks.
These remain outstanding/manual. C is not merged; no reviewer is selected or
started, and the pushed fixes need their own exact-head re-review.

Follow-up verification: Node 24.21.0, clean install (0 vulnerabilities), all
77 unit tests, source/test build and all eight required Electron scenarios pass
(~161 seconds). The new actual Electron abort/retry case recovers without
restarting, holds time while paused, retains pause on success and resumes with
the controller. A fresh serial no-store lab run retains the original geometry
and disposal counts (69 loads / 51 unloads); timing samples are recorded
separately in the C report. No final checks failed/skipped, and no generated
runtime artifacts are tracked. End-to-end driving/Windows/controller/audio/GPU
manual limitations remain explicit.

## PR #5 re-review: final minor cleanup

The re-review covered `7c03eaeaac4455a7dbb7c8121e1757aec057f6e0` and
confirmed S1/M1 fixed, with no SHOULD or MUST-FIX. It independently exercised
repeated failures/backoff, paused recovery and 21 manifest mutations; the prior
geography/rendering/routing evidence remains applicable. Two minor items were
then closed rather than carried into the prototype:

| Item | Disposition |
| --- | --- |
| M2 — graphics-context loss still says “Reload the page” | Changed to “Restart the application”, which is valid in the desktop shell. The startup-failure message now uses the same wording. District selection's actual window.location.reload() remains intentional; no missing Reload menu is assumed. |
| M3 — a request that never settles cannot enter retry | Tile fetches now use AbortSignal.timeout(10_000), covering both the request and consumption of its response body. A stalled read rejects into the existing monotonic capped backoff. A new Electron regression holds the first local request indefinitely, verifies frozen clock/speed, then observes a successful replacement request and the unchanged starting atlas marker. |

No map, route/fare, physics, input, geometry, shader or security behaviour was
changed by this cleanup. No new performance claim is made; earlier measured
samples remain historical. Physical end-to-end driving, physical controller,
real Windows gameplay/audio and Windows GPU checks remain outstanding/manual.
C stays unmerged; no reviewer is started or selected.

Final cleanup validation: clean install (0 vulnerabilities), all 77 unit tests,
source/test type-check/build and all nine required Xvfb/xfwm4 Electron scenarios
pass together (~172 s). The new actual Electron case never releases the first
request until cleanup; its deadline causes a successful replacement request,
with clock/speed held and the starting atlas marker unchanged. The targeted
case passed separately too. Diff checks pass; no remaining user-facing reload
instruction exists in src. No final automated failures/skips. Historical
performance samples were not rerun: this is a stalled-read deadline and wording
change, without geometry/query changes or a new speedup claim. Manual/end-to-end
limitations remain unchanged.
