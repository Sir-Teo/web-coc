# Native troop and spell roster

Pinned public client 18.400.21, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`, downloaded from `https://game-assets.clashofclans.com/`. This reference holds every original level of the ten troops and three spells this game implements. It contains no artwork; troop artwork is per kind, not per level.

- `catalog.json`: 129 troop levels across ten troops and 32 spell levels across three spells, each with its hitpoints, damage, housing space, Laboratory requirement and the price and duration of reaching it.

| Source | SHA-256 |
| --- | --- |
| [characters.csv](https://game-assets.clashofclans.com/7f04bdfdc4124b1f49308423bb8f4aa8b137aae3/logic/characters.csv) | `5c3acc5b46ff9e7978f406b540264e65c93a846b69d03cd43326a9853703cb89` |
| [spells.csv](https://game-assets.clashofclans.com/7f04bdfdc4124b1f49308423bb8f4aa8b137aae3/logic/spells.csv) | `385159e00327e6a1567cd91f1585b4ed0717d3f4475f0823398243482598289d` |

The signed files have a 68-byte signature header followed by the client LZMA payload, as recorded in [KING-COMBAT.md](../../docs/KING-COMBAT.md). Downloads use normal HTTPS certificate verification.

## Reading conventions

- A blank cell inherits from the previous row of the same named record.
- A row's own cells describe that level: `Hitpoints`, `DPS`, `HousingSpace` and the `LaboratoryLevel` it needs. Its `UpgradeCost` and `UpgradeTime` buy the level **above** it, exactly as the hero table does, so prices are shifted down one row here. Level one costs nothing and needs no Laboratory, so its requirement is recorded as zero rather than the source's own row value.
- The Healer and the Healing spell carry their healing as a **negative** damage rate. Both are recorded here as a zero `damage` and a positive `heal`.
- `P.E.K.K.A` is the record `PEKKA`; the Barbarian is this game's `swordsman`.

Reproduce with any Python 3.11+ interpreter; this importer needs no third-party packages:

```sh
python3 scripts/import-native-troops.py --check
```

This re-downloads the pinned tables, verifies their SHA-256 values and requires the committed JSON to match byte for byte. Every value it produces for the levels this game already shipped reproduces the previous hand-transcribed tables exactly, so extending the roster changes no existing level.

## Scope

Only the ten troops and three spells this game trains are recorded. The rest of the original roster — Miner, Baby Dragon, Electro Dragon, the dark troops, siege machines and the Builder Base list — is deliberately absent rather than silently treated as zero-level content.
