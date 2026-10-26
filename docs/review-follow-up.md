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
