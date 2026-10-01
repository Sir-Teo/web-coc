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
