# Unreleased: continuous taxi driving and map authoring

Default-world taxi service no longer closes at 17:00. Keep taking fares through
sunset, night and sunrise, or choose Rest for 8 hours from pause at a complete stop
with no booked passenger. The bot may rest at night between jobs. Earnings and
progress never reset on a timer. The reported Casaleone post-office route now
completes across the former closing boundary instead of becoming an obsolete goal.

The sky has sun, moon and stars, night illumination and taxi headlights. A sparse
population of up to three moving cars yields and collides normally. Continuous maps
also gain varied façade colours, people, benches, planters, dogs and rural cows,
placed clear of mapped streets and service bays. The goal header now explicitly
labels PICKUP / DESTINATION with a fixed address-callout arrow, never a GPS arrow.

London Westminster is a new selectable pilot with three real stops, left-side
traffic and English generic direction-board text. Veronese stays the default; old
prototype maps stay hidden but compatible. See [map workflow](../MAP_WORKFLOW.md)
for cloud/local authoring, checked-in OSM snapshots, validation and registration.

Veronese keeps data version 1 and its previous save signature is accepted because
its geometry and fares are unchanged. Old completed-shift saves resume as active;
legacy standalone maps retain their original shift/journey behaviour. London has
its own save slot. No merge, tag or publication is performed by this change.

Validation: `npm test` passed 200 tests; the documented Xvfb desktop suite passed
22 tests; both production-browser scenarios passed, including resize, controller
simulation, touch scrolling, save isolation, night/rest and London selection. The
packaged Windows export passed its disposable-profile opening/rest check, with
native day/night renders inspected. A 20-minute simulated traffic run completed
six fares over 14.36 km with zero collisions, and a dedicated regression completes
the Casaleone post-office trip across 17:00. London completed nine fares in a
15-minute simulation. Physical controllers/touch devices, overnight unattended
play and authoring a second foreign multi-town region remain untested; global
projection tests cover London, Tokyo and Sydney. Scenery people/animals are
decorative; the deliberately small traffic prototype can yield or park when blocked.
