# Troop combat guide

Open a troop's **Info** button in the Army catalog to inspect its current
combat stats, preferred target and tactical advice. An active Power Potion
previews boosted stats and identifies the permanent research level. Locked troops can be
inspected too. The guide's combat preferences now come from the same pinned
client fields as the simulation, including native troops without the early
roster's UI flags. Rocket Balloon and Dragon Rider correctly show **Defenses**;
Lava Hound names **Air Defense**, and Headhunter shows its fourfold Hero damage.
Resource and Wall preferences retain their source multipliers.

Offensive troops also list their ground/air attack targets separately from
their favorite target. Movement distinguishes flight, burrowing under Walls
and ground troops that can cross Walls. These read the source combat flags:
a flying Lava Hound still attacks ground targets only, while Headhunter can
attack both layers and cross Walls. Healing units retain their friendly-target
labels instead of receiving an offensive-target row.

Flying troops no longer share Balloon-specific bombing advice. Minion,
Super Minion, Baby Dragon, Rocket Balloon and Dragon Rider each have a concise
tip for their behavior. Other flyers receive general flight and air-defense
advice; ordinary Balloon explains its overhead ground blast.

The following ability facts appear near the top of the stat grid. Values come
from the combat source and shared ability adapters, rather than separate UI
constants:

| Troop | Added facts | Combat reference |
| --- | --- | --- |
| Furnace | Firemite stock, base lifetime, health loss and tier-specific child HP/jump damage | [Deployment lifecycle](../reference/deployment-lifecycle/README.md) and [health auras](../reference/furnace-life-aura/README.md) |
| Ruin Witch | Rubble consumption, lifetime summon limit, cast timing and tier-specific Knight stats/health loss | [Pinned Ruin Witch](../reference/official-wiki/troops/ruin-witch.md) and [Knight attack phases](../reference/attacking-ruin-knight/README.md) |
| Siege Barracks | Base lifetime and first release delay | [Deployment lifecycle](../reference/deployment-lifecycle/README.md) |
| Witch | Skeleton wave size, living limit and tier-specific HP/DPS | [Parent and summoned attacks](../reference/attacking-witch/README.md) |
| Super Witch | One living Big Boy, its HP, DPS and damage per swing | [Parent and summoned attacks](../reference/attacking-witch/README.md) |
| Healer | Two full-strength Healers and up to seven contributing Healers per group | [Friendly casts and stacking](../reference/attacking-healer/README.md) |
| Druid | Four recipients per chain, 4.5-tile bounce range, 30-second transformation and research-tier Bear stats | [Friendly casts and transformation](../reference/attacking-druid/README.md) |
| Lava Hound | Pup count, HP, DPS and ground/air targets | [Hound and Pup attacks](../reference/attacking-hound/README.md) |
| Ice Hound | Ice Pup count, HP, DPS, targets and hit chill | [Hound and Pup attacks](../reference/attacking-hound/README.md) |
| Golem | Golemite count, HP, DPS and ground targets | [Golem and Golemite attacks](../reference/attacking-golem/README.md) |
| Ice Golem | Defeat Freeze duration/radius and hit chill | [Ice Golem attacks](../reference/attacking-ice-golem/README.md) |
| Yeti | Yetimite stock, release threshold, HP, hit damage and Defense bonus | [Yeti and summoned attacks](../reference/attacking-yeti/README.md) |
| Super Yeti | Electromite stock, release threshold, first building hit, chain and stun | [Yeti and summoned attacks](../reference/attacking-yeti/README.md) |
| Headhunter | Hit damage against Heroes and poison duration/slows | [Headhunter attacks](../reference/attacking-headhunter/README.md) |
| Super Giant | Fivefold Wall damage and tier-specific Wall hit | [Giant attacks](../reference/attacking-giant/README.md) |
| Root Rider | Wall aura pulse damage, interval and radius | [Independent wall aura](../reference/attacking-root-rider/README.md) |
| Electro Dragon | Five chain targets, three-tile hops and 80% retained damage per hop | [Charged chain lightning](NATIVE-HEROES.md#version-109-electro-dragon-charge-and-mixed-target-lightning) |
| Electro Titan | Independent aura DPS, pulse damage/interval, radius and reduced Hero damage | [Whip and independent aura](../reference/attacking-electro-titan/README.md) |
| Apprentice Warden | Health aura percentage, radius and recipients | [Source attacks and aura](../reference/attacking-apprentice/README.md) |
| Inferno Dragon | Two ramp thresholds, stronger DPS tiers and recovery after a kill | [Source beam cadence](../reference/attacking-inferno-dragon/README.md) |
| Super Miner | Two ramp thresholds, stronger DPS tiers and death-bomb delay | [Source charges and ramp](../reference/attacking-super-miner/README.md) |
| Super Wall Breaker | Combined contact damage and death-only damage against Walls | [Death blasts and source charges](../reference/attacking-super-wall-breaker/README.md) |
| Bowler | Two boulder landings and four-tile bounce distance | [Fixed boulder landings](../reference/attacking-bowler/README.md) |
| Meteor Golem | Wall throw damage, tier-specific Meteormite HP/DPS/hit, wall crossing and merge search radius | [Golem](../reference/official-wiki/troops/meteor-golem.md) and [Meteormites](../reference/official-wiki/troops/meteor-golem-meteormite.md) |
| Super Valkyrie | Death Rage radius, troop/Hero damage, movement, pulse window and effect linger | [Pinned Farewell Gift](../reference/official-wiki/spells-siege-super/super-valkyrie.md) |
| Super Hog Rider | Tier-specific Hog/Rider HP, DPS, preferences, wall movement and landing delay | [Defeat split](../reference/attacking-super-hog/README.md) |
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
thirty-five troop families at 390×844, 844×390 and 1440×960. It verifies source facts,
favorite targets, advice, text fit, horizontal overflow, touch targets,
scrolling, training navigation and closing. Screenshots are saved under
ignored `output/playtest/`. These are headless browser viewport checks, not
physical-phone performance measurements. Two catalog groups and two researched-tier
groups per viewport retain the three-minute case limit; twenty-three researched profiles
check that parent research selects the correct troop, summon and ability tier.

Super Wall Breaker's Wall damage facts follow its current research tier. The
browser checks separately raise its parent Wall Breaker to level 14 and
verify 23,320 contact damage and 16,520 death damage against Walls. Advice
explains that defeat on approach still triggers the death explosion.

Super Miner shows its second and maximum DPS tiers, both source ramp
thresholds and one-second death-bomb delay. Advice explains why staying on
one target builds damage and changing targets resets the ramp. Browser
coverage also raises the parent Miner to level 12 and verifies the displayed
265 starting, 510 intermediate and 740 maximum DPS.

Inferno Dragon shows both damage-ramp thresholds, stronger DPS tiers and
its 0.6-second pause after a kill. Advice explains the single-target lock
and protection from Air Defenses. Browser checks raise the parent Baby
Dragon to level 12 and verify 91 starting, 182 intermediate and 1,820
maximum DPS.

Healer's group limits come from the pinned stacking table. Druid's chain and
transformation facts use the same source adapters as combat, and its Bear
hitpoints, DPS and Defense preference follow the Druid's research tier. Advice
explains that transformation ends healing and preserves the current health
percentage. Browser checks also inspect Healer 11 and Druid 6, including 88.56
and 132.25 Hero healing per second and the level-6 Bear's 2,750 maximum HP and
225 DPS. Existing historical replay inspection retains its older Hero-healing
ratio.

The Druid's Bear now also spends its source melee charge before the first hit;
see [Bear timing](../reference/attacking-bear/README.md) for the version-212 boundary.

Witch's Skeleton facts follow the parent's summon tier: level-1 Witch creates
four Skeletons per wave with a six-unit living limit, 30 HP and 25 DPS. Witch 8
creates five per wave with a sixteen-unit limit, 45 HP and 30 DPS. Super Witch
retains one Big Boy with 4,100 HP, 350 DPS and 700 damage per swing at both ends
of the parent's research table. Advice distinguishes the casters' ground/air
attacks from their ground-only summons. Separate viewport scenarios check
catalog usability and researched-tier readouts without extending test timeouts.

Root Rider's wall aura lists 4,000 damage per pulse, a 0.4-second interval and a
0.75-tile radius independently of its melee attack. Electro Dragon lists up to five
chain targets, three-tile hops and 80% retained damage per hop. Their advice explains
opening paths for ground troops and attacking clustered targets. Base and maximum
research profiles check the same ability facts at all three viewports.

Electro Titan's aura is separate from her displayed whip damage: 30 to 60 damage
every 0.4 seconds, or 75 to 150 DPS, within 3.5 tiles. It leaves walls unharmed,
damages ground/air defenders and deals 25% damage to Heroes. Apprentice Warden's
seven-tile aura supplies a temporary health buffer of 20% to 26%, excluding himself,
siege machines and Totems. The guide distinguishes this buffer from healing and
explains that overlapping health auras use the strongest bonus. Both entries read
their research-tier aura spell and have base/maximum viewport coverage.

Bowler's two total boulder landings and four-tile bounce extension are distinct
from Super Bowler's three landings and three-tile extension. Its advice explains
the fixed direction of the second landing. Super Hog Rider shows the Hog and
Rider separately: the Hog crosses walls and prefers defenses, while the Rider
attacks any building and needs an open ground route. The shared defeat-split
adapter resolves each child's research tier and the 1.3-second Rider flight.
The guide explains that Spring Trap ejection creates neither half. Minimum and
maximum research previews check both children, including the Hog's 320–1,200 HP
and Rider's 250–900 HP, at all three viewports.

Furnace, Ruin Witch and Siege Barracks now identify themselves as **Summoners**
in Army cards and Info. Their placeholder attack columns are omitted: they show
no direct attack targets, and the cards say **Summons** instead of displaying a
nonfunctional hit value. Ruin Witch prefers **Rubble**; the stationary spawners
have no favorite target. Ordinary attackers and friendly healers retain their
combat/healing rows. These distinctions use the same bunker/debris flags that
select their simulation controllers.

Furnace lists 19–22 Firemites, a 60-second base lifetime and fixed 25.5–30 HP/s
drain. Its Firemite preview follows the Furnace's own tier, ending at 325 HP and
80 damage per jump at Furnace 4. The extra fifth Firemite source tier is not
substituted for that child. Health auras can extend the parent's lifetime while
its stock stays finite. Ruin Witch shows one Knight per pile and the pinned
client's eight-summon lifetime limit, four-second vacuum and two-second summon.
Its Knight preview includes threefold Wall damage and the pinned 80 HP/s drain.
Siege Barracks lists its 30-second base lifetime and 1.3-second first release.

`tests/browser/summoner-army-preview.spec.ts` separately checks these three
summoners at base/maximum research on the same three viewports: six cases per
browser check roles, absent direct-attack rows, child facts, text fit, scrolling
and training navigation. Screenshots stay in ignored `output/playtest/`.

Meteor Golem lists fivefold Wall throw damage and its own tier's Meteormite
maximum HP, DPS, hit damage, ground targets and wall crossing. Advice explains
the thrown/staying split, health inheritance, re-merging by nearby idle halves,
clone restrictions and the below-1%-health exception. Merge search uses the
source five-tile radius. At Meteor Golem 3, the readout shows 2,900 Wall damage
and a maximum 8,750-HP Meteormite with 230 DPS and 345 damage per hit.

Super Valkyrie's Farewell Gift uses its linked ability/spell rows and the same
Rage modifier adapter as combat: radius four, +160% troop damage, +80% Hero
damage, +3.25 tiles/s ordinary movement and +1.625 with a favorite target. It
labels the 17.7-second first-to-last pulse window and one-second lingering effect
separately, rather than substituting the wiki's simplified duration. Base and
maximum parent-research profiles inspect these facts at all three viewports.
