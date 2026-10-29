# Working on Cerea Vice

Read `VISION.md` for the intended game, `README.md` for running it, `MAPS.md`
for world data, and `TAXI.md` for shift rules. This is a TypeScript / Three.js
browser game with an Electron desktop shell; Windows is the primary playtest
client, built from WSL with `npm run desktop:win`.

## Preserve the game rules

- No GPS, minimap, objective arrow or automatic route line. The compass shows
  the car's heading, independently of looking around.
- The stopped-only atlas marker represents knowledge: it changes only after
  a successful information request or a deliberate player estimate. Driving,
  parking, zooming, looking up streets and serving passengers cannot update it.
- Information is available anywhere while fully stopped, including in the
  atlas. Cerea currently permits stopping anywhere; Harbor retains marked bays.
- Keyboard and standard controller paths must both work. Information uses
  F / View; atlas placement and passenger service use Enter / A. LT only brakes;
  B / R changes forward/reverse at a settled stop. Atlas controls must not leak
  into driving. Looking is independent of steering and returns forward on idle.
- Preserve meaningful real street connections, one-way access and compass
  relationships. Building clearance and street-name ownership are important.
- Taxi shifts run 07:00–17:00 with deliberate pickup/dropoff, base fares and
  decreasing speed bonuses. Atlas use and pause stop simulation time.

## Validation and artifacts

Use Node >=22.12 and `npm ci`. Run `npm test` and `npm run build` for code
changes. For changes to input, screens, rendering or desktop behavior also run:

```bash
xvfb-run -a sh -c 'xfwm4 --compositor=off >/tmp/cerea-review-wm.log 2>&1 & npm run test:desktop'
```

The headless desktop check needs Xvfb and xfwm4; use the documented desktop
command on a graphical machine otherwise. Report prerequisites and failures
honestly. Controller automation simulates standard gamepad input; it does not
replace physical controller testing. Keep `dist/`, `release/`, `node_modules/`,
`.desktop-stage/` and `test-results/` out of git. OSM extracts and derived maps
are intentionally tracked with provenance in `data/README.md`.

## Changes and reviews

Make changes on a task branch. Commit and push when authorized, and hand over
an open PR. The owner decides when to merge; do not merge as part of a review.

**Choosing models: the user decides** (the owner, 2026-10-28). This project
rule replaces the global quota-service rules. Do not pick, start or chain an
implementer or reviewer model on your own; ask when a model is needed.

**Reviews are run by hand** (the owner, 2026-10-28, as in malpaco). Never start
a reviewer or a re-review yourself, and do not pair a reviewer with each task.

- **Per PR: optional.** Say when a PR deserves a review (input or controls,
  saves, the desktop shell or its security boundary, map data or game rules,
  a release candidate) and give the owner a ready prompt naming the PR and its
  head SHA (`.claude/skills/review-pr/SKILL.md`), filled in from
  `docs/review-prompts.md`. Prompts name no tool or model; the owner chooses
  both. The reviewer follows `docs/review-pr.md` and posts one review on the
  PR. One round: fix real defects in what the PR delivers; everything else
  becomes a follow-up issue. Blocking means a player or developer would hit it
  through normal use.
- **Per milestone: the big review** of everything since the previous release
  tag, before tagging (`docs/milestone-review.md`). PRs merged without a review
  are listed there.
- Merge needs the owner's go-ahead, passing checks and, when a review ran, its
  findings answered.

The initial whole-project PR targets `review/empty-baseline` and is a review
vehicle, not a normal change to `main`. It intentionally includes every project
file from the beginning. Do not merge that PR to publish game changes or use
its baseline as a development branch. Future ordinary PRs target `main`.
