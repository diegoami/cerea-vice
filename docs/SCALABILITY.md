# Work package B — scalability foundations

A was merged through PR #3 at `c3ffdeeee0cdedc0b68be00a3890499fa1199cc7`.
B changes architecture and diagnostics, without adding maps, roads, towns,
streaming, missions or a new engine. B was subsequently accepted and merged through PR #4 at
`ebd93fc93217f0f40654a0e1acc259a65d4819b8`. C is now a separate
[opt-in feasibility prototype](TILED_PROTOTYPE.md).

## Explicit district ownership

`new District(definition)` validates a definition and owns its node lookup,
road adjacency, spatial grids, directed route graph and optional profiler.
There is no active-district module variable or activation function. The loader
returns a context; the entry point passes it to `createGame(context)`.

Systems are bound through small `create…(context)` factories. They return the
same classes/functions used before, but close over the supplied context rather
than mutable imports. For example:

```ts
const town = new District(definition);
const { Car } = createCar(town);
const { Mission } = createMission(town);
const car = new Car();
const shift = new Mission();
```

Navigation, road signs/plates, atlas, HUD, parking, missions, car and renderer
all bind explicitly. The directions cache now belongs to its factory/context.
Tests use local contexts and explicitly rebind their fixture systems when
switching fixtures. A concurrent-context test keeps Cerea and Harbor cars,
missions, navigation, atlases and personal atlas notes alive together, proving
one cannot change the other's selected geography or marker knowledge.

Treat geometry definitions as immutable after construction. To edit topology
or geometry, construct a new District; mutating its source arrays would leave
precomputed indexes stale. Names/text-only hostile-input tests still exercise
escaping independently. Multiple contexts in memory are supported; the UI still
selects one district and reloads. This is not seamless inter-town travel yet.

## Broad phase and routing

A 32 m uniform grid indexes conservative building and road bounds. Queries
return candidates in original source order, then run the existing exact
polygon/hole/margin or road-projection predicates. Collisions in the game use
an index containing every world collider, including water/legacy obstacles;
standalone Car tests may still supply arrays for exhaustive reference checks.
Road paving, nearest-road queries, sign/plate clearance and plate sightlines
use the context indexes. Nearby props use the same building broad phase.

Nearest-road queries expand a square until no unseen segment can be closer.
Source-order tie breaking matches the old stable sort, including outside-map
queries. Large empty query areas iterate occupied cells rather than walking
millions of empty cells. Harbor's split hotel approach has its own index,
preserving its authored hint behaviour.

Node lookup and junction adjacency are precomputed. Directed Dijkstra uses a
binary heap over outgoing graph links. Equal-cost node priority matches the
old reverse-node-order reduce rule; road iteration remains in source order.
Tests compare full paths and costs for all taxi-stop pairs and boundary-node
routes, not just reachability. Taxi fares and hints keep the same distances,
one-way access and next-junction choices. No route/goal graphic is added.

## Local rendering frame

Simulation, navigation, map data and paper-atlas knowledge remain in world
coordinates using JavaScript doubles. A `LocalFrame` chooses an initial anchor
near the spawn, subtracts it from a cloned rendering definition **before**
Three.js allocates Float32 mesh attributes, and keeps the view local. Once the
car is more than 512 m from the current render origin, that origin snaps to a
256 m grid. The static content group, cockpit, rear mirrors and camera use
that frame together; lights/background are independent of translation.

World collision polygons are translated back to the unchanged logical world
frame and indexed there. Rebasing cannot move the car, mission bays, road
graph, atlas viewport or its position marker. The mathematical projection test
checks millimetre changes at >25 km and continuity across a rebase. An Electron
fixture translates Cerea by 25 km in both axes, then starts a fare, asks for
information, drives/stops and checks the atlas marker remains the same.

This bounds geometry coordinates near the **district's initial anchor**, not
an arbitrarily large continent's vertices. Streaming/rebuilding distant mesh
chunks remains C work. Harbor is handcrafted in its original local coordinate
system; the translated-data demonstration uses the general Cerea renderer.

## Diagnostics (off by default)

Browser: add `?profile=1` before the district hash. Electron:

```sh
npm run desktop -- --profile
# Or, after building:
node_modules/.bin/electron . --profile
```

The small overlay reports only mean/max CPU milliseconds and sample counts for
physics-step (car/parking/mission), nearest-road query, route search and render
submission including mirror work. It contains no coordinates, street names,
objectives or route information. Ordinary launches create no diagnostics DOM.
A fixed set of aggregate counters avoids accumulating per-frame trace entries.
Profiler-off calls bypass timing reads. These are CPU/driver submission timings,
not asynchronous GPU timer queries.

Reproduce CPU benchmarks with Node >=22.12 after `npm ci`:

```sh
node --import tsx tools/profile-world.mjs B-cpu
```

The script also supports the pre-B APIs, allowing the exact same benchmark to
run from an isolated archive of main. It warms each workload once, takes the
median of five runs, and writes ignored `test-results/<label>.json`:
400 deterministic collision/paving/nearest-road queries, all 81 directed taxi
pairs, and 1000 fixed idle Car steps at spawn. Physics timings include paving
and collision checks; these synthetic workloads are not a full driving route.

For the actual Electron renderer, build then run serially:

```sh
xvfb-run -a sh -c 'xfwm4 --compositor=off >/tmp/cerea-profile-wm.log 2>&1 & node desktop/profile.mjs B-desktop'
```

It enables profiling, asks once while stopped, boards the first passenger,
warms 30 frames, then records 120 delivered frame intervals and the aggregated
CPU overlay. Sound/driver behaviour and software-GPU scheduling can make frame
intervals noisy. Benchmarks must not run alongside tests or builds.

## Limits and manual checks

No new content or schema/importer changes. All geometry still loads at startup;
there is no tile loader, coarse inter-town graph or LOD. Spatial indexes duplicate
some bounding-box references and World currently builds a separate local render
context, trading startup memory for explicit ownership and precision. No claim
is made yet about ten-town memory or load time. Physical controller, actual
Windows launch/gameplay, audio listening and Windows GPU profiling remain
manual/outstanding for this PR. Electron security settings, CSP and local asset
root remain unchanged; the sole shell change is an opt-in profiling URL switch.

## Measurements — 2026-10-26

Node 24.21.0, same machine/dependencies, workloads run serially. Before is
merged A (`c3ffdeeee0cdedc0b68be00a3890499fa1199cc7`), measured from an isolated
archive using the same profiler script; the archive was removed afterward.
After is B's indexed/context implementation. Values are medians of five warmed
runs, in milliseconds for the whole named workload, not per query.

| CPU workload | A ms | B ms | A/B ratio |
| --- | ---: | ---: | ---: |
| 400 building-collision queries | 102.954 | 1.130 | 91.1× |
| 400 paving queries | 353.304 | 0.290 | 1217.3× |
| 400 nearest-road queries | 407.377 | 4.681 | 87.0× |
| 81 directed taxi-stop routes | 294.559 | 4.631 | 63.6× |
| 1000 idle physics steps (paving + buildings) | 1234.234 | 1.682 | 733.7× |

These gains combine constant-time node lookup, spatial broad phases and graph
adjacency/heap search; they should not be attributed to the grid alone. The
physics workload idles at spawn against building colliders, not every river or
legacy obstacle, and is deliberately repeatable rather than representative of
a full route. No timing threshold is asserted in tests; correctness checks use
exhaustive results. Keep these synthetic ratios separate from frame-rate claims.

Electron 45 / Chromium 156, Xvfb/xfwm4, ANGLE Vulkan SwiftShader, Detailed/540p,
1280×900 viewport / 768×540 internal buffer, 120 sampled frame intervals:

| Delivered frames | Median ms | p95 ms |
| --- | ---: | ---: |
| A main, same stopped-information/pickup workload | 83.3 | 100.1 |
| B, profiling enabled (earlier sample) | 83.3 | 100.1 |
| B, final ownership fix / profiling enabled, run 1 | 100.0 | 133.3 |
| B, final ownership fix / profiling enabled, run 2 | 83.2 | 100.0 |

B's aggregate browser CPU readings at the end of final run 1 were physics-step
0.015 ms mean (882 samples), nearest-road 0.100 ms (1 stopped request), route
search 0.133 ms (3 calls), and render submission 4.054 ms (170 frames, including
cold startup; max 279.3 ms). Browser timer precision and the tiny query sample
counts limit their usefulness; the Node workloads supply the repeated-query
measurements. Main has no per-stage overlay, so no prior browser per-stage
numbers are claimed. Render submission timing is not GPU frame time. The
software-rendered delivered frame rate stays bounded by rendering even after
substantial CPU query improvements. Final run 1
was 20% above the main median; run 2 returned to 83.2 ms. Its CPU means were
physics 0.016 ms, nearest-road 0.100 ms, route search 0.133 ms, and render
submission 3.879 ms. Both runs are retained (`B-desktop.json` and
`B-desktop-repeat.json`); no rendering speedup or equal-cost guarantee is claimed. Windows GPU performance remains unmeasured.

Evidence is ignored in `test-results/B-{main-cpu,cpu,main-desktop,desktop}.json`
and desktop screenshots, including `cerea-25km.png`. The final single-world
profile was refreshed after the ownership fix; earlier sample values above
are retained explicitly alongside both final samples. Regenerate in a fresh
checkout for independent evidence.

## Validation

Node >=22.12 is required; validated on 24.21.0. `npm ci` passes (0 vulnerabilities),
all 63 unit tests pass, and `npm run build` checks src/tests and builds successfully
(existing >500 kB JS bundle advisory). All six required Xvfb/xfwm4 Electron
scenarios pass together (~111 seconds), including the translated-25-km fixture.
`git diff --check` passes and generated artifacts remain ignored. Earlier
mechanical-migration type errors were fixed before these final passes; no final
automated checks failed or were skipped. Manual checks listed above remain
outstanding. This paragraph records the initial implementing-side validation. The later
independent review and accepted follow-up are recorded in `review-follow-up.md`.

Each World instance owns its mutable render origin, even when multiple instances
are created from the same bound factory. A constructor-level regression builds
two worlds with stubbed canvas painting and verifies that rebasing one leaves
the other unchanged. The full Electron suite was repeated after that correction.

## Independent review follow-up

Review of `f44e71f83c5b77c0e17f9490e78397f5a9860b32` found no blocking items
and confirmed old/new query, route and sign outputs independently. Its MINOR
large-grid argument-limit finding was reproduced and fixed: bounds accumulation
now uses loops for both whole grids and polygon/hole vertices. Regression checks
cover 150,000 grid items and 150,000 vertices without RangeError. This removes
that specific limit, not a general memory/load-time guarantee for large towns.

The legacy Harbor renderer now rejects definitions needing a nonzero render
anchor, rather than silently mixing local legacy collider coordinates with
world-frame physics. Harbor must still use its original authored coordinates;
this guard is not support for arbitrary translated Harbor data. The general
Cerea renderer's translated-coordinate support remains unchanged. Shared render
caches keyed only by colour/text are retained; resource lifetime under streaming
remains future work. The reviewer found factory startup overhead negligible.

Follow-up validation supersedes the initial count: 65 unit tests, source/test
build and all six required Electron scenarios pass (~113 s); npm ci reports
0 vulnerabilities. The sandboxed install initially failed its esbuild subprocess
check and was retried successfully with subprocess permissions. No final
checks failed or were skipped. Physical controller, real Windows play/audio
and GPU measurements remain outstanding; the recorded performance samples
above were not rerun because query algorithms and the supported scenes did
not change.
