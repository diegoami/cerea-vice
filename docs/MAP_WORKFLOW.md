# Authoring selectable maps locally or in a cloud session

The repository owns the entire pipeline: an OSM snapshot, a recipe, prepared geometry,
tiles, validation and registration in `public/maps/towns.json`. No external account,
map server at play time, or local-only file is needed. The normal chooser shows entries
without `hidden: true`; older prototype/component maps can remain hidden. Veronese
stays the default unless an author deliberately requests `--default`.

Registered maps ship in the next website or full desktop build. An already-installed
desktop client has no separate map-ZIP/folder importer yet. Creating a map in a cloud
session therefore means producing and checking in its complete repository assets,
then obtaining an updated game build after the owner's merge.

Start a cloud task with a prompt such as:

> Add a selectable map of central Kyoto, Japan, with real streets and at least three
> real taxi landmarks. Follow AGENTS.md and docs/MAP_WORKFLOW.md. State the selected
> extent, preserve north and one-way connections, include endless taxi service and
> day/night scenery, and commit the OSM snapshot, recipe, map and registry entry.
> Validate the map and inspect a render where possible. Open a PR against main;
> do not merge, tag or publish. Report unavailable checks.

Give a neighbourhood/extent or bounds when you have one. A whole country is not a
single town-scale extract: author bounded towns and real connecting corridors as a
region. Resolve ambiguous places before fetching. Use actual OSM IDs/names; do not
invent landmark coordinates or connecting roads. Agent/model and review choices
remain governed by AGENTS.md.

## Town map

Prerequisites are Node 22.12+, Python 3 and `npm ci`. The importer uses only the
checked-in extract once downloaded. In a managed cloud runtime, follow its network
policy and configured proxy/CA trust. The downloader uses public HTTPS with a User-Agent,
standard environment proxy/trust settings, bounded retries and atomic writes. Do not
disable TLS verification to work around network errors.

```sh
npm run map -- scaffold kyoto-centre --name 'Kyoto Centre' \
  --bbox=35.000,135.760,35.015,135.780 --driving-side left
npm run map -- fetch towns/kyoto-centre.town.json
npm run map -- candidates towns/kyoto-centre.town.json
```

The bounds above illustrate the command, not a pre-validated Kyoto map. Inspect the
actual area before choosing its extent. Bounds are south, west, north, east in degrees;
local geometry uses metres with north at negative z. Use small town-scale extents
first. Split antimeridian-crossing areas; supported origins are between 85°S and 85°N.

Edit the generated spec:

- Select at least three real landmark OSM IDs from the extract. Give their real names,
  a mapped public street, kind and simplified height. `frontage: nearest` selects a
  practical game stopping frontage rather than claiming a postal address. Mapped
  point landmarks can use `point: true`.
- Add a stop for each landmark, a starting stop and mission target, and a passenger
  roster with valid pickup/destination pairs. The empty scaffold intentionally does
  not guess or invent these.
- Set `townName` to the actual town (for example London), while `name` may identify
  the smaller map (London Westminster). Choose `drivingSide` correctly. New scaffolds
  use continuous taxi service, local metric scale and tiled delivery.
- Preserve distinct town identities and accurate town extents. Continuous-service
  imports generate stop `townId`/`town` fields; regional builds retain each component.
  These drive the one-town atlas drawings and public direction signs to legal town
  entrances. Landmark signs use their real stopping nodes and available clear verges.
  Atlas browsing uses resident static data and needs no online mapping API.
- Keep river/railway connections, bridge tags, one-way directions and street-name
  ownership meaningful. Review non-Latin glyph readability in the target browser;
  if a font is needed, include a suitably licensed offline asset and its licence.

```sh
npm run map -- build towns/kyoto-centre.town.json
```

Build writes staging files under ignored `build/maps/<id>/`, runs the town doctor,
and only then copies the map/tiles into `public/maps/<id>/` and registers it as visible.
Failed validation never adds a selectable entry. The command does not commit or
publish. `--hidden` is for component maps; `--default` deliberately changes the default.

The downloader retains `<id>-osm.json`, its `.overpassql` query and a `.provenance.json`
with bounds, endpoint, OSM timestamp and SHA-256. Existing snapshots are reused unless
`fetch --force` is explicitly requested. See the [OSM Overpass documentation](https://wiki.openstreetmap.org/wiki/Overpass_API)
for public endpoints and appropriate shared-server use.

## Multi-town region outside Italy

Build each distinct town first. Use `--hidden` for component towns when only the
combined region should appear in the chooser. Expand one town spec for contiguous
parts of the same city; do not compress overlapping pieces as if they were separate towns.

```sh
npm run map -- build towns/town-a.town.json --hidden
npm run map -- build towns/town-b.town.json --hidden
npm run map -- scaffold-region new-region --name 'New Region' \
  --towns=towns/town-a.town.json,towns/town-b.town.json --driving-side left --k=.6
npm run map -- fetch regions/new-region.region.json
npm run map -- build regions/new-region.region.json
```

Review `corridors.pairs`, source bounds, margins and the compression factor in the
region spec before building. The corridor extract contains real main roads; the
builder must find real connected paths. It refuses overlapping towns, invented
crossings, blocked roads and unacceptable bearing changes.

New frames select the UTM zone/hemisphere from their origin and set `northAligned:
true` so true north is preserved away from Italy too. Existing Veronese recipes retain
their established frame/coordinates for save compatibility. Do not silently reproject
those shipped maps. Neighbouring regions must share the exact same frame and real
OSM gateway node.

## Validation and handoff

Run `npm run town:check -- <id>`, `npm test` and `npm run build`. For rendering/input
changes follow the desktop command in AGENTS.md, one suite at a time. Inspect the
new map in a real browser or native export where available: signs, landmark/bay
access, atlas, local/cross-town fares, day/night, save/load and both keyboard/controller
paths. Controller simulation is not physical-device testing. Report checks that the
cloud environment cannot run. Budgets are enforced; refine the extent/detail or
make a measured proposal rather than silently deleting meaningful geography.

For a map already shipped, compare `mapSignature` before/after. Add the previous
signature with a test only if saves remain compatible; otherwise bump `dataVersion`
and document the incompatibility. A new map gets its own id/save slot. Never reuse
an existing id for a different part of the world.

Commit the extract/query/provenance, spec/frame, manifest/tiles, registry entry and
an entry in data/README.md. Leave dist, release, node_modules, build and test-results
untracked. Push a task branch and hand over an open PR; the owner chooses when to merge
or publish. The checked-in London Westminster pilot demonstrates this complete flow
with real data, left-side traffic and three validated taxi stops.
