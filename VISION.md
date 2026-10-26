# Cerea Vice game vision

## General vision

A geography-first driving game in which you learn your way around a real place by driving through it—not by following GPS or answering geography quizzes.

You drive an ordinary car through a simplified, recognizable real-world environment. Missions give you a reason to reach particular places, sometimes before a deadline. Success depends on reading signs, recognizing landmarks, understanding directions, planning routes and gradually building a mental map.

## Setting and atmosphere

The intended atmosphere is the 1980s, before everyday satellite navigation and smartphones. Modern street maps are acceptable for practical neighbourhood pilots; complete historical precision is not required.

The presentation is deliberately economical: first-person driving with a simple cockpit, sparse low-poly scenery and a C64/Amiga-inspired appearance. It should convey a believable place without requiring photorealistic buildings or sophisticated vehicle simulation.

The retro look is an aesthetic choice, not a requirement to reproduce old hardware or rendering techniques. Driving should feel smooth with modern analog controller input.

## The central gameplay loop

1. Receive a destination, address or description.
2. Plan the journey using the available information.
3. Drive using road signs, landmarks, compass directions and memory.
4. If uncertain, stop and consult the atlas or ask for directions.
5. Recover from wrong turns rather than automatically receiving a new route.
6. Reach the destination and complete the task.
7. Apply what you learned on subsequent journeys.

The main progression is personal familiarity: a district that initially feels confusing eventually becomes somewhere you know.

## Navigation rules

- No GPS, minimap, floating destination marker or route line.
- No live current-street readout; street names are learned from signs or a stopped information request.
- A visible compass shows the car’s heading—not the direction of the objective.
- The atlas is available only while stopped.
- Its position marker updates only after a successful information request or when the player manually marks where they think they are. Driving and parking alone do not update it; manual estimates may be wrong.
- Asking for your location or directions is possible anywhere, provided the car is stopped. It is not restricted to designated buildings or special interaction points.
- There are a few clearly identifiable places where stopping and parking are allowed.
- Directions use street names, compass directions, junctions and landmarks rather than exact coordinates or automatic navigation.
- Major thoroughfares may use larger direction boards. Normal streets use small name plates at crossings, including building-mounted plates where practical, with occasional repeat plates between junctions. Plates run along and face into the street they name. Players should be able to identify lateral streets before turning.
- Information can be requested while the atlas remains open. The same dedicated information control works on the road and in the atlas: View / Select (PS Share), or F on keyboard. A / Cross / Enter confirms menus or places an estimated marker.
- Consulting the atlas and asking for help are legitimate parts of play, not failures.

## Geography is the foundation

The eventual world should preserve meaningful real geography:

- Street and road connections.
- Place names.
- Relative positions and compass directions.
- Districts and neighbouring settlements.
- Rivers, bridges, terrain and major landmarks.

Scenery can be simplified and journeys can be compressed, but not so much that players learn misleading spatial relationships.

A fictional district is acceptable for the initial technical prototype. The larger vision remains a game through which players become familiar with actual places.

## Missions provide purpose

The driving and navigation foundation should support different themes without being built around just one:

| Mission theme | Reason to navigate |
| --- | --- |
| Taxi driving | Collect a passenger and find their destination |
| Pizza delivery | Locate an address before the order becomes late |
| Emergency delivery | Reach a clinic or another urgent destination in time |
| Courier work | Carry an item between specified locations |
| Detective work | Reach a witness, suspect or scheduled meeting |

Detective work is one possible application—not the defining identity of the engine. The initial generic journey now also supports a taxi game: a 07:00–17:00 shift, passengers giving new destinations, and completed rides paying a base fare plus a bonus for faster delivery. The shift ends with an earnings score; pausing or using the atlas stops the clock.

## Driving experience

The aim is accessible, credible driving rather than hardcore automotive simulation:

- First-person view.
- Controller support from the beginning, with keyboard fallback.
- Analog steering, acceleration and braking.
- Simple reversing and parking. LT is brake only; B / Circle (R on keyboard) selects forward or reverse while fully stopped, and RT accelerates in the selected direction.
- Free looking with the right stick and mouse, including full 360-degree horizontal rotation and a smooth return to the forward view when input is released, plus left/right glances for junctions and signs.
- A recognizable, economical cockpit with a steering wheel, speedometer, forward/reverse selector and working side mirrors.
- Basic collisions and readable vehicle behaviour.

The challenge should come primarily from finding your way, not from mastering complicated controls.

## What the game is not

It is not a fleet manager, transport tycoon, business simulator or conventional racing game.

There is no need for hiring drivers, managing depots, production chains, company finances or vehicle collections. Likewise, a large detective simulation, elaborate dialogue system and combat are outside the initial scope.

## First playable goal

A small, coherent district, one car, readable signs, distinctive landmarks, a compass, a few legal stopping areas and one timed destination.

The key test is:

> Can the player get somewhere through observation and directions, recover when lost, and later repeat the journey because they actually remember the place?

That is the core of the vision: learning geography through purposeful journeys, with missions supplying motivation and the road itself supplying the challenge.
