# Unreleased: one Veronese world and improved taxi driving

The default map is now **Veronese world**: all nine real towns and their existing
connecting roads in one continuous streamed map, with 69 taxi landmarks. The older
maps remain on disk for compatibility and diagnostics but are hidden from normal
selection. Each fresh shift/demo starts at a random town and landmark. Existing
legacy saves remain in their original slots; the unified world has a new slot and
data version 1. No shipped legacy map or signature changes.

Local and inter-town fares share one list. Inter-town quotes add a €12 premium on
top of distance pay; saved and boarded fares can cross the old regional boundary.
The bot chooses both types. Its continuous steering and bend-aware speed plan
replace the old 25 km/h, seven-position driver; reverse recovery now waits properly
for each gear change. Only the demo jumps to another town after three paid jobs,
retaining its progress. Player travel always follows the road network.

See [driving analysis and measurements](../BOT_DRIVING.md) and [world data](../../MAPS.md).
No release/tag or publication is performed by this change.
