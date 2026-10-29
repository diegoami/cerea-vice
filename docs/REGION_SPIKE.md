# Region spike: Legnago, Sanguinetto and the corridors between the towns

Issue #32, run 2026-10-29. A measurement, not a shipped town: nothing here changes the game, and the
generated maps are not checked in. The numbers decide the presets and budgets (#24), the compression
mapping (#40) and the first region (#41). Design: [TOWNS.md](TOWNS.md).

## What was run

- **Data.** Three Overpass queries, OSM data timestamp 2026-10-29T09:59:35Z:
  - Legnago, about 3 km² (45.1847–45.2003 N, 11.3001–11.3221 E), 3.9 MB, and Sanguinetto, about 1 km²
    (45.1777–45.1867 N, 11.1453–11.1581 E), 0.9 MB: highways, buildings and building relations,
    waterways, railways, water areas, `area:highway`, and amenity, tourism, historic and leisure features.
  - The region's places and `trunk`/`primary`/`secondary`/`tertiary` roads in 45.14–45.29 N,
    11.03–11.34 E, 2.2 MB.
- **Towns.** `tools/import-town.py` on unchanged code (fixed road widths, the local frame), with spike
  specs in `tools/region-spike/specs/`. Their landmarks and stops were picked from the suggestion ranking
  only to make the build run; they are **not confirmed stops**.
- **Measurements** use the game's own `District` and routing code where possible
  (`tools/region-spike/measure.ts`, `gaps.ts`) and Python for the region (`region_distances.py`,
  `spike_warp.py`, `spike_corridors.py`).

## Towns

| | Cerea (today) | Sanguinetto | Legnago |
| --- | ---: | ---: | ---: |
| Area | about 1.1 km² | about 1 km² | about 3 km² |
| Import time | 14 s | 7 s | 42 s |
| District file | 477 KB | 374 KB | 1,434 KB |
| Streets (unique names) | 51 | 30 | 130 |
| Road segments | 583 | 246 | 1,773 |
| Building masses kept | 1,081 | 1,085 | 3,193 |
| Footprints trimmed / removed | 137 / 5 | 69 / 2 | 782 / 16 |
| Footprint area removed by clearance | 7.3% | 14.6% | 10.5% |
| Stop pairs reachable (directed, one-way tags) | 72 / 72 | 30 / 30 | 56 / 56 |
| `District` construction | 17 ms | 5 ms | 20 ms |
| Plate textures, worst case | about 51 MiB | about 30 MiB | about 130 MiB |

All three validate and route without changes. Legnago is about three times Cerea in buildings, segments
and file size, and needs 42 s to import.

**Façade gaps**, sampled at three points per segment against the *original* footprints, before clearance:

| | 10th percentile | Median | Under 11.2 m (today's 8 m road + verges trims) | Under 2.8 m | Under 2.1 m |
| --- | ---: | ---: | ---: | ---: | ---: |
| Cerea | 17.2 m | 34.4 m | 3.1% | 0% | 0% |
| Sanguinetto | 18.4 m | 31.8 m | 3.6% | 0% | 0% |
| Legnago | 13.0 m | 33.0 m | 7.8% | 0% | 0% |

These are plain towns, not medieval centres: no street is narrower than 2.8 m, so width fitting (#25,
"Road width and drivability") never has to choose between trimming and excluding a street here, and no
passage is too narrow for the car. Fitting still matters on the minority of narrow streets: Legnago has
eight named streets with a gap under 4.5 m (Vicolo Pietà, Via Carlo Rosselli, Via Monache, Via San
Martino, Via Borgo Bello, Via Carceri, Via Fiume, Vicolo S. Martino), and the 10.5% of footprint area
Legnago loses today is concentrated there and along the main roads.

**What "every named street is drivable" brings in**, beyond the pedestrian streets the design expected:
- Legnago: 58 segments of named pedestrian ways (Via Duomo, Via Fiume, Galleria Risorgimento and others),
  four named pedestrian squares tagged `area=yes` (Piazza Giuseppe Garibaldi, Piazza della Libertà,
  Piazza San Martino, Piazza della Costituzione), **80 segments of named cycleways** (Ciclovia
  Treviso-Ostiglia, Ciclabile del Bussè, Via del Geniere), and named service roads.
- Named roads tagged `motor_vehicle=no` (8 in Legnago), `motor_vehicle=destination` (4) or `permit` (1).
- Today's importer turns each square into a road segment along its outline, not a paved area.

**Water and buildings.** Legnago has the Adige (two named river ways), the Bussè, five water areas and
named road bridges (Ponte Principe Umberto among them). Courtyard buildings are rare: 7 building
relations with 8 inner rings in Legnago, 1 in Sanguinetto, none in Cerea.

**Landmark suggestions** ranked by tags: Legnago 27 candidates (Comune di Legnago, Teatro Salieri,
Biblioteca Bellinato-Fioroni, Chiesa di San Martino Vescovo, Museo Fondazione Fioroni, Torrione, Poste,
Cinema Teatro Salus and others); Sanguinetto 6 (Chiesa di Santa Maria delle Grazie, Chiesa di San
Giorgio Martire, Municipio, Castello Scaligero, Poste, Teatro Comunale).

## Corridors and compression

Real road distances over the region's main roads, and drive times at 17 m/s (the car's paved top speed is
about 20 m/s), uncompressed and with the corridor model below:

| Pair | Real km | Real min | k = 0.6 km | k = 0.6 min | k = 0.7 min |
| --- | ---: | ---: | ---: | ---: | ---: |
| Cerea – Casaleone | 3.6 | 3.5 | 2.3 | 2.3 | 2.6 |
| Casaleone – Sanguinetto | 5.2 | 5.1 | 3.4 | 3.3 | 3.7 |
| Cerea – Sanguinetto | 5.9 | 5.8 | 3.9 | 3.8 | 4.3 |
| Nogara – Sanguinetto | 7.6 | 7.5 | 4.7 | 4.6 | 5.3 |
| Legnago – Cerea | 8.4 | 8.2 | 5.2 | 5.1 | 5.9 |
| Cerea – Bovolone | 10.6 | 10.4 | 6.4 | 6.3 | 7.3 |
| Bovolone – Sanguinetto | 10.8 | 10.6 | 6.5 | 6.4 | 7.4 |
| Legnago – Casaleone | 11.4 | 11.2 | 7.0 | 6.8 | 7.9 |

**The 2D warp in the design does not work for this region.** Mapping every point with rigid town zones,
a contraction between them and smoothstep transition bands (`spike_warp.py`) either folds the plane or
makes the bands of close towns overlap, at every setting tried:

| k | Band | Minimum Jacobian (folds if ≤ 0) | Zone and band overlaps |
| --- | ---: | ---: | --- |
| 0.6 | 400 m | −0.65, near Legnago | Cerea–Casaleone 236 m |
| 0.6 | 800 m | −0.17 | Cerea–Casaleone, Casaleone–Sanguinetto |
| 0.6 | 1600 m | 0.02 | three pairs, up to 2.6 km |
| 0.75 | 800 m | 0.19 | Cerea–Casaleone 645 m |
| 0.75 | 1600 m | 0.28 | three pairs |

A narrow band must absorb about (1 − k) × zone radius of offset, which for Legnago's 870 m zone is
350–500 m over 400 m and folds; a wide band reaches the neighbours. Cerea and Casaleone are only 2.6 km
apart.

**A corridor model does** (`spike_corridors.py`). Only the corridor roads are mapped, not the plane:
- Town zones move rigidly to `C + k (c − C)`; corridor junctions outside towns (2 in this network)
  become tiny rigid zones placed the same way.
- Each chain of road between two fixed points is mapped by one similarity transform (scale and turn) that
  takes its two real ends to their new positions, so its shape is kept.
- The countryside between corridors is generated filler, not warped real geometry.

At k = 0.6 and 0.7, over the 1,862 corridor segments: no new road crossings, no overlapping town zones,
town-to-town bearings within 0.4° (snapping to road nodes), and the drive times above. The compressed
region is about 13.5 × 7.6 km, about 1,700 tiles of 250 m in its bounding box, most of them countryside.

## Conclusions

1. **Use the corridor model, not the 2D warp, for #40.** It passes every check here; the warp cannot.
2. **k = 0.6** meets "about 5 minutes between neighbouring towns" best: Cerea–Legnago 5.1 min,
   Cerea–Bovolone 6.3, Nogara–Sanguinetto 4.6. The closest pairs drop to 2–4 minutes because they are
   close in reality. Confirm with in-game timing in #41.
3. **Budgets for #24** (single-file `town` preset): up to about 1.5 MB of district JSON, 3,200 building
   masses and 130 street names worked here; plate memory is the first limit to watch (about 130 MiB worst
   case for Legnago), then import time (42 s).
4. **Width fitting** is needed on a minority of streets only; no exclusions are needed in these towns.
5. **Paved squares, water areas and bridges** are needed for Legnago, as the design said; courtyard
   relations are rare here.
6. **The region needs the general tiler and paged collision (#29)**: about 1,700 tiles.

## Decisions for the owner

- **Cycleways and paths.** "Every named street is drivable" also makes 80 segments of named cycleways
  and nature paths drivable in Legnago (Ciclovia Treviso-Ostiglia, Ciclabile del Bussè, Percorso La
  Verbena). Recommended: keep pedestrian streets and squares drivable as decided, but leave named
  cycleways, footpaths, tracks and paths as non-drivable scenery with their names.
- **No-motor-vehicle tags.** 8 named roads in Legnago are tagged `motor_vehicle=no` (others
  `destination` or `permit`). Recommended: treat them like pedestrian streets (drivable), since the rule
  is "every named street", and record them in the report.
- **Distance signs** between towns: driven distance (recommended) or real kilometres (still open).

## Reproducing

Fetch the three extracts with the queries above into `data/region-spike/` (ignored), then:

```sh
python3 tools/import-town.py tools/region-spike/specs/legnago.town.json
python3 tools/import-town.py tools/region-spike/specs/sanguinetto.town.json
python3 -I tools/region-spike/profile_extract.py data/region-spike/legnago.json data/region-spike/sanguinetto.json
node --import tsx tools/region-spike/measure.ts legnago=test-results/region-spike/legnago.json sanguinetto=test-results/region-spike/sanguinetto.json
node --import tsx tools/region-spike/gaps.ts legnago=tools/region-spike/specs/legnago.town.json=test-results/region-spike/legnago.json
python3 -I tools/region-spike/region_distances.py data/region-spike/region-main-roads.json
python3 -I tools/region-spike/spike_warp.py data/region-spike/region-main-roads.json 0.6 400
python3 -I tools/region-spike/spike_corridors.py data/region-spike/region-main-roads.json 0.6
```

The spike specs write to `test-results/region-spike/` (ignored) and do not touch the registry, because
their output is not a district in `public/maps/`.

Not measured here: anything on Windows (load time, memory, frame time), physical controllers, and how
the compressed drive feels. Those belong to #41.
