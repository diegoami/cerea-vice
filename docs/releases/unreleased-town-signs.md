# Unreleased: town wayfinding and traffic recovery

Regional direction boards now lead with town names and physical turn arrows on
blue boards, instead of large green street-name lists with small town subtitles.
They reuse existing clear roadside sites. Their directions follow the full mapped
one-way graph, including across the joined world; they never depend on a fare or
the player's objective. At crossings, several destinations share a board, up to
5.6 m wide where the existing site clears streets and buildings. Towns reached by turning back along the approach are not
signed on a different exit. No external destinations or distances are invented.
The demo starts in High picture mode, up to the existing display/HiDPI, 4K and GPU
limits, without overwriting the player's saved picture preference. Instructions
and normal play return to that preference.

Street names remain on the existing small name plates. Within a single-city map,
only occasional compact local landmark boards remain at main-road junctions:
London keeps 12 of its former 116 directional boards, at at most 2.2 m wide instead
of 4.2 m. Town, gateway, parking and facade signs remain intact. Signed manifests,
source tiles and save signatures are unchanged.

Ambient cars no longer park in place after ten seconds without progress or at a
dead end. They check lane clearance before selecting roads, choose continuations,
reverse at settled stops and retry or turn around where legal. They can pull onto
a clear shoulder using ordinary driving, wait entirely clear of the carriageway,
then rejoin after the taxi passes. Ordinary oncoming traffic in its own lane does
not pull aside merely because the taxi is nearby. Steering changes gradually and
cars slow before bends. Where no shoulder fits, they yield temporarily
and continue recovering; physically blocked traffic still has to wait for space.
There is no visible despawn or position reset to clear a blocked car. The demo's
collision prediction now covers reversing and low-speed obstruction contacts too.
The demo follows the correct driving lane (including left-side maps), maintains a
gap behind slower traffic, overtakes on a clear straight with a predicted return
gap, and tries a clear road-edge/verge bypass after a short
blockage. Grass already uses the normal slower driving physics; buildings, water
and other vehicles remain solid. The enlarged taxi safety reservation permits a
traffic car to move out of it, avoiding a mutual deadlock without permitting its
body to rotate into the taxi.

Focused evidence includes directed-sign tests for unreachable towns and misleading
dead-end exits, unchanged map/tile signatures, circulation after a temporary
obstruction, shoulder clearance and rejoining. The sustained traffic test now runs
30 simulated minutes and requires paid local/inter-town work, over 17 km, no
60-second stall and zero collisions; the latest run completed eight fares over
19.49 km, completing two overtakes, with a maximum 20 seconds without progress. Focused tests cover both driving sides,
passing parked cars, using a clear verge, following a moving car, overtaking and
returning to lane, refusing an unsafe pass, and escaping the
taxi's safety buffer. Physical device
testing and an overnight unattended traffic soak remain untested.

The reported square failure on San Filippo Neri → Municipio di Bovolone is fixed.
A synthetic lane-orientation point was being used as a destination behind the
taxi, including at a one-way entry. It now only defines the approach orientation.
Both starting directions deliver the passenger, replacing 21–26 reversing
recoveries without delivery in six minutes with completion in 43–74 seconds.
Collision prediction includes the rendered bonnet and cabin, permits retreat
from an existing close approach, tests straight/opposite reverse steering, and
matches the current speed setting. A recovery ray ending inside a building can
search out to its clear nearby waypoint (at most 72 m), without pose resets.
Regressions keep the vehicle out of building solids and preserve courtyard holes.
