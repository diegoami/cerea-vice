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
