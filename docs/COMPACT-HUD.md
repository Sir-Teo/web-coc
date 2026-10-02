# Compact village controls

The previous HUD positioned side tools using a percentage of screen height while independently anchoring Attack, Collect and Shop to the bottom. At 844×390, pressing the center of Zoom out actually hit Collect. Shorter portrait and landscape views also put activity buttons behind Attack or moved controls beyond the viewport. The old landscape breakpoint excluded phones narrower than 701 CSS pixels.

`src/ui/compact-hud.css`, imported after the base stylesheet, gives short views explicit control rows and space for the army tray. Camera, Settings and activity buttons have 44×44 CSS-pixel targets. Their hit areas are checked directly; DOM visibility alone did not catch the old obstruction.

- Up to 700 pixels high, side tools use compact grids and explicit clearance above the bottom actions. Edit mode has a single row of three camera controls.
- On narrow, short portrait views, Collect sits between Attack and Shop. The decorative village caption is omitted to leave that row clear. The camera/settings grid stays at the right edge and the activity grid at the left.
- Landscape views up to 600 pixels high and at least 4:3 use one bottom row: Attack, army, Collect and Shop. Settings and the camera row sit above the right-hand actions. Explicit button sizes replace the previous blanket scale transforms in this layout.
- The landscape army tray hugs a short roster instead of stretching an empty panel across the map. Larger rosters keep horizontal scrolling. Its available region reserves 114 pixels after the left inset and 196 before the right inset for the adjacent controls and their gaps.
- Edge variables include browser safe-area insets. A touch regression reserves 44 pixels on each side and 21 at the bottom in a 568×320 view; this verifies the CSS spacing contract, not a physical notch/home-indicator device.

The new rules preserve the existing game actions, modal/drawer behavior, art, camera coordinates, economy, save format and combat rules. Views taller than 700 CSS pixels retain their previous HUD layouts.

## Tall phones

The compact rules stop at 700 pixels high, so most phones in portrait (390×844 and taller) still used the narrow-width layout. An October 2026 audit at 390×844 found a 33×35 Settings button, 29×30 camera buttons, 19×24 resource "+" buttons, 33×35 dialog close buttons and 49×27 Settings switches.

With a coarse pointer and a view taller than 700 pixels, Settings and the three camera buttons are now 44×44. Some controls have no room for bigger art, so a transparent `::after` grows the area a finger can press instead. The insets include each button's own border, because `::after` is placed from the padding edge.

- Resource "+": 43×38, stopping short of the bar and of the next row, 39 pixels away.
- Dialog close buttons: 45×47. A drawer's close button does not reach left over its scrolling tabs.
- Settings switches: 53×45, within their own setting row.

Mouse layouts are unchanged. `tests/browser/touch-targets.spec.ts` hit-tests points just outside each drawn control. It checks that neighbouring "+" buttons do not overlap, and taps beside the art with a real touch. Without the rules, both cases fail. The dense touch case above still passes with the larger areas. Unlocked army tiles stretch taller than their content (287 against 248 pixels at 390×844). On tall touch views, Add and Brew grow to 40 pixels into that room, ×5, Fill, Remove and All grow to 36, and Remove and All sit 8 pixels apart. Locked tiles keep their size: they are already the tallest, and their controls are disabled. The army strip therefore scrolls no further than before (338 pixels of content in a 306-pixel strip, before and after). `tests/browser/army-touch.spec.ts` checks the sizes on every unlocked tile of a developed village, and checks that no tile's content spills out of its box. It also trains a troop with a tap and confirms mouse layouts keep the compact tiles. The Shop's category tabs grow from 30 to 44 pixels. The sheet sizes to its content, so it gets 14 pixels taller and its building strip keeps its 191 pixels; the same spec checks both.

## Dialogs and safe areas

The page uses `viewport-fit=cover`, and the installed iOS app draws under a translucent status bar, so dialogs must avoid device insets as the HUD does. The dialog backdrop padded a fixed 12 pixels on phones, which is not enough. With iPhone insets emulated, a full-height dialog reached 47 pixels under the status bar and Dynamic Island in portrait. Its close button reached 27 pixels in. In landscape, the dialog reached 11 pixels under the notch.

`.modal-backdrop` now pads each side by `max(--backdrop-pad, env(safe-area-inset-*))`, with a base of 30, 12 or 10 pixels by breakpoint. Dialogs and the raid result cap their height at 100% of that padded box, instead of `100dvh` less the base padding. With no insets the size is the same.

`tests/browser/safe-area.spec.ts` sets real `env()` insets through Chromium's `Emulation.setSafeAreaInsetsOverride`: 59/34 pixels in portrait and 59/59/21 in landscape. It opens the campaign list, which fills a phone, checks that the dialog and its close button stay inside the safe area, and closes the dialog with a tap. A third case confirms the unchanged 12-pixel margin without insets. Before the fix, both inset cases failed. Physical notched devices have not been checked.

## Verification

`tests/browser/hud-layout.spec.ts` checks 19 viewports for both starter and developed villages, including both sides of the 700/701-pixel width and 799/800-pixel aspect-ratio boundaries. Five points inside each main HUD control must hit that control. Each viewport also clicks the measured center of Zoom out and requires a zoom change. Representative small views open Settings and collect resources without changing zoom. Side tools must remain at least 44 pixels in each dimension; short starter trays must not acquire unused trailing width.

A 3× touch case rotates between phone sizes, reserves inset space, scrolls the army tray to Train, opens Army and Shop, and uses the camera controls in Edit mode. A first-run case completes Collect, opens the highlighted Shop and uses Skip at three compact sizes. Existing gameplay, army-roster, resource-flight and placement-preview cases run alongside these checks in Chromium and WebKit. The density integration configuration and WebKit CI selection include this file.

Run the focused checks with:

```sh
npx playwright test tests/browser/hud-layout.spec.ts
npx playwright test tests/browser/hud-layout.spec.ts --config=playwright.retina.config.ts --browser=webkit
```

Screenshots and the full release evidence are recorded in [QA.md](QA.md). These checks cover the main village HUD, named interactions and tested viewports. Full native UI parity, physical-device ergonomics and the other outstanding game systems remain part of the ongoing work.
