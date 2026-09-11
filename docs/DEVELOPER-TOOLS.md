# Developer testing tools

Open the local game with `?devtools=1`:

- Development: `http://localhost:5173/?devtools=1`
- Production preview: `http://localhost:4173/?devtools=1`

Click **DEV** in the lower-right corner, or press **Ctrl/⌘ Shift D**. Escape closes the panel. The scene and attack simulation pause while the panel is open; real-time construction and resource production continue. Keyboard input stays inside the dialog.

## Controls

| Tool | Behavior |
| --- | --- |
| Set balances | Set gold, elixir, dark elixir and gems independently, including above storage capacity. |
| Fill storage | Fill actual gold/elixir/dark storage capacities and set gems to 10,000. Dark capacity remains zero without a storage building. |
| Set army | Set individual troop and spell counts. Test armies may exceed normal camp/spell capacity. |
| Ready-made army | Set 20 of every troop and five of every spell, or clear all troop/spell counts. |
| Max troop research | Set all supported troop research to level 5, bypassing laboratory requirements. |
| Set Town Hall | Set TH1–8 directly and refresh its hitpoints. Existing buildings remain intact when lowering the Town Hall. |
| Max existing buildings | Complete construction and raise existing buildings to the selected Town Hall's ceilings. Grandfathered higher levels remain intact. Does not create every building or change the Town Hall. |
| Finish all timers | Complete building construction/upgrades, hero upgrades and research without spending gems or advancing the wall clock. |
| Unlock campaign | Ensure every stage has at least one star, preserving existing higher scores. |
| Unlock King | Raise Town Hall to at least 4 and place a completed Hero Hall in a legal empty footprint, or finish an existing hall. |
| Set King level | Change the unlocked King's level within the current TH/Hero Hall cap. For level 20: unlock King, set TH8, max existing buildings, then set King level 20. |
| Battle outcomes | Finish the current attack with three stars or its current score, using normal result/reward/history logic. |

Changes use normal automatic saving. Village edits are blocked during an attack. Invalid numeric values are rejected before committing the change, so a bad field cannot partially apply a batch.

## Checkpoints

The first toolbox load takes a checkpoint automatically. **Take checkpoint** replaces it with the current home village. **Restore checkpoint** exits the current battle and restores that snapshot; current audio/accessibility preferences remain in effect. Normal timer/offline processing then applies to the restored save.

The checkpoint survives reloads in the same tab through `sessionStorage`; closing the tab ends that checkpoint's lifetime. If browser storage is unavailable, the in-memory checkpoint remains usable until reload. Settings → Export village remains the way to keep a durable backup.

## Console API

While enabled, `window.__dev` exposes the same validated controls:

```js
__dev.setResources({ gold: 1000000, elixir: 1000000, dark: 20000, gems: 10000 });
__dev.setArmy({ giant: 20, archer: 40 }, { rage: 3, heal: 3 });
__dev.setTownHall(8);
__dev.unlockKing();
__dev.maxBuildings();
__dev.setKingLevel(20);
__dev.finishTimers();
__dev.unlockCampaign();
__dev.restore();
```

Partial resource/army records leave unspecified types unchanged. `checkpoint()` returns a deep-cloned snapshot; use the panel's Take checkpoint button to also update the tab's persistent checkpoint.

## Availability and implementation

The URL must explicitly include `devtools=1`. The toolbox is allowed in Vite development builds, including LAN testing, and on exact loopback production-preview hosts (`localhost`, `127.0.0.1`, `::1`). It stays disabled on deployed hosts even with the query parameter. There is no secret password, saved admin flag, account bypass, or remote endpoint. This is a local testing convenience in a client-controlled game, not a server authorization mechanism.

`src/dev/access.ts` owns availability, `controls.ts` owns atomic save mutations, and `panel.ts` owns the optional dialog/console API. The panel loads as a separate chunk only when enabled. No core gameplay rules depend on the toolbox.

Verification: `tests/developer.test.ts`, `tests/browser/developer.spec.ts`, and `scripts/developer-check.mjs`. Run the production script with a built game served on port 4173.
