# Player-visible text audit (issue #19)

Owner request: remove text that is only prose and is not needed to play. Kept:
controls and prompts (with the active bindings), fares and pay, street, place
and sign names, the clock and earnings, passenger requests, the compass,
rule-bearing text and necessary state or error messages.

Decisions: **KEEP**, **CUT** (removed), **SHORTEN** (reworded, information
kept) and **OWNER** (borderline; left unchanged pending the owner's decision).
"Bindings" means the text is built from the player's active bindings.

Map data (`public/maps/*.json`: mission names, objectives, hints, place,
stop and passenger names) is unchanged. The save signature hashes the whole
district definition, so editing that text would make every existing save
"belong to an older map".

## HUD (`src/ui/Hud.ts`)

| Surface | Current text (summary) | Decision | Reason |
| --- | --- | --- | --- |
| District tag | district name | KEEP | Where you are playing |
| District tag subtitle | `REAL CEREA / FICTIONAL TEST LINK`, `FICTIONAL PROTOTYPE` | KEEP | Labels fictional streets as fictional |
| District tag subtitle | `REAL STREETS / MODERN MAP` (Cerea Centro) | OWNER | Says the streets are real; not needed to play |
| Compass | heading letters and degrees | KEEP | Game rule |
| Deadline label | `TIME TO ARRIVE` / `SHIFT 07:00–17:00` | KEEP | Labels the clock |
| Objective eyebrow (Harbor) | `01 / THE DRIVE` | SHORTEN → `OBJECTIVE` | "01 / THE DRIVE" is chapter flavour |
| Objective eyebrow (taxi) | `TAXI / FREE DRIVING`, `COLLECT PASSENGER`, `PASSENGER BOARDING`, `PASSENGER ABOARD` | KEEP | Ride state |
| Objective title | `Free driving · O requests fares`, `Collect Elena at …`, `Elena → …` | KEEP | Goal, bindings |
| Objective description | mission objective (see Mission) | see Mission | |
| Taxi status | `€x earned · n fares · base €y + speed bonus €z` | KEEP | Earnings and pay |
| Radio header | `LOCAL DIRECTIONS` / `TAXI RADIO` / `MISSION REMINDER` | KEEP | Says where the message comes from |
| Radio header | `NO SIGNAL REQUIRED` | CUT | Flavour |
| Mission reminder (taxi) | objective + `Shift: 09:12 / 17:00. Earned €x from n fares.` | SHORTEN | Earnings and fare count are always on the taxi status line; objective and clock kept |
| Mission reminder (Harbor) | objective + time remaining or "deadline has passed; finish the drive for a late-arrival result" | KEEP | Documented purpose; late-arrival rule |
| Speed, gear, stop state | `KM/H`, `D`/`R`, `P · LEGAL STOP`, `STOPPED · ALLOWED`, `STOPPED · UNSAFE`, `SETTLING`, `ON THE MOVE` | KEEP | State |
| Dashboard badge | `CEREA / 1986` | CUT | Decoration; the in-scene dashboard already carries it |
| Dashboard device | `● Controller connected`, `Keyboard controls`, `Keyboard · controller restricted` + tooltip | KEEP | Input state |
| Dashboard | `ESC / START  PAUSE` | KEEP | Control (pause is not remappable) |
| Prompt, stopped | `<key> Collect Elena`, `Complete fare`, `Request fares` / `Show fare list`, `Ask for information`, `Atlas`, `Select reverse/forward`, `· stopping allowed` | KEEP | Bindings and state |
| Prompt, moving | `Stop fully to request fares, read the atlas or ask for directions` | KEEP | Stopped-only rule |
| Prompt, boarding | `Elena is getting in · stay stopped` | KEEP | Rule |
| Map credit | OSM attribution | KEEP | Licence |
| Controls table | action / controller / keyboard rows | KEEP | Bindings |

## Briefing (`src/ui/Hud.ts`)

| Surface | Current text | Decision | Reason |
| --- | --- | --- | --- |
| Eyebrow | `CEREA VICE / A DRIVING EXPERIMENT` | SHORTEN → `CEREA VICE` | Tagline |
| Heading | `A place. A deadline. Your own way.` | SHORTEN → `Taxi shift 07:00–17:00` / `Find Blue Hotel` | Tagline replaced by the goal |
| Intro (taxi) | `Collect passengers, learn the streets and see how much you can earn before 17:00.` | SHORTEN → `Collect passengers and earn as much as you can before 17:00.` | Goal kept, flavour cut |
| Intro (Harbor) | `No familiar streets. Just a compass, a few signs, and the road ahead.` | SHORTEN → the mission objective (`Reach the Blue Hotel in Waterfront and stop in its marked forecourt.`) | Flavour replaced by the goal |
| Start button | `Start the engine >` | KEEP | Control |
| Button note | `A / ENTER TO START · 07:00–17:00 TAXI SHIFT` | SHORTEN → `A / ENTER TO START` | Shift hours are now the heading |
| Button note (Harbor) | `A / ENTER TO BEGIN · 3 MINUTE DRIVE` | KEEP | Duration |
| Side heading | `Drive a taxi in Cerea.` / `Find Blue Hotel.` | CUT | Repeats the main heading |
| Side text (taxi) | `Drive freely. When you want a passenger, stop and press … to compare a list of fares with their guaranteed pay, accept one, then collect your passenger at a full stop.` | SHORTEN → `When you want a passenger, stop and press … for the fare list and accept one. Stop in the pickup's named bay and press … to collect them, and again at their destination.` | How to work; merges the collect/drop-off sentence from the tip; bindings |
| Side text (Harbor) | mission hint from map data | KEEP | Where the goal is |
| District switch | district buttons; `LB / RB or Q / E: change district before starting.` | KEEP | Control |
| Attribution | district attribution | KEEP | Licence |
| Tip heading (taxi) | `A working day in 20 active minutes.` | SHORTEN → `07:00–17:00 in about 20 active minutes.` | Length of play kept |
| Tip text (taxi) | `Clock: 07:00–17:00. Stop in the named bay and use … to collect or drop off a passenger. Faster rides earn more; slow rides still pay a base fare. The shift clock runs while you drive freely; pausing, reading the atlas or the fare list freezes it.` | SHORTEN → `Faster rides earn a bigger bonus; slow rides still pay the base fare. The clock runs while you drive and stops while paused or reading the atlas or fare list.` | Pay and clock rules kept; clock and service repeated elsewhere |
| Tip `Lost? Pull over.` | `Come to a full stop anywhere. Use … for the atlas, or … for information. Marked P bays are legal stopping places.` | KEEP | Stopping, atlas and information rules; bindings |
| Controller status | `Controller connected · Left stick: steer · RT: accelerate · A / Cross: confirm · View / Select: information.` (`src/input/Input.ts`) | SHORTEN → `Controller connected.` | The controls table beside it lists the active bindings; the fixed list ignored remapping |
| Controller status | restricted / unsupported mapping / `Connect a controller and press any button. Keyboard works immediately.` | KEEP | Necessary state |

## Pause and results (`src/ui/Hud.ts`)

| Surface | Current text | Decision | Reason |
| --- | --- | --- | --- |
| Pause eyebrow | `ENGINE IDLING / TIMER PAUSED` | SHORTEN → `TIMER PAUSED` | State kept |
| Pause heading | `Take a breather.` | SHORTEN → `Paused` | Flavour |
| Pause text | `The district will be here when you’re ready.` | CUT | Flavour |
| Pause button and note | `Back to the road >`, `A / ENTER / START TO RESUME` | KEEP | Control |
| Shift result eyebrow | `17:00 / TAXI SHIFT COMPLETE` | KEEP | State |
| Shift result heading | `You earned €x.` | KEEP | Earnings |
| Shift result text | `n passengers delivered during 07:00–17:00.` | CUT | Repeats COMPLETED RIDES and the clock |
| Shift result stats | total fares, speed bonuses, completed rides, collisions, information requests | KEEP | Results |
| Shift result note | `The passenger still aboard at closing time is not counted as a completed fare.` | KEEP | Pay rule |
| Shift result note | `The shift is over. Try again and use what you remember to earn more.` | CUT | Flavour |
| Shift result button | `Start another shift >`, `A / ENTER TO RESTART AT 07:00` | KEEP | Control |
| Drive result heading | `Found your way.` / `A little behind.` | SHORTEN → `Arrived on time.` / `Arrived late.` | Result kept, flavour cut |
| Drive result text | `You reached the destination before the deadline.` / `You arrived after the deadline. The way here is a little more familiar now.` | CUT | Repeats the heading; flavour |
| Drive result stats | driving time, unsafe stops, collisions, direction / legal / unsafe requests | KEEP | Results |
| Drive result footnote | `Same district. Same destination. Try a different way.` | CUT | Flavour |
| Drive result button | `Take another drive >`, `A / ENTER TO RESTART` | KEEP | Control |

## Fare list (`src/ui/Hud.ts`)

| Surface | Current text | Decision | Reason |
| --- | --- | --- | --- |
| Eyebrow, heading | `TAXI DISPATCH / TIME PAUSED`, `Available fares` | KEEP | State |
| Intro | `Choose one ride, or close the list and keep driving.` | CUT | Repeats the action buttons |
| Intro | `Prices are fixed from where this list was issued; collection supplements and fares pay only on delivery.` | KEEP | Pay rule |
| Offer | passenger; `From` place, street; `To` place, street; `Guaranteed €x (includes €y collection) + up to €6.00 speed bonus` / `Quote pending` | KEEP | Fare and destination information |
| Buttons | `Accept selected · A / Enter`, `New list · Y / N`, `Close list · B / Backspace` | KEEP | Controls (fixed menu controls) |
| Footer | `Up / down, W / S, D-pad or left stick: choose. Closing keeps this list until you accept a fare or ask for a new list; … / … shows it again while stopped. Start / Escape: pause menu and save.` | SHORTEN → `Up / down, W / S, D-pad or left stick: choose. A closed list is kept until you accept a fare or ask for a new one; … / … shows it again while stopped. Start / Escape: pause and save.` | Controls and the kept-list rule kept; bindings |

## Atlas (`src/ui/Atlas.ts`, marker status in `src/ui/Hud.ts`)

| Surface | Current text | Decision | Reason |
| --- | --- | --- | --- |
| Edition line | `CEREA MOTORING ATLAS · MODERN STREETS / RETRO EDITION`, `· 1986 EDITION`, `· MODERN CEREA / FICTIONAL TEST LINK` | SHORTEN → `STREET ATLAS`, plus `· FICTIONAL TEST LINK` on the outskirts prototype | Flavour; the fictional label stays |
| Heading | district name | KEEP | |
| Paused label | `PARKED READING · TIMER PAUSED` | SHORTEN → `TIMER PAUSED` | State kept |
| Tabs | `01 · District map`, `02 · Place index` | KEEP | Navigation |
| Zoom controls | `−`, zoom %, `+`, `Overview` | KEEP | Controls |
| Map labels | street names, place names, `P`, grid letters/numbers, `N` | KEEP | Street-name ownership, compass |
| Information panel | `LAST INFORMATION RECEIVED` + last answer | KEEP | Knowledge |
| Introduction | `Finding your way` / `North is at the top. Zoom: RT / LT, + / − or mouse wheel. Pan: right stick, I J K L or drag the map. R3 / Home restores the overview.` | CUT | The north arrow and the footer show the same; the mouse wheel moves into the footer |
| Key | `Key`, `Road`, `Legal stopping bay`, `Landmark`, `Water` | KEEP | Legend |
| Margin text | `Asking for information updates the marker. Click to mark your estimate; drag to pan. Left stick / D-pad moves the crosshair; A / Enter places it.` | SHORTEN → `The marker moves only when you ask for information or mark your own estimate. Click the map to mark it.` | Knowledge rule and mouse control kept; the rest is in the footer and tools |
| Margin note | `Unsure where you are? Press F or View / Share to ask for information without closing the atlas.` | CUT | Repeats the `Ask for information View / Share · F` button |
| Marker status | `No position marked.`, `Your estimated position · B2`, `Last information received: … · B2`, `Starting position: … · B2` | KEEP | Knowledge state |
| Tools | `Ask for information`, `Mark my position`, `Erase marker` with controls | KEEP | Controls |
| Attribution | district attribution | KEEP | Licence |
| Attribution suffix (Cerea) | `· Modern street subset; simplified scenery and game stopping bays.` | OWNER | Disclaimer that bays are game placements; not needed to play |
| Footer | `LB / RB · Q / E: pages · RT / LT · + / −: zoom` + page controls; `Close atlas` | SHORTEN (adds `wheel`; index page `A / Enter / click: locate`) | Controls absorb the cut introduction and street-index text |
| Index: places table | `Places and parking`, place, street/area, grid, `Legal stopping bay` | KEEP | Places |
| Index: grid note | `Grid letters run west to east; numbers run north to south. Match a place’s reference to the squares on the district map.` | SHORTEN → first sentence only | Compass relationship kept; second sentence explains the obvious |
| Index: street note | `Click a street name to open a detailed view. On controller use the right stick up/down to select a street, then A. Keyboard: I / K, then Enter.` | CUT | Moved into the footer |
| Index: street table | `Street index`, names, grid | KEEP | Street names |
| SVG title/description | screen-reader text | KEEP | Accessibility, not shown |

## Mission notices and objectives (`src/mission/Mission.ts`)

| Surface | Current text | Decision | Reason |
| --- | --- | --- | --- |
| Shift start / after dropoff | `[receipt] 07:00 · Free driving. Stop and request fares when you want a passenger.` | SHORTEN → `[receipt] Free driving. Stop and request fares.` | Clock is on screen; explanation cut |
| Receipt | `Elena: “Thank you!” Fare €x (base €y + speed bonus €z).` | SHORTEN → `Elena: fare €x (base €y + speed bonus €z).` | Payment kept, flavour cut |
| Fare accepted | `Fare accepted. ` + objective | KEEP | State |
| Pickup committed | `Elena has seen the taxi and is coming over. Stay stopped while they get in.` | SHORTEN → `Elena is getting in. Stay stopped.` | Rule kept |
| Boarded | `Elena boarded: “Please take me to Ufficio Postale di Cerea, Via ….” A guaranteed fare plus up to €6.00 speed bonus is available. Stop there and confirm passenger service.` | SHORTEN → `Elena boarded: “Please take me to Ufficio Postale di Cerea, Via ….”` | Passenger request (destination, place, road) complete; pay is on the status line; the objective says where to stop |
| Shift end | `17:00 · Taxi shift complete.` | SHORTEN → `Taxi shift complete.` | Clock on screen |
| Objective, free, no list | `Free driving. Stop and request fares to see available rides.` | SHORTEN → `Free driving. Stop and request fares.` | |
| Objective, free, list kept | `Free driving. 4 fares are listed; stop and request fares to read them again.` | KEEP | Kept-list rule |
| Objective, boarding | `Elena is walking to the taxi. Stay stopped while they get in.` | SHORTEN → `Elena is getting in. Stay stopped.` | Rule kept |
| Objective, ride | `Collect Elena at Municipio di Cerea, Via …. Stop in Sosta Municipio and confirm passenger service.` | SHORTEN → `… Stop in Sosta Municipio.` | The service prompt with its key appears at the stop |
| Fare text (`offerText`, tests only) | journey + guarantee | KEEP | Not shown in game |
| Error strings (`Invalid saved …`) | thrown, never shown | KEEP | Internal |

## Game messages (`src/game/Game.ts`)

| Surface | Current text | Decision | Reason |
| --- | --- | --- | --- |
| Mouse look | `Mouse look could not capture the pointer. …` / `Click the windshield to capture mouse look, …` | KEEP | Error with recovery |
| Graphics | `Graphics context interrupted. Restart the application to continue.` | KEEP | Error |
| Fares refused | `You already have a fare: …` | KEEP | Rule |
| Fares refused | `Come to a complete stop before requesting fares. Hold the handbrake, then press O.` | SHORTEN → `Come to a complete stop before requesting fares, then press O.` | Handbrake advice is explanation; the stop state shows when you are stopped |
| Atlas refused | `Come to a complete stop before opening the atlas. Hold the handbrake, then press T.` | SHORTEN → `Come to a complete stop before opening the atlas, then press T.` | Same |
| Information refused | `Come to a complete stop first. Hold the handbrake, then ask again.` | SHORTEN → `Come to a complete stop first, then ask again.` | Same |
| Scenery loading | `Scenery is still loading. Request fares (O) once it is ready.` | KEEP | State |
| List closed | `Fare list closed; nothing accepted. It stays available while you drive: stop and press O to read it again.` | SHORTEN → `Fare list closed; nothing accepted.` | The objective line already says the list is kept and how to reread it |
| Information, free driving | `[location] No fare booked: stop and request fares when you want a destination.` | SHORTEN → `[location] No fare booked.` | Explanation repeated by the objective |
| Directions | `On …, …, facing …. Continue … to …; turn … onto ….` and Harbor equivalents (`src/navigation/*Navigation.ts`) | KEEP | Navigation information |
| Boarding, gear | `Elena is getting in. Wait until they are seated before moving.` | SHORTEN → `Elena is getting in. Stay stopped.` | Rule kept, same wording as elsewhere |
| Boarding, service | `Elena is getting in. Stay stopped.` | KEEP | |
| Gear | `Reverse selected. RT accelerates; LT brakes.` | KEEP | LT-only-brakes rule; bindings |
| Gear refused | `Stop fully and release the accelerator before switching forward / reverse (B).` | KEEP | Rule; bindings |
| Service | `No passenger booked. Stop and press O to see available fares.`, `Stop in … at …, then press Enter to collect Elena.` | KEEP | Rule; bindings |
| Controller | `Controller disconnected. Reconnect and press A / Cross, or Enter on the keyboard, to resume.` | KEEP | State |
| Scenery status | `Loading scenery… simulation time is paused.` / `Scenery load interrupted. Retrying automatically… time is paused. Restart the application if it persists.` | KEEP | State |
| Save | `Saved 09:12. Continue saved shift restores this district. Starting a new shift keeps the save until you explicitly save again.` | SHORTEN → `Saved 09:12. A new shift keeps this save until you save again.` | Overwrite rule kept; the obvious cut |
| Save failed | `Save failed. Storage is unavailable or full; the previous save has been kept.` | KEEP | Error |
| Load | `No saved shift for this district yet.` | KEEP | State |
| Load | `Loaded 09:12. Paused; resume when ready.` | SHORTEN → `Loaded 09:12. Paused.` | |
| Load failed | `Could not load this save: it is unavailable, damaged or belongs to an older map. Your current shift and stored save have been kept.` | KEEP | Error |
| Menu actions | `Change controls`, `Save shift`, `Continue saved shift` | KEEP | Controls |

## Settings and controls (`src/presentation/Settings.ts`, `src/input/ControlsPanel.ts`)

| Surface | Current text | Decision | Reason |
| --- | --- | --- | --- |
| Settings header and help | `PICTURE & SOUND`, `D-pad: select · A: change · Start: drive`, keyboard line | KEEP | Controls (file left untouched: other branches change it) |
| Settings options | Scenery, Picture, Cockpit motion, Volume, Radio and their values | KEEP | Settings |
| Controls intro | `Driving bindings only. Atlas and menus keep their own controls. Sticks steer/look; Start and Escape always pause. D-pad selects; A edits. B closes.` | KEEP | Which controls can change; panel controls |
| Controls default status | `Select a binding. L3 is available for forward / reverse.` | SHORTEN → `L3 is free for forward / reverse.` | The first sentence explains the obvious |
| Controls messages | capture, invalid key, conflict, saved, defaults restored, storage unavailable | KEEP | State and error |
| Binding rows | action names and bindings | KEEP | Bindings |

## Start-up (`src/main.ts`, `index.html`)

| Surface | Current text | Decision | Reason |
| --- | --- | --- | --- |
| Loading | `Opening the district…` | KEEP | State |
| Fatal | `Unable to start the drive` + check district files / WebGL 2, restart | KEEP | Error with recovery |
| Window title | `Cerea Vice 0.9.0-rc.1 · Cerea Centro` | KEEP | |
| `<meta name="description">` | not shown in the game | KEEP | Browser metadata |

## In-scene text

Street plates, direction signs, parking signs, landmark names and the cockpit
dashboard (`CEREA / 1986`, speed/gear readout) are part of the world and were
not changed.

## Owner decisions

1. `REAL STREETS / MODERN MAP` under the district name on the Cerea Centro HUD.
   Recommendation: cut; the briefing attribution already credits OSM.
2. `· Modern street subset; simplified scenery and game stopping bays.` after the
   atlas attribution. Recommendation: keep; it is the in-game statement that
   bays are game placements, not real parking rules.
3. Unused stale data: the Cerea map hints (`Your first passenger is Elena at
   Sosta Municipio …`, outskirts `Prototype journey: …`) predate free driving
   and are overwritten before they show. Recommendation: clear them in the next
   map-data release, when the save signature changes anyway.
