# Adding towns: design

Status: proposal, revised 2026-10-28 after a second review. No code yet. Owner decisions are marked **Decided**; everything else is a recommendation to review.

## Goal

Add real towns and cities, beginning with downtown Verona, through a repeatable script driven by a small spec file per town instead of a hand-edited importer. Detail should be configurable, and one town should be able to mix detail levels by area.

**Decided** (owner, 2026-10-28):
- Verona is **real geography throughout**: street network, names and one-way tags from OpenStreetMap, as in Cerea Centro.
- The first Verona area is about **1 km²** around the Arena.
- Towns are **separate districts chosen from the menu for now**, connected by real roads later.
- **Script first, runtime loading later.** Towns are added by a build-time script now. The town file format is designed so a finished town can later be dropped into a folder and loaded by the running game.
- **Every named street is drivable**, including pedestrian streets, as today. The only exception is a passage physically too narrow for the car (see Road width and drivability).
- **One regional coordinate frame** for all towns, adopted now. Cerea is converted to it once.
- **The script suggests landmarks and stops; the owner confirms** them in the spec.

The game rules in `AGENTS.md` apply unchanged: no GPS, minimap, objective arrow or route line, and the atlas marker reflects knowledge only.

## What exists today

Read from `MAPS.md`, `data/README.md`, `docs/TILED_PROTOTYPE.md`, `docs/SCALABILITY.md`, `src/world/schema.ts`, `src/game/Save.ts` and the tools. Nothing was re-measured for this document.

Generic and reusable:
- Named-road filtering, one-way and roundabout tags, OSM node ids kept so real junctions connect and overpasses do not, and the largest connected network kept.
- Building footprints with holes, clipped against road corridors, junction caps and bays (`tools/prepare-cerea.mjs`, using `polygon-clipping`).
- Bay placement beside a landmark's street (`bay_for` in `tools/import-cerea.py`).
- Water and rail lines clipped to the bounds.
- Tile export (`tools/export-tiles.mjs`) and the streaming manifest.
- The `District` context, directed routing, sign and street-plate generation, and the tests for ownership and reachability.

Specific to Cerea and hardcoded:
- Bounds, projection origin (`lat0, lon0`) and the extract path in the importer; `prepare-cerea.mjs` reads and writes `public/maps/cerea.json` directly.
- The seven landmarks chosen by OSM id, the cinema lookup, bay names, nine stops, passenger names, fare pairs and the mission hint text.
- The district list in `src/world/load.ts` (`availableDistricts`) and its special case for the outskirts manifest.

Behaviour that matters for Verona:
- **Which roads are kept:** every named `highway` except private or no-access ways and unnamed service roads. Named footways, steps and pedestrian streets are therefore drivable roads. Cerea has none: its 583 segments are primary, secondary, tertiary, unclassified and residential.
- **Road width:** an OSM `width` clamped to 6–10 m, otherwise 8 m. Every Cerea segment is 8 or 9 m. Clearance then removes the road plus a 1.6 m verge from building footprints; in Cerea that trimmed 137 of 1,081 buildings and removed 5.
- **Water:** polylines only, 3 m wide (the Menago is hardcoded at 7 m). There is no water area.
- **Projection:** a local equirectangular approximation around each town's own origin.
- **Saves:** `mapSignature` (`src/game/Save.ts:13`) hashes the entire district JSON, so any byte change to a town's file makes its existing saves refuse to load.
- **Street plates:** one canvas texture per unique name at a 1024×192 aspect; the tiled-prototype notes estimate up to about 1 MiB each with mipmaps.

Scale reference: Cerea Centro is about 1.0 × 1.1 km, 1,081 building masses, 51 streets, 480 KB of JSON from a 1.9 MB raw extract. All geometry loads at startup. Ten-town performance, memory and loading are unmeasured.

## Coordinate frame

**Decided:** one frame for every town, so towns can be joined later without reprojecting them.

Recommendation: UTM zone 32N (EPSG:32632), which covers both Cerea (11.21° E) and Verona (10.99° E), minus a fixed regional false origin so numbers stay small. North stays negative Z: `x = easting − E0`, `z = −(northing − N0)`. UTM is conformal, so shapes and distances stay correct across the region, which one equirectangular origin would not guarantee over tens of kilometres. The renderer already rebases its origin around the car and is tested 25 km from the origin, so large world coordinates are not a rendering problem. The projection can be implemented with the standard transverse Mercator series in the importer; no external service is needed.

Consequences:
- Cerea's coordinates change once. That is done as its own step after the spec refactor has proved identical output (see Phases), with a data version bump and a clear notice that older Cerea saves no longer load. The outskirts prototype is regenerated from it; Harbor is fictional and stays as it is.
- Stop, bay and landmark ids are prefixed by town (for example `verona:arena`), since names such as `municipio` repeat.

## Spec file

One file per town, for example `towns/verona.town.json`. It holds only choices, never generated geometry.

```
id, name, description, dataVersion
source:    extract path or Overpass query, retrieved date, attribution
area:      bounds (box or polygon) in latitude/longitude; projected with the regional frame
preset:    "sketch" | "town" | "full"
zones:     optional polygons with their own preset
landmarks: confirmed list (OSM id, display name, kind); the script writes suggestions next to it
stops:     confirmed list, or a count and minimum spacing for suggestions
content:   passenger name pool, fare overrides, start position, mission text
```

Everything not given has a default. Cerea's spec records today's hand-picked landmarks, stops and names, so Cerea is the regression anchor.

## Pipeline

Each stage reads and writes plain files, so a stage can be rerun alone and its output reviewed.

1. **Fetch.** An Overpass query is enough at 1–2 km² (Cerea's raw extract is 1.9 MB) and is checked in so rebuilds stay offline. Regional extracts and `osmium` are left until towns of several km².
2. **Normalise.** Project with the regional frame, split ways at shared nodes, keep OSM ids.
3. **Roads.** All named ways (decided), one-way and roundabout tags, largest connected component, boundary stubs. Width from the street gap (next section).
4. **Buildings.** Footprints with holes; the preset sets minimum area, outline simplification and height source (`height`, then `building:levels`, then a default).
5. **Water and open areas.** Water polygons (river banks, `natural=water`) as well as lines; large paved squares as open paved areas rather than buildings or roads.
6. **Landmark and stop suggestions.** Rank candidates from OSM tags (`historic`, `tourism`, `amenity=place_of_worship`, named buildings, wikidata present) and write a suggestion report. Only the confirmed list in the spec becomes landmarks and stops. A missing confirmation fails the build with the report path.
7. **Bays.** Generalised `bay_for`, on a drivable road beside each confirmed stop.
8. **Clearance.** Clip buildings against the fitted road corridors and bays; record trimmed and omitted ids.
9. **Features and named areas.** Rail lines; named areas from OSM place data for atlas labels.
10. **Tiles** when the size requires them, using the existing exporter.
11. **Checks**, then write the district file, provenance, data version and a size report.

Implementation: keep the existing Python importer and make it read the spec. That keeps Cerea's output byte-identical with little risk and keeps saves valid through the refactor. A later port to TypeScript (to share `schema.ts` and `District` directly) is optional; if done, compare geometry within a tolerance and topology exactly, not bytes, because rounding and serialisation differ between the two languages.

## Road width and drivability

A fixed 8 m road in streets 3–5 m wide would cut into the façades of a medieval centre and erase much of what makes it recognisable. Instead:
- **Fit the width to the street.** Measure the gap between façades along each segment (rays from the centreline to the nearest footprint) and use the smaller of the class width and the gap minus a small margin, never below a drivable minimum. Clearance then trims only what genuinely blocks the road.
- **Drivability probe.** Drive every segment and junction with the test autopilot and physics to find passages the car cannot get through or corners it cannot turn.
- **The one exception to "every named street".** A passage narrower than the car's minimum is excluded from the drivable graph, because otherwise directions and fares would route through a street the car cannot enter. Each exclusion is listed in the report for the owner. Named steps and paths through parks are also listed, since they are the most likely to surprise.
- **Report** the share of footprint area removed by clearance, per town and per street, as a recognisability measure.

## Detail presets

| | sketch | town | full |
| --- | --- | --- | --- |
| Roads | major and named residential | all named roads (decided default) | as town |
| Buildings | merged into blocks, small ones dropped | footprints above a minimum area | all footprints, finer outlines |
| Landmarks | few | as confirmed | as confirmed, with kinds |
| Scenery | none | trees, lamps, parked cars (today) | as town plus façade variety |
| Plates | arterials only | every street arm (today) | as town |
| Delivery | single file | single file, tiled over a size budget | tiled |

Thresholds come from the Verona spike's measurements (Phases), not from guesses.

## Detail zones and named areas

- **Detail zones:** spec polygons that override the preset, applied by location. Roads crossing a zone boundary keep the higher detail so the network stays connected.
- **Named areas:** from OSM suburb and neighbourhood data, for atlas labels only. They are labels on the paper atlas, not a live position or a navigation aid.
- **Countryside filler** between towns, from land-use data, only once towns connect.

## Checks

Run the existing assertions over **every town in the registry** instead of writing a separate validator: the unit and desktop tests that today name Cerea or the outskirts iterate the registry. A thin command (`town check <id>`) runs the same functions for one town and prints the reasons. They fail a town on:
- a road graph that is not one connected component, or confirmed stops unreachable in either direction with one-way tags;
- buildings overlapping fitted road corridors or bays;
- sign or street-plate ownership violations;
- a stop without an accessible bay, or a drivability probe failure on a drivable segment;
- a size report over budget (file size, building count, tiles, plate textures and their estimated memory).

Fixed-pose screenshots (`tools/capture-views.mjs`, from PR #22) go with each build for a person to judge. The desktop suite already takes several minutes, so a new town adds one smoke scenario rather than a copy of every scenario.

## Runtime

- A generated registry (for example `public/maps/towns.json`) replaces the `availableDistricts` constant; adding a town needs no code edit.
- **Runtime-ready format (decided: later).** A built town is one folder: registry entry, district file or manifest, tiles, provenance, data version and attribution. Data only, no code, validated on load. Later, the desktop app can load such folders from a player-chosen directory through the same narrow bridge the radio uses; the renderer never gets general file access.
- The briefing's district buttons need a list or picker for many towns, usable from keyboard and controller.
- **Saves:** a deliberate rebuild bumps the town's `dataVersion`; the player is told an older save is for a previous version of that town instead of seeing a generic error. The signature stays a hash of the data, because a changed map can put a saved car inside a building.
- Larger areas still need what the docs already list: bounded street-plate textures with eviction, fewer draw calls, a regional atlas, paged collision and topology, and a weighted gateway router for connected towns. Plate memory is measured for the Verona core, since many more street names may make it matter already at 1 km².

## Phases

1. **Spec, read by the Python importer** (#23). Cerea regenerates byte-identical in its current frame. Then, as a separate commit, convert Cerea to the regional frame with a data version bump.
2. **Verona spike** (#32). Run the parameterised importer once for the Verona core and write a report, not a shipped town: trimmed and removed buildings, named footways and steps, water, squares, plate count and memory, reachability, drivability, file size.
3. **Presets and checks over the registry** (#24), with budgets set from the spike.
4. **Verona core** (#25), with width fitting, the drivability exclusion rule, water polygons, paved squares and confirmed landmarks.
5. **Town registry and selection screen, runtime-ready folder format** (#26).
6. **Licence and provenance check** (#27), alongside 1–4.
7. **Detail zones and named areas** (#28), **larger towns** (#29), **connected towns** (#30), **runtime loading from a folder** (#33).

1 to 6 are the near-term plan, in milestone "0.11 — Towns pipeline".

## Risks and open questions

- **Licence.** OpenStreetMap data is under the ODbL, with attribution and share-alike terms for derived databases. Cerea already ships derived map files with credit in the game. What that requires when the game is distributed beyond the owner needs a deliberate check (#27), not an assumption.
- **Driving every named street.** Pedestrian streets, squares and passages become taxi routes. Width fitting and the drivability rule keep it physically possible; whether it feels right is for playtesting.
- **Cerea saves break once** when Cerea moves to the regional frame.
- **Verona data:** courtyards and multipolygon buildings, accents and long names, the Adige and its bridges, very large landmarks such as the Arena.
- **Landmark choice is editorial**, hence suggest-and-confirm.
- **Game content** (passenger names, request wording, fare balance) is authored, with generated defaults and tuning through playtesting.
- **Repository growth:** each checked-in raw extract adds megabytes; acceptable for a few towns, to be revisited for many.
- **Performance is unproven.** Memory, load time and Windows frame rate for a denser town are unmeasured; the Verona core is measured on the owner's Windows machine before larger areas.

## Deferred

- Loading town folders at runtime (#33), designed for now.
- Traffic, pedestrians crossing roads, terrain elevation: out of scope here, as elsewhere.
