# Adding towns: design

Status: proposal, revised 2026-10-29 after the PR #31 review and the owner's region decisions. No code yet. Owner decisions are marked
**Decided**; everything else is a recommendation to review. Review findings are cited as R1–R15.

## Goal

Add real towns and cities, beginning with downtown Verona, through a repeatable script driven by a
small spec file per town instead of a hand-edited importer. Detail should be configurable, and one
town should be able to mix detail levels by area.

**Decided** (owner, 2026-10-28):
- Verona is **real geography throughout**: street network, names and one-way tags from
  OpenStreetMap, as in Cerea Centro.
- The first Verona area is about **1 km²** around the Arena.
- Towns are **connected in regions** by their real intercity roads, **shortened** so neighbouring
  towns are about **5 minutes** apart; inside its zone every town stays at real scale (owner,
  2026-10-29). A town outside any region is a district chosen from the menu, as today.
- The **first region** is Cerea with Legnago, Bovolone, Sanguinetto, Nogara and Casaleone and the
  villages in between; the first **bigger town is about 3 km²** (owner, 2026-10-29).
- **Script first, runtime loading later.** Towns are added by a build-time script now; the town
  format is designed so a finished town can later be loaded by the running game from a folder.
- **Every named street is drivable**, including pedestrian streets, as today, in every preset. The
  only exception is a passage physically too narrow for the car (see Road width and drivability).
- **One regional coordinate frame** for all real towns, adopted now. Cerea is converted to it once.
  Harbor is fictional and keeps its authored coordinates.
- **The script suggests landmarks and stops; the owner confirms** them in the spec.

The game rules in `AGENTS.md` apply unchanged: no GPS, minimap, objective arrow or route line, and the
atlas marker reflects knowledge only.

## What exists today

Read from `MAPS.md`, `data/README.md`, `docs/TILED_PROTOTYPE.md`, `docs/SCALABILITY.md`,
`src/world/schema.ts`, `src/game/Save.ts` and the tools. Independently checked in the PR #31 review;
`python3 tools/import-cerea.py` reproduces `public/maps/cerea.json` byte for byte today.

Generic and reusable:
- Named-road filtering, one-way and roundabout tags, OSM node ids kept so real junctions connect and
  overpasses do not, and the largest connected network kept.
- Building footprints clipped against road corridors, junction caps and bays
  (`tools/prepare-town.mjs`, formerly `prepare-cerea.mjs`, using `polygon-clipping`). The importer reads only each building way's
  outer ring and has no relation handling, so the holes in `cerea.json` come from clipping only;
  Cerea's extract contains no relations (R8).
- Bay placement beside a landmark's street (`bay_for` in `tools/import-cerea.py`).
- Water and rail lines clipped to the bounds.
- The `District` context, directed routing, sign and street-plate generation, and the tests for
  ownership and reachability.

Specific to Cerea and hardcoded (until #23 step 1, which moved the importer's choices into
`towns/cerea.town.json`, read by `tools/import-town.py`; Cerea still rebuilds byte for byte):
- Bounds, projection origin (`lat0, lon0`) and the extract path in the importer;
  `prepare-cerea.mjs` read and wrote `public/maps/cerea.json` directly.
- Nine landmarks and stops: seven building ways chosen by OSM id plus two cinemas found by node
  lookup; bay names, passenger names, fare pairs and the mission hint text (R15).
- The district list in `src/world/load.ts` (`availableDistricts`) and its outskirts special case.
- The tile exporter `tools/export-tiles.mjs` is the outskirts fixture, not a general tiler: it reads
  `cerea.json`, hardcodes the entry node and absolute coordinates for the fictional link and hamlet,
  and adds their fares and stop (R11, R12).
- `tools/capture-views.mjs` lists the districts and poses it captures (R14).
- Tests import `cerea.json`, `harbor.json` and the outskirts manifest directly (R2).

Behaviour that matters for Verona:
- **Which roads are kept:** every named `highway` except private or no-access ways and unnamed service
  roads. Named footways, steps and pedestrian streets are kept as drivable roads. Cerea has none: its
  583 segments are primary, secondary, tertiary, unclassified and residential.
- **Road width and clearance:** an OSM `width` clamped to 6–10 m, otherwise 8 m (every Cerea segment is
  8 or 9 m). Clearance removes `width / 2 + 1.6 m` on each side of the centreline from building
  footprints (`prepare-town.mjs`, the corridor radius); in Cerea that trimmed 137 footprints, removed 5 and left 1,081
  masses. Validation requires a road wider than 2 m (`src/world/district.ts:24`).
- **The car** is a point with a 1.05 m collision margin (`src/driving/Car.ts:61`): it needs a clear gap
  of 2.1 m and has no body width or turning footprint. There is no reusable driving autopilot; the
  only test driver follows fixed Harbor waypoints (R5).
- **Water:** polylines only, 3 m wide (the Menago is hardcoded at 7 m), and colliders except where
  paved. There are no water areas or paved open areas in the schema (R9).
- **Projection:** a local equirectangular approximation around each town's own origin.
- **Saves:** `mapSignature` (`src/game/Save.ts:13`) hashes `JSON.stringify` of the whole parsed district,
  including taxi names, fares, mission text and provenance, so any content change, including a text or
  fare edit, makes that district's saves refuse to load (formatting alone does not). `SaveData` and the
  schema have no data version, and a refused save gets a generic message (R6).
- **Street plates:** one canvas texture per unique name at a 1024×192 aspect, up to about 1 MiB each with
  mipmaps, kept in a module-level cache that is never disposed (`src/world/builders.ts:168`).

Scale reference: Cerea Centro is about 1.0 × 1.1 km, 1,081 building masses, 51 streets, 480 KB of JSON
from a 1.9 MB raw extract. All geometry loads at startup. Ten-town performance, memory and loading are
unmeasured.

## Coordinate frame

**Decided:** one frame for every real town, so towns can be joined later without reprojecting them.

Recommendation: UTM zone 32N (EPSG:32632), which covers Cerea (11.21° E) and Verona (10.99° E), minus
a fixed regional false origin recorded in each spec's provenance, so numbers stay small. North stays
negative Z: `x = easting − E0`, `z = −(northing − N0)`. UTM is conformal, so shapes and distances stay
correct across the region. The renderer already rebases its origin around the car and is tested 25 km
from the origin.

UTM grid north differs from true north by about 1.4° at Verona and 1.6° at Cerea (R15). The compass
and atlas treat negative Z as north, so rotate the frame by the convergence at the regional origin;
the remaining error is under 0.2° across the region. Record the rotation with the false origin.

Consequences:
- Cerea's coordinates change once, as its own step after the spec refactor has proved identical
  output. The outskirts prototype is regenerated with its fictional link placed relative to the entry
  node and the regional bounds instead of absolute coordinates (R12). **Saves for both Cerea and the
  outskirts stop loading at that point**, with a message that names the map version (see Saves).
- Stop, bay and landmark ids are prefixed by town (for example `verona:arena`).

## Regions and compression

**Decided:** towns keep their real streets at real scale; only the space between them is shortened.

**Mapping.** Work in the regional frame. Let `C` be the region centre, `k` the compression factor
(0 < k ≤ 1), and `c_i` the centre of town zone `i`. The global contraction is `g(p) = C + k (p − C)`.
Inside zone `i` the town only moves, by `T_i = (k − 1)(c_i − C)`, so its streets are unchanged.
Between towns:

```
f(p) = g(p) − Σ_i w_i(p) · (k − 1)(p − c_i)
```

where `w_i` is 1 inside zone `i` and falls to 0 across a transition band around it (a smoothstep on the
distance from the zone boundary). Inside a zone this reduces to `p + T_i`; far from every zone it is
`g(p)`. Town centres keep their exact compass bearings to each other, and the distance between their
zones shrinks by `k`.

**Rules.**
- Corridor roads keep their real nodes, junctions, one-way tags and names; their geometry is mapped by
  `f`, so they shorten by about `k` outside the bands and bend slightly inside them. Village zones are
  rigid like towns but use the `sketch` preset.
- No buildings in transition bands, which distort; the bands get only countryside filler (fields,
  trees), so nothing visibly warps.
- Checks on a grid over the region: `f` has a positive Jacobian everywhere (no folds), no two zones
  overlap after mapping, bands do not overlap each other, and town-to-town bearings are unchanged.
- Fares, the speed bonus and timing use the driven, compressed distance, so pay per minute stays
  consistent. The paper atlas shows the same compressed map; no GPS, route line or live marker.
- **For the owner:** direction boards between towns should show the distance you will actually drive
  (recommended), not the real-world kilometres.
- A compressed region is no longer at true UTM positions outside the zones; the frame, false origin,
  `k`, `C` and the zones are recorded in the region spec and provenance.

**Region spec.** One file per region, for example `regions/lower-verona.region.json`: the town specs and
their zone polygons, village zones, the corridor roads to keep (as OSM way ids or a rule such as "the
main roads connecting these towns"), `k`, `C`, the band width and the countryside filler preset. A
region is delivered tiled, with paged collision (#29), since it is several kilometres across.

## First region: the lower Veronese plain

Measured 2026-10-29 from an Overpass query of places and `trunk`/`primary`/`secondary`/`tertiary` roads
in the box 45.14–45.29 N, 11.03–11.34 E (OSM data timestamp 2026-10-29T09:59:35Z; 2.2 MB; not checked
in). Road distances are shortest paths over those roads between the town place nodes, ignoring one-way
tags; drive times assume 17 m/s, a little under the car's paved top speed of about 20 m/s
(`src/driving/Car.ts`).

| Pair | Straight km | Road km | Drive at 17 m/s | At k = 0.6 |
| --- | ---: | ---: | ---: | ---: |
| Cerea – Casaleone | 2.6 | 3.6 | 3.5 min | about 2 min |
| Casaleone – Sanguinetto | 4.0 | 5.2 | 5.1 min | about 3 min |
| Cerea – Sanguinetto | 4.9 | 5.9 | 5.8 min | about 3.5 min |
| Nogara – Sanguinetto | 7.1 | 7.6 | 7.5 min | about 4.5 min |
| Legnago – Cerea | 7.7 | 8.4 | 8.2 min | about 5 min |
| Cerea – Bovolone | 10.3 | 10.6 | 10.4 min | about 6 min |
| Legnago – Nogara | 19.7 | 22.0 | 21.5 min | about 13 min |

The "at k" column scales the whole road distance and is an upper bound on the saving, since town zones
are not shortened. So the compression this region needs is **mild, about k = 0.6**, not the 1:4 to 1:5 a
generic 20 km example suggests; the nearest pairs are already about 5 minutes apart uncompressed. `k` is
set from measured in-game drive times (#41), with the 5-minute target for typical neighbours.

The box also contains 30 more villages (among them Asparetto, Aselogna, San Pietro di Legnago, Concamarise,
Salizzole, Roverchiara, San Pietro di Morubio, Venera), 85 hamlets and about 527 km of main road. "The
villages in between" therefore means the villages on the chosen corridors, as sketch zones; the rest
stays countryside. The town centres span 19.6 km east–west (Nogara to Legnago) and 9.7 km north–south
(Bovolone to Casaleone); at k = 0.6 that is 11.8 × 5.8 km between centres, roughly 14 × 8 km with the
outer town zones.

Legnago, the largest town and the only one of about 3 km², also lies on the Adige, so it is the first
real test of water polygons and bridges. The Verona core (#25) moves after this region; it is the next
bigger-city test, not the first.

## Spec file

One file per town, for example `towns/verona.town.json`. It holds only choices, never generated
geometry.

```
specVersion
id, name, description, dataVersion
source:    extract path or Overpass query, retrieved date
attribution, sourceUrl
area:      bounds (box or polygon) in latitude/longitude; projected with the regional frame
frame:     false origin and rotation (written by the importer)
stoppingPolicy: "anywhere" | "marked-bays"
preset:    "sketch" | "town" | "full"
zones:     optional polygons with their own preset
landmarks: confirmed list (OSM id, display name, kind)
stops:     confirmed list (stop id, landmark, display name)
content:   passenger name pool, fare overrides, start position, mission text
```

**Stops and landmarks are always a confirmed list** (R13). The script writes its ranked suggestions to a
separate report, never into the build; the owner copies the chosen entries into the spec, and a build
with no confirmed stops fails with the report's path. Cerea's spec records today's choices, so Cerea is
the regression anchor.

## Pipeline

Each stage has its own command and plain intermediate file, so a stage can be rerun alone and its output
reviewed. The pipeline is already mixed: parsing in Python, clearance and checks in Node.

1. **Fetch** (Python). An Overpass query is enough at 1–2 km² and is checked in so rebuilds stay
   offline. Regional extracts and `osmium` wait for towns of several km².
2. **Normalise** (Python). Project with the regional frame, split ways at shared nodes, keep OSM ids.
   Assemble multipolygon building relations into outer and inner rings (R8).
3. **Roads** (Python). Every named way except `access=private|no` and `highway=construction|proposed`
   (R15 missing risks); one-way and roundabout tags; boundary stubs. Named pedestrian ways tagged
   `area=yes` (squares such as Piazza Bra) become paved open areas, not road segments (R7). Named steps
   are kept as flat drivable streets, since there is no elevation; they are listed in the report (R7).
4. **Buildings** (Python). The preset sets minimum area, outline simplification and height source
   (`height`, then `building:levels`, then a default).
5. **Water and open areas** (Python). Water polygons (river banks, `natural=water`) and paved open areas,
   both new schema fields (R9).
6. **Landmark and stop suggestions** (Python). Rank candidates from OSM tags (`historic`, `tourism`,
   `amenity=place_of_worship`, named buildings, wikidata present) into the suggestion report.
7. **Road widths** (Node; see below), then **bays** for confirmed stops.
8. **Clearance** (Node, `prepare`), recording trimmed and omitted ids and the area lost per street.
9. **Features and named areas.** Rail lines; named areas from OSM place data for atlas labels.
10. **Tiles**, only when a town exceeds the single-file size budget. This needs a new general tiler
    (#29); the outskirts exporter is not one (R11).
11. **Checks**, then write the district file, provenance, data version and the report.

Implementation: keep the existing Python importer and make it read the spec, so Cerea's output stays
byte-identical and saves stay valid through the refactor. Port to TypeScript only if a second town or
the first preset change makes the Python code harder to keep correct than a port; compare a port by
geometric tolerance and identical topology, not bytes.

## Road width and drivability

A fixed 8 m road in streets 3–5 m wide would cut into the façades of a medieval centre. Fitting has to
account for the verge that clearance also removes (R1):

- **Gap.** Sample the centreline every 2 m and cast rays to the nearest footprint on each side; the
  segment's gap is the 10th percentile of the samples (the minimum is reported too), so a doorway recess
  does not widen the street. A side with no footprint within the class half-width plus the verge counts
  as open and uses the class half-width.
- **Width and verge.** A façade is untouched when `width + 2 × verge ≤ gap`. The verge shrinks from
  1.6 m to a floor of 0.3 m on narrow streets before the road narrows; the road narrows from its class
  width to a floor of 2.2 m (above validation's 2 m and the car's 2.1 m clear gap). So a street with a
  gap of at least 2.8 m keeps its façades intact.
- **Below 2.8 m.** Either clearance trims the façades and the report gives the area lost for that
  street, or the segment is marked not drivable (next point). The report lists every such street with
  both options; the owner decides per town, with "trim and report" as the default.
- **Not drivable, still a street.** A passage narrower than the car's 2.1 m gap is the decided exception
  to "every named street". It stays in the world, the atlas, plates and signs, but gets `drivable: false`
  on its `Road` (a schema change, R4), which keeps it out of routing, fares, directions and
  `isPaved`. If an exclusion splits the drivable network, the build fails and the report names the
  pocket; the owner confirms dropping its stops or widening the street.
- **Drivability check.** A geometric check, not a driving bot (R5): every drivable centreline and the
  arc through every junction must keep the car's 1.05 m margin clear of colliders, the same rule the car
  uses.
- **Bays on narrow streets.** `bay_for` tries 6–14 m squares 9–16 m from the centreline and fails when
  none fits. Fitted narrow streets need smaller bays, a bay on the nearest wider street, or the
  `anywhere` stopping policy Cerea already uses (R5).

## Detail presets

**Every preset keeps every named street drivable** (decided). Presets change buildings, scenery and
plate density only (R7).

| | sketch | town | full |
| --- | --- | --- | --- |
| Roads | all named roads | all named roads | as town |
| Buildings | merged into blocks, small ones dropped | footprints above a minimum area | all footprints, finer outlines |
| Landmarks | as confirmed | as confirmed | as confirmed, with kinds |
| Scenery | none | trees, lamps, parked cars (today) | as town plus façade variety |
| Plates | major roads only | every street arm (today) | as town |
| Delivery | single file | single file, tiled over a size budget | tiled |

Thresholds come from the Verona spike's measurements of the fitted road model (Phases), not from
guesses.

## Detail zones and named areas

- **Detail zones:** spec polygons that override the preset, applied by location.
- **Named areas:** from OSM suburb and neighbourhood data, for atlas labels only. They are labels on the
  paper atlas, not a live position or a navigation aid.
- **Countryside filler** between towns, from land-use data, only once towns connect.

## Schema and save changes

No phase owned these, so they belong to #23 step 2, the one step that already breaks Cerea and outskirts
saves (R6, R9):
- `dataVersion` on the district and in `SaveData`. A refused save names its version; a save from before
  data versions says it belongs to an earlier version of that map.
- The map signature hashes only what makes a save unsafe to restore (nodes, roads, buildings, bays,
  stops and their ids), not names, fares, mission text or provenance. A text or fare change then keeps
  saves loading; a geometry change still refuses them, since it could put a saved car inside a building.
- `drivable` on `Road`, water polygons with bridge carriageways exempt from water collision, and paved
  open areas with paving and collision semantics. They are added to validation, rendering, `isPaved`,
  the route graph and the tests together; real towns use them from #25.

## Checks

The existing unit and desktop assertions that name Cerea or the outskirts iterate the **registry**
(#26) instead (R2). Registry entries declare capabilities: `frame` (regional or authored), `taxi`,
`provenance`, `spec`. Spec checks run only on spec-built towns; Harbor and other authored districts get
the generic district checks only (R10). A thin `town check <id>` runs the same functions for one town.

They fail a town on:
- a drivable network that is not one connected component, or confirmed stops unreachable in either
  direction with one-way tags;
- buildings overlapping fitted road corridors or bays;
- sign or street-plate ownership violations;
- a stop without an accessible bay, or a drivability check failure on a drivable segment;
- unconfirmed stops or landmarks;
- a size report over budget (file size, building count, tiles, plate textures and their estimated
  memory).

Fixed-pose screenshots go with each build; `tools/capture-views.mjs` reads its districts and poses from
the registry and the spec instead of its own list (R14). The desktop suite already takes several
minutes, so a new town adds one smoke scenario rather than a copy of every scenario.

## Runtime

- The registry (for example `public/maps/towns.json`) replaces the `availableDistricts` constant and the
  outskirts special case; adding a town needs no code edit. It comes before presets and the Verona core
  so they can use it (R2).
- The briefing's district buttons need a list or picker for many towns, usable from keyboard and
  controller.
- **Runtime-ready format (decided: later).** A built town is one folder: registry entry, district file or
  manifest, tiles, provenance, data version and attribution. Data only, validated on load. Loading such
  folders from a player-chosen directory (#33) uses the same narrow desktop bridge as the radio. Switching
  towns without a full reload then also needs the street-plate cache to be disposed per town.
- Larger areas still need what the docs already list: bounded street-plate textures with eviction,
  fewer draw calls, a regional atlas, paged collision and topology, and a weighted gateway router for
  connected towns. Plate memory is measured in the Verona spike, since many street names may matter at
  1 km² already.

## Phases

1. **Spec read by the Python importer** (#23 step 1). Cerea regenerates byte-identical in its current
   frame.
2. **Registry, loader and selector** (#26), with capability flags, the tests iterating it, and the
   capture tool reading it. The folder format for runtime loading moves to #33.
3. **Regional frame, schema and save changes** (#23 step 2): Cerea and the outskirts move to the frame,
   ids are prefixed, `dataVersion` and the narrower signature arrive, and the new road, water and paved
   area fields are added. Cerea and outskirts saves break once here.
4. **Region spike** (#32, retargeted from Verona to the first region): Legnago at about 3 km² and one
   small town, each with fixed and fitted widths (trimmed and removed buildings, streets below 2.8 m and
   2.1 m, named footways, steps and squares, the Adige and bridges, multipolygon buildings, plate count
   and memory, reachability, bays, file size), plus the corridors mapped with `k` = 0.6 (drive lengths,
   fold and overlap checks, tile count).
5. **Presets and checks over the registry** (#24), with budgets from the spike.
6. **Licence and provenance decision** (#27), a gate before the first new town ships.
7. **Compression mapping** (#40), **general tiler and paged collision** (#29), and gateway routing for
   connected towns (#30).
8. **First region** (#41): Cerea, Legnago, Bovolone, Sanguinetto, Nogara, Casaleone and the villages on
   their corridors.
9. **Later:** the Verona core (#25), detail zones and named areas (#28), runtime loading from a folder
   (#33).

1 to 8 are the near-term plan, in milestone "0.11 — Towns pipeline".

## Risks and open questions

- **Licence.** OpenStreetMap data is under the ODbL, with attribution and share-alike terms for derived
  databases. What that requires when the game is distributed beyond the owner needs a deliberate check
  (#27) before a new town ships.
- **Driving every named street.** Pedestrian streets and flat steps become taxi routes, and narrow streets
  may be trimmed. Width fitting and the drivable rule keep it possible; whether it feels right is for
  playtesting.
- **Saves break once** for Cerea and the outskirts at phase 3.
- **Verona data:** courtyards and multipolygon buildings, accents and long names, the Adige and its
  bridges, very large landmarks such as the Arena, restricted-traffic tagging.
- **Landmark choice is editorial**, hence suggest-and-confirm.
- **Game content** (passenger names, request wording, fare balance) is authored, with generated
  defaults and tuning through playtesting.
- **Repository growth:** each checked-in raw extract adds megabytes; acceptable for a few towns.
- **Performance is unproven.** Memory, load time and Windows frame rate for a denser town are unmeasured;
  the Verona core is measured on the owner's Windows machine before larger areas.

## Deferred

- Loading town folders at runtime (#33), designed for now.
- Traffic, pedestrians crossing roads, terrain elevation: out of scope here, as elsewhere.
