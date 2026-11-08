# Town atlas and junction guidance

Continuous-service maps use two map scales: a regional drawing of towns and connecting
roads, and a rectangular street drawing for each town. Opening the atlas selects the
current stopped town, as requested by the owner. It supplies town context without
placing or following a car marker. Information and deliberate estimates remain the
only ways to change that marker.

Home / R3 returns to the regional view. Enter / A opens the town under the crosshair,
or places an estimate in countryside. Town detail also permits deliberate estimates.
Mouse clicks follow the same rule; a drag never places one. Dragging beyond a town's
edge transfers pointer capture to the continuous regional view, so the same gesture
can cross the old quadrant boundaries. Town/index lookup keeps knowledge and time
unchanged. F / View requests information while reading, including in countryside.

Zoom buttons and keys use 2× steps, and the wheel and triggers respond faster. The
regional drawing omits building and street-label detail. Town drawings filter geometry
to their own extents and batch roads/buildings into a few SVG paths. Only the selected
town's street index is prepared until a wider lookup is requested. The fixed geometry is drawn once into a cached canvas paper (up to 4096 pixels for a
town and 2048 for the region). Labels, town selection and knowledge markers remain
vector overlays. Panning and zooming reuse that surface instead of retessellating all
building and road shapes. Four paper drawings are cached. Glyph extents are measured on a canvas once for a drawing; pan/zoom projects
those cached extents instead of forcing a DOM layout for every label. The frozen 3D
scene and mirrors are rendered once under the atlas, with a fresh frame on resize or
return to driving.

The existing game manifest is still resident for driving/navigation. This change does
not alter its download format or add an online service. Once loaded, browsing another
town requires no atlas network request. Legacy fixture maps retain their existing
atlas pages, including overlapping quadrants where applicable.

Direction boards use actual legal road exits. Town targets are reachable main-road
entrances to the authored town extent, with other road entrances or stopping nodes as
fallbacks. Landmark targets are the real stopping nodes. Reverse directed route costs
exclude one-way violations, dead-end detours and sending a driver back through the
approach. Arrow geometry follows the exit angle, using up to 25 metres of road shape
before the next junction. Signs name destinations; street names stay on their street
plates. Guidance is independent of the current fare.

Main boards cover town exits and nearby landmarks. Supplementary brown boards provide
local turns where a clear verge exists, with at most two sites prepared per landmark.
They are generated lazily for nearby visual tiles, assigned by the sign's position and
merged when destinations share an approach. Co-located destinations can share a row:
Sanguinetto's castle, municipality and theatre occupy the same mapped building/node.
The Veronese fixture has a direction cue for all 69 landmarks across main/local boards;
this does not imply that every approach is signed.

All changes are presentation/navigation code. Map manifests, source extracts, tiles,
map signatures and save versions remain unchanged. Existing saves keep their car,
mission and atlas knowledge.

## Checks

Unit checks cover town extents and stop identity, sparse regional geometry, local
street scope, unchanged signatures/knowledge, directed town-entry detours, angled
arrows, shared civic names, clear sign sites and unique ownership at tile boundaries.
The game transition test also verifies that paper controls continue working while
3D/mirror redraws are suspended.

`desktop/town-atlas-check.mjs` is shared by production Chromium and native Electron
checks. It exercises zoom, regional drag, Oppeano selection, pointer-capture transfer,
resizing, offline browsing, rural manual estimation and information, frozen time,
unchanged knowledge during browsing, and unchanged car state. Existing opening,
controller, persistence and legacy atlas regressions remain part of the suites.
The Windows smoke additionally opens the larger Verona town drawing, measures a
zoom handler/paint, transfers a native drag to the region, and captures destination
boards from ordinary saved-game approach poses in a disposable profile.
