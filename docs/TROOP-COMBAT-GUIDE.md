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
advice; ordinary Balloon retains its bombing explanation.

The following ability facts appear near the top of the stat grid. Values come
from the combat source and shared ability adapters, rather than separate UI
constants:

| Troop | Added facts | Combat reference |
| --- | --- | --- |
| Super Minion | Eight Long Shot attacks; 9.75-tile opening range | [Offensive Long Shot](../reference/attacking-super-minion/README.md) |
| Baby Dragon | +100% damage, +50% attack rate and 4.5-tile ally radius | [Tantrum and phases](../reference/attacking-baby-dragon/README.md) |
| Rocket Balloon | Four-second deployment boosters | [Rocket Balloon phases](../reference/attacking-rocket-balloon/README.md) |
| Dragon Rider | 0.6-second death-blast delay | [Dragon Rider phases](../reference/attacking-dragon-rider/README.md) |

The modal body scrolls when its additional facts exceed the available height.
Close and **Train troops** retain targets of at least 44×44 pixels, and the
latter returns to the Army catalog. There is no combat,
save-format or replay-version change.

`tests/browser/troop-combat-guide.spec.ts` opens real catalog Info buttons for
nine troop families at 390×844, 844×390 and 1440×960. It verifies source facts,
favorite targets, advice, text fit, horizontal overflow, touch targets,
scrolling, training navigation and closing. Screenshots are saved under
ignored `output/playtest/`. These are headless browser viewport checks, not
physical-phone performance measurements.
