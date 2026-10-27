# Cerea taxi shift

Cerea Centro now plays as a taxi shift. Collect a passenger, read their destination request, drive there using signs and the atlas, stop and complete the fare. Dispatch then gives you another customer. The original Harbor District journey is still selectable.

## Your working day

- Start at **07:00**, beside the Municipio. Your first passenger is **Elena**.
- The clock advances at 30 game seconds per active simulation second: a 07:00–17:00 shift lasts about **20 active minutes**.
- Pause screens and atlas reading freeze the clock and the current ride's bonus timer.
- The sky and daylight change as the working day progresses.
- At **17:00**, the shift ends and shows earnings, completed rides, speed bonuses, collisions and information requests.
- A passenger still aboard at closing time has not completed the fare and does not pay. Start another shift to try for a higher total.

## Collecting and delivering

1. Find the current passenger's named pickup stop. Static waiting figures appear at all stops, so they do not identify the active pickup.
2. Stop fully inside the marked stopping area, then press **A / Cross / Enter** to collect them.
3. Read the passenger's request and street name in the objective and taxi radio message.
4. Reach that destination, stop in its named area and press **A / Cross / Enter** again.
5. Read the payout and the next pickup from dispatch. Keep working until 17:00.

A / Enter confirms passenger service only when you are stopped at the current goal; it does not request directions. **View / Select (PS Share) / F** remains the information control on the road and in the atlas. **Y / Triangle / T** opens the atlas while stopped. **B / Circle / R** switches forward/reverse while stopped; LT remains brake only and RT accelerates in the chosen gear.

Pickup and dropoff do not move the atlas position marker. It still changes only when you ask for information or place your own estimate. When a goal changes, old route instructions are cleared while your marked position is retained.

## Game fares and speed bonuses

A completed ride pays:

- **Base fare:** €4.00 plus €1.20 per kilometre of the planned road route between pickup and dropoff.
- **Speed bonus:** up to €6.00, decreasing linearly with active ride time.
- **Slow arrival:** still pays the base fare, even when its bonus reaches zero.

The ride's bonus budget is the larger of 100 seconds and `90 + route distance in metres / 4.5`. The remaining bonus is `€6 × max(0, 1 − active ride time / budget)`, rounded to cents. This is a prototype scoring rule, adjustable in the district's taxi data, rather than a real taxi tariff.

The bonus clock begins when the passenger boards. Travelling to a pickup uses shift time, but pays no fare by itself. The dashboard shows total earnings, completed fares and the base/remaining bonus for the passenger aboard. Planning with the atlas is free of timer pressure; learning shorter routes and recovering from wrong turns faster raises the score.

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

The first trip takes Elena from the Municipio to the post office. Later passengers take you between the cinemas, church, school, restaurant, oratory and other stops. Ten authored customer requests cycle if you are fast enough to complete them all before closing, giving a repeatable basis for comparing shift scores.

The map now extends farther south and east, including the post office and the Oratorio dello Spasimo area, plus additional streets north and west. All taxi stop pairs have finite directed road routes. Pickup areas are game placements near mapped places, not claims about real taxi ranks or parking permissions. See [map sources and layout](MAPS.md) and [source details](data/README.md).

Presentation options never change fares, clocks, stopping areas or passenger-service rules. Sound fades out while the atlas or pause screen freezes the shift.

The district context now owns indexed queries and the directed route graph.
The route implementation changes in B preserve the old paths, route costs and
speed-bonus accounting; all stop pairs are compared with exhaustive Dijkstra.
Rendering-origin shifts affect neither service bays nor atlas knowledge. B adds
no fares, stops or towns. See [scalability notes](docs/SCALABILITY.md).

## Optional outskirts feasibility journey

The separate **Cerea outskirts prototype** adds a fictional test hamlet to the
real city subset, with an outbound passenger from Municipio followed by a
return fare, then the existing requests. It has ten stops and twelve requests.
The added countryside/street names are labelled fictional; the default real
Cerea shift is unchanged.

The same fare/bonus formula uses the complete directed detailed route distance,
even when navigation uses a coarse next-town plan. A loading pause freezes car
and shift/bonus time. Atlas reading still freezes time; loading, crossing a
tile/region boundary and serving passengers never relocate its knowledge marker.
See [the prototype report](docs/TILED_PROTOTYPE.md) for scope and measurements.
