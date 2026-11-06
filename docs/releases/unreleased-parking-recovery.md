# Unreleased: change recovery strategy at awkward parking approaches

The autonomous driver prefers a legal forward street loop when its destination
would require an immediate U-turn. If that loop is unavailable on a narrow road,
it can drive to a real crossing and turn there. An obstructed street can instead
be backed out of in bounded stages to use another road. If the vehicle needs room
to straighten before reversing, it first tests a short forward adjustment against
the same body-clearance and collision checks.

Recovery attempts remember their location and target. A new plan is not treated
as progress when the vehicle stays in the same area: failed street entries are
temporarily excluded, and other nearby forward entries can be connected through
a collision-checked local path. An occupied waypoint can be skipped by reconnecting
farther along the existing route. Repeated reverse attempts vary their direction
and extent instead of replaying the same manoeuvre.

Parking service now uses Mission.canServe, matching the player's actual stopping
area. The former extra inset could cause unnecessary repositioning at a perfectly
valid pickup or dropoff. Completing service clears the old reversing manoeuvre
before driving toward the next destination.

All changes use ordinary pedals, steering, settled gear changes and existing road
connections. Fares, clocks, earnings, atlas knowledge and saves are not reset by
recovery. Maps, save signatures, player input and presentation are unchanged.

Regression cases cover forward loops, waiting for a crossing before turning,
blocked-street back-out, left-side traffic, occupied waypoints, valid parking-edge
service and a pickup completed during reverse. Existing obstacle, Bovolone square,
overtaking, boarding and save/handoff tests remain part of verification.
