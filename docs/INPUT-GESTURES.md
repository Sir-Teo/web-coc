# Canvas gesture cancellation

September 11, 2026. A canvas press can finish on a DOM control when a drawer or dialog moves under the held pointer. Phaser emits `pointerupoutside` for that release. The village previously handled only `pointerup`, leaving its saved press active until a later canvas release. Starting a DOM gesture could also leave that old press in place.

Outside presses and releases now clear the saved press, drag classification, and pinch distance. Native pointer cancellation clears the same state. Ordinary releases clear their saved press before checking whether a dialog blocks the map, and only a gesture that began on the canvas can become a village tap. Already committed building moves retain their last valid position.

`tests/browser/ui-input.spec.ts` presses the real canvas, moves a DOM button under the held pointer, and releases onto it. The test reproduced the retained press before the fix. It verifies cancellation and then opens the shop and switches categories. Repeated shop placement, camera and touch checks cover the neighboring input paths.

The broader browser run first exposed an intermittent shop closure. This investigation found and fixed the reproducible stale-press bug; a single failed trace does not prove that every possible drawer interaction race has been eliminated.

## DOM controls during queued rendering

The native-grid audit reproduced a separate lost-click race: a model update scheduled between a Save button’s pointer press and release replaced the button node, preventing its click. HUD structural rendering now waits until active action pointers release or cancel, and resumes on the next animation frame after click dispatch. Window blur also releases this guard. Live counters keep updating while a pointer is held.

Drawers and dialogs retain their DOM when their generated content is unchanged. Their scroll positions are restored only after content replacement, so an unrelated redraw cannot cancel a smooth Army category jump. Changed contents still rerender and preserve the existing focus behavior.

The added browser regression holds a real Save button, triggers a structural update, checks that its node remains connected, then releases and verifies the persisted army name in the model. It also triggers redraws during jumps to Spells and back to Troops. The old implementation failed the mounted-node assertion. Quick-army reload, narrow catalog scrolling, modal focus and replay interaction cases exercise the adjacent flows.
