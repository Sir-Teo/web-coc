# Helper Hut

A free 3×3 building, one per village, from Town Hall 9. The client builds it instantly, without a builder; it has one level, 500 hitpoints and no upgrades. It is the client's own art (`villager_house_lvl1_active`).

## Source

`python3 scripts/import-native-helpers.py` builds `reference/helpers/catalog.json` from the pinned client's `villager_apprentices.csv`, `globals.csv` and `texts.csv` (see [reference/helpers/README.md](../reference/helpers/README.md)). The building itself is `Helper Hut` in `buildings.csv`; `townhall_levels.csv` counts one from Town Hall 9.

## Replays

A Helper Hut can stand in villages recorded from replay version 55; it adds no combat rule (see [REPLAYS.md](REPLAYS.md#version-55-helper-hut)).
