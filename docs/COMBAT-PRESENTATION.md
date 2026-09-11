# Combat presentation — September 11, 2026

Attacks now emit weapon identity, source/target ids and target layer to the renderer. The scene draws arrows, iron cannonballs, red-tipped rockets with exhaust, fireballs, violet arcane bolts, and falling fused bombs. Defense shots originate above the building body, airborne targets lift the endpoint, and melee impact marks appear on the target instead of at the attacker's feet.

`CombatEffects` owns its temporary graphics and tweens. Impacts and projectiles remove themselves; entering another battle, returning home, rewinding a replay, and shutting down the scene cancel outstanding effects without delayed impact callbacks leaking into the new scene. Reduced motion shows short stationary hit marks. Switching reduced motion on also cancels an already-flying shot.

Stone/timber wreckage and subdued ground scars replace the old flattened intact sprites. See [DESTRUCTION-ART.md](DESTRUCTION-ART.md) for original generated sources, saved asset paths and exact prompts. Ruins keep their source aspect ratio and world position, and sit below live troops. Return-home and replay reconstruction restore intact artwork and its original anchor.

## Verification

- Eight simulation scenarios verify real melee/ranged troop and defense attack events, weapon identity, target ids/layers, unchanged attack damage and one event per cooldown. The full 140-test simulation/save suite passes.
- Five browser scenarios cover rubble materials and aspect ratios, restoration of a fully destroyed practice village, real troop projectile creation, cancellation of pending impacts on return home, stationary reduced-motion hit feedback, and cancellation when reduced motion is enabled mid-flight. All five pass in WebKit.
- The targeted Chromium run also passes replay rewind/sharing, graphics context loss/recovery, tab ownership transfer and twenty consecutive raid transitions.
- The full Chromium run passed 61 scenarios and exposed a slider-layout lookup race in the additional, uncommitted phone replay test. Waiting for visible slider bounds resolved it; all nine repeated desktop/phone/sharing replay checks then passed. A separate recorded Lightning attack confirmed destroyed Town Hall rubble at the end and intact artwork after rewinding to zero.
- An isolated checkout of the committed changes independently passes 115 simulation tests, TypeScript, and the production build. Both that checkout and the complete working tree pass Chromium/WebKit production checks with no browser errors, including all eight replacement art assets, collection feedback and tab handoff. Offline Chromium reload and army controls pass with all 81 manifest files cached.
- Both original rubble assets retain real alpha and rebuild byte-for-byte identically. Reviewed desktop and phone rubble captures and renderer-native weapon previews in `output/playtest/`.
- Local headless Chromium at 1440×960 measured 59 mean FPS both idle and in battle, with battle p95 frame time 16.8 ms. This is a desktop automation measurement, not physical-device certification.

## Remaining work

The subsequent [projectile simulation pass](PROJECTILE-SIMULATION.md) moves ranged damage and flight onto the battle clock, including wall attacks, splash, pending-shot termination rules, and replay reconstruction. Exact live-game flight speeds and attack statistics remain unverified.

Per-building wreckage, level-specific destruction, directional attack/death animation, persistent damage smoke, distinct weapon audio and complete roster behavior also remain open. This pass does not establish full production or content parity.
