# Compact village controls

The previous HUD positioned side tools using a percentage of screen height while independently anchoring Attack, Collect and Shop to the bottom. At 844×390, pressing the center of Zoom out actually hit Collect. Shorter portrait and landscape views also put activity buttons behind Attack or moved controls beyond the viewport. The old landscape breakpoint excluded phones narrower than 701 CSS pixels.

`src/ui/compact-hud.css`, imported after the base stylesheet, gives short views explicit control rows and space for the army tray. Camera, Settings and activity buttons have 44×44 CSS-pixel targets. Their hit areas are checked directly; DOM visibility alone did not catch the old obstruction.

- Up to 700 pixels high, side tools use compact grids and explicit clearance above the bottom actions. Edit mode has a single row of three camera controls.
- On narrow, short portrait views, Collect sits between Attack and Shop. The decorative village caption is omitted to leave that row clear. The camera/settings grid stays at the right edge and the activity grid at the left.
- Landscape views up to 600 pixels high and at least 4:3 use one bottom row: Attack, army, Collect and Shop. Settings and the camera row sit above the right-hand actions. Explicit button sizes replace the previous blanket scale transforms in this layout.
- The landscape army tray hugs a short roster instead of stretching an empty panel across the map. Larger rosters keep horizontal scrolling. Its available region reserves 114 pixels after the left inset and 196 before the right inset for the adjacent controls and their gaps.
- Edge variables include browser safe-area insets. A touch regression reserves 44 pixels on each side and 21 at the bottom in a 568×320 view; this verifies the CSS spacing contract, not a physical notch/home-indicator device.

The new rules preserve the existing game actions, modal/drawer behavior, art, camera coordinates, economy, save format and combat rules. Views taller than 700 CSS pixels retain their previous HUD layouts.

## Verification

`tests/browser/hud-layout.spec.ts` checks 19 viewports for both starter and developed villages, including both sides of the 700/701-pixel width and 799/800-pixel aspect-ratio boundaries. Five points inside each main HUD control must hit that control. Each viewport also clicks the measured center of Zoom out and requires a zoom change. Representative small views open Settings and collect resources without changing zoom. Side tools must remain at least 44 pixels in each dimension; short starter trays must not acquire unused trailing width.

A 3× touch case rotates between phone sizes, reserves inset space, scrolls the army tray to Train, opens Army and Shop, and uses the camera controls in Edit mode. A first-run case completes Collect, opens the highlighted Shop and uses Skip at three compact sizes. Existing gameplay, army-roster, resource-flight and placement-preview cases run alongside these checks in Chromium and WebKit. The density integration configuration and WebKit CI selection include this file.

Run the focused checks with:

```sh
npx playwright test tests/browser/hud-layout.spec.ts
npx playwright test tests/browser/hud-layout.spec.ts --config=playwright.retina.config.ts --browser=webkit
```

Screenshots and the full release evidence are recorded in [QA.md](QA.md). These checks cover the main village HUD, named interactions and tested viewports. Full native UI parity, physical-device ergonomics and the other outstanding game systems remain part of the ongoing work.
