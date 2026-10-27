# Tiled outskirts feasibility prototype — work package C

This report records the earlier implementation and measurements. The later
[playtest follow-up](PLAYTEST_IMPROVEMENTS.md) supersedes its typography, static
passenger, fixed dispatch, fare and temporary-player-profile descriptions.


B was accepted and merged through PR #4 at
`ebd93fc93217f0f40654a0e1acc259a65d4819b8`. This is a separate opt-in C
experiment, still using Three.js. Cerea Centro and Harbor remain their existing
games; their map files are unchanged.

## What the prototype contains

Select **Cerea outskirts prototype** in the briefing. It copies the modern
Cerea street topology and prepared building footprints, then adds a fictional
Test Link north from the cropped Via Oberdan endpoint to a fictional Test Hamlet.
The roughly 1.25 km country link, 16 hamlet houses, Test Lane/Orchard Row and
terminal bay are original test content, **not real surrounding geography**.
The briefing, atlas edition, street/town signs and provenance label this clearly.
Real-city road ends say that mapped data ends, rather than inventing actual
road closures. The default real Cerea map is not extended or overwritten.

The prototype starts with a traveller at Municipio wanting Test Hamlet, then
a return customer wanting Municipio, followed by the existing city fares.
There are ten stops. The existing 07:00–17:00 clock, fare formula, speed bonus,
deliberate boarding/dropoff and stopped information rules are unchanged. New
scenery and waiting figures are permanent; nothing appears only at a goal.

Run from WSL with the Windows client:

```sh
npm run desktop:win -- cerea-outskirts
```

Or choose the prototype in the briefing of a browser/native desktop build.
For a browser, `#district=cerea-outskirts` selects it. LT is brake only, B/R
changes gear while stopped, View/F asks for information and Y/T opens the atlas.
There are no new driving inputs. Sharp is still available for small signs.

## Offline export and provenance

```sh
npm ci
python3 tools/import-cerea.py --tiles-only  # use the checked-in prepared Cerea map
python3 tools/import-cerea.py --tiles       # rebuild Cerea from its extract, then tiles
```

`tools/export-tiles.mjs` emits `public/maps/cerea-outskirts/manifest.json` and
55 tile payloads under `tiles/`. Files are reproducible byte-for-byte. Tiles
are 250×250 m, with one owner for each road segment, building, feature piece,
bay, landmark, plate, board and prop. Longer source feature lines are split
into collinear pieces; road connections, one-way tags and source coordinates
stay intact. Owner tiles keep whole objects rather than clipping roofs/roads
at seams. A conservative asset reach is included in the loading halo.

Each tile carries the source OSM timestamp, ODbL attribution/provenance and an
explicit synthetic-content note. The manifest also retains source IDs, origin,
source bounding box and a synthetic-extension note. No network is needed to
export or run. OSM-derived content retains its existing ODbL provenance; no
new licensing decision is made for original authored game content. See
`data/README.md` for the source/licence links and distinctions.

## What loads and unloads

The manifest keeps logical roads, footprints/collisions, places and atlas data
resident. **Rendering** payloads are fetched locally around the car, constructed
as tile-relative meshes, merged by material and removed/disposed when distant.
This is render streaming, not full topology/collision paging. Keeping collision
geometry resident avoids driving through a temporarily absent building or river.

Two loads run concurrently, nearest first. The loading radius is 465 m, retention
radius 615 m and radial fog ends at 300 m. The larger halo includes asset reach
and the mirrored views. Cached tiles beyond the visible range are hidden; a
wider retention range avoids repeatedly rebuilding a boundary tile. Payload
identity/local paths and asset owners are checked. IDs are canonical grid
coordinates, bounds must match ID×250, and the current prototype requires a
complete rectangular tile grid; aliases, overlaps and missing cells are rejected. A late completion outside
the current halo or after disposal never installs a stale mesh.

If the visible neighbourhood is not ready, car physics and mission time freeze
with a generic loading notice. Transient local reads retry automatically after
0.5 s, then 1/2/4 s with an 8 s backoff cap while the tile remains wanted.
Requests bypass the response cache so a retry rechecks the local asset. A
10-second browser-time abort signal covers the request and response body; a
stalled read enters the same backoff instead of holding a load slot forever. The
gate stays closed until recovery; persistent failures suggest restarting the
application. Recovery never resumes a paused drive or changes atlas knowledge.
No tile coordinates or location information are displayed.
Pause/atlas still freeze simulation time, and asset completion never moves an
atlas marker. Keyboard and standard controller use the same existing game paths.

The view origin rebases as in B, but each tile subtracts its own anchor before
Float32 geometry allocation. Resident tile groups, cockpit, camera and mirrors
share the current local frame. Collision/route/atlas coordinates remain logical
world coordinates. Street plates retain the globally planned ownership/angles;
landmark plaques use their street frontages, not arbitrary tile edges.

Radial fog is applied with per-world material clones; the shared legacy material
and plate caches are not mutated. Disposing a tile releases its geometries and
owned sign materials/textures. Facade surfaces and pooled material clones live
for the streaming world and are disposed with it. Shared plate textures remain
cached intentionally — an important limit for many towns, below.

## Layered navigation

The coarse graph has three regions (Cerea, country link, test hamlet) and two
shared portals. It is deliberately a tree with unique region connections;
validation rejects disconnected/non-tree coarse data. Detailed region graphs
are built lazily, with at most two retained. Stopped directions search the
current region up to the next portal, rather than searching distant streets.
A zero-length local leg at a portal retains its zero comparison cost even if
the displayed instruction continues into the next region; a regression covers
the hamlet return direction that originally selected the wrong road endpoint.

Fare accounting concatenates the detailed legs and sums the complete path's
edge distances in order. Tests compare every directed city/hamlet stop pair
against the full graph: same paths and exact costs. No coarse distance estimate
is used to price a ride. Instructions still name streets, compass directions,
junctions and permanent signs. No route line, goal arrow, live street label or
automatic atlas tracking is added.

This is not a general optimal portal router for arbitrary cyclic networks.
Ten connected towns with multiple gateways will need a weighted portal graph
and precomputed intra-region gateway costs, rather than this unique-path tree.
The logical fine-road arrays still reside in the manifest even when detailed
search graphs/visual tiles are absent.

## Reproducing the measurements

Run profiles **serially**, after the build/tests finish:

```sh
npm run build
xvfb-run -a sh -c 'xfwm4 --compositor=off >/tmp/cerea-tile-lab-wm.log 2>&1 & node desktop/profile-tiles.mjs'
node --expose-gc --import tsx tools/profile-tile-model.mjs
xvfb-run -a sh -c 'xfwm4 --compositor=off >/tmp/cerea-profile-wm.log 2>&1 & CEREA_DISTRICT=cerea-outskirts node desktop/profile.mjs C-game-city'
```

The tile lab is an explicit diagnostic entry (`electron . --district=cerea-outskirts
--tile-lab`, browser `?tile-lab=1#district=cerea-outskirts`). It is a **scripted
station-jump tour, not a physical drive**. It visits city spawn, the city exit,
country, hamlet and city again, waiting for tile loads to finish, discarding
12 frames and sampling 40 frame intervals per station. Geometry/texture counts,
scene geometry-buffer bytes, reported JS heap and load/unload totals are saved.
Tile wait times start after world/renderer setup; they are not complete app
launch times. Fetch/build totals are aggregate durations, not elapsed wall time.
Normal gameplay has no lab globals or controls.

The metadata-only Node test separately times JSON decode and context construction
and measures additional retained heap after explicit GC for one versus ten
independent copies of the same logical dataset. It includes no rendered meshes,
GPU memory, combined inter-town graph or ten distinct real towns. It must not
be read as a ten-town rendering benchmark or whole-process memory measurement.

The normal-game profiler waits for the car to settle, asks once while stopped,
boards a passenger, warms 30 frames and samples 120 delivered frame intervals.
These Linux SwiftShader results do not predict a physical Windows GPU.

## What must change before ten towns

Three.js can construct, cull and release these streamed meshes; there is no
measured basis here for changing engines. There is also **no proof of a Windows
60 fps budget or ten-town performance**. The next decisions are architectural:

- Pack street/sign text into bounded atlases and add explicit shared-texture
  ownership/eviction. The existing 1024×192 RGBA street plates can approach
  1 MiB each with mipmaps (format/driver dependent); hundreds of unique names
  could consume hundreds of MiB. Shared caches remain after a tile unload.
- Reduce per-tile draw calls/build stalls with material atlases, instancing,
  background preparation and a measured loading budget. Tiling does not by
  itself make a dense city render faster.
- Page distant collision/fine topology as needed, make the paper atlas regional
  without live tracking, and add weighted gateway routing for multiple links.
  The current complete logical manifest and atlas scale with all supplied data.
- Import actual adjacent towns and real connecting roads with their provenance;
  the fictional test link is not production geography. Measure real Windows
  GPU, physical controllers, full-route frames, memory and loading before
  expanding scope or making an engine decision.

There is no save system, traffic simulation, terrain elevation, GPS or new mission
engine. C remains a feasibility prototype, with original Cerea/Harbor and their
rules preserved. Windows launch/gameplay, physical controllers and audio listening
remain manual checks for this PR. Existing screen-space sky and non-colliding
props remain accepted visual limits. Generated screenshots/profiles stay ignored.

## Recorded measurements (2026-10-26)

Node 24.21.0; Electron 45 / Chromium 156; Linux Xvfb/xfwm4; ANGLE Vulkan
SwiftShader software GPU; 1280×900 viewport and 768×540 internal rendering.
Runs were serial, after tests/builds. These are feasibility samples rather
than statistical or hardware-GPU performance claims.

| Scripted station | Tile wait s | Median / p95 frame ms | Resident tiles | Uploaded geometries / textures | Scene geometry buffers MiB | Mean draw calls |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| City start | 2.06 | 133.3 / 150.0 | 18 | 443 / 86 | 10.15 | 607 |
| City exit | 0.89 | 66.6 / 83.4 | 21 | 412 / 93 | 9.07 | 353 |
| Countryside | 0.21 | 33.4 / 50.0 | 21 | 132 / 58 | 0.35 | 117 |
| Test hamlet | 0.14 | 50.0 / 66.6 | 19 | 142 / 63 | 0.37 | 117 |
| City return | 1.09 | 133.3 / 150.0 | 18 | 443 / 94 | 10.15 | 607 |

Draw calls include the cockpit and mirror passes. Geometry-buffer bytes count
all unique scene geometry attributes/indices, including the inactive Simple
layer; uploaded geometry counts are the renderer's separate GPU-object count.
The tour performed 69 loads and 51 unloads. Sampled resident counts stayed
between 18 and 21; this is a snapshot range, not a continuous heap trace.
Cumulative fetch wait was 5.21 s and tile construction 1.77 s; requests overlap,
so these are not elapsed wall time. City geometry buffers returned to exactly
the initial 10,639,660 bytes and uploaded geometry count after returning.

Reported JS heap varied from 29.1 to 71.7 MiB without forced browser GC.
It is not whole-process/GPU memory and does not prove immediate heap release.
After explicit world disposal, resident tiles were zero, uploaded geometries
39 and textures 48: the cockpit and shared cached street textures remain.
That residual cache is deliberately reported, not described as complete memory
unloading. The tour covers one outward/return cycle, not a leak endurance test.

The **normal playable prototype** at city spawn, with HUD, retro pass, passenger
and ordinary input loop, measured 116.7 ms median / 150.0 ms p95 across 120 frames.
The CPU diagnostics included startup: physics 0.017 ms mean, nearest road
0.300 ms (one request), route search 1.900 ms (three calls), render submission
12.757 ms mean / 1104 ms maximum. These small query samples and the cold render
maximum are not steady GPU timings. Earlier B samples were roughly 83–100 ms;
C makes **no city-rendering speedup claim**. The lab's 607 city draw calls and
main-thread tile construction identify work to do before scaling dense content.

The metadata file is 528,580 bytes and all 55 tile payloads together
492,690 bytes. Node JSON decode took 4.83 ms; the first cloned context plus
one route search 29.89 ms, subsequent contexts 17.02 ms mean. After explicit GC,
additional retained heap for one context was 2.31 MiB and ten independent copies
21.58 MiB, above the parsed-source/module baseline. Copies share the
same content/string values; ten distinct real towns and a connected combined
world were not measured. No rendering or GPU allocations are included in that
sizing result.

**Decision:** keep Three.js for the next experiment. Streamed geometry can be
removed and rebuilt with bounded nearby residency, while metadata costs are
modest in this small test. This does not demonstrate a production ten-town
world. Dense-city batching/build stalls, shared texture lifetime, atlas/topology
paging and real Windows GPU measurements are the next constraints; changing
engines is not supported by these measurements alone.

Evidence is ignored in `test-results/C-tile-lab.json`, `C-model-memory.json`,
`C-game-city.json` and refreshed city/hamlet/lab screenshots. Re-run the tools
in an independent checkout to regenerate it.

## Final validation

`npm ci` passed on Node 24.21.0 (0 vulnerabilities), all **74 unit tests** passed,
and `npm run build` type-checks source/tests and builds successfully (existing
>500 kB advisory, ~643 kB main JS plus a lazy ~3 kB lab chunk). All **seven**
required Xvfb/xfwm4 Electron scenarios passed together (~163 seconds), including
blocked tile loading/time freeze, controller View/Y/A and manual/confirmed atlas
knowledge, city/hamlet offline assets, correct return-direction wording and
marker persistence after driving. The six prior scenarios still pass.

Two tile exports were byte-identical for all 56 JSON files. Original Cerea and
Harbor map files are unchanged. Diff checks pass and generated runtime/build
artifacts remain ignored. During development, type errors in new fixtures were
corrected and screenshot inspection exposed the portal endpoint hint bug; it
was fixed and covered before final checks. No final automated checks failed
or were skipped. Physical controller, real Windows launch/gameplay/audio and
Windows GPU measurements remain outstanding/manual. No independent reviewer
was started or selected; this C prototype requires its own review and is not
merged.

## PR #5 review follow-up validation

The first independent review covered `5077517cef214896963b368a6962ee11ec978034`
and requested transient-load recovery (S1), with a minor grid-validation gap
(M1). Both are addressed: automatic backoff/fresh reads preserve the session,
and canonical IDs/matching bounds/full rectangle coverage reject malformed
manifests. See `review-follow-up.md` for reproduction and dispositions.

`npm ci` passed (0 vulnerabilities); **77 unit tests**, source/test type-check
and build, and **all eight** required Xvfb/xfwm4 Electron scenarios pass together
(~161 seconds). The new case aborts the first local tile request, confirms a
retry while paused with frozen time/speed, restores the file response, checks
that pause is retained, then resumes with the standard controller. Existing
scene, atlas/marker, gear, offline and prototype tests remain passing.

A serial lab repeat checks the new no-store local-read policy. Original evidence
is preserved, and follow-up JSON/PNG is in ignored
`test-results/C-retry-tile-lab.*`:

| Scripted station | Tile wait s | Median / p95 frame ms |
| --- | ---: | ---: |
| City start | 1.96 | 100.0 / 133.3 |
| City exit | 0.69 | 33.4 / 83.3 |
| Country | 0.15 | 33.3 / 50.0 |
| Hamlet | 0.07 | 33.4 / 50.0 |
| City return | 0.94 | 100.0 / 116.7 |

It again performs 69 loads / 51 unloads, returns to exactly
10,639,660 city geometry-buffer bytes / 443 geometries, and disposes
back to 0 resident tiles / 39 cockpit geometries / 48 retained textures.
Frame/load differences are software-GPU/run variance, not a measured retry-policy
speedup. No scene, route, collision or fare algorithms changed during follow-up.
No final checks failed or were skipped. An actual end-to-end drive of the link,
physical controller, Windows play/audio and Windows GPU measurements remain
outstanding; the lab remains scripted jumps. The fix requires a fresh independent
review of its exact head; no reviewer is started/chosen and C remains unmerged.

The re-review at `7c03eaeaac4455a7dbb7c8121e1757aec057f6e0` verified S1/M1
fixed and found no blocking items. Its remaining minor notes are also addressed:
graphics/startup failures now say “restart the application”, and a 10-second
request/body deadline sends never-settling reads into the existing backoff.
Final cleanup validation is 77 unit tests, source/test build and all nine
required Electron scenarios passing (~172 s), including an indefinitely held
first request that times out and recovers without clock or marker changes.
No performance sample or Windows/manual check is newly claimed by that cleanup.
C remains unmerged and the updated head requires an independent recheck.
