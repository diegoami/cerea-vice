# Adding towns: design

Status: proposal, 2026-10-28. No code yet. Decisions taken by the owner are marked **Decided**; everything else is a recommendation to review.

## Goal

Add real towns and cities, beginning with downtown Verona, through a repeatable script driven by a small spec file per town, instead of a hand-edited importer. Detail should be configurable, and one town should be able to mix detail levels by area.

**Decided** (owner, 2026-10-28):
- Verona is **real geography throughout**: street network, names and one-way tags from OpenStreetMap, as in Cerea Centro.
- The first Verona area is about **1 km²** around the Arena, similar in size to Cerea Centro.
- Towns are **separate districts chosen from the menu**. The design must allow real connecting roads later, but they are not built now.
- Towns are added by a **build-time script**. Loading town packs from a player folder is deferred.

The game rules in `AGENTS.md` apply unchanged: no GPS, minimap, objective arrow or route line, and the atlas marker reflects knowledge only.

## What exists today

Read from `MAPS.md`, `data/README.md`, `docs/TILED_PROTOTYPE.md`, `docs/SCALABILITY.md` and the tools. Nothing here was re-measured for this document.

Generic and reusable:
- Projection to local metres (north is negative Z), named-road filtering, one-way tags, node ids kept from OSM so real junctions connect and overpasses do not, and keeping the largest connected network.
- Building footprints, including holes, clipped against road corridors, junction caps and bays (`tools/prepare-cerea.mjs`, using `polygon-clipping`).
- Bay placement beside a landmark's street (`bay_for` in the importer).
- Water and rail lines clipped to the bounds.
- Tile export (`tools/export-tiles.mjs`): 250 m render payloads and a manifest with logical geometry.
- The `District` context, directed routing, sign and street-plate generation, and the tests for ownership and reachability.
- The district schema (`src/world/schema.ts`), including an `areas` list and optional `streaming` manifest.

Specific to Cerea and hardcoded:
- Bounds, projection origin and the source extract path in `tools/import-cerea.py`.
- The seven landmarks chosen by OSM id, the cinema lookup, bay names, nine stops, passenger names and fare pairs.
- `tools/prepare-cerea.mjs` reads and writes `public/maps/cerea.json` directly.
- `src/world/load.ts` lists districts in a constant (`availableDistricts`) and special-cases the outskirts manifest path.
- The importer is stdlib Python calling Node tools through `tsx`.

Scale reference: Cerea Centro is about 1.0 × 1.1 km, 1,081 building masses, 51 streets, 480 KB of JSON (raw extract 1.9 MB). All geometry loads at startup. The tiled prototype adds streaming for the fictional outskirts but still keeps the full logical geometry in its manifest. The docs state that ten-town performance, memory and loading are unmeasured.

## Spec file

One file per town, for example `towns/verona.town.json`. It holds only choices, never generated geometry.

```
id, name, description
source:   extract (path or Overpass query), retrieved date, attribution text
area:     centre lat/lon, bounds (box or polygon) -> projection origin
preset:   "sketch" | "town" | "full"    (see Detail presets)
zones:    optional polygons with their own preset (see Detail zones)
landmarks: optional overrides: include/exclude by OSM id or name, display names, kinds
stops:    optional: count, minimum spacing, explicit stops
content:  passenger name pool, fare tuning overrides, start position
```

Everything not given has a default. Cerea gets a spec that reproduces today's hand-picked landmarks, so Cerea doubles as the regression anchor.

## Pipeline

Each stage reads and writes plain files, so a stage can be rerun alone and its output reviewed in git.

1. **Fetch.** Regional OSM extract cut to the area (for example from a Geofabrik Veneto extract) or an Overpass query. A checked-in extract keeps rebuilds offline and reproducible, as for Cerea. Record the source timestamp.
2. **Normalise.** Project to metres; split ways at shared nodes; keep OSM ids.
3. **Roads.** Keep classes allowed by the preset; apply one-way and roundabout tags; keep the largest connected component; mark boundary stubs.
4. **Buildings.** Footprints with holes. The preset decides minimum area, outline simplification and height source (`height`, then `building:levels`, then a default).
5. **Landmarks.** Rank candidates from OSM tags (`historic`, `tourism`, `amenity=place_of_worship`, `building` with a name, wikidata present) and take the top N, applying the spec overrides. Associate each with a building mass as the importer does today.
6. **Bays and stops.** Generalise `bay_for`; choose stops that are spread out and reachable.
7. **Clearance.** Clip buildings against road corridors and bays (`prepare`), recording trimmed and omitted ids.
8. **Features and areas.** Water and rail lines; named areas from OSM place data for atlas labels.
9. **Tiles** (only when the preset or size needs them): the existing exporter.
10. **Validate** with a "town doctor" command, then write the district file, provenance and a size report.

A single command ties it together, for example `npm run town -- build verona`, with `--stage` to run one stage.

Recommended implementation language: TypeScript under `tools/towns/`. It can import `schema.ts` and `District` directly, as `export-tiles.mjs` already does, which keeps validation identical to the game's. The existing Python importer stays until the Cerea spec reproduces its output, then is retired. This is a recommendation; keeping Python for the parsing stages is a workable alternative.

## Detail presets

| | sketch | town | full |
| --- | --- | --- | --- |
| Roads | primary to tertiary and named residential | all named roads (Cerea today) | also unnamed service roads, pedestrian ways as non-driveable scenery |
| Buildings | merged into blocks, small ones dropped | all footprints above a minimum area | all footprints, finer outline tolerance |
| Landmarks | few, large | 7 to 12 | many, with kinds |
| Scenery | none | trees, lamps, parked cars (today) | as town plus extra façade variety |
| Plates | arterials only | every street arm (today) | as town |
| Delivery | single file | single file, tiled if over a size budget | tiled |

The threshold numbers (minimum area, tolerance, size budget) are to be set from measurements on Verona, not guessed here.

## Detail zones and named areas

- **Detail zones** are polygons in the spec that override the preset, for example `full` inside the historic core and `sketch` at the edge. The pipeline applies the zone preset per feature by location; roads that cross a boundary keep the higher detail so the network stays connected.
- **Named areas** (the schema's existing `areas` list) come from OSM suburb and neighbourhood data. They are used for atlas labels and could later drive fare zones. They carry no navigation aid: an area is a label on the paper atlas, not a live position.
- **Countryside filler** between towns is generated from land-use data. It is only needed once towns connect.

## Validation: "town doctor"

Fails the build, and prints the reason, on:
- A road graph that is not one connected component, or stops that are unreachable in either direction once one-way tags apply. Verona's restricted-traffic and pedestrian zones make this a real risk.
- Buildings overlapping road corridors or bays after clearance.
- Street-plate or sign ownership violations (reusing the existing checks).
- A stop without an accessible bay.
- A size report over budget: file size, building count, tile count, estimated texture count.

It also writes comparable screenshots from fixed poses (reusing `tools/capture-views.mjs`) so a person can judge the result.

## Runtime changes

- Replace the `availableDistricts` constant with a generated registry (for example `public/maps/towns.json`), so adding a town needs no code edit.
- The briefing's district switch is built for three buttons. It needs a list or picker for many towns, usable from keyboard and controller.
- Selection, saves and the version/map signature already handle one district at a time and should work unchanged. Save compatibility must be checked per town.
- Larger areas need work the docs already list: bounded street-plate textures with eviction, fewer draw calls, a regional atlas, paged collision and topology, and a weighted gateway router for connected towns. None of that is needed for a 1 km² Verona core.

## Phases

1. **Spec and Cerea regeneration** (#23). Move Cerea's hardcoded choices into a spec and regenerate the district. The output should match today's file, or differ only where the difference is understood and approved.
2. **Presets and town doctor** (#24). Presets, validation, size and budget report, screenshots.
3. **Verona core, about 1 km²** (#25). First real new town. Expect surprises: courtyards, restricted zones, many landmarks, accents and long names.
4. **Town registry and selection screen** (#26). Data-driven list for many towns.
5. **Detail zones and named areas** (#28).
6. **Larger towns** (#29). Tiled loading, regional atlas, paged collision and topology, plate atlas.
7. **Connected towns** (#30). Weighted gateway routing and corridor roads; the spec's `area` and `source` fields already allow adjacent towns to share boundary nodes.
8. **Licence and provenance check** (#27; can run alongside 1): per-town attribution and the obligations of redistributing OSM-derived map data.

Phases 1 to 4 and 8 are the near-term plan. 5 to 7 follow once a real town has been played.

## Risks and open questions

- **Data licence.** OpenStreetMap data is under the ODbL, which includes attribution and share-alike terms for derived databases. Cerea already ships derived map files with credit in the game. Whether and how that applies when the game is distributed beyond the owner needs a deliberate check, not an assumption.
- **Source size and API etiquette.** A larger area fetched from Overpass can be refused or slow. A regional extract avoids that but is a large download; only the cut result is checked in.
- **Clearance cost.** `prepare` tests every building against road pieces with a bounding-box filter. That is likely fine at 1 km² and may need a spatial grid at several; not measured.
- **Verona specifics.** Many pedestrian and restricted-access streets; courtyards and multipolygon buildings; names with accents; the Adige river and bridges (bridges are already a road attribute).
- **Landmark choice is editorial.** Automatic ranking will pick some surprising places. The override list is part of the design for that reason.
- **Game content.** Passenger names, request wording and fare balance are authored, not extracted. Defaults are generated; tuning stays with playtesting, as for hamlet fares.
- **Performance is unproven.** Memory, load time and Windows frame rate with a denser town are unmeasured. The Verona core must be measured on the owner's Windows machine before larger areas are attempted.

## Deferred

- Town packs loaded from a player-chosen folder. If wanted later they would be data only, validated on load, and reach the renderer through the desktop bridge the radio uses, never as arbitrary file access.
- Traffic, pedestrians crossing roads, terrain elevation: out of scope here, as elsewhere.
