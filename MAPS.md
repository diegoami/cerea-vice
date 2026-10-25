# Loadable districts

Cerea Vice now loads a selected district from a bundled JSON file. Cerea Centro is the default; Harbor District remains available from the briefing. Select with the map buttons or LB / RB (Q / E on keyboard) before starting. Selection is remembered locally and also recorded in the URL hash. The WSL playtest launcher uses a fresh temporary profile for each launch. Loading another district restarts the drive.

## Cerea Centro pilot

The approximately 667 × 779 metre subset includes 29 named streets, Piazza Fratelli Sommariva's roundabout, Via Paride, Viale della Vittoria, Via Roma, Via Venticinque Aprile, the Menago and eastern railway lines. San Zeno in Santa Maria Assunta, Municipio di Cerea, Biblioteca di Cerea and Scuola Olga Visentini are named landmarks. There are 582 retained building masses. Ninety-seven source footprints are trimmed back from the full road/sidewalk envelope and five have no usable remainder. The same trimmed geometry is used for rendering, collisions and the atlas.

Start at Sosta Municipio beside Via Venticinque Aprile. Find Biblioteca di Cerea on Viale della Vittoria and stop in Sosta Biblioteca within six minutes. Streets, one-way routing, atlas, manual position estimates and information-request marker updates work together. Stopping alone still does not move the marker.

For this pilot, stopping and requesting information are allowed everywhere without unsafe-stop counts. Marked bays remain orientation cues and the mission arrival area. Stopping by itself still does not move the atlas marker.

This uses modern geography with a retro visual presentation. The source outlines and topology are real; building heights, façade details, the church silhouette and stopping bays are simplified gameplay interpretations. Marked bays are not statements about real parking permissions. Traffic and detailed turn restrictions are outside this pilot.

The default mission is a first real-place playtest, not a final challenge balance. Test turn approaches, small signs, narrow streets and the arrival bay on a physical controller before expanding the area.

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
5. Set the starting position, heading and name. Define the mission's destination bay and a reachable road node near its entrance, plus its objective, hint and duration.
6. Put the file in `public/maps/` and register its ID and name in `availableDistricts` in `src/world/load.ts`.
7. Check validation, connectivity, road/footprint clearance, legal stopping and arrival. Run unit and desktop tests, inspect both the atlas and driving view, then playtest the journey.

Generic map rendering supports angled segments, shared junction caps, polygon building collisions, local landmark signs and source attribution. Signage now has two levels. Larger arrow boards are limited to junctions connecting major roads (mapped primary, secondary and tertiary roads). Small, arrow-free street-name plates identify every turnable street from each legal crossing approach. Plates are attached to nearby façades where practical, otherwise to small posts, and repeat along stretches away from crossings. Visibility and clearance checks cover the plate face, its approach and the side of the crossing it names, including the Borghetto turn into Viale della Vittoria. Its west end has an explicit one-way/no-entry warning. Parking and boundary signs use the same clearance checks. Static untextured meshes are batched to keep the denser district economical. The original Harbor scenery and its familiar navigation wording are retained in dedicated legacy builders, rather than requiring the new renderer to reproduce its handcrafted decorations.

## Rebuild

```sh
python3 tools/import-cerea.py
npm test
npm run build
npm run desktop:package:win
```

From WSL, `npm run desktop:win` rebuilds and launches Cerea Centro in Windows. To launch an existing bundle without rebuilding, use `node desktop/run-windows.mjs cerea` (or `harbor`). The executable also accepts `--district=cerea` or `--district=harbor`.

The importer works offline from `data/sources/cerea-osm.json`. Review provenance and source permissions when introducing a new extract. Attribution for the current OpenStreetMap data appears in the driving view, briefing and atlas; see `data/README.md`.
