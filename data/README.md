# Cerea map data

The Cerea Centro pilot uses a modern OpenStreetMap subset around Via Paride, Piazza Fratelli Sommariva, Viale della Vittoria and Via Venticinque Aprile.

- Raw extract: `sources/cerea-osm.json`, retrieved through `https://overpass-api.de/api/interpreter`.
- Source database timestamp: recorded in the extract's `osm3s.timestamp_osm_base` and the derived map's `provenance.osmTimestamp`.
- Source query extent: south 45.188, west 11.202, north 45.201, east 11.221.
- Playable subset: south 45.1888, west 11.2055, north 45.1985, east 11.2185, approximately 1,020 × 1,080 metres.
- Projection: local metre approximation centred on latitude 45.1943, longitude 11.2112, with north at negative world Z.
- Derived district: `public/maps/cerea.json`.
- Rebuild offline: `python3 tools/import-cerea.py`.

© OpenStreetMap contributors. The source extract and derived OpenStreetMap database content are provided under the [Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/). See [OpenStreetMap copyright and attribution](https://www.openstreetmap.org/copyright). The game displays attribution in the driving view, briefing and atlas.

Road shape points, shared junction IDs, street names, highway classes and one-way tags are retained. Highway classes distinguish major-road direction boards from normal street-name plates. The largest connected named-road component within the boundary is used. Boundary stubs are marked as leaving the playable area. No live map service is required by the game.

Building outlines come from the source data; heights, materials and landmark silhouettes are simplified. Named school/library areas are associated with a building on their grounds. The complete road width, junction caps, sidewalks and stopping bays are subtracted from building footprints with a build-time polygon-clipping step. One hundred thirty-seven footprints are trimmed and five have no usable remainder. Source IDs are recorded under `provenance.trimmedFootprints` and `provenance.omittedConflictingFootprints`. The derived polygons are shared by the scenery, collisions and atlas. This is a practical low-poly interpretation, not a measured building reconstruction.

The nine designated stopping bays are gameplay placements. They are not claims about real parking permissions. At this pilot stage, stopping and asking for information are allowed anywhere without unsafe-stop counts. Waterways marked as underground/culverted in the source are not rendered as open water. Railways are static scenery. Modern one-way tags inform directions, but traffic, enforcement and detailed turn restrictions are not simulated. The visual style remains retro without claiming historical precision.

The cinema POIs are associated with a containing or nearby building. Additional pickup frontages use the nearest mapped street where an address is not supplied. Passenger names, taxi requests, fares and clock acceleration are game content authored for this prototype.

## C: tiled outskirts feasibility fixture

`public/maps/cerea-outskirts/` is derived offline from the prepared Cerea map by
`tools/export-tiles.mjs` (`python3 tools/import-cerea.py --tiles-only`). It emits
a manifest and 55 local 250×250 m render payloads. The base real-city JSON and
raw OSM extract are not changed. Nodes, roads, one-way tags, source IDs and
prepared building footprints from Cerea are preserved. Source feature lines
are split into collinear pieces for owner-tile assignment.

The added **Test Link**, **Test Lane**, **Orchard Row**, 16 houses and **Test
Hamlet** are explicitly fictional prototype content, not sourced roads or a
reconstruction of countryside around Cerea. The original source bounding box
still describes only the real subset. Manifest notes, each tile's provenance,
briefing/atlas labels and permanent street/town signs state the distinction.
The synthetic connection begins at the cropped Via Oberdan endpoint only to
exercise portals and rendering; it makes no claim that such a real road exists.

OSM-derived database content retains the ODbL-1.0 attribution and source links
above. No separate licence is assigned here to original authored game content.
All rendering/audio assets are local code-generated assets as described in
`docs/PRESENTATION.md`; no new external textures, audio or live services are used.
The game shows OSM credit in the prototype's driving view, briefing and atlas.
