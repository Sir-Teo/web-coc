# Wall rows and bulk upgrades

Wall selection now supports connected straight rows and groups of same-level walls. Every selected footprint is highlighted in the village; the anchored card shows the count, level range, eligible upgrade count and total resource cost. Controls work with pointer and touch input.

## Reference behavior

- Supercell's [February 10, 2025 update](https://supercell.com/en/games/clashofclans/blog/news/get-geared-up-for-the-latest-update--3/) added selection of multiple same-level walls, with increments of one or ten and a resource/availability limit. The local controls provide +1, +10, −1 and −10. Adding walls is limited by matching pieces and the balance of an eligible resource; removing pieces retains the anchor.
- The [Home Village wall reference](https://clashofclans.fandom.com/wiki/Wall/Home_Village?page=3) describes instant wall construction and upgrades, the free-builder requirement for resource purchases, and upgrading the eligible pieces in a selected row. A row here follows one grid axis, stops at gaps and never turns around corners. At an intersection, Other row switches direction. Same-level additions prefer nearby walls, with ID as a stable tie-breaker; that ordering is a local interaction choice.
- The [wall reference](https://clashofclans.fandom.com/wiki/Wall) documents elixir eligibility once every selected piece is at least level 5. Mixed rows containing a lower-level wall offer gold until that wall reaches level 5.
- Supercell's [August 30, 2026 update](https://supercell.com/en/games/clashofclans/blog/release-notes/august-update-3/) specifically removes the free-builder requirement for **Wall Rings**. It does not make ordinary gold/elixir upgrades builder-free. Wall Rings are not implemented here.

Sources checked September 11, 2026; the community wall pages were available through indexed excerpts. Existing local wall prices, HP and Town Hall ceilings remain in use. This change does not claim live-game price or per-level artwork parity.

## Purchase and selection rules

Both new wall placement and resource upgrades require one available builder. They complete immediately and create no timed reservation, so that builder remains available for the next wall. Ordinary building construction retains its timed reservation. Older saved wall timers still settle through the existing completion path without charging again.

A bulk purchase validates IDs, duplicate selection, wall type, current levels, Town Hall ceiling, resource eligibility, builder availability and total affordability before spending anything. Capped or unfinished pieces in a row are left unchanged, and the card states how many selected pieces can upgrade. The chosen resource is charged once; every eligible piece gains exactly one level and its upgraded hitpoints. No gems are spent and no new wall timer is created. A batch emits one completion effect and sound rather than overlapping a sound for every piece.

Upgraded rows remain selected. Selecting another object, returning home from combat, entering edit mode, opening another activity, or canceling discards the transient selection. Reloading retains upgrades and resource balances but does not persist an active selection. Home wall tools cannot alter a village during a battle.

The card supports narrow phones and short landscape viewports, uses at least 44px targets for its controls, and exposes gold/elixir totals before purchase. It avoids the resource counter stack where the viewport has room and keeps the card inside the viewport. Existing individual-wall Move and Info controls remain available. Moving or rotating a whole row is still unfinished.

## Verification and remaining work

Model tests cover straight rows, gaps and corners, mixed levels, stable same-level grouping, quantity limits, partial affordability rejection, duplicate/missing/non-wall IDs, Town Hall caps, unavailable builders, immediate HP changes, one batch charge/effect, battle guards and save/reload behavior.

Browser tests touch a real wall, select and upgrade its row, reload the purchase, adjust same-level quantities, wait for an available builder, upgrade a mixed row with gold then elixir, verify that Info upgrades only its displayed wall, and inspect every primary control on 320px portrait and 844px landscape phones. Label and cost use separate lines, with checks that both remain within each purchase button. Chromium and WebKit exercise these flows; WebKit CI includes the wall suite.

Remaining wall work includes row movement/rotation, the full per-level wall artwork and connector system, live-game price/HP tables, Wall Rings and higher Town Hall content. Broader village and multiplayer requirements remain tracked separately.
