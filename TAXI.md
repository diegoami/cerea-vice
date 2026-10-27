# Cerea taxi shift

Cerea Centro now plays as a taxi shift. Collect a passenger, read their destination request, drive there using signs and the atlas, stop and complete the fare. Dispatch then gives you another customer. The original Harbor District journey is still selectable.

## Your working day

- Start at **07:00**, beside the Municipio. Dispatch offers a randomized pickup and destination.
- The clock advances at 30 game seconds per active simulation second: a 07:00–17:00 shift lasts about **20 active minutes**.
- Pause screens and atlas reading freeze the clock and the current ride's bonus timer.
- The sky and daylight change as the working day progresses.
- At **17:00**, the shift ends and shows earnings, completed rides, speed bonuses, collisions and information requests.
- A passenger still aboard at closing time has not completed the fare and does not pay. Start another shift to try for a higher total.

## Collecting and delivering

1. At a full stop, read the dispatch offer: passenger, pickup, destination and guaranteed pay. Reading pauses the clock.
2. **A / Enter** accepts. **B / Backspace** declines and immediately offers another reachable pair, without a penalty or earnings. **Start / Escape** opens the pause/save menu.
3. Find the accepted passenger's named pickup stop. Waiting people appear at all stops without highlighting your goal.
4. Stop fully inside the marked area, then use passenger service (**A / Enter** by default) to collect them. They leave the pavement and sit beside you; look right to see them.
5. Reach their destination, stop in its named area and confirm passenger service again. The seat clears, the fare pays and dispatch offers another trip.
6. Keep working until 17:00. A fresh shift uses a different random sequence; loading a save preserves its existing sequence.

Passenger service (A / Enter by default) confirms only when you are stopped at the current goal; it does not request directions. **View / Select (PS Share) / F** remains the information control on the road and in the atlas. **Y / Triangle / T** opens the atlas while stopped. **B / Circle / R** switches forward/reverse while stopped; LT remains brake only and RT accelerates in the chosen gear.

Pickup and dropoff do not move the atlas position marker. It still changes only when you ask for information or place your own estimate. When a goal changes, old route instructions are cleared while your marked position is retained.

## Game fares and speed bonuses

A completed ride pays:

- **Guaranteed fare:** €4.00 plus €1.20 per kilometre of the planned directed road route, plus €25 per kilometre beyond the first kilometre. A long collection journey also adds €25 per kilometre beyond its first kilometre, quoted from your stopped location when the offer opens. Collection supplements pay only when you complete the fare.
- **Speed bonus:** up to €6.00, decreasing linearly with active ride time.
- **Slow arrival:** still pays the base fare, even when its bonus reaches zero.

The ride's bonus budget is the larger of 100 seconds and `90 + route distance in metres / 4.5`. The remaining bonus is `€6 × max(0, 1 − active ride time / budget)`, rounded to cents. This is a prototype scoring rule, adjustable in the district's taxi data, rather than a real taxi tariff.

The bonus clock begins when the passenger boards. Travelling to a pickup uses shift time. Long collection journeys contribute to the quoted guaranteed payment, but pay nothing until dropoff. The quote is fixed when shown and retained by save/load; taking a detour cannot increase it. The dashboard shows total earnings, completed fares and the base/remaining bonus for the passenger aboard. Planning with the atlas is free of timer pressure; learning shorter routes and recovering from wrong turns faster raises the score.

## Places to learn

The expanded modern-map subset has **51 named streets** and **nine taxi stops**:

- Municipio di Cerea
- Ufficio Postale di Cerea
- San Zeno in Santa Maria Assunta
- Oratorio dello Spasimo
- Teatro del Gusto
- Cinema Principe
- Cinema Mignon
- Scuola Olga Visentini
- Biblioteca di Cerea

Passenger names come from the authored roster. Pickup/destination pairs are drawn
from all reachable distinct stops, avoiding immediate repetition of the same
pair when alternatives exist. The seeded authored sequence remains available
to unit-test fixtures for repeatable route and payout comparisons, while normal
play uses fresh dispatch randomness.

The map now extends farther south and east, including the post office and the Oratorio dello Spasimo area, plus additional streets north and west. All taxi stop pairs have finite directed road routes. Pickup areas are game placements near mapped places, not claims about real taxi ranks or parking permissions. See [map sources and layout](MAPS.md) and [source details](data/README.md).

Presentation options never change fares, clocks, stopping areas or passenger-service rules. Sound fades out while the atlas or pause screen freezes the shift.

The district context now owns indexed queries and the directed route graph.
The route implementation changes in B preserve the old paths, route costs and
speed-bonus accounting; all stop pairs are compared with exhaustive Dijkstra.
Rendering-origin shifts affect neither service bays nor atlas knowledge. B adds
no fares, stops or towns. See [scalability notes](docs/SCALABILITY.md).

## Optional outskirts feasibility journey

The separate **Cerea outskirts prototype** adds a fictional test hamlet to the
real city subset, with ten stops and a twelve-name passenger roster.
Its hamlet participates in randomized offers in both directions.
The added countryside/street names are labelled fictional; the default real
Cerea shift is unchanged.

The fare/bonus formula uses the complete directed detailed route distance,
even when navigation uses a coarse next-town plan. A loading pause freezes car
and shift/bonus time. Atlas reading still freezes time; loading, crossing a
tile/region boundary and serving passengers never relocate its knowledge marker.
See [the prototype report](docs/TILED_PROTOTYPE.md) for scope and measurements.

## Saving a shift

The briefing and pause menus include **Continue saved shift**; the pause menu
also enables **Save shift**. One manual slot per district stores the car and
gear, timers, earnings and receipts, information counts, offer/ride and dispatch
random state, and the atlas cursor/marker/source. Saves load paused, and local
scenery must be ready before simulation can resume. Starting another shift does
not overwrite a save. Unavailable storage, corrupt saves and incompatible maps
produce a status message while preserving the current game and stored data.

Windows uses `%LOCALAPPDATA%\CereaVice\profile` for both WSL-launched and portable
builds. Removing the launcher's temporary bundle does not remove progress.
Control and presentation settings persist separately from the manual shift slot.
See [playtest changes and validation](docs/PLAYTEST_IMPROVEMENTS.md).
