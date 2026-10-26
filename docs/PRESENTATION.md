# Work package A — economical town presentation

This is a presentation pass on the existing Cerea district, using Three.js.
No content expansion, streaming, spatial index or route/physics rewrite is part
of A. Work packages B and C remain separate, owner-gated work.

## Options and cost boundaries

The owner selected Detailed / Retro 540p after seeing the software-rendered
tradeoff. Picture, scenery, volume, radio and cockpit-motion options are available
in the briefing and pause screens, with native keyboard/mouse controls and
D-pad selection / A cycling. Start always starts/resumes. Options persist in
local storage, separately from district selection; a fresh Windows playtest
profile uses defaults. The simulator remains paused while options are changed.

- Sharp: existing display-sized buffer, capped at 1920 px wide. Use this to
  read a small street plate. Perspective, sign placement and text are unchanged.
- Retro 540p (default) / 270p: fixed maximum internal height, preserving aspect
  ratio; nearest-neighbour upscale and a subtle 2×2 ordered dither with 32 levels
  per channel. The pass converts linear scene colour to display colour before
  dithering. HUD and atlas are independent DOM/SVG at display resolution.
- Detailed / Simple: extra façade textures, roofs and props have a single
  scenery switch. Simple retains the base buildings. Both use exactly the same
  clipped collision polygons. All static geometry is merged by material;
  Detailed replaces base building walls rather than drawing over them.
- Cockpit motion: bounded interior-only roll/pitch (under one degree) and
  small wheel vibration, with an exact Off setting. The road camera, compass,
  car position, handling and gear selection are unaffected.
- Sound: master volume including mute; radio independently off by default.
  An idle/engine triangle oscillator follows speed and gear. A brief square
  tick follows steering rather than supplying turn advice. A sine-note loop
  is the quiet radio bed. Atlas, pause, briefing and results fade the master
  to zero; their simulation clock does not advance. No virtual radio station,
  traffic simulation or new indicator control is introduced.

## Geography, signs and scenery

Four warm façade palettes repeat by 65 m local neighbourhood. Canvas textures
supply shutters, windows, doors and a small shop frontage; doors remain at
street level. Roofs are low triangular tile facets confined to the triangulated
clipped footprints, including holes. This intentionally stylised roof treatment
does not reconstruct individual real roofs. The sky is a small painted gradient;
the existing 07:00–17:00 sun progression has stronger directional contrast.
There are no shadow maps or extra shadow render passes.

Roadside tree/lamp/car/person candidates are deterministic, do not depend on
passengers or objectives, and are rejected near paving, buildings, bays and
signs/plate sightlines. These are static, non-colliding props. Every Cerea bay
gets the same waiting figure; none appears or disappears when the active goal
changes. Passenger service remains a deliberate stopped action in the named
bay. Harbor retains its handcrafted scenery.

There is no new current-location or goal overlay. Small signs become less
readable at low resolution; Sharp is the explicit fallback, not enlarged arrow
boards or automatic navigation. Mirrors keep their rear cameras, 320×192 render
targets and 10 Hz updates. Both housings remain visible in the new screenshots.

## Asset provenance

All façade, roof and sky pixels are painted at runtime by project code in
`src/world/Scenery.ts` and `src/world/World.ts`. They use no external images,
fonts or downloads. All sound is synthesized by original code in
`src/presentation/Sound.ts`; there are no recordings, samples or network assets.
The generated sound and texture output is dedicated to CC0-1.0 by this project.
OSM geography remains under the separate attribution/provenance documented in
`data/README.md`; this presentation pass does not modify the source extract or
its derived JSON. OSM credit remains visible and now clears the controller line.

## Reproducing the desktop measurement

Use Node >=22.12, `npm ci`, `npm run desktop:setup`, `npm run build`, Xvfb and
xfwm4. Run one measurement at a time, without a build or tests running alongside:

```sh
xvfb-run -a sh -c 'xfwm4 --compositor=off >/tmp/cerea-profile-wm.log 2>&1 & node desktop/profile.mjs default'
xvfb-run -a sh -c 'xfwm4 --compositor=off >/tmp/cerea-profile-wm.log 2>&1 & CEREA_PICTURE=sharp node desktop/profile.mjs detailed-sharp'
xvfb-run -a sh -c 'xfwm4 --compositor=off >/tmp/cerea-profile-wm.log 2>&1 & CEREA_PICTURE=sharp CEREA_DETAIL=false node desktop/profile.mjs simple-sharp'
```

Each run owns a fresh temporary Electron profile, starts at Municipio, waits
2 seconds, discards 30 animation frames, and records 120 requestAnimationFrame
intervals (median and p95). It records the GPU, viewport and internal buffer,
saves a screenshot/JSON in ignored `test-results/`, and closes only its own
app/profile. These are delivered frame intervals, including compositor and
mirror work, rather than GPU timer queries or isolated simulation timings.
The screenshot call occurs after sampling. No map or goal state is exposed by
the profiler. The old main build can use the same script with no picture options.

Measurements and validation are recorded below. The initial
working budget was at most 10% median frame-time growth; the selected default
must remain below that bound in this setup. Sharp/Detailed is an optional higher
cost mode, not a claim of equal rendering work at equal cost. These Linux
SwiftShader numbers do not predict a physical Windows GPU's performance.

## Known limits / manual follow-up

Physical controller mapping, actual Windows launch/play, audio listening and
GPU frame times remain manual checks for this PR. The automated controller is
standard-mapped simulated input. Browser audio may need a click or key press.
The loop is intentionally sparse, and pedestrians and parked cars do not move.
Small street plates are not promised legible at a distance in 270p; select
Sharp and use the existing look controls. Buildings still all load at startup;
this pass does not solve the multi-town architecture.

## Recorded measurements — 2026-10-26

Node 24.21.0, Electron 45.0.0 / Chromium 156, Linux/Xvfb/xfwm4, ANGLE Vulkan
SwiftShader (Subzero), 1280×900 viewport. Measurements ran serially. This is a
software GPU, not a Windows hardware benchmark. The baseline was measured both
before changes and again from an isolated archive of
`origin/main` at `4c3479c2a505d874e7199d1ec43eb33f911e7f61`; both gave 166.7 ms
median / 183.4 ms p95. The archive and its temporary profile were removed.

| Build / picture | Internal buffer | Median frame ms | p95 frame ms |
| --- | --- | ---: | ---: |
| v0.6.1 main, Sharp | 1280×900 | 166.7 | 183.4 |
| A default, Detailed / Retro 540p | 768×540 | 83.3 | 116.7 |
| A optional Detailed / Sharp | 1280×900 | 216.7 | 250.0 |

The chosen default reduces delivered median frame time by about 50%, meeting
the provisional ≤10% growth budget by deliberately shading fewer pixels.
Detailed/Sharp costs about 30% more than old main at the same resolution; it
is not covered by the default's budget claim. Earlier development samples
were 250 ms for Detailed/Sharp and 116.7 ms for Detailed/540p; an initial 350 ms
sample overlapped tests and is excluded. Final default was repeated at 83.3 ms.
These are short stationary samples rather than claims about a whole driving
route, loading time, CPU stage timing or ten-town scalability.

Ignored evidence: `test-results/baseline-repeat.{json,png}`,
`final-default.{json,png}` and `final-sharp.{json,png}`. The desktop suite also
refreshes `cerea-briefing.png`, `cerea-driving.png`, `cerea-atlas.png`,
`atlas-cordioli-detail.png`, `cerea-retro-270p.png`, `cerea-settings.png`, and
`cerea-sharp-mirrors.png`. Re-run the suite/profiler to regenerate evidence in
an independent checkout; none of these generated artifacts is tracked.

## Validation

On the final code: `npm ci` (0 vulnerabilities), `npm test` (55 passing),
`npm run build` (source and tests type-check; existing >500 kB bundle advisory),
and the required command below all passed:

```sh
xvfb-run -a sh -c 'xfwm4 --compositor=off >/tmp/cerea-review-wm.log 2>&1 & npm run test:desktop'
```

All four Electron scenarios passed together (about 113 seconds), including
new settings/retro/mirror/layout coverage. The first sandboxed Electron launch
failed; desktop checks required desktop process permissions. During development,
a new test's one-frame settings-visibility assumption and its missing retro
renderer boundary stub were corrected; final suites have no failed or skipped
automated checks. Actual Windows launch/gameplay, physical controllers and audio
listening remain manual, unperformed checks for this PR. No review was started.
