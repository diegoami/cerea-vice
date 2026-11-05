# Driving the autonomous taxi

The opening driver in #124 used seven discrete steering choices and predicted
1.2 seconds of motion toward a single junction point. Its speed target was capped
at 7 m/s (25 km/h). That combination repeatedly corrected between steering choices,
braked for individual nodes and lacked the road shape beyond the next point.
Its recovery timer also ran while braking and waiting to select reverse, leaving
less time for the manoeuvre itself.

The replacement follows the road polyline with continuous pure pursuit. Lookahead
grows from 5 to 16 metres with speed. Steering uses the actual car's speed-dependent
curvature and changes smoothly. The speed plan looks 120 metres ahead, brakes for
bends and service bays, and targets up to 47 km/h on ordinary streets, 61 km/h on
primary/secondary roads and 29 km/h on service/pedestrian streets. These are bot
targets, not changes to player handling or game traffic rules. Actual physics,
road/grass resistance, collisions and boarding holds still apply.

A short collision prediction brakes for unexpected obstructions. Lack of route
progress still triggers bounded local replanning. Recovery now has explicit phases:
brake and settle, select reverse, back up with a distance/time limit, brake and
settle, then select forward. A planned three-point turn can begin immediately when
a stationary taxi faces away from its route. It does not need to drive in circles
first. No recovery changes the car's pose.

## Measurements

All comparisons use the actual car, parking and mission updates at 60 Hz, production
collision geometry, dispatch seed 683129967 and the same initial pose. The old
measurements are from the opening implementation at 8430045. A moving sample means
speed above 1 m/s. A large steering change means a command delta above 0.2 between
moving samples; this measures the visible correction pattern rather than counting
small continuous corrections as errors.

| 180-second route | Old distance | New distance | Old moving mean | New moving mean | Old/new large steering changes | New collisions |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Cerea | 792 m | 1,992 m | 17.0 km/h | 45.5 km/h | 473 / 6 | 0 |
| Lower plain | 929 m | 2,693 m | 19.2 km/h | 55.8 km/h | 409 / 0 | 0 |
| Verona–Oppeano | 834 m | 1,664 m | 17.2 km/h | 34.6 km/h | 469 / 3 | 0 |

Cerea completed two fares in that time instead of one. The new driver spent about
6 seconds in reverse there and none in reverse on the other two samples. A full
1,200-second run on the unified world completed seven fares, covered 14.84 km and
averaged 48 km/h while moving, with zero collisions. It selected four local and
four inter-town fares (one remained unfinished at closing), and spent 35.7 seconds
in reverse. These are deterministic checks, not a claim about every seed or town.

Reproduce the new measurements with:

```sh
node --import tsx tools/benchmark-demo.ts
node --import tsx tools/benchmark-demo.ts veronese --seconds=1200
```

The benchmark does not perform showcase jumps: it measures uninterrupted driving.
Tests additionally require sustained paid work, a completed delivery past a permanent
obstruction, recovery from an enclosure, legal settled gear changes, useful urban
speed, bounded reverse duration and fewer large steering changes. Physical controller
handling is separate; the bot does not change the player's inputs or car physics.

## Town showcase and dispatch

The unified world samples a town uniformly, then one of that town's real taxi
landmarks for each fresh start. It does not mutate the signed map spawn. The atlas
starts without a marker and opens around the starting area; only asking for
information or placing an estimate supplies a marked position.

Each dispatch list contains two local and two inter-town jobs, with pickups in the
current town. One inter-town offer serves a nearby town and the other may serve any
other town, including across the old region boundary. Quotes include normal distance
pay plus an explicit €12 inter-town premium. The bot alternates local/inter-town
choices and favours practical collection and delivery distances within that type.
Quotes, dispatch state, boarding and cross-town rides use the existing save format.

Only the demo jumps after three paid jobs. It waits for the passenger to finish
walking away, chooses a different town/landmark, and retains time, earnings, receipts
and statistics. It never jumps with a booked passenger or while rules are open.
Player sessions never jump. This is the owner's requested showcase exception to
ordinary movement; collision recovery continues to use driving and reversing.

## Verification for this change

On 2026-11-05, `npm ci`, `npm run build` and the full `npm test` run passed
(182 tests at that run). Final focused domain runs also passed the subsequently
added cases: small-town board quotas, hidden legacy gateways, waiting for the third
passenger's exit before dispatch, and excluding the actual arrival town from the
showcase jump. The final game/unified-map run passed 18 tests, including arrival-town exclusion after inter-town travel.

The unified town doctor passed all 4,692 directed stop pairs, 69 accessible bays,
24,901 building clearances, and 386,141 road-centreline samples. Its texture budget
model found at most 332 nearby street names, about 83 MiB of street-name textures.
The source maps' existing notes remain: 38 junction arms without a name plate and
one Verona bay without room for a P sign. These checks do not move any source data.

The full Xvfb/xfwm4 desktop run passed 19/22 initially. Correcting legacy-test
navigation/build metadata and restoring the hidden-map catalogue for old gateway
loads resolved the three failures. A serial five-case rerun passed opening,
controller driving, map visibility/error recovery, main-screen return and gateway
crossing; together the runs cover all 22 cases. The production Chromium check
passed the unified default, mixed labelled fare lists, quote layout at 960×640,
save/load, held input, controller-only opening, touch scrolling and fresh handoff.

Windows x64 packaging and a native isolated-profile opening check passed. Two Verona
samples measured 16.7–17.2 ms mean frame time (about 58–60 fps), 16.9 ms p95 and
173–194 MiB of JavaScript heap. The final sample started at Torre dei Lamberti. These are a short hardware sample, not total process/GPU memory
or a full-world soak test. Physical controller/touch-device play, a full manual
Windows shift, and exhaustive unattended runs over every seed remain owner checks.


## Continuous service and a small traffic population

The 17:00 cutoff is removed for the default world and newly authored continuous maps.
The reported Casaleone post office route is regression-tested across its former
closing boundary and completes normally. Old completed-shift saves resume as active
without resetting their clock, receipts, car, atlas or booked ride. Legacy fixtures
retain their old schedules for compatibility.

Ambient traffic is capped at three cars, follows directed access and the map's
left/right driving side, yields to the taxi, stays out of service bays and uses
normal collision queries. A reserve around the taxi and a final vehicle-body check
prevent an NPC from rotating into it and boxing it in. The regression simulates ten
minutes of paid work with traffic rather than treating wheel movement as progress.
In a seeded twenty-minute traffic run the taxi completed six fares, covered about
14.36 km and recorded zero collisions. These numbers are separate from the earlier
traffic-free comparisons above.

Sleep is voluntary for players, available through pause only while fully stopped
and unbooked. It advances eight hours, preserves position/money/knowledge, and leaves
the player paused. The bot may rest at night between jobs; discrete dispatch/boarding
is frozen during sleep as well as driving. Neither sleeping nor the calendar resets
progress. Celestial movement and scenery are presentation, without GPS assistance.
