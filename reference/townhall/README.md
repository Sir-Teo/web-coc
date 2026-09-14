# Native Town Hall catalog

Pinned public client 18.400.21, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`, downloaded from `https://game-assets.clashofclans.com/`. This reference holds the tier tables the Home Village progression is built from. It contains no artwork; the buildings it gates own their own art and combat references.

- `catalog.json`: 18 Town Hall tiers with their original hitpoints, gold price, build duration and permitted count of every entity this game implements; the Town Hall each individual building and trap level requires; and the Barbarian King records through level 30.

| Source | SHA-256 |
| --- | --- |
| [townhall_levels.csv](https://game-assets.clashofclans.com/7f04bdfdc4124b1f49308423bb8f4aa8b137aae3/logic/townhall_levels.csv) | `2d596bcd08433924c3e566f79f380eb2260076f87c5b5dd30c9ab6f2c3f41472` |
| [buildings.csv](https://game-assets.clashofclans.com/7f04bdfdc4124b1f49308423bb8f4aa8b137aae3/logic/buildings.csv) | `9aed5fed876e2914a22fa7fed688a651c691ab06170d60e2bda8dc9262fbccb1` |
| [traps.csv](https://game-assets.clashofclans.com/7f04bdfdc4124b1f49308423bb8f4aa8b137aae3/logic/traps.csv) | `757ca07de02b26b2071b52bb3cb495df2f0ae879731a859d3102ca3552dd528c` |
| [heroes.csv](https://game-assets.clashofclans.com/7f04bdfdc4124b1f49308423bb8f4aa8b137aae3/logic/heroes.csv) | `658c9721fb0fd5488b69ca3555ef5597d521f28dde95af051a2a98ccbdd65197` |
| [special_abilities.csv](https://game-assets.clashofclans.com/7f04bdfdc4124b1f49308423bb8f4aa8b137aae3/logic/special_abilities.csv) | `c978dd90ff2335e60d988f3476d78bec72672e8c074344d149096e89951181eb` |

The signed files have a 68-byte signature header followed by the client LZMA payload, as recorded in [KING-COMBAT.md](../../docs/KING-COMBAT.md). Downloads use normal HTTPS certificate verification.

## Reading conventions

Three different inheritance rules apply and are expanded before anything is written.

- In `townhall_levels.csv` each tier is its own single-row record. A blank count means *unchanged from the tier below*, so counts carry forward across records, not within one. The importer additionally requires every count to be monotonic.
- In `buildings.csv` and `traps.csv` a blank cell inherits from the previous row of the same named record. `TownHallLevel` is the Town Hall that permits that level, so `X-Bow` levels 1–3 reading `9` is the complete Town Hall 9 ceiling.
- The Town Hall's own rows are offset: row 9 carries `TownHallLevel` 8, because Town Hall 9 is what a Town Hall 8 village builds. The importer asserts that offset rather than assuming it.
- `heroes.csv` stores the *next* upgrade's price and duration on the current-level row, so `catalog.json` converts them into destination-level records. `RequiredHeroTavernLevel` is the Hero Hall. Activation recovery is joined from `special_abilities.csv` through each row's `SpecialAbilitiesLevel`; the King's `BarbarianKingAbilityHeal` levels 5, 6 and 7 heal 450, 525 and 625.

Reproduce with any Python 3.11+ interpreter; this importer needs no third-party packages:

```sh
python3 scripts/import-native-townhall.py --check
```

This re-downloads the pinned tables, verifies their SHA-256 values and requires the committed JSON to match byte for byte.

## Scope

Counted and gated names are restricted to the entities this game implements. Buildings the game has no model for — Dark Barracks, Siege Workshop, Pet House, the Builder Base roster and later defenses — are deliberately absent and are not silently treated as zero-count content. The catalog records what the original client permits; which of it the home village actually offers is a separate decision recorded in [TOWNHALL-9.md](../../docs/TOWNHALL-9.md) and `src/game/progression.ts`. Gold Mine, Elixir Collector, storage, Builder's Hut and Hero Hall counts and economy in this game remain local values that diverge from these rows below Town Hall 9; the Town Hall's own hitpoints, price and duration are recorded here but the running game still uses its established local curve.
