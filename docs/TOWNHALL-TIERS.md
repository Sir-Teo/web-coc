# Town Hall tiers

The home village runs from Town Hall 1 to **Town Hall 18**, the last tier the pinned client defines. Every count, gate, price and duration on that ladder is an original value; nothing on it is invented.

The source audit began with the recording-version 46–47 rollout. The catalog and builder
limit below still drive the tier rules; the [content inventory](CONTENT-INVENTORY.md) records
current feature coverage, including systems added after that rollout. The compatibility
section preserves the original recording boundaries; [Replays](REPLAYS.md) describes the current compatibility rules.

## Source

The original tier catalog comes from the pinned public client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`, and is committed as [reference/townhall](../reference/townhall/README.md): 18 tiers, 37 gated entities, 296 per-level rows and 110 Barbarian King records. The importer re-downloads the signed sources, verifies their SHA-256 values and reproduces the JSON byte for byte:

```sh
python3 scripts/import-native-townhall.py --check
```

`src/game/tiers.ts` derives both tier columns — how many of each building a tier permits, and how high each may be upgraded — from that reference rather than from transcribed arrays. Reading the source needs three separate inheritance rules, described in the [reference README](../reference/townhall/README.md) and asserted by the importer. Extra building families read their count and level columns from
[the full client progression catalog](../reference/full-client/progression.json), as the same
module's `EXTRA_BUILDING_KINDS` loop shows.

For the original catalog, two rules define the tier columns:

- A tier's count is the original count, except for the five buildings this game deliberately hands out differently before Town Hall 9 (below). All of them have converged on the original by Town Hall 9.
- A tier's level ceiling is the original gate column, capped by what this game implements, and zero wherever the tier permits none of that building.

Applying those rules reproduces every Town Hall 1–9 value this game shipped before, so no earlier tier changed.

## The ladder

Town Hall 9 unlocks the X-Bow and Hero Hall 3; see the per-tier highlights below. Counts read _count × maximum level_.

| Tier | Headline additions                                                                                                         |
| ---- | -------------------------------------------------------------------------------------------------------------------------- |
| 10   | **Inferno Tower 2×3**, X-Bow 3×4, Bomb Tower 2×4, Giant Bomb 5×4, Skeleton Trap ×4, Cannon 6×13, Wall 275×11               |
| 11   | **Eagle Artillery 1×2** and **Tornado Trap 1×2**, X-Bow 4×5, Wizard Tower 5×10, Cannon 7×15, Air Sweeper 7, Wall 300×12    |
| 12   | Inferno Tower 3×6, Hidden Tesla 5×10, Air Bomb 6×6, Spring Trap 8×7, Cannon 17, Mortar 12                                  |
| 13   | **Scattershot 2×1**, Seeking Air Mine 7×4, Bomb 7×9, Spring Trap 9×8, Cannon 19, Wizard Tower 13                           |
| 14   | **Builder's Hut 2–4**, the first armed huts — Bomb 8×10, Giant Bomb 7×8, Air Bomb 7×9, Wall 325×15, Air Defense 12         |
| 15   | **Monolith 1×1** and **Spell Tower 2×1**, Cannon 21 and Archer Tower 21 — the last of both — Spell Factory 8, Army Camp 12 |
| 16   | Gold Mine and Elixir Collector 17, Spell Factory 9, Dark Elixir Drill 11                                                   |
| 17   | Archer Tower ×9, Seeking Air Mine 9×7, Giant Bomb 8×11, Barracks 19                                                        |
| 18   | Wizard Tower ×6, Air Bomb 8×13, Wall 19, Laboratory 16, Hero Hall 12, King 110 and **Skeleton Trap 5**                     |

Army housing rises from 220 at Town Hall 9 to **352** at Town Hall 18 (four Army Camps at level 14). Spell housing reaches 10. The Barbarian King reaches **level 110** behind a Hero Hall 12; both the Town Hall and the Hero Hall have to permit a level, so neither alone raises the ceiling.

## What this game withholds

Every home building now reaches its pinned source ceiling. Builder's Hut levels 5–8 have reconstructed previews, activation and aiming, so the former level-four artwork cap is removed. `tests/townhall-tiers.test.ts` asserts that `WITHHELD` is empty.

The Clan Castle was the last of the others. It is buildable from Town Hall 3 and upgrades through all 14 original levels, with original hitpoints, prices, durations and reconstructed artwork, and it is damaged, destroyed and counted like any other building. What it does **not** do is hold reinforcements: in the original a home Castle is filled by clanmates' donations, and there is no original answer for a village with no clan. The roster the garrison system fields is a _defender_ roster with its own fixed levels, not the player's trained army, so loading it from the barracks would be this game's invention rather than the client's. An empty Clan Castle is an ordinary state in the original; the donation system behind reinforcements is a social feature, not missing content.

Reading the Castle's tier needed one rule the ladder did not have. A tier that permits none of a building already forced a zero ceiling; the reverse now holds too, because the source counts one Clan Castle from Town Hall 1 but gates its first level at Town Hall 3.

The pinned catalog also counts buildings and traps introduced after this tier rollout,
including the Dark Barracks, Dark Spell Factory, Siege Workshop and Pet House. Current
implementation coverage is tracked in [the content inventory](CONTENT-INVENTORY.md).
Town Hall weapons are covered in [Native defenses](NATIVE-DEFENSES.md), and the full hero,
equipment and pet roster in [Native heroes](NATIVE-HEROES.md).

## The original economy

Hitpoints, prices, durations and capacities are now original for every home building. The eight buildings that never had a source table — the Town Hall, both resource buildings, both storages, the Builder's Hut, the Hero Hall and the Blacksmith — took their hitpoints from a local curve until this pass; they now read the same pinned rows as everything else.

Storage is the original allowance rather than this game's own curve, and the Town Hall counts its own store toward every cap the way the original does. A Town Hall 18 village holds 27,000,000 gold: 5,000,000 in the hall plus 6,500,000 in each of four stores. The flat 100,000 base allowance is gone. Dark elixir works the same way, and the hall alone holds dark from Town Hall 7.

That capacity is what makes the ladder work rather than merely what limits it: every purchase a tier permits fits inside the storage that tier allows, and the margin is often thin — a Town Hall 16 holds 26,000,000 elixir against a 24,000,000 Spell Factory 9. The local curve it replaces was far more forgiving, and without the hall's own store the ladder does not close.

Because storage now holds the original allowance, a prototype-sized purse would overflow it several times over, so a new village is granted the original's own opening amounts — 750 gold, 750 elixir and the 250 gems this game already gave — with its mines and collectors still holding produce to collect. Raid loot is capped by the room left at home, which is the original rule and now actually binds.

Gold Mines, Elixir Collectors and Dark Elixir Drills produce at the original hourly rate and hold the original capacity at every level (`src/game/collector-production.ts`); the simulation, Info panel and fill artwork read the same rows. Produce a save earned under the old prototype curve above the new capacity is kept until collected rather than clipped.

Builder's Huts are sold the way the original sells them: all five are available from Town Hall 1, and each costs gems rather than gold — the second free, then 500, 1,000 and 2,000. `WORKER_COST_2ND` through `WORKER_COST_5TH` are pinned from the client's own globals table, as are the starting grants.

## Late families at home

The Inferno Tower, Eagle Artillery, Scattershot, Monolith, Spell Tower and Tornado Trap
entered home villages at their original tiers after first appearing in Goblin Map battles.
Artwork loads on first use, including when a home village owns the family. Current home,
practice and campaign combat ownership is documented in [Native defenses](NATIVE-DEFENSES.md).

A home Spell Tower is placed carrying the Rage spell and its context panel cycles through the spells unlocked by its level — Rage, Poison, Invisibility and Earthquake — the way the X-Bow cycles its targeting mode. The choice survives saves, edit undo/redo and layout presets, and travels in recordings; so do the Spell Tower's active spell and the Multi-Gear Tower's Long Range/Fast Attack mode.

The armed Builder's Hut now fights at home too. From Town Hall 14 a hut buys the nail turret the campaign huts already carried, and its turret, Defending Builders and repair behaviour step in home and practice battles exactly as they do in the campaign. A level-one hut stays passive, as it does in the original. Home huts reach level 4 at Town Hall 14, then levels 5, 6, 7 and 8 at Town Halls 15, 16, 17 and 18. Their original damage, hitpoints, prices, durations and Defending Builder repair levels come from the pinned client.

The campaign keeps one thing the home village does not. A campaign-only identity — Goblin Halls, the Goblin Castle, the Foreboding Cave and the rest — is still never a home building.

## Where this game still differs

- **Counts before Town Hall 9.** A starter village opens with two Cannons rather than one, and Gold Mines, Elixir Collectors and both storages arrive a tier or two earlier. `LOCAL_COUNTS` in `src/game/tiers.ts` holds the five affected columns; all of them have converged on the original by Town Hall 9.
- **Research.** The current native roster uses its source level ladders and Laboratory, Barracks and factory gates. The five-level research limit belonged to the initial tier rollout; current troop and spell coverage is listed in [the content inventory](CONTENT-INVENTORY.md).

## Compatibility

Recording version **47** carries the fifth coffin tier and the armed home Builder's Hut; version 46 carries the Town Hall 18 ceilings before it. No combat rule changed and versions 34–46 remain playable, each keeping its own ceilings: a version-46 recording cannot hold a Skeleton Trap above 4 or a Builder's Hut above 4, a version-45 recording still cannot hold a Town Hall above 9, an Archer Tower above 12, a Wall above 16 or a King above 30, and the version-44 and pre-44 limits before it are unchanged. Version 56 adds Builder's Hut levels 5–8; all earlier recordings retain their previous hut ceilings. Save version 4 is unchanged; an existing village loads untouched and nothing is granted retroactively.

A version-45 recording also cannot hold a late family outside a campaign village, because before version 46 the home village could not build one.

The one value correction in the Town Hall 18 pass is the Bomb's level-4 build time, which was 40 minutes locally and is 30 minutes in the source. The Inferno Tower's prices and durations, which had fallen through to the prototype curve, now come from its own pinned catalog like the rest of its table.

## Verification

`tests/townhall-tiers.test.ts` checks the whole ladder against `reference/townhall/catalog.json` rather than a transcribed copy: every count and ceiling at all 18 tiers, monotonic columns, a zero ceiling wherever a tier permits none of a building, nothing above what the game implements, the absence of withheld levels, the original Town Hall requirement for a spread of levels, army and spell housing, hero caps, affordability of every purchase within its own tier's storage, and shipped artwork for every reachable level. It also plays the ladder: the Town Hall 8 → 9 → 18 climb, X-Bow construction and its count gate, the Hero Hall 3 path to King 21, building all six late families in a home village and fighting a practice battle that steps their state, the Spell Tower's weapon cycle, and the version-47 recording boundary against real version-44, version-45 and version-46 rejections.

`tests/king-combat.test.ts` compares all 110 King records to the pinned catalog. The Air Sweeper, Bomb Tower, Cannon, Archer Tower, Hidden Tesla, Dark Elixir Storage, Skeleton Trap, Seeking Air Mine, Army Camp, Wall, trap and army-facility suites each derive their expectations from the same reference.

[The tier browser checks](../tests/browser/townhall-tiers.spec.ts) cover all eighteen
progression cards, late-family shop gates and the original Spell Tower weapon cycle.
[The current Spell Tower checks](../tests/browser/spell-tower-mode-preview.spec.ts) cover all
four home spells, their portraits and Move previews on desktop and phone. See
[QA](QA.md) and [release verification](RELEASE-VERIFICATION.md) for browser, production,
offline and device checks.
