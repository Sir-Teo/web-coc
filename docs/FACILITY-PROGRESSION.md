# Army facility progression

Audited September 11, 2026. Barracks levels 1–10, Laboratory levels 1–6 and Spell Factory levels 1–3 now use explicit Home Village health, elixir prices and construction durations. These values drive purchases, saved timers, building health, practice/campaign snapshots and Info previews. Spell Factory levels 4–5 remain supported for accepted legacy saves; the playable Town Hall ceiling is still 8.

## Reference tables

Each price and duration buys the listed destination level. Values exclude discounts and boosts.

| Barracks level | HP | Elixir | Time | Town Hall |
| --- | --- | --- | --- | --- |
| 1 | 100 | 100 | 10s | 1 |
| 2 | 200 | 500 | 15s | 2 |
| 3 | 250 | 2,500 | 2m | 2 |
| 4 | 300 | 5,000 | 30m | 2 |
| 5 | 360 | 20,000 | 2h | 3 |
| 6 | 420 | 120,000 | 4h | 4 |
| 7 | 500 | 270,000 | 6h | 5 |
| 8 | 575 | 600,000 | 12h | 6 |
| 9 | 650 | 1,000,000 | 1d | 7 |
| 10 | 730 | 1,400,000 | 1d 12h | 8 |

The [Barracks data table](https://goblinsfarm.com/wiki/buildings/barracks.html) identifies client build 18.400.21 and an August 26, 2026 update date. Its level 1–8 health agrees with Supercell's [June 2025 balance changes](https://supercell.com/en/games/clashofclans/blog/release-notes/welcome-to-lets-get-crafty-update/). The [indexed Barracks wiki](https://clashofclans.fandom.com/wiki/Barracks?jwsource=cl&page=1&title=Barracks) also records the March 2025 price/time reductions. The older [CoC Guide table](https://coc.guide/army/barrack) retains pre-reduction health and durations and an 800,000-elixir level-eight price; those older values are not used.

| Laboratory level | HP | Elixir | Time | Town Hall |
| --- | --- | --- | --- | --- |
| 1 | 500 | 5,000 | 1m | 3 |
| 2 | 550 | 25,000 | 30m | 4 |
| 3 | 600 | 50,000 | 2h | 5 |
| 4 | 650 | 100,000 | 4h | 6 |
| 5 | 700 | 200,000 | 8h | 7 |
| 6 | 750 | 400,000 | 16h | 8 |

The [Laboratory data table](https://goblinsfarm.com/wiki/buildings/laboratory.html) and [Laboratory wiki](https://clashofclans.fandom.com/wiki/Laboratory) agree on these levels, the 3×3 footprint and the first Laboratory at TH3.

| Spell Factory level | HP | Elixir | Time | Housing | Town Hall |
| --- | --- | --- | --- | --- | --- |
| 1 | 425 | 150,000 | 6h | 2 | 5 |
| 2 | 470 | 300,000 | 12h | 4 | 6 |
| 3 | 520 | 600,000 | 1d | 6 | 7 |
| 4, legacy | 600 | 1,200,000 | 2d | 8 | 9 |
| 5, legacy | 720 | 2,000,000 | 3d | 10 | 10 |

The [Spell Factory data table](https://goblinsfarm.com/wiki/buildings/spell-factory.html) and [Spell Factory wiki](https://clashofclans.fandom.com/wiki/Spell_Factory) agree on the values. The [CoC Guide table](https://coc.guide/army/spell-forge) corroborates housing and health but retains older, longer durations. The 3×3 footprint remains unchanged. Lightning, Healing and Rage unlock at levels 1, 2 and 3 respectively.

## Rules and saved progress

- One Barracks is available from TH1, one Laboratory from TH3, and one Spell Factory from TH5. The shop, direct placement and progression displays share those limits. Supercell's [September 2022 announcement](https://supercell.com/en/games/clashofclans/blog/news/upcoming-barracks-system-changes-2/) establishes the single-Barracks model.
- The highest completed factory supplies spell housing. Constructing facilities contribute nothing; upgrading facilities keep their completed level's capacity and unlocks. Multiple imported factories remain placed but no longer multiply spell housing.
- Prepared spells and previously paid queues are retained even above the new capacity. Army shows the excess and allows casting/removal. New additions and presets must fit. No building, army, layout position, purchase or paid deadline is removed or restarted.
- Existing village building health is recalculated while preserving its damage fraction. New upgrades restore full destination-level health on completion. Legacy above-cap/count buildings remain usable, without allowing purchases beyond current Town Hall gates.
- The highest completed Laboratory supports research during its own upgrade. Either timer can start first; research consumes no builder. Each timer completes independently, including offline or with gems. Research uses the completed laboratory level until construction finishes. First construction cannot research.

Supercell's [December 2022 update](https://supercell.com/en/games/clashofclans/blog/release-notes/december-update-2022/) explicitly permits starting research while the building upgrades. Existing research also continues. The previous local guards blocked both start orders; both are removed. Free, instant preparation follows the [facility upgrade behavior audit](FACILITY-UPGRADES.md).

Save version stays 4 and replay version stays 16. This pass changes the health assigned to newly created battles, not the combat engine's interpretation of an existing snapshot. A regression records the former 1,062.5-HP level-two Barracks, reloads a home village normalized to 200 HP, and reproduces the recorded battle's buildings, units and result without changing its saved health.

## Verification and remaining work

On short landscape screens (up to 600px high and at least 4:3), research uses a compact status column beside the troop cards. Cards keep the level, portrait, name, current/next stats, price and duration, with a minimum 44px Research action. The status column stays visible when scrolling the catalog, including the 44px gem-completion action during active research. A compact fixed header retains a 44px Close control. The first two research actions must be fully visible at both 568×320 and 844×390. Portrait and desktop retain the larger catalog layout. The upgrade notice identifies both the completed and destination Laboratory level.

Refreshing an already open dialog no longer replays its entrance animation. Research changes, building upgrades, settings and result refreshes keep the panel and backdrop fully opaque at their normal scale. New dialog openings still animate. A first-frame browser regression checks both behaviors, alongside focus restoration and the real research/finish/close interactions.

Twenty-seven new model cases exercise every purchasable level through actual payment, persistence and exact deadline completion, all eight Town Hall count/level gates, direct placement rejection, legacy capacity and paid queues, health migration, independent research/building timers in both start orders, gem completion and replay compatibility. The full model suite includes the unchanged 192-battle campaign matrix. Browser checks cover Info values, research while upgrading, paid reload, gem completion, shop unlocks and preserved excess spells on desktop, phone and landscape. See [QA.md](QA.md) for final run results and evidence.

This completes the audited numeric progression for these supported facilities. Barracks levels 8–10 still lack their Healer, Dragon and P.E.K.K.A unlocks. Dark Barracks, Dark Spell Factory (including its extra housing), remaining spells and spell research, per-level building art, and the broader resource economy remain unfinished. The complete supported Spell Factory contribution at TH8 is six spaces; this is not a claim that all sources of native spell housing are implemented.
