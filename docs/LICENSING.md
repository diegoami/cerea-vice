# Map data licensing (issue #27)

A technical summary for the owner to review, **not legal advice**. Where it matters, take advice.
Written 2026-10-29 for the 0.11 release, the first to ship more than one OpenStreetMap town.

## The situation

- The repository `diegoami/cerea-vice` is **public** and has **no licence file** for its code.
- GitHub releases (portable Windows ZIPs) are public. Each bundle contains the map files under
  `resources/app.asar` (`dist/maps/`), built from OpenStreetMap extracts.
- The game shows "© OpenStreetMap contributors · ODbL 1.0" in the driving view, briefing and atlas.
- The extracts (`data/sources/`), specs (`towns/`, `regions/`) and build tools (`tools/`) are in the
  public repository; `data/README.md` records sources, query areas and timestamps.

## What the ODbL 1.0 asks of this project

The [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) and the
[OSMF licence pages](https://osmfoundation.org/wiki/Licence) distinguish:
- **Derived databases**: the map JSON files are OSM data adapted and combined with game data, so they are
  derived databases. When a derived database is used publicly, it must be offered under the ODbL
  (share-alike, section 4.4) and access to it must be offered in machine-readable form (section 4.6).
- **Produced works**: what the game draws on screen is a produced work. It needs a notice that it contains
  OSM data under the ODbL (section 4.3), which the in-game attribution provides. A produced work itself
  does not have to be under the ODbL.
- **Attribution** (section 4.2/4.3): credit "© OpenStreetMap contributors" with a link to the licence
  or the copyright page, wherever the data or a produced work is used.

## Status after this change

| Obligation | Status |
| --- | --- |
| In-game attribution | Done: driving view, briefing and atlas, for every OSM district |
| Notice that ships with the maps | **Added**: `public/maps/NOTICE.md` is bundled in every build |
| Derived map data offered under the ODbL | Stated in the notice; the map files are public in the repository |
| Machine-readable access to the derived data | The repository holds the derived maps, the extracts and the tools that rebuild them |
| Provenance | `data/README.md` (sources, areas, timestamps), each map's `provenance`, the region's frame and compression |

## For the owner to decide

- **A licence for the game's own code and content.** With no licence file, nobody else may reuse the code.
  That is a valid choice, but it is separate from the map data, which must stay under the ODbL. If you
  want others to reuse the code, choose a licence; this summary does not pick one.
- **Whether to take advice** before distributing beyond playtesters, in particular on the share-alike
  boundary between the derived map data and the game.
- **Overpass usage.** Extracts were fetched with a few small queries and are checked in, so the game and
  rebuilds never query live services, in line with the provider's usage policy.
