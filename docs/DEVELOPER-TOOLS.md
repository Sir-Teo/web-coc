# Developer testing tools

Open the game with `?devtools=1`:

- Development: `http://localhost:5173/?devtools=1`
- Production preview: `http://localhost:4173/?devtools=1`
- Hosted game: `https://coc.teozeng.dev/?devtools=1`

Click **DEV** in the lower-right corner, or press **Ctrl/⌘ Shift D**. Escape closes the panel. The scene and attack simulation pause while the panel is open; real-time construction and resource production continue. Keyboard input stays inside the dialog.

The panel is organised into six tabs — **Village**, **Army**, **Levels**, **Heroes**, **World** and **Battle & save**. The checkpoint buttons and the status line stay above the tabs, so they are reachable from anywhere.

## Village

| Tool                            | Behavior                                                                                                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TH1 – TH18 preset buttons       | Rebuild the village as a complete Town Hall of that tier in one click. The small number on each button is how many pieces that tier owns.                                                   |
| Build maxed village             | The same preset with the parts switched off individually: walls, research, heroes, army, resources, campaign stars.                                                                         |
| Set Town Hall                   | Set TH1–18 directly and refresh its hitpoints. Existing buildings remain intact when lowering the Town Hall.                                                                                |
| Max existing buildings          | Complete construction and raise existing buildings to the selected Town Hall's ceilings. Grandfathered higher levels remain intact. Does not create every building or change the Town Hall. |
| Finish all timers               | Complete building construction/upgrades, hero and pet upgrades and research without spending gems or advancing the wall clock.                                                              |
| Set every building of this kind | Pick any kind the village owns and give every copy of it one explicit level, with matching hitpoints.                                                                                       |
| Set balances                    | Set gold, elixir, dark elixir and gems independently, including above storage capacity.                                                                                                     |
| Fill storage                    | Fill actual gold/elixir/dark storage capacities and set gems to 10,000. Dark capacity remains zero without a storage building.                                                              |
| Fill ores                       | Fill shiny, glowy and starry ore to the Blacksmith's capacity.                                                                                                                              |
| Set trophies and XP             | Set both counters directly.                                                                                                                                                                 |

### Maxed village presets

`maxTownHall(level)` replaces the whole village rather than editing it in place:

- Every building the tier permits, at that tier's count and upgrade ceiling (`BUILDING_COUNTS` and `BUILDING_LEVELS` in `src/game/tiers.ts`), laid out fresh by `src/dev/village.ts`.
- The layout grows outward from a central Town Hall: buildings take the free position nearest the middle, largest first, so one-tile traps fill what is left over. One tile of walking room is kept between buildings when the tier can afford it; a late tier that needs every tile packs them together. Walls then ring the result, innermost ring first.
- Research goes as far as the new Laboratory allows, heroes/pets/gear to the ceilings of the new Hero Hall, Blacksmith and Pet House, camps and spell housing are filled from the unlocked roster, and storages are filled.
- Saved layouts and obstacles are cleared — both describe the arrangement being replaced — and progress the new halls cannot support (heroes, pets, gear, ores at a tier with no Hero Hall) is reset rather than carried over, so lowering the Town Hall produces a consistent village.

A maxed Town Hall 18 village is 483 pieces: 158 buildings and 325 walls. `MAX_SAVED_BUILDINGS` in `src/game/save.ts` is 600 for that reason; at the previous 400 no village above Town Hall 10 could be represented at full count.

## Army

| Tool                       | Behavior                                                                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fill camps with a mix      | Split camp housing evenly across every unlocked, non-siege troop, then fill the siege reserve. Spell housing is filled the same way.                    |
| Fill camps with this troop | Spend all camp housing on one chosen troop.                                                                                                             |
| Ready-made army            | Set 20 of every troop and five of every spell, or clear all troop/spell counts.                                                                         |
| Saved configurations       | Name the current army and keep it in this browser (up to twelve). Loading one applies it exactly. These are separate from the three in-game army slots. |
| Set army                   | Set individual troop and spell counts. Test armies may exceed normal camp/spell capacity.                                                               |

## Levels

Every troop's and spell's research level, each with the game's own ceiling shown on the field, applied as one batch. **Max troop research** takes every troop and spell to its absolute ceiling regardless of Laboratory level; **Research to this laboratory** takes them as far as the village's Laboratory actually allows.

## Heroes

Unlock the King, level any hero within its Town Hall and Hero Hall cap, level any pet the Pet House has granted, and level any owned hero item within its Blacksmith cap. **Max heroes, pets and gear** does all of it at once, assigns pets to the hero lineup and fills ore storage.

## World

Campaign stars for both catalogs (12 Valley stages, 90 Goblin stages), and time travel: **+1 hour**, **+1 day**, **+7 days** or an arbitrary number of hours. Time travel moves every timer and production clock back by the chosen span and settles the village, so collectors, builders, research and hero upgrades advance exactly that far without the wall clock moving. Production lands in the mines and collectors, which still have to be collected.

## Battle & save

Finish the current attack with three stars or its current score, or **destroy to a percentage** — the weakest standing buildings fall until the attack sits at (or just past) the requested destruction. Walls, traps and concealed Teslas are not spent reaching it, because they are not scored.

The save section copies or downloads the village as JSON — the same format as Settings → Export village — and imports a pasted village after migrating and validating it. An invalid paste is rejected without touching the current village.

Changes use normal automatic saving. Village edits are blocked during an attack. Invalid numeric values are rejected before committing the change, so a bad field cannot partially apply a batch.

## Checkpoints

The first toolbox load takes a checkpoint automatically. **Take checkpoint** replaces it with the current home village. **Restore checkpoint** exits the current battle and restores that snapshot; current audio/accessibility preferences remain in effect. Normal timer/offline processing then applies to the restored save.

The checkpoint survives reloads in the same tab through `sessionStorage`; closing the tab ends that checkpoint's lifetime. If browser storage is unavailable, the in-memory checkpoint remains usable until reload. Settings → Export village remains the way to keep a durable backup.

## Console API

While enabled, `window.__dev` exposes the same validated controls:

```js
__dev.maxTownHall(15); // a complete Town Hall 15 village
__dev.maxTownHall(9, { walls: false, army: false }); // parts of one
__dev.plan(12); // what a Town Hall 12 village would contain
__dev.fillArmy(); // camps filled from the unlocked roster
__dev.fillArmy({ troop: 'dragon', spells: false });
__dev.setResources({ gold: 1000000, elixir: 1000000, dark: 20000, gems: 10000 });
__dev.setArmy({ giant: 20, archer: 40 }, { rage: 3, heal: 3 });
__dev.setBuildingLevel('cannon', 12);
__dev.setResearch({ archer: 9 }, { rage: 5 });
__dev.setHeroLevels({ king: 80, queen: 80 });
__dev.setPetLevel('lassi', 10);
__dev.setItemLevel('barbarian-puppet', 18);
__dev.advanceTime(24 * 3600); // one day of production and timers
__dev.setCampaignStars(3);
__dev.damageBattle(75);
__dev.exportSave();
__dev.importSave(json);
__dev.restore();
```

Partial resource/army records leave unspecified types unchanged. `checkpoint()` returns a deep-cloned snapshot; use the panel's Take checkpoint button to also update the tab's persistent checkpoint.

## Availability and implementation

The URL must explicitly include `devtools=1`. The toolbox is allowed in Vite development builds, including LAN testing, on exact loopback production-preview hosts (`localhost`, `127.0.0.1`, `::1`), and on `coc.teozeng.dev`. It stays disabled on other deployed hosts even with the query parameter. There is no secret password, saved admin flag, account bypass, or remote endpoint. This is a testing convenience in a client-controlled game, not a server authorization mechanism.

`src/dev/access.ts` owns availability, `controls.ts` owns atomic save mutations, `village.ts` owns the maxed-village plan and its layout, `loadout.ts` owns army composition and the stored configurations, and `panel.ts` owns the optional dialog/console API. The panel loads as a separate chunk only when enabled. No core gameplay rules depend on the toolbox.

Verification: `tests/developer.test.ts`, `tests/developer-village.test.ts`, `tests/browser/developer.spec.ts`, and `scripts/developer-check.mjs`. Run the production script with a built game served on port 4173.

The ten-troop expansion migrates older seven-troop checkpoints before validating them, retaining the checkpoint instead of replacing it with current progress. Actions and form submissions restore focus to their activating control across Chromium and WebKit, including WebKit pointer clicks that do not automatically focus buttons.
