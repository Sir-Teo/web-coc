# Visual quality pass — September 11, 2026

The original Air Defense, Spell Factory and Balloon replacement artwork is documented in [AIR-MAGIC-ART.md](AIR-MAGIC-ART.md), including exact prompts, accepted source paths, rejected opaque output and deterministic rebuild instructions.

## Rendering fixes

- Collection particles are browser HUD elements. Their starting point is projected from the producer's world position into CSS pixels, and their destination is the visible resource counter. Panning and zooming during flight no longer shifts either endpoint. Animations remove their elements on completion or cancellation; resizing, scene transitions and reduced motion clear outstanding flights.
- Resource bubbles track their producer's current position, sprite height and display depth. Moving a mine previously left its bubble at the old location (the regression fixture measured a 320-world-pixel horizontal error). Changing reduced motion now stops an already-running bubble tween. Removing a producer also removes its bubble and tween.
- Dark elixir bubbles use a dark violet glyph instead of the regular elixir color.
- Balloons render at a larger battlefield scale, use a slower four-frame sway, and float smoothly instead of inheriting the ground troops' rapid movement bob. Their attack, health, housing and simulation timing are unchanged.

The particle lifecycle uses the browser's [Web Animations API](https://developer.mozilla.org/en-US/docs/Web/API/Element/animate); the game renderer remains responsible for village/world effects.

## Verification

- All **132 simulation/save tests** passed; TypeScript and the production build passed.
- All **57 Chromium browser scenarios** passed in one uninterrupted run, including the twenty-raid transition check, heroes, placement, phone layouts, replay seeking and sharing.
- All **four new visual-feedback scenarios** passed in WebKit as well as Chromium. They exercise collection start/end positions at different camera scales, camera changes during flight, relocation, reduced motion, removed producers, completion cleanup and viewport changes.
- Compared the decoded pixels of all six live Phaser textures with their accepted WebP files in both Chromium and WebKit. All matched. Actual pointer deployment selected and rendered the new Balloon atlas with no browser or asset errors.
- Rebuilt the six new assets and compared SHA-256 hashes: identical. All five source images and all six outputs have real alpha transparency. Source originals remain outside the public build.
- Production smoke checks passed in Chromium and WebKit for boot, shop, research and tab ownership transfer, plus Chromium offline reload and army access. The offline manifest contains 79 files.
- A fresh four-second local performance sample measured 59 FPS in both the village and a deployed battle, with 16.8 ms 95th-percentile frame times. This is headless Chromium at 1440×960 on the local Mac, not a physical-phone benchmark.

The automated deployment checks are documented in [RELEASE-VERIFICATION.md](RELEASE-VERIFICATION.md).

Review evidence is under `output/playtest/`: `air-magic-visual-report.json`, `air-magic-hashes.json`, `collection-feedback-chromium.png`, `collection-feedback-webkit.png`, `balloon-scale-chromium.png`, `balloon-scale-webkit.png`, and the `air-magic-*` desktop/phone/landscape captures. Reports and screenshots are development evidence, not shipped game assets.

This pass does not establish pixel-identical official artwork, full directional animation, complete content parity, physical-device certification, multiplayer or commercial production readiness. Those remain open in [EXPERIENCE-PARITY.md](EXPERIENCE-PARITY.md).
