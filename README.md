# Crown & Clan

A frontend-only isometric village strategy game inspired by the building, training, and raiding loop of Clash of Clans. Original generated artwork, Phaser 4, TypeScript, Vite, and a responsive DOM interface.

## Run

Requires Node 22.12+ (developed with Node 26).

```sh
npm ci
npm run dev
```

Open http://localhost:5173. The village begins with an established settlement and a trained army so every core interaction is immediately available.

```sh
npm run build
npm run preview -- --port 4173
```

For preview, use http://127.0.0.1:4173. `dist/` is a self-contained static deployment. Serve it over HTTPS for offline support and safe session ownership (localhost is also supported). No backend, API keys, CDN dependencies, paid services, or runtime AI calls are required.

## Play

- Drag or use WASD / arrow keys to pan. Scroll, pinch, or use the camera buttons to zoom.
- Select a building to move, upgrade, or finish construction with gems.
- Use Shop to place buildings. A clear green footprint is required. Escape cancels placement.
- Click resource bubbles or Collect to collect gold and elixir.
- Train troops individually or five at a time through the army tray. Camp capacity includes queued units. “Train previous army” replenishes deployed troops without duplicating ready or queued units. Additional completed barracks shorten training times.
- Upgrade the laboratory, then open Research from its building controls or the army menu. Research unlocks troop levels 2 and 3, with permanent health and damage increases. Research completes while away and can be finished with gems.
- Attack opens the 12-stage campaign. Select a troop and tap outside the enemy's deployment boundary. Keys 1–4 select troops.
- Giants prefer defenses. Archers fire at range. Wizards deal splash damage. Walls can be broken; solid buildings block movement.
- Earn one star for 50% destruction, one for destroying the Town Hall, and one for 100%. A star unlocks the next stage.
- Deployed troops are consumed; undeployed troops remain in your village. Closing the browser during a raid forfeits deployed troops and unclaimed loot.
- Only one tab can play a village at a time. A second tab waits until the first closes, then loads the latest save.
- Progress saves in IndexedDB with a localStorage backup. Settings includes export/import. Importing replaces the current village. Resource accumulation while away is capped at 8 hours and collector storage.

## What is implemented

- 12 building types plus walls; 3 progression levels, with distinct final-level artwork for all 12 structures.
- Building placement, relocation, builder reservations, construction, upgrades, collection, resource storage, and camp capacity.
- Four troops, four-frame walking sprites, three research levels, batch training and army replenishment, targeting, A* navigation, wall breaking, defense attacks, splash damage, destruction, results, and campaign progress.
- 12 independently authored campaign layouts with different fortifications, escalating defenses, tactical previews, and suggested army sizes.
- Responsive HUD, shop, training, campaign, help, persistent quest rewards, settings, reduced motion, generated sound effects, and optional ambient tones.
- Automatic saves, exclusive tab ownership, validated import/export, self-hosted fonts, optimized WebP assets, and production offline caching.

## Architecture

`src/game/model.ts` owns serializable state and gameplay rules. Its combat simulation runs at a fixed 20 Hz. `src/game/data.ts` defines the catalog and troop tuning; `src/game/campaign.ts` owns enemy blueprints and stage tuning. `src/game/scene.ts` owns Phaser rendering, animation, camera, and input mapping. `src/ui/hud.ts` owns DOM menus and HUD. `src/game/save.ts` validates and persists saves. `src/game/session.ts` prevents concurrent writers using the browser Web Locks API. No Phaser objects enter saved data.

In development, `window.__game` exposes the model and scene, and `window.advanceTime(ms)` advances simulation for tests. `window.render_game_to_text()` provides a compact structured snapshot in both builds.

## Verification

```sh
npm test
npx playwright install chromium webkit
npm run test:e2e
npm run build
# With the preview server running:
node scripts/production-check.mjs
```

Simulation tests cover placement collisions, construction, upgrades, builder reservation, caps, training, save validation, pathfinding, battle completion, deployment, and campaign unlocks, research completion, batch training, and a 144-battle matrix across twelve stages, three armies, and four approaches. Browser tests exercise actual menus and pointer input, reload persistence, mobile layout, battle results, focus handling, camera controls, research, tab handoff, graphics-context loss/recovery, and twenty consecutive raids. Production smoke checks cover Chromium, WebKit, and offline reload.

Screenshots and reports are written to `output/playtest/` (not shipped). See `docs/QA.md` for verified coverage and remaining release limits.

## Assets

Source artwork and generation records are in `art/source/` and `docs/ASSETS.md`. Optimized assets live in `public/assets/`. Rebuild them with `npm run assets`. The normal build does not regenerate artwork or call an image service.

## Current scope

This is a complete playable local game loop, not a full commercial Clash of Clans content replacement. It has no server-authoritative multiplayer, accounts, clans, matchmaking, purchases, or cloud sync. Local clocks and saves are intentionally user-controlled. Level 1 and 2 buildings share base artwork; level 3 uses a separate set. Units have four-frame walking animation and simple attack feedback, rather than full directional attack/death animation sets. Each campaign stage now has a distinct authored layout. Existing version-1 saves remain compatible; new research and army-composition fields are optional. Physical iOS/Android device performance, multi-hour sleep/resume endurance, broader army-composition balance testing, and accessibility review remain release gates before a public production launch.
