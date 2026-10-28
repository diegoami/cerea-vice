# Sound and radio

This covers vehicle sound (issue #14) and the in-car radio with a player-chosen
local music folder (issue #17): design, defaults, the desktop security
boundary, persistence, supported formats and how to check it by listening.
It supersedes the sound bullet in [PRESENTATION.md](PRESENTATION.md).

## Diagnosis: why 0.9 was hard to hear

The 0.9 engine was a single **triangle oscillator at 34–118 Hz**, at an engine
gain of 0.07–0.15, behind a master default of **25% ("Quiet")**. That is roughly
−35 to −28 dBFS of a tone whose fundamental lies below what laptop speakers and
many headsets reproduce, and a triangle wave has very weak upper harmonics. The
radio, the only other continuous sound, defaulted to Off. This is the most likely
reason the owner could not tell whether there was sound. It is an estimate from
the code: it has not been measured on the Windows output.

Audio was not blocked in the desktop shell. Electron's default autoplay policy
does not require a user gesture, so an `AudioContext` created on a
controller-only start already runs; the shell now states
`autoplayPolicy: 'no-user-gesture-required'` explicitly so that stays true. An
ordinary browser does require a click or key press: the game retries resuming
about once a second while driving, and the dashboard says
**SOUND BLOCKED · CLICK OR PRESS A KEY** until it can play.

## Vehicle sound

All vehicle sound is synthesized at runtime by `src/presentation/Sound.ts`. It
uses no recordings, samples or downloads, and it never calls `Math.random`, so
seeded dispatch stays reproducible.

- **Engine**: a sawtooth fundamental with a detuned square an octave above,
  through a resonant low-pass filter. Pitch follows speed (about 40–130 Hz in
  forward) and rises with throttle. The filter opens with throttle and speed, so
  accelerating sounds brighter as well as louder. The harmonics are what make it
  audible on small speakers.
- **Reverse**: a steeper pitch curve plus a thin gear whine while moving, so
  the selected direction can be heard. Selecting forward or reverse gives a short
  two-note clunk (rising into D, falling into R).
- **Braking**: band-passed noise that grows with brake pressure and speed and is
  silent at a standstill, as is the handbrake when stopped.
- **Road rumble**: low-passed noise that grows with speed.
- **Steering tick**: unchanged in meaning. It is ambience, not a turn signal
  or a route cue.
- A gentle compressor keeps the layers from clipping at 100%.

Levels are deliberately moderate: idle is a soft hum and the brightest layer
only appears under full throttle, to avoid fatigue over a 20-minute shift.

**No navigation cues.** Every input to the sound is the car's own speed, gear,
steering and pedals, plus the presentation settings. Nothing depends on the
route, destination, position, district or mission state. Sound never gives
directions or reveals where you are.

## Radio

**Radio → On** with **Radio source**:

- **Built-in tune** (default source): a soft synthesized square arpeggio over a
  sine bass, generated in `Sound.ts`.
- **My music folder** (desktop app only): plays the supported audio files in a
  folder you choose, in name order, including up to three levels of subfolders
  (at most 2000 tracks). When the folder has nothing playable, the built-in tune
  plays instead and the settings screen says why.

**Music level** (25–100%, default 50%) is separate from **Volume**. The final
music level is Volume × Music level, and it ducks by up to 25% while you
accelerate hard, so the engine stays readable. Volume → Mute silences music too.

Controls:

| Action | Where | Keyboard | Controller |
| --- | --- | --- | --- |
| Radio on / off, source, music level | Picture & Sound (briefing or pause) | Tab / arrows, or mouse | D-pad / left stick to select, A to cycle |
| Choose music folder… | Picture & Sound | Space on the button, or mouse | A on the button (the native folder dialog then needs a mouse or keyboard) |
| Previous / next track | Picture & Sound | Space on the button | A on the button |
| Next track while driving | driving only | **V** by default | **D-pad right** by default |

Only **next track** has a driving binding. Turning the radio on or off, levels,
source and previous track are not needed at the wheel and stay on the pause
screen, which also stops the shift clock. Next track is useful mid-drive (skip a
song without stopping) and maps to a free key and button. It is part of
**Change controls**: conflicts are reported, the choice is saved, and Restore
defaults resets it. It only works while driving with the folder source on; the
atlas, the fare list and menus never see it, and D-pad right keeps moving the
atlas crosshair in the atlas. Its result appears on the dashboard, never in the
road message area, so it cannot overwrite a direction you asked for.

Older control profiles keep every custom binding. A 0.9 profile without the
radio gains it on **V / D-pad right** when those are free. Otherwise it gets the
next free letter, then digit, and the next free button. A 0.8 profile gains
**Request fares** first, then the radio, with no overlap. A profile that is
itself invalid (for example two actions on one key) still falls back to defaults,
as before.

## Discoverability

- The dashboard shows `SOUND 75% · RADIO OFF` (or `SOUND MUTED`, `SOUND BLOCKED
  · CLICK OR PRESS A KEY`, `SOUND UNAVAILABLE`, `RADIO TUNE`, `RADIO 3/12 <title>`)
  on every screen, including the briefing.
- The help table on the briefing and pause screens lists the radio track
  control with your current bindings, and points to Picture & Sound for volume,
  mute and radio.
- Changing **Volume** plays a short two-note check tone at the new level, even
  on the paused briefing screen. The game itself stays silent there.

## Defaults and saved preferences

| Setting | 0.9 default | Now |
| --- | --- | --- |
| Volume | 25% ("Quiet") | **75%**, steps Mute / 25 / 50 / 75 / 100% |
| Radio | Off | Off |
| Radio source | (none) | Built-in tune |
| Music level | (none) | 50% |

75% leaves headroom above a level that is clearly audible with the new engine.
The radio stays **off by default**: music would be an imposition at first
launch and would compete with the engine this change makes audible. The
dashboard indicator makes it easy to find.

Saved choices are kept. A profile that saved 25%, 50% or 100% keeps that value;
an odd stored value snaps to the nearest step; a saved Mute stays muted. 0.9
settings gain the new radio fields with their defaults. These settings live in
the same `cerea-presentation` local storage entry as the picture options, so
they persist with them. If the owner's Windows profile saved 25% earlier, it
stays at 25%, which is louder than before because of the new engine mix. Raise
it in Picture & Sound if needed.

Pause, atlas, fare list, briefing and results fade all game sound to zero,
including folder music, which pauses in place and resumes from the same point.
Their clocks do not advance; nothing about the radio changes simulation time.

## Music folder: security model

The renderer stays sandboxed (`sandbox`, `contextIsolation`, no
`nodeIntegration`). It gains no filesystem access:

1. **Preload** (`desktop/preload.cjs`) exposes exactly two calls as
   `window.cereaMusic`: `library()` and `chooseFolder()`. Neither takes an
   argument, so the renderer cannot name a path.
2. **Main** (`desktop/main.mjs`) answers them only for the game's own main
   frame (`cerea://game`). `chooseFolder` opens the native folder dialog: the
   player's deliberate choice is the only way a folder is selected.
3. `desktop/music.mjs` lists the folder (resolved with `realpath`), skipping
   symbolic links and unsupported files, and returns only display titles (the
   path relative to the folder, without extension), the folder's own name and
   **fresh random ids**. Absolute paths stay in the main process.
4. The renderer plays `cerea-music://track/<id>`. That protocol accepts only
   `GET`, a well-formed id from the current listing and no query string. It
   re-checks that the real path is still a regular, non-link file strictly inside
   the folder and has a supported extension, then streams it with byte ranges
   for seeking. Anything else gets a 404.
5. The page's Content Security Policy adds only `media-src cerea-music:`. There
   are no remote URLs, uploads, accounts or streaming; everything is offline.

Unit tests (`desktop/music.test.mjs`) cover traversal, symlinks, foreign table
entries, sibling-prefix folders, unsupported types, ranges, missing, empty and
unreadable folders. The desktop test checks the bridge's two calls and refused
path and traversal URLs from the real renderer.

## Persistence

The chosen folder is stored as `music-folder.json` in Electron's `userData`
directory. On Windows that is `%LOCALAPPDATA%\CereaVice\profile`, the same
profile that keeps saves, controls and settings across relaunches and new
builds. Only an absolute path is accepted on reading; a damaged file is ignored.
The folder is rescanned at every launch, so added or removed tracks show up.
A folder that has been moved, renamed or is on a disconnected drive is reported
(`“Music” is not available …`) and the built-in tune plays. Cancelling the
dialog keeps the current folder.

## Supported formats

Whatever Electron's Chromium decodes offline. Electron includes the codecs for
these extensions: **.mp3, .ogg / .oga / .opus, .wav, .flac, .m4a / .aac, .webm**.
Other files are ignored and counted ("2 other files ignored"). DRM-protected
files (for example old iTunes `.m4p`) are not supported. A listed file that
cannot be decoded is skipped with a message (`Skipped “title”: it could not be
played.`). If every track fails, the built-in tune takes over.

## Future: bundled music

No music is bundled, selected or downloaded, and the repository contains no
audio files. If bundled 80s-style tracks are added later:

- Keep each track's licence, author, source URL, download date and checksum
  in a provenance file beside it (as `data/README.md` does for OSM), and show the
  attribution in the game.
- Verify the licence explicitly allows redistribution in an offline build.
- Serve them from `dist/` through the existing `cerea:` protocol and add a third
  `radioSource` value. The folder path and its security model stay as they are.

## Checking it by listening

Automated tests use a stand-in `AudioContext` and a silent display server. They
check the wiring (levels, mute, pause, resume, radio state and the folder
boundary), **not audibility or quality**. Before release, on Windows:

1. Fresh profile: start with the controller only (Start). The dashboard
   should read `SOUND 75% · RADIO OFF` and the engine should idle audibly
   through the selected Windows output, on speakers and on headphones.
2. Accelerate, cruise, brake hard, stop, select reverse and reverse. Each should
   be distinguishable without looking and not tiring over a few minutes.
3. Pause: silence. Change Volume through each step: a check tone at each level;
   Mute is silent. Resume: the level matches.
4. Radio On, Built-in tune; then choose a real music folder. Music plays,
   **V** / D-pad right skips, levels balance against the engine.
5. Relaunch: folder and levels are remembered. Rename the folder and relaunch:
   the message explains it and the built-in tune plays.
6. Repeat 1 with keyboard / mouse only.

None of these listening checks were done during development (WSL and Xvfb only).
