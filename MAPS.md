# Loadable districts

Cerea Vice now loads a selected district from a bundled JSON file. Cerea Centro is the default; Harbor District remains available from the briefing. Select with the map buttons or LB / RB (Q / E on keyboard) before starting. Selection is remembered locally and also recorded in the URL hash. The WSL playtest launcher uses a fresh temporary profile for each launch. Loading another district restarts the drive.

## Cerea Centro pilot

The approximately 1,020 × 1,080 metre modern subset includes 51 named streets, the Sommariva roundabout, Via Paride, Viale della Vittoria, Via Roma, Via Venticinque Aprile, the Menago and railway lines. It now reaches the post office and Oratorio dello Spasimo area to the south/east, with Teatro del Gusto and additional street connections to the north/west. There are 1,081 retained building masses; 137 source footprints are trimmed and five removed to keep road, sidewalk and stopping areas clear.

The default game is a [07:00–17:00 taxi shift](TAXI.md) with nine pickup/dropoff locations and ten authored customer requests. The JSON carries a `taxi` definition with clock rate, game fare parameters, named stops, bay IDs, road node IDs and customer pickup/destination pairs. Stops and fares are validated on load; all nine-stop directed route pairs are covered by tests.

Passenger service uses A / Enter after a full stop in the current target area. Information uses View / Select (PS Share) / F in both road and atlas views. LT is brake only; B / Circle (R) selects forward/reverse while stopped, and RT accelerates in that direction. Stopping or serving a passenger does not move the atlas marker.

For this pilot, stopping and requesting information are allowed everywhere without unsafe-stop counts. Marked bays remain orientation cues and the mission arrival area. Stopping by itself still does not move the atlas marker.

This uses modern geography with a retro visual presentation. The source outlines and topology are real; building heights, façade details, the church silhouette and stopping bays are simplified gameplay interpretations. Marked bays are not statements about real parking permissions. Traffic and detailed turn restrictions are outside this pilot.

The taxi shift is an initial gameplay balance, with an accelerated clock and speed rewards to tune through playtesting. Test turn approaches, small signs, narrow streets and the arrival bay on a physical controller before expanding the area.

## Atlas detail and street lookup

The atlas supports 1×–8× zoom, panning, pointer-centred wheel zoom and a full overview reset. Street/place labels use readable detail sizes and street labels have a paper-colour halo. A street index can focus any printed street label at 5×, including Via Cordioli; this is a manual atlas lookup, with no route line or live tracking. Marker geometry stays a small screen size when zoomed.

Map controls: RT / LT or + / − zoom, right stick / I J K L / mouse drag pan, R3 / Home restores overview. In the index, right stick up/down or I / K selects a street and A / Enter locates it. Mouse users click the indexed name. Left stick retains crosshair/index-scrolling control. Zooming and dragging never move the position marker, and reading keeps taxi time paused.

## Files and loading

- `public/maps/cerea.json`: generated Cerea district, bundled into the Windows build.
- `public/maps/harbor.json`: original handcrafted district data.
- `src/world/schema.ts`: the district data structure.
- `src/world/district.ts`: validation, active district state and shared spatial helpers.
- `src/world/load.ts`: local selection and JSON loading.
- `tools/import-cerea.py`: deterministic offline conversion of the checked-in source extract.
- `tools/prepare-cerea.mjs`: build-time polygon clipping for road, sidewalk, junction and bay clearance.
- `src/world/signs.ts`: major-road direction boards and other roadside signs.
- `src/world/streetPlates.ts`: façade/post street-name plates, crossing coverage and between-junction repeaters.
- `data/README.md`: source, projection, attribution and simplification notes.

The running game loads only the local JSON files; it does not contact OpenStreetMap or require an internet connection. Editable JSON is district content, not executable code. The current UI selects bundled districts; there is no arbitrary file picker or map editor yet.

## Adding another district

1. Create a version 1 district JSON matching `DistrictDefinition` in `src/world/schema.ts`.
2. Use local metre coordinates: north is negative Z and east is positive X. Preserve a consistent scale. Roads connect node IDs; intermediate shape points retain curves. Different elevation crossings must not share a junction ID unless the roads actually connect.
3. Supply road widths, `roadClass` and one-way direction where needed. `primary`, `secondary` and `tertiary` receive major-road direction boards where they meet other major roads; other classes use name plates. A one-way segment runs from `a` to `b`. Road-rule enforcement is not simulated, but route hints and onward signs honour this direction.
4. Supply bounds, building polygons, water/rail polylines, named landmarks and rectangular game stopping areas.
5. Set the starting position, heading and name. A basic district can define one mission destination bay and road node. For taxi mode, add `taxi.stops` and `taxi.fares`, start/end hours, clock rate and fare parameters; every referenced stop needs an accessible bay and a reachable road node.
6. Put the file in `public/maps/` and register its ID and name in `availableDistricts` in `src/world/load.ts`.
7. Check validation, connectivity, road/footprint clearance, legal stopping and arrival. Run unit and desktop tests, inspect both the atlas and driving view, then playtest the journey.

Generic map rendering supports angled segments, shared junction caps, polygon building collisions, local landmark signs and source attribution. Signage now has two levels. Larger arrow boards are limited to junctions connecting major roads (mapped primary, secondary and tertiary roads). Small, arrow-free street-name plates identify each physical street arm at a crossing, including one-way streets. A plate runs along and faces into the street it names; corner façades therefore carry the name of their own frontage. Nearby façades are preferred, otherwise small posts are used, with repeat plates along longer stretches. Checks cover ownership, orientation, street-facing visibility and clearance, including the first Via Dante / Via Venticinque Aprile junction. Its west end has an explicit one-way/no-entry warning. Parking and boundary signs use the same clearance checks. Static untextured meshes are batched to keep the denser district economical. The original Harbor scenery and its familiar navigation wording are retained in dedicated legacy builders, rather than requiring the new renderer to reproduce its handcrafted decorations.

## Rebuild

```sh
python3 tools/import-cerea.py
npm test
npm run build
npm run desktop:package:win
```

From WSL, `npm run desktop:win` rebuilds and launches Cerea Centro in Windows. To launch an existing bundle without rebuilding, use `node desktop/run-windows.mjs cerea` (or `harbor`). The executable also accepts `--district=cerea` or `--district=harbor`.

The importer works offline from `data/sources/cerea-osm.json`. Review provenance and source permissions when introducing a new extract. Attribution for the current OpenStreetMap data appears in the driving view, briefing and atlas; see `data/README.md`.

Roads without an explicit `width` use the same 8 m carriageway width for rendering, atlas strokes, paving and sign/plate clearance. Bundled roads currently all specify their widths.
