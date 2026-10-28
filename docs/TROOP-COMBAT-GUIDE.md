# Troop combat guide

Open a troop's **Info** button in the Army catalog to inspect its current
research stats, preferred target and tactical advice. Locked troops can be
inspected too. The guide's combat preferences now come from the same pinned
client fields as the simulation, including native troops without the early
roster's UI flags. Rocket Balloon and Dragon Rider correctly show **Defenses**;
Lava Hound names **Air Defense**, and Headhunter shows its fourfold Hero damage.
Resource and Wall preferences retain their source multipliers.

Flying troops no longer share Balloon-specific bombing advice. Minion,
Super Minion, Baby Dragon, Rocket Balloon and Dragon Rider each have a concise
tip for their behavior. Other flyers receive general flight and air-defense
advice; ordinary Balloon explains its overhead ground blast.

The following ability facts appear near the top of the stat grid. Values come
from the combat source and shared ability adapters, rather than separate UI
constants:

| Troop | Added facts | Combat reference |
| --- | --- | --- |
| Super Wall Breaker | Combined contact damage and death-only damage against Walls | [Death blasts and source charges](../reference/attacking-super-wall-breaker/README.md) |
| Super Bowler | Three boulder landings; three-tile bounce distance | [Source boulders and phases](../reference/attacking-super-bowler/README.md) |
| Super Barbarian | Eight-second opening Rage; +70% damage and +1.5 tiles/s | [Rage and charges](../reference/attacking-super-barbarian/README.md) |
| Sneaky Goblin | Five-second opening invisibility | [Invisibility and resource attacks](../reference/attacking-sneaky-goblin/README.md) |
| Super Archer | Four extra arrow tiles; 0.3-tile piercing radius | [Piercing and charges](../reference/attacking-super-archer/README.md) |
| Super Wizard | Ten total targets; three-tile branch radius; 40% branch damage | [Chain Magic and phases](../reference/attacking-super-wizard/README.md) |
| Super Minion | Eight Long Shot attacks; 9.75-tile opening range | [Offensive Long Shot](../reference/attacking-super-minion/README.md) |
| Baby Dragon | +100% damage, +50% attack rate and 4.5-tile ally radius | [Tantrum and phases](../reference/attacking-baby-dragon/README.md) |
| Balloon | 0.416-second death-blast delay | [Source attacks and crash](../reference/attacking-balloon/README.md) |
| Rocket Balloon | Four-second deployment boosters | [Rocket Balloon phases](../reference/attacking-rocket-balloon/README.md) |
| Dragon Rider | 0.6-second death-blast delay | [Dragon Rider phases](../reference/attacking-dragon-rider/README.md) |

Super Wall Breaker, Super Bowler, Super Barbarian, Sneaky Goblin, Super Archer and Super Wizard each have advice
for their own demolition, bouncing projectile, opening boost, resource raid, piercing line or branched attack.
These tips describe playable behavior without exposing replay or simulation
implementation details. Super Barbarian's speed bonus is additive tiles/second,
not an attack-rate boost. Super Archer's extra travel is measured beyond its
target; the guide does not substitute the wiki's different range convention.

The modal body scrolls when its additional facts exceed the available height.
Close and **Train troops** retain targets of at least 44×44 pixels, and the
latter returns to the Army catalog. Balloon's source movement, reach and
crash labels accompany its version-190 combat boundary; see the linked
reference for historical playback behavior.

`tests/browser/troop-combat-guide.spec.ts` opens real catalog Info buttons for
fifteen troop families at 390×844, 844×390 and 1440×960. It verifies source facts,
favorite targets, advice, text fit, horizontal overflow, touch targets,
scrolling, training navigation and closing. Screenshots are saved under
ignored `output/playtest/`. These are headless browser viewport checks, not
physical-phone performance measurements.

Super Wall Breaker's Wall damage facts follow its current research tier. The
browser checks separately raise its parent Wall Breaker to level 14 and
verify 23,320 contact damage and 16,520 death damage against Walls. Advice
explains that defeat on approach still triggers the death explosion.
