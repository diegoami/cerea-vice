# Loadable districts

Cerea Vice now loads a selected district from a bundled JSON file. Cerea Centro is the default; Harbor District remains available from the briefing. Select with the map buttons or LB / RB (Q / E on keyboard) before starting. Selection is remembered locally and also recorded in the URL hash. The WSL playtest launcher uses a temporary app bundle and a durable Windows profile for saves and settings. Loading another district restarts the drive.

## Cerea Centro pilot

The approximately 1,020 × 1,080 metre modern subset includes 51 named streets, the Sommariva roundabout, Via Paride, Viale della Vittoria, Via Roma, Via Venticinque Aprile, the Menago and railway lines. It now reaches the post office and Oratorio dello Spasimo area to the south/east, with Teatro del Gusto and additional street connections to the north/west. There are 1,081 retained building masses; 137 source footprints are trimmed and five removed to keep road, sidewalk and stopping areas clear.

The default game is a [07:00–17:00 taxi shift](TAXI.md) with nine pickup/dropoff locations and ten passenger names used by randomized requests. The JSON carries a `taxi` definition with clock rate, game fare parameters, named stops, bay IDs, road node IDs and customer pickup/destination pairs. Stops and fares are validated on load; all nine-stop directed route pairs are covered by tests. New shifts draw reachable, distinct stop pairs rather than cycling the authored fare order.

Passenger service uses A / Enter after a full stop in the current target area. Information uses View / Select (PS Share) / F in both road and atlas views. LT is brake only; B / Circle (R) selects forward/reverse while stopped, and RT accelerates in that direction. Stopping or serving a passenger does not move the atlas marker.

For this pilot, stopping and requesting information are allowed everywhere without unsafe-stop counts. Marked bays remain orientation cues and the mission arrival area. Stopping by itself still does not move the atlas marker.

This uses modern geography with a retro visual presentation. The source outlines and topology are real; building heights, façade details, the church silhouette and stopping bays are simplified gameplay interpretations. Marked bays are not statements about real parking permissions. Traffic and detailed turn restrictions are outside this pilot.

The taxi shift is an initial gameplay balance, with an accelerated clock and speed rewards to tune through playtesting. Test turn approaches, small signs, narrow streets and the arrival bay on a physical controller before expanding the area.

## Atlas detail and street lookup

The atlas supports 1×–8× zoom, panning, pointer-centred wheel zoom and a full overview reset. Street/place labels use readable detail sizes and street labels have a paper-colour halo. A street index can focus any printed street label at 5×, including Via Cordioli; this is a manual atlas lookup, with no route line or live tracking. Marker geometry stays a small screen size when zoomed.

Map controls: RT / LT or + / − zoom, right stick / I J K L / mouse drag pan, R3 / Home restores overview. In the index, right stick up/down or I / K selects a street and A / Enter locates it. Mouse users click the indexed name. Left stick retains crosshair/index-scrolling control. Zooming and dragging never move the position marker, and reading keeps taxi time paused.

Large districts, including the Lower Veronese plain, use a book of local quadrants.
The regional overview shows towns and page boundaries without street-name clutter.
Click a quadrant, or move the crosshair and press A / Enter, to open its detail page.
Each page covers 1.2 km square, with 200 m overlapping its neighbours, and has a
local A–D / 1–4 grid like the original Cerea atlas. North / south / east / west
links lead to adjacent pages; LB / RB or Q / E turn through the quadrants and index.
R3 / Home returns to the regional overview. The 1×–8× zoom applies to each local
page, so it can reach street detail independently of the region's total size.
The index gives page and local-grid references, distinguishes the same street
name on different pages, and opens the chosen page when a street is located.
Overlapping labels are suppressed on detail pages; a street lookup highlights
the selected name. Turning pages, opening a quadrant and looking up a street
never update the position marker. Information remains available on every page.

## Files and loading

- `public/maps/cerea.json`: generated Cerea district, bundled into the Windows build.
- `public/maps/harbor.json`: original handcrafted district data.
- `src/world/schema.ts`: the district data structure.
- `src/world/district.ts`: validation, explicit District contexts and shared spatial helpers.
- `public/maps/towns.json`: the district registry: every playable district's menu name, map file,
  data version, attribution and capabilities (`frame`, `taxi`, `provenance`, `spec`), plus fixed
  screenshot poses. `tools/import-town.py` keeps spec-built entries up to date.
- `src/world/load.ts`: registry validation, local selection and JSON loading.
- `towns/cerea.town.json`: Cerea's town spec: area, extract, confirmed landmarks and stops, fares and
  mission text (see [docs/TOWNS.md](docs/TOWNS.md)).
- `tools/import-town.py`: deterministic offline conversion of a town spec and its checked-in extract;
  `tools/import-cerea.py` runs it for Cerea and keeps the `--tiles` options.
- `tools/prepare-town.mjs`: build-time polygon clipping for road, sidewalk, junction and bay clearance.
- `src/world/signs.ts`: major-road direction boards and other roadside signs.
- `src/world/streetPlates.ts`: façade/post street-name plates, crossing coverage and between-junction repeaters.
- `data/README.md`: source, projection, attribution and simplification notes.

The running game loads only the local JSON files; it does not contact OpenStreetMap or require an internet connection. Editable JSON is district content, not executable code. The current UI selects bundled districts; there is no arbitrary file picker or map editor yet.

## Adding another district

The planned spec-driven pipeline for real towns, starting with Verona, is in
[docs/TOWNS.md](docs/TOWNS.md). Until it exists, districts are added by hand as below.

1. Create a version 1 district JSON matching `DistrictDefinition` in `src/world/schema.ts`.
2. Use local metre coordinates: north is negative Z and east is positive X. Preserve a consistent scale. Roads connect node IDs; intermediate shape points retain curves. Different elevation crossings must not share a junction ID unless the roads actually connect.
3. Supply road widths, `roadClass` and one-way direction where needed. `primary`, `secondary` and `tertiary` receive major-road direction boards where they meet other major roads; other classes use name plates. A one-way segment runs from `a` to `b`. Road-rule enforcement is not simulated, but route hints and onward signs honour this direction.
4. Supply bounds, building polygons, water/rail polylines, named landmarks and rectangular game stopping areas.
   Rivers and lakes can also be areas (`waterAreas`): set `"waterAreas": true` under `features` in a town spec
   and `tools/import-town.py` takes `natural=water` and `waterway=riverbank` ways and multipolygons; the
   prepare step clips them to the district and subtracts every road corridor for their collision shape, so
   bridges stay drivable. Cerea has none and does not set the flag.
5. Set the starting position, heading and name. A basic district can define one mission destination bay and road node. For taxi mode, add `taxi.stops` and `taxi.fares`, start/end hours, clock rate and fare parameters; every referenced stop needs an accessible bay and a reachable road node.
6. Put the file in `public/maps/` and add its entry to `public/maps/towns.json` (built from a town spec,
   `tools/import-town.py` adds it). The briefing, LB / RB cycling and `--district` then offer it; no code
   change is needed. `tests/registry.test.ts` checks every entry against its map and spec.
7. Run `npm run town:check -- <id>` (all listed districts when no id is given). The town doctor
   (`tools/town-doctor.ts`, the same checks `tests/town-doctor.test.ts` runs on every registry entry)
   fails a district on a road network in pieces, a stop unreachable in either direction, a bay that is
   covered or that the car cannot get into from its street, a building on a road or bay, a road the car
   cannot follow by its 1.05 m margin, a street plate on the wrong street, or a size over budget. It
   lists junction arms left without a plate. Then run unit and desktop tests, inspect both the atlas and
   driving view, and playtest the journey.

Generic map rendering supports angled segments, shared junction caps, polygon building collisions, local landmark signs and source attribution. Signage now has two levels. Larger arrow boards are limited to junctions connecting major roads (mapped primary, secondary and tertiary roads). Small, arrow-free street-name plates identify each physical street arm at a crossing, including one-way streets. A plate runs along and faces into the street it names; corner façades therefore carry the name of their own frontage. Nearby façades are preferred, otherwise small posts are used, with repeat plates along longer stretches. Checks cover ownership, orientation, street-facing visibility and clearance, including the first Via Dante / Via Venticinque Aprile junction. Its west end has an explicit one-way/no-entry warning. Parking and boundary signs use the same clearance checks. Static geometry, including shared canvas-textured façades and roofs, is batched by material to keep the denser district economical. The original Harbor scenery and its familiar navigation wording are retained in dedicated legacy builders, rather than requiring the new renderer to reproduce its handcrafted decorations.

## Rebuild

```sh
python3 tools/import-cerea.py          # same as: python3 tools/import-town.py towns/cerea.town.json
npm run town:check -- cerea
npm test
npm run build
npm run desktop:package:win
```

From WSL, `npm run desktop:win` rebuilds and launches Cerea Centro in Windows. To launch an existing bundle without rebuilding, use `node desktop/run-windows.mjs cerea` (or `harbor`). The executable also accepts `--district=cerea` or `--district=harbor`.

The importer works offline from `data/sources/cerea-osm.json`. Review provenance and source permissions when introducing a new extract. Attribution for the current OpenStreetMap data appears in the driving view, briefing and atlas; see `data/README.md`.

Roads without an explicit `width` use the same 8 m carriageway width for rendering, atlas strokes, paving and sign/plate clearance. Bundled roads currently all specify their widths.

## Presentation details

Neighbourhood façade colours derive deterministically from local 65 m areas,
not the mission; the shared palette is `src/world/palette.ts`. Detailed scenery paints repeating shutters/windows and
street-level shop doors locally. Roof facets use each clipped footprint's
triangulation, including courtyards; no overhang changes road clearance.
These are economical interpretations rather than surveyed architectural details.
Simple and Detailed building meshes share the original collision polygons.

Decorative trees, lamps, parked cars and people are placed deterministically
beside selected roads, outside carriageways/buildings/bays, with space reserved
for signs and street-plate sightlines. Taxi stops have no waiting people. After stopped service at an accepted pickup,
one passenger, managed separately from static scenery, walks from a nearby
doorway or off-street spot (found from building footprints) to the taxi and
takes the adjacent seat; dropoff clears the seat and the passenger walks away.
This state survives tile eviction, origin rebasing and save/load. They add no collision
or stopping rules. No JSON schema or importer changes are required for this
presentation pass. Harbor retains its legacy scenery. See
[presentation measurements and limits](docs/PRESENTATION.md).

## Scalability foundations

A loaded definition now becomes an explicit `District` context, owning node
lookup, adjacency, spatial indexes and directed routing. The loader returns
it; systems bind through `create…(context)` factories. No mutable active-map
module state remains. More than one district's systems can coexist in memory;
the selection UI still reloads one district at a time. Treat geometry as
immutable after context creation; rebuild the context after editing geometry.

Building/road grids conservatively choose candidates, retaining the original
polygon/hole/margin and projected-distance predicates. Source-order ties and
full taxi route paths are checked against exhaustive references. Render geometry
is constructed in a local coordinate frame before Float32 conversion; physics,
directions and atlas markers keep logical world coordinates. A translated Cerea
fixture exercises the general renderer 25 km from the origin. The original
Harbor scene remains handcrafted in its authored local coordinates; definitions
requiring a nonzero Harbor render anchor are rejected explicitly.

No map JSON/schema/importer or provenance changes are made by this work.
There is no tile loading or second town yet. See [B architecture and measurements](docs/SCALABILITY.md).

## Tiled outskirts experiment (C)

`public/maps/cerea-outskirts/manifest.json` and its 250 m `tiles/` payloads form
an additional opt-in district. `python3 tools/import-cerea.py --tiles-only`
regenerates it from prepared Cerea; `--tiles` also rebuilds the base extract.
Original Cerea/Harbor JSON files remain unchanged. Real Cerea nodes, street
connections, one-way tags and clipped building footprints are retained; the
northbound Test Link, Test Lane/Orchard Row and test hamlet are explicitly
fictional, not a claim about surrounding roads.

The manifest retains logical geometry for collision and the paper atlas, with
local render payloads loaded/evicted around the car. Whole objects have single
owner tiles; fog and a conservative halo hide the outer edge. Three routing
regions and two portals give coarse inter-town planning and local detailed
queries, with exact detailed path costs for taxi fares. The coarse prototype
must be a tree; arbitrary connected town networks are future work.

Attribution is shown in the prototype's driving view, briefing and atlas, and
source/synthetic provenance travels in every tile. See [the C feasibility
report](docs/TILED_PROTOTYPE.md) and [source/licence details](data/README.md).

Tile references must use canonical integer grid IDs with matching 250 m bounds
and complete coverage of the prototype rectangle. Invalid overlaps, aliases or
missing cells fail validation before play. Local read failures retry with capped
backoff, holding the simulation gate until the current neighbourhood is ready.
Recovery retains the existing trip, atlas knowledge and pause state.

## Regions: the lower Veronese plain

`public/maps/lower-verona/` is a streamed district joining six real towns: Cerea, Legnago, Bovolone,
Sanguinetto, Nogara and Casaleone. Each town keeps its real streets at real scale and is placed rigidly at
`k` times its position in the regional frame (UTM zone 32N, false origin at the region centre, turned by
the grid convergence there). The real main roads between towns are kept with their junctions, one-way
tags and names, and shortened by `k = 0.6`, so neighbouring towns are a few minutes apart (Cerea–Legnago
about 5 minutes at 17 m/s). Direction boards where a road leaves a town give the real road distance to
the next town. Six villages and hamlets on those roads (Concamarise, Aselogna, Venera, Belfiore,
Alberoni, Casella) are included at real scale too, placed like the towns but with no
stops (`"kind": "village"` specs, a 50 m `villageMargin`). The builder also refuses a region where a
shortened road would cross a town's or village's street, or where a road centreline would run into a
building. Rebuild with:

```sh
npm run build:region     # tools/build-region.py, then tools/tile-district.mjs
```

`regions/lower-verona.region.json` lists the towns (each from its own spec in `towns/`), the town pairs
whose corridors are kept, `k`, and the shift content. The builder fails if towns overlap, if mapping
creates a road crossing, or if a town-to-town bearing moves by more than 1°; it is deterministic. See
[docs/TOWNS.md](docs/TOWNS.md) and the measurements in [docs/REGION_SPIKE.md](docs/REGION_SPIKE.md).

## Verona centro

The centre of Verona inside the Adige loop (about 1.9 km², #25), from `towns/verona.town.json` and
`data/sources/verona-osm.json`: 417 named streets, 3,554 building masses and 13 stops, from the Arena and
Piazza Bra to the Duomo and Castelvecchio. It is the first town with:
- **Building relations** (`"buildingRelations": true` under `features`): multipolygon buildings such as
  Palazzo Barbieri keep their courtyards as holes, through clearance and in collision.
- **Squares** (`"pavedAreas": true`): `place=square` outlines and highway areas such as Piazza Bra,
  Piazza delle Erbe and Piazza dei Signori are paved open ground (`pavedAreas` in the district) that the
  car can drive across; they are not roads, so routing, directions and fares still follow the streets
  through them. The atlas draws them, and the river areas, under the buildings.
- **Tiled delivery for a single town**: over the single-file budget, it is built and tiled with

```sh
npm run build:verona     # tools/import-town.py, then tools/tile-district.mjs (no sidecar: one town)
```

Every named street is drivable, including pedestrian and limited-traffic streets (owner decision). Roads
are still 8 m wide; clearance removes 12.3% of the footprint area (Legnago 10.5%), and fitting widths to
narrow streets is a follow-up. A river centreline inside a mapped river area is drawn but not solid,
since the area's own shape (water minus road corridors) applies there; it used to block Ponte Garibaldi.
