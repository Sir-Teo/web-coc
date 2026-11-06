# Testing

## Everyday checks

```sh
npm run check
```

This typechecks unit tests and shared fixtures, checks documentation links, runs
the Vitest suite, typechecks runtime code and builds the production app with its
service worker. It does not start a browser or deploy anything.

| Command                              | Use                                                   |
| ------------------------------------ | ----------------------------------------------------- |
| `npm test`                           | Unit, simulation, replay, save and asset tests        |
| `npx vitest run tests/model.test.ts` | One focused test file                                 |
| `npm run typecheck`                  | Strict runtime types, including unused code           |
| `npm run typecheck:tests`            | Unit test and shared fixture types, including imports |
| `npm run test:docs`                  | Local Markdown file links in project documentation    |

The test project intentionally uses looser types than runtime source, but all its
diagnostics must pass. Browser specs run through Playwright separately.
`npm run test:imports` remains an alias for the complete test-project typecheck.

## Browser checks

Install browsers once, and again when Playwright changes:

```sh
npx playwright install chromium webkit
npm run test:e2e
npx playwright test tests/browser/game.spec.ts --browser=webkit
npx playwright test --config=playwright.retina.config.ts --browser=webkit
```

The default configuration uses Chromium and starts Vite on port 5173. It may reuse
an existing local dev server; CI always starts its own. Stop unrelated servers on
that port before testing. The Retina configuration runs its selected specs at 2×
device scale. Traces and failure screenshots go under `output/`.

Specs wait for `window.__game.scene.artSettled` rather than `scene.ready`: `ready`
turns true once the home village can draw, before the post-boot art batch has
loaded. Desktop development preloads every defense family after boot; coarse-pointer
phone previews use production's load-on-first-use behavior. Add `?eagerart` for a phone
art gallery, or `?lazyart` to force demand loading on any device (it wins if both are
present; see [the architecture guide](ARCHITECTURE.md)). Wait on `ready` only to test that
window itself.

`artSettled` only says nothing is still loading; it does not prove anything drew.
Rendering changes that touch deferred families need a `?lazyart` case that asserts
the drawn output too (see `tests/browser/deferred-families.spec.ts`): a first visit
that scouts before the family lands (native meshes must not keep Phaser's missing
texture), and a failed page (the fallback sprite stays visible, the battle is not
held, and the family loads once the network returns). The eager dev default missed
an invisible first-campaign Town Hall that only the production path produced.

Map actions must stay reachable without a pointer: B opens a list of every building
(selecting one focuses its card), and M toggles a tile cursor that arrows or WASD move and
Enter or Space act on (select, place, deploy), announced through `#map-announcer`.
Enabling the cursor focuses the map, including when a battle control held focus;
Enter and Space must deploy rather than activate that previous control. Battle
results trap focus and block map movement, cursor toggles, zoom and troop shortcuts
until the player returns to the village or starts another battle.
Army search and both filter selects must stay mounted while filtering, clearing
filters and adding troops. The campaign pickers must also survive filtering,
section jumps and progress refreshes. Replacing a select during its input event
can stall WebKit's native picker; restoring focus to a new select does not repair it.
`RESERVED_KEYS` in `src/game/data.ts` keeps troop and spell shortcuts off these keys.

For visible changes, inspect desktop and phone layouts, pointer/touch input,
reduced motion and relevant replay pause/seek behavior. Automated pixel or layout
checks do not replace reviewing the actual rendered result.

Touch-only styles (finger-sized controls, larger touch text and hit areas, the share sheet) key on
`(pointer: coarse)`. A spec that depends on it checks `matchMedia('(pointer: coarse)')` after boot. If an
engine's touch emulation does not report a coarse pointer, the spec skips with that reason rather than
failing in WebKit CI. Mouse cases skip in the opposite situation. Specs that inject native touches or
safe-area insets use CDP or constructed `Touch` objects, and run in Chromium only.

## Production and offline checks

```sh
npm run build
npm run test:production
```

The production runner owns an isolated preview server and exercises Chromium and
WebKit. Chromium also checks offline reload. See [release verification](RELEASE-VERIFICATION.md)
for coverage, reports, feature-specific runners and deployment requirements.

## Asset changes

Use the changed importer's `--check` mode where supported and run its asset tests.
Native reconstruction needs the pinned source client and Python dependencies; it is
not part of ordinary app setup. See [assets](ASSETS.md) and [script conventions](../scripts/README.md).

## Failures and evidence

Reproduce a failing file on its own before changing timeouts or worker counts. Save
the command, commit, browser and failing assertion in the PR. `output/` is ignored;
upload useful traces or screenshots as review/CI artifacts instead of committing them.

Historical milestone results are available in Git history. They are not evidence
that the current revision passes. Current CI and fresh reports are the release record.

## Comparable battle load measurements

Use `node scripts/battle-load-benchmark.mjs --mobile --army=th18 --level=half
--lazyart --checkpoint=2 --detail=2 --density=0.5 --warmup=8 --seconds=6 --gl`
(on one line) to start from an exact two-second simulation checkpoint and hold
rendering detail and canvas density during measurement. Add `--freeze` to hold the
battle throughout measurement. Checkpoint runs report complete battle-state hashes;
frozen runs reject any state mutation. Compare matching starting hashes, canvas
sizes, detail levels, army levels and CPU settings. Live runs stop simulation at
the end of the timed interval before collecting their final report.

Without these controls, adaptive resolution and warmup progress can produce different
battle workloads. Headless software-rendered Chromium and `--cpu=4` are diagnostic
comparisons; they do not establish performance on a physical phone. Repeat warmed
runs without concurrent tests or builds, and report variation with the results.

`--mobile` uses an Android user agent as well as touch input and a phone viewport.
Phaser 4.2.1's default `autoMobileTextures` policy selects one texture per batch for
Android/iOS. Touch emulation alone leaves Phaser's desktop OS detection intact;
older `--mobile` reports therefore exercised the desktop batching policy. Use
`--mobile --agent=desktop` to reproduce that input/OS combination. Reports include
the user agent, Phaser version, detected OS, automatic policy and actual render-node
limits. Keep these fields consistent when comparing runs.

Add `--samplers=4` to cap the fragment texture units reported to the renderer before
boot. This tests the tradeoff between smaller sampler shaders and more draw calls
without changing source artwork. Supported caps are 1, 2, 4, 8, 16 and 32; the
real device may enforce a lower limit. Compare `rendering.maxTextures` as well as
canvas and battle hashes. This benchmark control does not change the game's
normal renderer budget. A held-state gain alone does not establish a live-battle
improvement; repeat live runs in both orders before choosing a renderer change.

Use `--batch-textures=4` to change the render-node batching budget through Phaser's
public manager API, independently of the emulated `--samplers` hardware ceiling.
It supports the same values and clamps to the renderer's hardware limit. Compare
`rendering.maxParallelTextureUnits` and `rendering.nodeTextureLimits`, rather than
assuming `rendering.maxTextures` is the batching budget. For an Android one-versus-four
comparison, keep `--mobile --agent=android` and all checkpoint/rendering controls the
same, changing only `--batch-textures`. Neither control changes the normal game's policy.
