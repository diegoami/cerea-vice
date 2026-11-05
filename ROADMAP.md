# Cerea Vice tentative development roadmap

The goal is to reach a small playable version of the [game vision](VISION.md): learn a real place through purposeful journeys, signs, landmarks, directions and memory. Keep the current driving prototype as the foundation and expand it in small, testable steps.

This is a proposed sequence, not a fixed schedule. Each milestone ends with a playable checkpoint; findings can change the next milestone's scope. Choose the first real location early, but build only a small district until the navigation loop works.

## Next milestone (as of 6 November 2026)

`main` is ahead of the last release, `v0.14.0-rc.1` (milestone #110), by work merged on 2 November 2026,
none of it reviewed per PR (the owner reviews at milestones only, see AGENTS.md):

- #114 atlas findability: zooming into a page overview turns to the detail page (#113); the place index
  names the current destination (#87).
- #115 back to the main screen from pause (#85); #116 Backspace no longer erases the marker (#111).
- #117 town and village signs between the plain's towns (#84), and the save signature now ignores tile sizes.
- #118–#121 contiguous regions (#112): one shared frame, Verona grown south to Borgo Roma, the region from
  Verona to Oppeano, and driving between the two regions at the gateway on Via Quaiotto north of Bovolone.

The owner approved integration of #128 on 6 November. It includes the pending
ancestry of #122 (handover), #124 (autonomous opening), #125 (unified world and
inter-town fares), #126 (compact HUD), #127 (continuous service, day/night,
scenery and cloud map authoring), and #128 itself (town boards, High demo quality,
lane keeping, traffic recovery and overtaking). No per-PR review was requested.
Include this inventory in the next milestone issue when the owner chooses a
release candidate. The reported Bovolone square loop is covered by the final fix
and real-map regressions before integration. No new release/tag is proposed here.

Before the next release candidate, the owner still has to:
- play the crossing north of Bovolone on Windows, and confirm or rename the proposed stops (the seven
  southern Verona stops, San Giovanni Lupatoto's six, Oppeano's three);
- measure memory, load and frame time in the region from Verona to Oppeano: the streamed-map budget was
  raised to 16,000 buildings and 9 MB for it (owner decision, 2 November 2026) on the strength of Verona
  centro–Borgo Roma (11,407 buildings) playing well; the region itself (15,106) is unmeasured (#51).

Still open on #112: "continued in …" at region edges in the atlas (step 6), and an optional second gateway
on Via Madonna (Bovolone–San Giovanni Lupatoto). Ca' di David and Isola Rizza are deliberately left out:
after compression they overlap Borgo Roma and Oppeano, and as a village Isola Rizza would lie off every
corridor. #90 (device-specific prompts) is largely superseded by #93; the owner has not decided whether to
close it.

## Current starting point

The prototype already has first-person driving, analog controller input with keyboard fallback, reversing, handbraking, glances, collisions, a heading compass, junction direction boards, legal stopping areas, stopped-only direction requests, and one timed journey through fictional Harbor District.

A portable Windows client has been built and launched. Automated tests cover driving and navigation systems and a desktop drive with simulated controller input. The user confirmed milestone 1 complete on 25 October 2026, covering the driving and signs playtest. Longer-term geography learning will be evaluated through multiple journeys.

A stopped-only atlas is now implemented. Cerea Centro is now an initial modern-geography pilot with loadable district data. The main missing pieces are a distinct location request, multiple selectable journeys within a district, and evidence that repeated journeys produce familiarity.

## Milestone 1 Validate the driving and signs

**Status:** Complete, confirmed by the user on 25 October 2026.

**Deliverable:** a comfortable Windows controller playtest of the current hotel journey.

- Test a physical controller on Windows: connection, analog steering and triggers, glances, pause, disconnect/reconnect and keyboard fallback.
- Check signs from the actual cockpit at driving speed, including both directions of travel, bends and junction approaches. Adjust size, position, contrast and viewing distance where needed.
- Tune low-speed steering, braking, reversing and parking so reaching a destination does not depend on precise vehicle handling.
- Try a first journey, an intentional wrong turn and a repeated journey. Record where the player hesitates and which cues they use.

**Checkpoint:** the player can control the car, read junction signs in time, stop and ask for help, recover from a wrong turn and finish the journey. Fix input and visibility problems before expanding the world.

## Milestone 2 Complete the navigation tools

**Status:** Atlas implemented with controller/keyboard page controls, paused reading time and a position marker updated by successful information requests or the player’s own estimate. Information can also be requested from within either atlas page using F, View / Select (PS Share) or its button, without closing the atlas. The atlas now includes 1×–8× zoom, pan controls, readable detail labels and a street index that can focus an individual road. It is a book: large districts read fixed 1.2 km quadrants (#92), dense compact towns such as Verona get density-chosen smaller pages (#89), zoomed-out paper prints only the major-road network with streets revealing at 2× and paths at 4× (#88), and page/grid references stay visible while zoomed (#86). 0.13.0-rc.3 (milestone #101) released this work; 0.14.0-rc.1 (milestone #110) added page turns that keep the zoom (#104) and key and button names only under Change controls (#93). On `main` since then: overview zoom reaches street names (#113), the place index names the current destination (#87), density pages for long single towns and split pages over a region's dense city (#112). See "Next milestone" above for what is unreleased.

**Deliverable:** a usable paper-style atlas and clearer stopped-only help.

- Add a north-up atlas with street names, districts, landmarks, bridges and an index of named places. It shows geography without a route line, live car marker or destination arrow.
- Make opening, browsing and closing the atlas work with the controller and keyboard. Allow access only after a settled stop; prevent driving while it is open.
- Support two clear help requests while stopped anywhere: “Where am I?” and “How do I get to my destination?”
- Use the same street and landmark data for the world, signs, atlas and spoken-style text directions so their information agrees.
- Explain legal stopping places clearly while allowing help at any stopped location. Help requests remain legitimate tools, not a score penalty.

**Checkpoint:** a player can locate themselves from descriptions, plan a route on the atlas, close it, drive a section and stop to reorient when uncertain.

**Implemented rule to playtest:** atlas consultation pauses the mission timer and driving. Direction hints currently remain on the driving HUD without pausing the timer; reconsider their reading behaviour when expanding navigation help.

## Milestone 3 Make journeys reusable and test learning

**Status:** Implemented as an initial Cerea taxi shift with nine destinations, continuing pickup/dropoff jobs, a 07:00–17:00 clock, earnings and speed bonuses. Playtesting and balance remain. See [TAXI.md](TAXI.md).

**Deliverable:** several short journeys across the same fictional district.

- Replace hotel-specific assumptions in missions and directions with data for named destinations, arrival areas, starting positions and optional deadlines.
- Provide roughly three to five destinations with different approaches. Include an untimed familiarisation drive and a few timed trips.
- Keep tasks generic: go to a place, carry an item or make a return journey. Passenger AI, business systems and elaborate story logic can wait.
- Add a simple way to choose and replay a journey using the controller.
- Playtest a repeated trip and a new trip that shares some familiar roads. Use arrival time, wrong turns, remembered landmarks and the player's own explanation of the route as evidence of learning. Fewer help requests may be useful evidence, but are not the objective by themselves.

**Checkpoint:** repeated journeys become easier because the player recognises the place. They can reuse part of that knowledge on a different trip. If the world still feels arbitrary, improve its cues and layout before adding more content.

## Milestone 4 Choose and model a small real district

**Status:** Cerea Centro selected and modelled from a modern OpenStreetMap subset. The user explicitly accepts modern geography with retro presentation; exact historical reconstruction is unnecessary. See [MAPS.md](MAPS.md) and [data sources](data/README.md).

**Deliverable:** a reviewed geographic specification for the first real-place pilot.

- Choose the town or district, its boundary and an approximate year in the 1980s. Prefer a compact area with varied junctions, recognisable landmarks and several useful destinations.
- Identify suitable geographic and historical references; check permitted use and attribution before bringing source material into the project.
- Record roads, connections, place names, districts, rivers, crossings, terrain cues and key landmarks. Check which modern roads or landmarks did not exist in the chosen period.
- Decide which details can be simplified. Preserve connectivity, orientation, relative positions and meaningful barriers; review any compression for misleading spatial relationships.
- Define a small set of pilot journeys before modelling scenery, so the required roads and cues are clear.

**Checkpoint:** someone familiar with the place can review the road graph and map, recognise it, and identify no major misleading connections or directions. Record unresolved historical details explicitly.

## Milestone 5 Build the real-place pilot

**Status:** First playable pilot implemented, followed by a major-road/street-name signage hierarchy, street-facing plates that name their own frontage, repeated street identification, full-circle right-stick/mouse looking, higher-resolution rendering, trimmed road-edge building polygons, and unrestricted stopping for Cerea playtests: loadable JSON, angled roads, mapped building footprints, named civic landmarks, one-way directions, adaptive atlas and an expanded taxi district with changing destinations and shift scoring. Physical playtesting and tuning remain.

**Deliverable:** the existing navigation loop running in one recognisable real district.

- Separate district content from game behaviour so road graphs, destinations, landmarks, signs and parking areas can be replaced without rewriting the driving systems.
- Support roads beyond the current rectangular grid, including curves and irregular junctions. Keep road surfaces, collision boundaries and routing aligned.
- Start with a reviewed road layout and simple scenery. Use a small repeatable import/conversion process if it saves work; do not make a general map editor a prerequisite.
- Preserve skyline cues, waterways, bridges and important terrain relationships. Use slopes or impassable boundaries where geography requires them.
- Generate or author the matching atlas and direction boards from the reviewed district data.
- Recheck vehicle speed, sightlines and deadlines at the district's chosen scale rather than copying Harbor District's three-minute timer.

**Checkpoint:** a player can recognise real spatial relationships, navigate several journeys and recover when lost. Compare the game atlas and driven routes with the source geography and local knowledge.

## Milestone 6 Finish a small Windows vertical slice

**Deliverable:** a shareable build with one car, one real district and a handful of purposeful journeys.

- Improve cockpit readability, landmark silhouettes and restrained engine/ambient audio where they help driving or orientation.
- Add the small settings needed for playtesting: audio level, controller sensitivity/deadzone and display options. Save preferences and completed journeys locally if useful.
- Check performance on the intended Windows machine, controller-only menu use and different window sizes.
- Make Windows builds repeatable and attach a versioned portable ZIP to releases. Consider an installer after the portable build is reliable.
- Run an external playtest with first-time and repeat journeys. Keep feedback about geography learning separate from input problems and deadline pressure.

**Checkpoint:** players can complete journeys through observation and help, explain how places connect and find familiar destinations again from memory. This is the decision point for expanding the map or adding a mission theme.

## Scope after the vertical slice

Expand to neighbouring districts or settlements only after the pilot passes the learning checkpoint. Then try one thin mission theme—taxi, delivery, courier or detective work—using the existing journey system. Add dialogue, traffic or more elaborate tasks only when they improve the navigation experience.

Fleet management, company finances, production chains, vehicle collections, combat and a large detective simulation remain outside this roadmap.

## Immediate next work

1. The owner's Windows playtest of the regions and the crossing, with memory readings (see "Next milestone").
2. Then the next milestone review and release candidate, when the owner calls it.
3. #112 step 6 ("continued in …" at region edges), and the optional second gateway.
