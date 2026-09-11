# Native-density rendering

The village now renders into the screen's available physical pixels. Previously the Phaser canvas stayed at one pixel per CSS pixel on every screen, so the browser enlarged the completed village image on Retina and 3× displays. The HUD already used browser-rendered text and controls.

`src/game/display.ts` sizes the canvas buffer from its parent's CSS dimensions and `window.devicePixelRatio`. A 1440×960 Retina viewport gets a 2880×1920 buffer; a 390×844 phone at 3× gets 1170×2532. CSS keeps the canvas filling its parent. Phaser's `NONE` scale mode and `scale.resize` update the renderer, camera dimensions, canvas bounds and input conversion together. This follows the [ScaleManager resize contract](https://docs.phaser.io/api-documentation/class/scale-scalemanager). The pinned Phaser 4.2.1 implementation has no general WebGL `resolution` configuration property, so adding such a property would not fix the buffer.

The buffer has a 16-million-pixel budget, equivalent to 64 MB of RGBA color pixels before depth/stencil, antialiasing and driver allocations. Each side is also bounded by 8192 and the GPU's reported texture, renderbuffer and viewport limits. Very large displays therefore render at a lower effective density. Integer buffer dimensions are rounded down, with separate horizontal/vertical camera scales preventing fractional-density rounding from stretching the world. This is a bounded allocation policy, not a claim about total GPU memory consumption.

## Coordinates and resizing

The camera operates in physical buffer coordinates. `viewZoom`, `baseZoom` and `setZoom` use CSS pixels per world pixel, preserving the existing view at every density. Phaser converts canvas input into buffer coordinates. DOM shop drags use the same conversion explicitly; `screenFor` returns DOM coordinates for context cards and browser pointer actions. Pan movement divides by each camera axis's zoom. Tap tolerances and pinch distances use CSS pixels, so a small finger wobble does not become a drag on a dense screen. Resource flights use the same physical-to-CSS mapping when leaving a producer for its HUD counter.

A `ResizeObserver` watches the canvas parent. The display-density media query is renewed when density changes, following [MDN's devicePixelRatio guidance](https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio). Chromium's device-metrics override changed the value and query match without delivering either a media-query or window-resize event during testing. A single density comparison before each game step covers that case and delayed display notifications, with no per-frame resize or allocation. The observer and listeners are removed when the game is destroyed.

Resizing preserves world center and CSS zoom within the new viewport limits. It cancels a held map gesture, clears collection particles and the DOM placement pointer, and remaps a stationary mouse cursor into the new buffer. The density does not enter saves, simulation rules or replay data.

## Verification and reproduction

`tests/display.test.ts` checks ordinary native buffers, fractional browser zoom, the large-display allocation budget and smaller GPU dimension limits. `tests/browser/display-density.spec.ts` exercises 2× desktop, 3× phone and fractional-density views. It verifies buffer dimensions, real pointer selection, the CSS drag threshold, pan distance, placement preview, committed placement, rotation, and individual alternating one-physical-pixel stripes. Full framebuffer RGBA values, including the frozen buildings, troops, text and terrain, must match before and after graphics context loss/restoration. A Chromium CDP case changes density on the same live page from 1× to 2×, 1.25× and back, retaining framing and cancelling held gestures. A second Chromium CDP case injects a native two-finger pinch at 3× and checks CSS zoom without a false building selection. These two CDP cases are Chromium-only; WebKit still covers static density, rotation, touch selection and recovery.

The existing touch scenario uses a 3× mobile context. Production checks now use 2× contexts in Chromium and WebKit, including actual deployment, replay, resizing, tab handoff and Chromium offline reload. They assert the desktop and landscape drawing-buffer dimensions without development globals.

Run the density and Retina integration suite with `npx playwright test --config=playwright.retina.config.ts` (add `--browser=webkit` for WebKit). CI also runs the existing terrain and camera cases at 2× in WebKit.

For a hardware sample on macOS:

```sh
node scripts/performance-check.mjs --camps --metal --density=2
node scripts/performance-check.mjs --camps --metal --density=3 --viewport=390x844
```

The benchmark reports actual density, CSS dimensions, canvas dimensions, browser version, GPU and host load. The phone viewport on a Mac remains a Mac GPU test. Physical phones/tablets, other GPUs and thermally constrained sessions still need measurement. Native-density rendering exposes more of the existing source artwork; it does not increase its source resolution or establish pixel parity with the native game. See [QA.md](QA.md) for measured results.
