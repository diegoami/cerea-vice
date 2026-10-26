# Whole-project review brief: Cerea Vice v0.6.0

Review the complete repository from its first prototype through the 3D cockpit,
including this workflow adoption. The PR's empty base is intentional. Review
the entire base-to-head diff and relevant history, not only the final commit.

**Protects:** learning a real place through observation and directions, with
an honest stopped-only atlas, consistent keyboard/controller behavior,
correct taxi scoring and a safely isolated offline desktop client.

## Forbidden results / blocking means

Evidence of any of these is MUST-FIX, not deferred hardening:

- Automatic knowledge of the car/objective through marker updates, camera
  heading driving the compass, a route line, or an equivalent navigation leak
  contrary to the documented rules.
- Atlas use while moving, time advancing during pause/atlas, or atlas inputs
  causing unintended driving, gear changes or information/marker actions.
- Braking selecting reverse, invalid moving shifts, or inconsistent documented
  keyboard/controller mappings that prevent core navigation or passenger service.
- Wrong-street name plates, missing named-junction coverage, disconnected goals,
  one-way routing errors, or building/collider geometry blocking valid roads.
- Unstopped or duplicate taxi payouts, negative/incorrect fares or bonuses,
  payments for unfinished rides at shift end, or a broken restart.
- Desktop content escaping the intended local asset root, remote/untrusted
  navigation gaining capabilities, Node exposure to renderer content, or
  packaging/launch behavior that fails its documented supported use.
- Tests or documentation claiming protection that the implementation bypasses,
  including review setup that silently reviews another commit or claims
  independence without a separate reviewer.

Other concrete bugs should also be reported. Separate verified defects from
suspected risks and deliberate prototype limits. Report all blockers found
across the scope together; state incomplete coverage rather than approving an
unfinished pass. The reviewer can disagree with this brief with evidence.

## Areas to inspect

1. `src/game`, `src/driving`, `src/input`: fixed-step simulation, stop settling,
   gear/brake semantics, free-look return, physical cockpit and mirror passes,
   screen/input transitions, focus loss and controller disconnect.
2. `src/navigation`, `src/ui`: route/direction wording, information confirmation,
   manual marker knowledge, zoom/pan/index behavior and controller parity.
3. `src/mission`, `TAXI.md`: pickup/dropoff gates, directed distance, fares and
   speed bonuses, 07:00–17:00 clock, pause, shift completion and reset.
4. `src/world`, `public/maps`, `tools`, `data`: schema checks, OSM provenance,
   coordinates and topology, street-plate ownership/visibility, collision versus
   rendered geometry, import reproducibility and destination accessibility.
5. `desktop`, package manifests and lockfile: custom protocol, asset boundaries,
   navigation/permission policy, packaging, isolated profiles and WSL launch.
6. Tests and docs: assertions versus claims, real coverage gaps, reproducibility,
   safe and independent review workflow.

## Validation available at handoff

For v0.6.0, the implementing session observed:

- `npm test`: 39 passing tests.
- `npm run build`: TypeScript and production Vite build pass; existing bundle
  size advisory remains.
- Headless Electron desktop checks: all three scenarios passed; the affected
  Cerea scenario was rerun after final cockpit geometry changes and passed.
- Windows v0.6.0 packaged and opened with an isolated profile from WSL.
- Visual inspection of forward/down cockpit views and functioning side mirrors.

These are implementer observations, not independent review results. The reviewer
must report its own checks and distinguish inherited evidence from reproduced
results. Installation: Node >=22.12, `npm ci`. Runtime/UI checks need a graphical
environment or Xvfb plus xfwm4 as documented in `AGENTS.md`.

## Known prototype limits

- No progress/save-game persistence; reload starts a new drive or shift.
- Cerea uses modern OSM topology with simplified scenery and approximate stop
  frontages, not a historically exact 1980s town or surveyed legal parking.
- Cerea permits stopping anywhere at this stage. Harbor retains bay legality.
- Side mirrors render at 320×192 / 10 Hz. Vehicle handling is arcade-like.
- Portable unsigned Windows bundle, no installer or automatic updates.
- Automated controller tests simulate a standard mapping; physical controllers
  and varied Windows/GPU hardware still need playtesting.

No independent review has been performed by the implementing session. Post
findings on the PR and leave merging and reviewer/model choice to the owner.
