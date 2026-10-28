# Colour and picture quality (issues #15 and #16)

This pass rebalances the town's colours (#15) and makes the picture-quality
choices easier to find, with an opt-in higher-resolution mode (#16). The colour
pass came first, so the picture-mode comparisons use the new palette. Colour
taste is the owner's call: the before/after screenshots listed below are
supplied for that decision, and nothing here claims how the result looks on the
owner's Windows displays.

Nothing in this pass changes geometry, street connections, sign ownership,
collision or stopping areas, atlas knowledge or controls. There are no new
navigation overlays.

## Diagnosis: where the green came from

Method: `tools/capture-views.mjs` loads fixed poses through the ordinary saved
shift path (no game globals): Cerea Centro at Municipio, San Zeno and Teatro,
and the streamed outskirts at the city (Municipio), the countryside link
(z = −1150) and Test Hamlet. Each pose is captured at 08:00 and 16:30 in Sharp,
Retro 540p and Retro 270p, at 1280×720 with the HUD hidden. For every image it
records mean CIELAB per band of the windshield (sky: top 30%, street: 30–62%,
lower: 62–100%, which is mostly the dashboard) and the share of pixels where
green is the strongest channel by more than 12 levels.

To attribute the cast, the scenery colours were moved into one module
(`src/world/palette.ts`) and the same poses were rendered with
palette variants (08:00, Sharp and Retro 540p):

- **v0**: all old values. It reproduced the original screenshots' statistics
  exactly, which shows that the refactor itself changes nothing.
- **v1**: old materials, new light/haze/sky.
- **v2**: new materials, old light/haze/sky.

Whole-frame mean a* (negative is green) and green-dominant pixel share at
Municipio, 08:00:

| Variant | Sharp a* / b* | Sharp green-dominant | Retro 540p green-dominant |
| --- | ---: | ---: | ---: |
| Before (0.9 main) | −2.7 / 10.1 | 8.4% | 31.9% |
| v1: old materials, new light | −3.0 / 7.8 | 9.6% | 36.8% |
| v2: new materials, old light | +1.1 / 8.0 | 0.2% | 3.5% |
| After | +0.9 / 5.7 | 0.2% | 3.0% |

Findings:

1. **Materials are the main cause.** The ground (`0x7d876b`), asphalt
   (`0x4d5655`), stopping bays (`0x647d6f`), simple-scenery windows, posts,
   one façade (`0xbcc0a0`), most shutters and the cockpit trim (`0x5d655d`) were
   all grey-greens with green as the strongest channel. Swapping only the
   materials removes the green cast (v2). Swapping only the lights does not (v1).
2. **Lighting and haze turn that into olive and yellow.** The sun (`0xffdfae`) and
   hemisphere sky (`0xffe3bf`) are strongly blue-deficient. Warm light on
   grey-green surfaces gives olive/khaki. On its own the light is not green: v1
   is slightly *greener*, because the less yellow light shows the green
   materials more plainly. It does carry most of the yellow (b*), so it was
   moderated to avoid swapping green for a sepia cast. The hemisphere's ground
   colour (`0x62776d`) added green bounce to every vertical surface. The midday
   haze (`0x9fb6bf`) and fog start (`0xa3b6b4`) were teal.
3. **The retro treatment amplifies the cast but does not cause it.** Retro 540p
   and 270p have the same mean colour as Sharp (a* within 0.1–0.4), but the
   green-dominant share rises from about 8–14% to about 30%. The 2×2 dither and
   32-level quantisation treat the channels identically. On surfaces whose red
   and green are nearly equal, they flip neighbouring pixels between red-led and
   green-led, which reads as green speckle. With R clearly ≥ G in the new
   neutrals, the share drops to about 3%. The shader is unchanged.
4. **Vegetation is not the problem in town.** Tree crowns are small. In the
   countryside and hamlet, the green fields are appropriate and stay green.
5. **The cockpit counts.** The dashboard fills the lower third of every frame,
   and its olive trim was a large constant contributor: lower-band a* was −2.6
   to −2.9 before and +0.3 to +0.9 after.

Averaged over all 12 poses and hours per mode, mean a* moved from −2.4 to +0.1
and b* from 7.1 to 3.8. Mean lightness is unchanged (L* 36.7 Sharp before and
after), and the green-dominant share fell from 9.7% / 29.9% / 29.5% to
2.5% / 4.8% / 4.8% (Sharp / 540p / 270p).

## Palette decisions

All values are in `src/world/palette.ts`. Cerea (`World.ts`), the streamed
outskirts (`renderTile.ts`, `StreamingWorld.ts`), façades (`Scenery.ts`),
posts (`builders.ts`) and the cockpit share them.

- **Masonry:** ochre `0xd2a878`, cream `0xdcc8a6`, terracotta `0xca9680` and
  grey stucco `0xc4beb2` replace the four 0.9 colours, one of which was
  greenish. They keep the 65 m neighbourhood pattern and the variant-2 shop
  doors. The shutters are green persiane, walnut, slate blue and oxblood (0.9:
  three green/teal and one brown). The glass is blue-slate rather than teal.
- **Roads and paving:** asphalt `0x52535a` (slightly cool, so it stays neutral
  under warm light), light-stone verges, cool-grey setts `0x77767a` for
  stopping bays (the yellow bay lines are unchanged), greige town ground
  `0x878479`.
- **Vegetation:** tree crowns `0x5b7444`. Countryside tiles use a meadow base,
  a golden stubble field and a green crop field, instead of three greens.
- **Light:** sun `0xffe6c0`, hemisphere sky `0xfff0dc`, earth-toned bounce
  `0x6f665a`, with the same intensities as 0.9.
- **Haze:** `0xc9b29c` at the start and end of the day, grey-blue `0xaeb8c0`
  at midday. The lower sky band below the horizon is warm grey.
- **Cockpit:** neutral grey trim and pillars, warm grey cloth. The instrument
  face and its text colours are unchanged.
- **Unchanged on purpose:** sign, street-plate and landmark board colours.
  They are legible, and the outskirts bake them into tracked derived tiles.
  Harbor's handcrafted palette, people's skin and hair tones (one olive shirt
  became mauve) and the retro shader are also unchanged.

`tests/palette.test.ts` guards legibility and the rebalance:

- Sign text on every board colour: at least 4.5:1.
- Street-plate ink: at least 7:1.
- Boards on façades: no worse than 0.9's weakest pairing (2.99:1). This is why
  the terracotta is a little lighter than first drafted.
- Plate borders and window glass on façades: at least 3:1.
- No neutral surface has green as its strongest channel.
- The façades spread at least 20° of hue and 1.3× of luminance, and vegetation
  stays green.

## Picture-quality modes

The Picture choice is in **Picture & Sound** on the briefing and pause screens.
It is reached with Tab and the arrow keys, or with the controller D-pad and A.
It is ordered from lightest to most demanding. A line under it explains the
selected mode and shows the picture actually drawn, read back from the WebGL
drawing buffer, for example `Drawing 960×540 for a 1280×720 window`. The
preference is saved in local storage. In the Windows build, that is the
persistent profile.

| Mode | Internal picture | Notes |
| --- | --- | --- |
| Retro 270p | height ≤ 270 | Lightest. Nearest-neighbour upscale and dither. |
| Retro 540p | height ≤ 540 | **Default**, unchanged. |
| Sharp | display × pixel ratio, ≤ 1920 wide, ratio ≤ 2 | Unchanged from 0.9. |
| High (to 4K) | display × pixel ratio, ≤ 3840×2160, ratio ≤ 2 | New. Opt-in only. |

Every mode is also fitted to the GPU's renderbuffer, texture and viewport
limits, shrinking proportionally. A changed device pixel ratio, for example
after moving the window to another display, triggers a resize even when the
window size stays the same. The canvas always fills the window, and the camera
aspect comes from the window. HUD, atlas and menus are DOM at display
resolution, so text size and layout do not depend on the mode. Mirrors keep
their 320×192, 10 Hz targets. Input and simulation are identical in every mode.

Why these caps: 3840×2160 covers 4K panels at 100% and 200% scaling. Pixel
ratio 2 already exceeds what small signs need, and a 3× display would quadruple
the cost for little gain. High is never selected automatically, because nothing
in the browser reliably shows whether a GPU can sustain it. Retro 540p stays
the default. A saved High choice is kept on relaunch, because it was the
player's explicit choice.

## Measurements and their limits

Linux, Xvfb with xfwm4, Electron 45 / Chromium, **ANGLE Vulkan SwiftShader**
(a CPU software renderer), `desktop/profile.mjs`. Each run: a fresh profile,
Municipio, stopped, 120 animation-frame intervals after 30 discarded. The
1440×900 window is the default. `CEREA_SCALE=2` adds
`--force-device-scale-factor=2` to emulate a HiDPI display. Runs were serial.

| Pixel ratio | Mode | Buffer | Median ms | p95 ms |
| --- | --- | --- | ---: | ---: |
| 1 | Retro 270p | 432×270 | 100.0 / 50.0 | 133.4 / 66.8 |
| 1 | Retro 540p | 864×540 | 83.4 / 83.2 | 150.0 / 100.0 |
| 1 | Sharp | 1440×900 | 200.0 / 283.3 | 250.0 / 333.3 |
| 1 | High | 1440×900 | 300.0 / 283.2 | 333.4 / 333.3 |
| 2 | Retro 540p | 864×540 | 233.3 | 300.0 |
| 2 | Sharp | 1920×1200 | 466.7 | 533.3 |
| 2 | High | 2880×1800 | 749.9 | 816.7 |

Where two values are given, the first and second runs are shown. At ratio 1
and 1440 px wide, High and Sharp draw the same buffer. Their run-to-run spread
(200–300 ms) is the noise level of this setup. Cost grows roughly with drawn
pixels. Emulated HiDPI also makes compositing more expensive for every mode
(Retro 540p rose from about 83 to 233 ms with the same internal buffer).

These numbers **do not predict** frame rates on the owner's Windows GPU, and no
frame rate is promised for any mode. They show only the relative cost and that
the caps are applied. Not checked here: physical HiDPI monitors, real 1440p/4K
displays, Windows fullscreen on real hardware, GPU timer queries and physical
controllers. The desktop test only emulates a standard-mapped controller.

## Automated coverage

- `tests/presentation.test.ts`:
  - default and validation of saved modes, including that unknown values fall
    back to Retro 540p;
  - Sharp unchanged;
  - High at 1440p, 4K at 100% and 200%, 3× ratio and ultrawide;
  - GPU-limit fitting, and aspect ratio across modes and ratios.
- `desktop/smoke.test.mjs` "picture quality …", at pixel ratio 2:
  - option labels, and that a fresh profile starts in Retro 540p;
  - keyboard Tab/arrow selection, then controller D-pad/A cycling to High,
    without starting the shift;
  - in every mode: the buffer matches the formula, the canvas CSS size and the
    HUD font size stay the same, pixelation is retro only, and the aspect ratio
    is kept;
  - an atlas estimate placed in High stays put after switching modes;
  - the buffer is recomputed after entering and leaving fullscreen;
  - High persists across a relaunch.

## Screenshots

Regenerate with `npm run build`, then
`xvfb-run -a -s '-screen 0 1920x1200x24' node tools/capture-views.mjs <label>`
(optional second argument: comma-separated modes; `CEREA_HOURS` picks the
hours, default `8,16.5`). Each run writes `summary.json` with the statistics
above. The files are ignored and not committed:

- `test-results/views/before/`: 0.9.0-rc.1 main.
- `test-results/views/after/`: this branch.
- `test-results/views/ablation-v0|v1|v2/`: the attribution variants.

Each directory has 36 images named
`<district>-<pose>-<hour>-<mode>.png`, in identical poses. The districts and
poses are `cerea-municipio`, `cerea-san-zeno`, `cerea-teatro`,
`cerea-outskirts-city`, `cerea-outskirts-countryside` and
`cerea-outskirts-hamlet`. The hours are `8` and `16h5`, and the modes are
`sharp`, `retro-fine` and `retro`. The profiler writes
`test-results/quality-x{1,2}-<mode>.{json,png}`.
