# Canvas gesture cancellation

September 11, 2026. A canvas press can finish on a DOM control when a drawer or dialog moves under the held pointer. Phaser emits `pointerupoutside` for that release. The village previously handled only `pointerup`, leaving its saved press active until a later canvas release. Starting a DOM gesture could also leave that old press in place.

Outside presses and releases now clear the saved press, drag classification, and pinch distance. Native pointer cancellation clears the same state. Ordinary releases clear their saved press before checking whether a dialog blocks the map, and only a gesture that began on the canvas can become a village tap. Already committed building moves retain their last valid position.

`tests/browser/ui-input.spec.ts` presses the real canvas, moves a DOM button under the held pointer, and releases onto it. The test reproduced the retained press before the fix. It verifies cancellation and then opens the shop and switches categories. Repeated shop placement, camera and touch checks cover the neighboring input paths.

The broader browser run first exposed an intermittent shop closure. This investigation found and fixed the reproducible stale-press bug; a single failed trace does not prove that every possible drawer interaction race has been eliminated.

## DOM controls during queued rendering

The native-grid audit reproduced a separate lost-click race: a model update scheduled between a Save button’s pointer press and release replaced the button node, preventing its click. HUD structural rendering now waits until active action pointers release or cancel, and resumes on the next animation frame after click dispatch. Window blur also releases this guard. Live counters keep updating while a pointer is held.

Drawers and dialogs retain their DOM when their generated content is unchanged. Their scroll positions are restored only after content replacement, so an unrelated redraw cannot cancel a smooth Army category jump. Changed contents still rerender and preserve the existing focus behavior.

The added browser regression holds a real Save button, triggers a structural update, checks that its node remains connected, then releases and verifies the persisted army name in the model. It also triggers redraws during jumps to Spells and back to Troops. The old implementation failed the mounted-node assertion. Quick-army reload, narrow catalog scrolling, modal focus and replay interaction cases exercise the adjacent flows.

## Browser gestures on phones

October 1, 2026. Several browser gestures could take over during touch play. The canvas already set `touch-action: none`, but the HUD did not:

- **Pull-to-refresh and page bounce.** A downward swipe that started on a HUD panel could pull-to-refresh in Chrome on Android, reloading the page mid-raid, or rubber-band the page in iOS Safari. `html` and `body` now set `overscroll-behavior: none`.
- **Double-tap zoom.** Two quick taps on a train or deploy button could zoom the page instead of registering two presses. Buttons now set `touch-action: manipulation`. Shop tiles keep `pan-x`, so a vertical drag still lifts a building out of the shop.
- **Long-press selection and callouts.** Holding a finger still to stream troops or move a building could raise iOS's selection loupe or a callout over nearby HUD text. `body` now disables text selection and the touch callout. Inputs, selects and textareas re-enable selection so the army search and army preset names can still be edited.
- **Context menu.** A long press fires `contextmenu`. Phaser's `disableContextMenu` now cancels it on the canvas. The game has no right-click action, so desktop play loses nothing.
- **Focus zoom.** iOS Safari zooms the page when a field with text smaller than 16px takes focus, and the page stays zoomed after the keyboard closes. With `(pointer: coarse)`, the army search and the Army and campaign pickers now use 16px text. Mouse-driven layouts keep 13px.

`tests/browser/touch-browser-gestures.spec.ts` runs a 3× touch context. It checks the overscroll, touch-action and selection styles. It also checks that a dispatched `contextmenu` on the canvas is cancelled, and that every field reaches 16px while typing in the search still works. A desktop case confirms that mouse layouts keep their 13px text. Without the fix, both touch cases fail. These checks verify the CSS and event contract in Chromium's mobile emulation. They do not replace testing on physical iOS and Android devices.

## Training by tapping portraits

In the original's training screen, tapping a troop's or spell's portrait adds one, and holding it keeps adding. Here, only the "+ Add" button under the portrait did that. That button is 40 pixels tall on a tall phone; the portrait is 55×58.

An unlocked tile's portrait now does the same as its Add button. It runs `train:` or `brew:` through the same click handler and the same hold-to-repeat: a 450 ms delay, then one every 110 ms.

- **Why not `data-action`.** The portrait carries `data-add`, not `data-action`, so a page or test that looks up a tile's Add control by its action still finds one element.
- **Blocked tiles.** A locked tile, a full army, or a spell tile without spell housing has no `data-add` on its portrait.
- **Scrolling the strip.** A swipe that starts on a portrait still scrolls the tile strip. The browser cancels the pointer when it takes over the pan, which stops the hold before its first repeat.
- **Long press.** The portrait suppresses iOS's image callout and text selection, and shrinks slightly while pressed.
- **Keyboards and screen readers.** They keep the Add button; the portrait is not focusable.

`tests/browser/army-portrait-tap.spec.ts`, at 390×844 with touch:

- taps the Barbarian portrait twice and a spell portrait once;
- checks that a locked portrait is not a control;
- in Chromium, holds a portrait for a second with native touch events (at least three troops);
- swipes from a portrait and checks that the strip scrolls and no troop is added.

## Screen kept on during raids and replays

October 2, 2026. Phones dim and lock the screen after their idle timeout, which can be as short as 30 seconds. Three kinds of play involve little touching: watching a replay, watching the first-run Goblin raid, and waiting on a raid's last troops. A locked phone hides the page, and a hidden page stores the raid settled at its current score.

`src/ui/screen-awake.ts` wraps the [Screen Wake Lock API](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API). The one-second economy timer in `src/main.ts` asks it to keep the screen on while a raid is live or a replay is playing. The Goblin raid plays as a replay. The lock is released in the village, on a finished raid's results, and while a replay is paused or complete. Browsers drop the lock when the page is hidden, so it is requested again when the page returns. If a lock arrives after the raid has ended, it is released immediately. A browser without the API, or one that refuses the request (battery saver, a permissions policy), keeps the device's usual timeout. The lock never enters saves, simulation or replays.

`tests/screen-awake.test.ts` covers holding and releasing, repeated requests, re-requesting after the page is hidden, late grants, refusals and a missing API. `tests/browser/screen-awake.spec.ts` replaces the browser's wake lock with a recorder, because headless browsers refuse real locks. It checks that the village requests nothing, a raid holds one lock across timer ticks, a finished raid releases it, and a replay holds it only while playing. The spec fails without the timer wiring. Whether a phone actually stays on still needs checking on physical devices.

## Pan momentum on touch screens

October 2, 2026. The camera used to stop the instant a finger lifted, even after a quick swipe. Phones scroll with momentum, so it felt abrupt.

`src/game/pan-fling.ts` measures the finger's speed over the last 100 ms of a one-finger pan. On release the camera keeps moving and slows exponentially, with a 325 ms time constant. A release at speed v travels about v × 325 ms. A finger that rested for 50 ms before lifting, a release slower than 0.25 CSS pixels per ms, and a tap produce no glide. Speed is capped at 4 pixels per ms. The decay is integrated exactly, so a glide covers the same distance at 30, 60 or 120 FPS.

`VillageScene` stops the glide in these cases:

- A finger touches the map. A pinch's second finger clears the pan's samples, so pinches end without momentum.
- Anything else moves the camera: the zoom buttons, recenter, or focusing a building.
- A dialog blocks the map.
- The canvas resizes.
- Reduced motion is on.

The glide runs on wall-clock time, like the finger it continues: on slow or throttled frames, Phaser substitutes and caps frame deltas. Mouse dragging has no momentum, so desktop panning is unchanged. The camera never enters saves, simulation or replays.

`tests/pan-fling.test.ts` covers the glide distance and stop, frame-rate independence, slow and resting releases, the end-of-drag window, the speed cap and direction. `tests/browser/pan-fling.spec.ts` dispatches `TouchEvent`s inside the page, because scripted input from outside the page arrives one slow software-rendered frame apart. It checks that a quick swipe glides and settles, and that a resting finger, a tap, a pinch and the zoom buttons each stop the glide. A reduced-motion case checks there is no momentum. Removing the stop on a new press makes it fail. The spec constructs `Touch` objects and runs these cases in Chromium only.

## Vibration

October 2, 2026. Android browsers can vibrate, and a light tap is the usual confirmation that a troop landed. `src/ui/haptics.ts` vibrates for 8 ms on a deploy and 25 ms when a building is destroyed. A raid's result gives a short double pulse, but only when it earned a star. Each kind is throttled, so a held troop stream ticks at most every 90 ms. The haptics follow the existing sound cues: `AudioManager.play` reports every cue to a `feedback` hook before checking whether sound is on, so vibration works with sound off. `main.ts` keeps replays still, including the first-run Goblin raid, which plays as a replay.

Settings has a Vibration switch, stored as `settings.haptics` (absent means on). It appears only where `navigator.vibrate` exists; iOS Safari has no Vibration API. Haptics never vibrate before the page's first tap, because browsers ignore and warn about vibration before then. Phaser's feature detection reassigns `navigator.vibrate` at boot, so a test stub must be writable.

`tests/haptics.test.ts` covers the patterns, throttling, the off, unsupported and not-yet-tapped cases, and the saved setting. `tests/browser/haptics.spec.ts` replaces `navigator.vibrate` with a recorder. It checks that a real tap-to-deploy pulses once and that the switch turns pulses off. It also checks that replays stay still, that only a starred result celebrates, and that browsers without the API get no switch. Without the `main.ts` wiring, both pulse cases fail. How the pulses feel on physical phones has not been checked.

## Sharing files from a phone

Settings → Export village, and a replay's Export, used to download a JSON file. On a phone that file lands in a Files or Downloads folder, far from where players send things. `src/ui/share-file.ts` takes the file text and, on a touch screen whose browser reports that it can share the file, opens the system share sheet: Messages, AirDrop or cloud storage, for example. Closing the sheet exports nothing, so the village export shows no "exported" toast and no download follows. A mouse still downloads, as does any browser that will not share the file type. Chrome on Android shares no JSON, so it downloads as before. The share call happens within the tap's user activation.

`tests/browser/share-file.spec.ts` replaces `navigator.share` and `navigator.canShare`. On a phone it checks that the village backup and a replay are handed to the sheet with their file names and type, that the village file restores through `parseSaveFile`, and that nothing downloads. It also covers closing the sheet, a browser that will not share JSON, and a desktop mouse. When the share sheet is never chosen, the two sharing cases fail. Existing download, import and recovery specs still pass.
