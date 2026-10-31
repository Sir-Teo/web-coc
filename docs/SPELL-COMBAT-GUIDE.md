# Spell combat guide

The Army catalog's **Info** buttons explain each spell's targets, current effects
and tactical use. The nine newer spells now have their own facts and advice.
Previously they inherited Rage's damage/movement rows, lingering boost, Hero
effectiveness and advice, even when they summoned troops or harmed defenders.
Poison, for example, displayed a negative movement increase and Rage instructions.

The [guide adapter](../src/ui/spell-combat-guide.ts) reads inherited rows from the
pinned client [combat tables](../reference/full-client/combat.json). It uses the
same spell/ability tiers, summoned-unit target flags and Haste movement adapter as
combat. The [information panel](../src/ui/hud.ts) supplies the effective army tier:
an active Power Potion previews its boosted facts while identifying permanent
research; battle and replay panels retain recorded tiers. Research and combat rules
are unchanged.

| Spell | Facts and advice |
| --- | --- |
| Poison | Maximum DPS, movement/attack slows and reduced Hero damage; keep defenders in the ramping cloud. |
| Earthquake | First-cast damage as a share of maximum building HP, tier-dependent ground-defender damage, diminishing building damage and increasing effectiveness against walls. |
| Haste | Ordinary and favorite-target movement boosts, no damage boost, pulse window and one-second linger; heroes use half the ordinary movement boost. |
| Skeleton | Summon count, first group, spawn duration and ground attack targets; protect the arriving shielded squad from area damage. |
| Bat | Summon count, first group, spawn duration and ground/air attack targets; protect the defense-seeking swarm from area defenses. |
| Totem | Chained summon HP and initial stun; a stationary decoy draws fire while losing health. |
| Overgrowth | Root duration, no damage, building-only targets and the rooted buildings' temporary immunity. |
| Ice Block | Freeze duration and ability-tier damage protection; friendly troops pause and nearby enemies freeze. |
| Angry | Ability-tier Defense priority duration; redirect troops toward defenses without changing wall movement. |

Haste's pulse window is the span between its first and last pulse, excluding cast
startup and the final lingering boost. Its ordinary movement increase rises from
3.5 to 7 tiles/s; troops with a favorite target use 1.75 to 3.5 tiles/s through the
shared `rageModifiers` adapter. Poison's movement-slow fact describes ordinary
defending troops; defending Heroes retain their existing movement scaling and take
5% of the ordinary damage rate. Earthquake's first-cast percentage does not promise
the same damage from later casts or substitute the distinct Wall curve.

Summon movement and attack targets are separate facts. The source `Spell Bat` row
flies and declares both ground and air targets. `Spell Shielded Skeleton` moves
and attacks on the ground. Neither panel inherits the generic troop-target row
previously shown for all spells.

`tests/browser/spell-combat-guide.spec.ts` opens all nine real Info buttons at base
and maximum research tiers, across 390×844, 844×390 and 1440×960 viewports. It checks
targets, tier-specific facts, advice, text fit, horizontal overflow, the research
button's touch target and scrolling, dialog closing and browser errors. Original
spell art remains visible in screenshots under ignored `output/playtest/`.
These DOM checks pause the village animation loop after boot and Army opening;
existing spell-combat and production checks retain real gameplay.
