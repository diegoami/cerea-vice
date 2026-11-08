# Unreleased: autonomous opening

Launching a district now starts a continuous disposable demo with the normal HUD and
small Start button. The taxi driver chooses fares, boards and delivers passengers,
and explores after closing without resetting its progress. Start freezes it for
rules and current controls; Begin game starts fresh after held controls are released.
Existing saved shifts remain available and are never overwritten by the demo.

World choice is above the rules. Keyboard arrows, controller D-pad or left stick
navigate the worlds, Begin game and options; Enter / A confirms. Changing worlds
returns to frozen rules instead of restarting autonomous play. The bot is discarded
on Start, and held controller buttons or orphan keyboard repeats cannot confirm
through a map reload. Atlas arrows now highlight street-index entries as well as
moving the map crosshair; looking up a street preserves the knowledge marker.

Keyboard, mouse and controller remain the driving inputs. Instructions scroll by
keyboard, wheel, controller right stick or touch. The opening deliberately shows
bindings as requested; normal playing screens keep their concise action labels.

Maps, map signatures and save formats are unchanged. See [implementation and
verification](../OPENING.md) for evidence and playtest limits. No release version or
tag has been created by this change.
