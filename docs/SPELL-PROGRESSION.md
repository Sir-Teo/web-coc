# Home Village spell progression

Audited September 11, 2026; extended September 14 and 15, 2026. Nine spells are now cast: Lightning, Healing, Rage, **Freeze**, **Invisibility**, **Jump**, **Clone**, **Recall** and **Revive** — every Spell Factory spell but the Totem. Each runs to its own original ceiling, read from the pinned [troop and spell reference](../reference/troops/README.md) rather than transcribed. Every value for levels 1–5, which this game already shipped, reproduces the records below exactly, so nothing existing changed. These are undiscounted values. Preparation remains free and instant; the prices below are permanent research upgrades.

The Healing spell carries its healing as a negative damage rate in the source, as the Healer does; it is recorded here as a positive heal.

## The Freeze Spell

Added September 15, 2026, as **recording version 48**: no earlier recording may carry or cast one, and every archived battle before it stays byte-identical. The Spell Factory offers it at level 4, its own `SpellForgeLevel`, and it runs to level 8.

It deals no damage. Within its 3.5-tile radius every defence stops mid-reload and picks a target again when it thaws, and every defending troop stops where it stands. Its hold comes straight from the source's `FreezeTimeMS`: 2.5 seconds at level 1, rising with research. A second cast may only extend a freeze already running, never cut it short.

Two source columns are deliberately not modelled, and the gap is here rather than hidden. `FreezeOuterTimeMS` states a shorter hold for the edge of the burst, which needs an outer radius the table does not give; the whole radius takes the inner time. `RandomRadius` scatters where the burst actually lands, which this game does not reproduce — a cast lands where it is aimed.

## The Invisibility Spell

Added September 15, 2026, as **recording version 49**, and offered by a Spell Factory 6 — its own `SpellForgeLevel`. It runs to level 4, the shortest ladder of any spell this game casts.

It deals no damage. Nothing can target a troop standing under the veil: not a defence, not a defending troop, not the Eagle Artillery's group weighting. Walls still block and traps still trigger, which is what the source's own immunity list says by naming `walls` and `siegeMachines` as untouched.

Its rhythm is read rather than chosen. The source states a pulse count and an interval — 14 pulses at a quarter-second for level 1, 17 at level 4 — so the ring lasts 3.5 to 4.25 seconds, and each troop keeps its cover for a further `InvisibilityTime` of 0.6 seconds after stepping out, the way the Rage Spell's boost lingers.

A unit carries `invisibleUntil` only while a veil is actually holding it, so a battle without one is byte-identical to a battle recorded before the spell existed.

## Jump, Clone, Recall and Revive

Added September 15, 2026, as **recording version 50** — one version for all four, so a recording either predates the batch or carries all of it.

**Jump** (Spell Factory 4) raises a ramp. Walls under the ring cost nothing to cross while it holds, and stand untouched when it closes: the pathfinder takes `breaches` and stops marking those tiles as wall. Nothing else changes, and with no ring open the routing is byte-identical to before. Its length is stated as pulses and an interval — 81 × 0.25s at level 1, 401 at level 5 — so it runs from 20.3 to 100.3 seconds.

**Clone** (Spell Factory 5) copies the troops in the ring in deployment order, spending `DuplicateHousing` — 22 at level 1 up to 48 — and each copy lives its stated `DuplicateLifetime` of 30 seconds before fading, fought or not. A copy is never copied: the spell spends its housing on what is really standing there.

**Recall** (Spell Factory 7) takes troops back into the hand, nearest the centre first, spending `RecallHousing` — 83 at level 1 up to 120. A recalled troop returns to the hand and may be redeployed. A Clone copy has nowhere to return to and is simply lost, which is why the two spells read each other's marks.

**Revive** (Spell Factory 8) stands a fallen hero back up where it fell, at `ResurrectHitpointPercentage` of its maximum — 60% at level 1 rising to 80%. Its `Radius` is zero and its reach is `TargetingRadius`, eight tiles. With no hero down within reach the spell is **not spent**: the cast is refused and the spell stays in hand.

The **Totem Spell** is the one Spell Factory spell still unimplemented: its `ChainSpell` summons a totem, an entity this game has no model for. The eight Dark Spell Factory spells wait on that building.

The spell key order matters and is load-bearing: an archived battle state is compared as JSON, so `SPELL_KEYS` follows the `SPELLS` object's own order and the Freeze Spell is **appended**, never inserted. `tests/freeze-spell.test.ts` asserts that order, and that every recording's own book is a prefix of today's. The per-version book is now one table, `SPELLS_ADDED_AT` in `replay.ts`, so the next spell is one line rather than a new constant.

## Sources

The primary numeric reference is Supercell's published [spells.csv](https://game-assets.clashofclans.com/7f04bdfdc4124b1f49308423bb8f4aa8b137aae3/logic/spells.csv), located through the client-build reference on [Goblins Farm](https://goblinsfarm.com/wiki/spells/lightning-spell.html). That index identifies client 18.400.21, updated August 26, 2026. The downloaded file has SHA-256 `385159e00327e6a1567cd91f1585b4ed0717d3f4475f0823398243482598289d`. It contains a four-byte `Sig:` marker, a 64-byte signature, and an LZMA stream whose four-byte uncompressed length is extended to eight bytes for the standard decoder. The decoded CSV has SHA-256 `3973d7b83baa04593c19628bc8243ef80d3101ee1d8011e23bc28704f7815513`.

Only the three named Home Village records are used. Empty cells inherit values within a spell's levels. `UpgradeCost` and `UpgradeTimeH` describe the next level; `LaboratoryLevel` describes the current row's level. The game uses destination-level records, so research prices/times move forward one row while laboratory gates do not. Radius points convert at 100 per tile and movement-speed points at 8 per tile/second. The downloaded/decoded reference and selected fields are retained in `output/playtest/reference-spells*`; the complete external CSV is not shipped in the game.

The current [Lightning](https://clashofclans.fandom.com/wiki/Lightning_Spell/Home_Village), [Healing](https://clashofclans.fandom.com/wiki/Healing_Spell/Home_Village), and [Rage](https://clashofclans.fandom.com/wiki/Rage_Spell/Home_Village) wiki entries cross-check the early effects, research and gates. Older CoC Guide Healing tables still show 40 pulses and 600 initial total healing; the primary CSV has 41 pulses at every level and a 55% hero multiplier. [Clash Ninja's November 2025 update summary](https://www.clash.ninja/blog/town-hall-18-is-here) describes the 300ms Healing extension. Its linked [official release notes](https://supercell.com/en/games/clashofclans/blog/release-notes/town-hall-18-crash-lands-update/) do not enumerate that low-level balance detail, so the CSV is the numeric authority here.

## Supported levels

| Spell | Level | Damage / healing per pulse / damage boost | Movement boost | Research elixir | Research time | Laboratory |
| --- | --- | --- | --- | --- | --- | --- |
| Lightning | 1 | 150 damage | — | — | — | — |
| Lightning | 2 | 180 damage | — | 50,000 | 2h | 1 |
| Lightning | 3 | 210 damage | — | 100,000 | 4h | 2 |
| Lightning | 4 | 240 damage | — | 200,000 | 6h | 3 |
| Lightning | 5 | 270 damage | — | 600,000 | 24h | 6 |
| Healing | 1 | 15 healing | — | — | — | — |
| Healing | 2 | 20 healing | — | 75,000 | 3h | 2 |
| Healing | 3 | 25 healing | — | 150,000 | 6h | 4 |
| Healing | 4 | 30 healing | — | 300,000 | 12h | 5 |
| Healing | 5 | 35 healing | — | 900,000 | 24h | 6 |
| Rage | 1 | +130% damage | +2.5 tiles/s | — | — | — |
| Rage | 2 | +140% damage | +2.75 tiles/s | 400,000 | 6h | 3 |
| Rage | 3 | +150% damage | +3 tiles/s | 800,000 | 12h | 4 |
| Rage | 4 | +160% damage | +3.25 tiles/s | 1,000,000 | 24h | 5 |
| Rage | 5 | +170% damage | +3.5 tiles/s | 2,000,000 | 48h | 6 |

Research also requires the spell's actual unlock: Factory 1/TH5 for Lightning, Factory 2/TH6 for Healing, and Factory 3/TH7 for Rage. A low laboratory requirement does not unlock a spell before its factory exists. Research shares the single project slot with troops, needs no builder, and remains available while the laboratory upgrades. The completed building level supplies the gate until its deadline. Payment, gem completion, offline completion and next-level previews use the same records.

## Combat behavior

- Lightning uses a two-tile radius and damages any eligible building footprint intersecting the circle. Town Halls, all three resource storages and traps are immune; collectors, walls and other buildings remain eligible. A surviving defense is stunned for 0.1s, forgets its target and restarts its attack cooldown. Already launched projectiles remain in flight. The current catalog has no Clan Castle or defending troops; those interactions remain to be implemented.
- Healing covers five tiles. Each ring delivers 41 pulses at 0.3s intervals, with total troop healing of 615 / 820 / 1,025 / 1,230 / 1,435. Heroes receive 55%, including fractional health. Overlapping rings stack, health clamps at the unit's maximum, and defeated units cannot revive. Missed pulses are not banked for re-entry. Local pulses begin immediately at cast time; the final pulse lands at 12.0s and the aura expires at 12.3s.
- Rage covers five tiles with 60 pulses across an 18s aura. Each pulse grants a one-second boost; leaving the ring does not refresh it. The final pulse at 17.7s can leave a boost until 18.7s. Damage is additive above normal damage: level 1 gives 2.3× normal attack damage. Speed is an additive tile/second increase, and attack cadence remains unchanged. Heroes receive half each spell boost. Overlapping Rage rings do not stack; for the currently simplified King ability, the stronger spell/ability damage and movement boost applies independently. Death damage is not increased. A purple troop tint tracks the boost's actual lifetime.

Pulse counters advance once for each scheduled event crossed by a simulation update, including long updates. Stationary pulse totals do not depend on update partitioning. The broader simulation still samples moving units at update boundaries. Native bottle fall, charging/hit delays, exact animation timing and full hero-equipment interactions remain separate fidelity work; the published CSV contains timing fields that are not yet reconstructed as a complete native deployment sequence.

## Persistence, presentation and verification

Optional `spellLevels` extends save version 4; older villages start at spell level 1 without losing prepared spells, paid queues or troop research. New level records must contain all three valid integer levels. Research kinds must be actual strings; array and object coercion is rejected before membership lookup. Shared research validation accepts known troops or spells and refuses projects already at their supported maximum.

Combat version 17 snapshots all three spell levels on entry. Home research cannot change an active attack or a replay. Portable exports whitelist the spell levels alongside troop levels. Version 16 and older result records remain valid, but their combat playback is unavailable after this rules change. See [REPLAYS.md](REPLAYS.md).

Army cards and battle trays show spell levels. Each spell has an Info panel with researched values, radius, housing, hero effects and a direct path to its laboratory card. Research lists both troops and spells, with current/next values, prices, deadlines and facility/laboratory gates. The existing compact landscape arrangement is retained. Closing details or research restores the originating Army drawer, scroll position and keyboard focus, including nested spell-detail → research navigation. Laboratory Info distinguishes its troop and spell research limits.

Thirty-six new model cases cover every research transition and each supported level's actual effects, exact deadlines, both project types sharing a slot, laboratory upgrades, malformed/legacy saves, footprint edges and immunity, stun/reset, launched projectiles, pulse totals and overlap, hero scaling, Rage cadence/linger and exact shared replay reproduction. See [QA.md](QA.md) for the final browser and production runs. Later spell types and levels, Dark Spell Factory, defending troops, native deployment animation/timing and complete hero equipment remain unfinished.

## Spell presentation follow-up

The original spell-vial SVGs now use the native hue families: blue Lightning, yellow Healing and purple Rage. The current [Healing entry](https://clashofclans.fandom.com/wiki/Healing_Spell/Home_Village) describes the light yellow liquid, and the [Rage entry](https://clashofclans.fandom.com/wiki/Rage_Spell/Home_Village) identifies its purple ring. Exact local hex values and the glassware silhouettes are authored approximations, not extracted native pixels. Matching aura colors keep spells recognizable between the Army panel and battlefield.

`node scripts/spell-assets.mjs` deterministically regenerates the three 256×256 transparent WebPs; `--check` verifies the shipped bytes and runs in CI. The main artwork pipeline imports this generator. Versioned `-v2` URLs avoid stale cached colors, and the superseded files are removed from the build. All three images retain a complete 0–255 alpha range and together occupy 14,002 bytes.

Lightning now draws a single forked graphic with a blue glow and white core, replacing three rectangular strips. It fades over 260ms on the existing simulation-driven effect timeline, freezes with paused combat and is destroyed on exit. This is a local visual improvement; the native bottle descent, impact staging and particle timings remain unfinished. Browser captures verify both aura colors, the bolt, half-opacity at 130ms and cleanup on returning home.
