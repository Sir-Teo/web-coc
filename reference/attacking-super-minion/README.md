# Super Minion offensive Long Shot

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
The eleven `characters.Super Minion` tiers in
[the combat tables](../full-client/combat.json) name
`SuperMinionSpecialProjectiles`: eight releases at range 975 with projectile
`super_gargoyle_projectile_big`. The separate defensive substitution names
`SuperMinionSpecialProjectiles_DEF`, which supplies three releases. Offense
previously ignored the ability: an actual source-tier-five deployment at x=4
walked to x=9.5 before firing at 2.8 s, then used ordinary projectiles for all
nine measured shots.

All tiers have `AttackSpeed=1000`, no cooldown override or new-target delay.
The established [older-engine split-clock adapter](../attacking-giant/README.md)
therefore gives **one-second fresh and repeat charges with zero recovery**.
Modern executable first-hit timing remains unverified.

The [official-wiki comparison](../official-wiki/spells-siege-super/super-minion.md)
corroborates eight offensive and three defensive Long Shots. Source tiers 1–11
display Minion levels 4–14; ordinary boosting begins at displayed level 8.
The client ranges are 9.75/3.5 tiles; the wiki reports 10.25/4. This change
retains the client values.

## Recording version 187

Carried Super Minions begin a source charge after reaching extended range.
The first eight physical releases use the large projectile at six tiles per
second. Ammunition is spent at release, including shots still in flight,
across building and ground/air defender targets. Retargeting and canceled
charges do not replenish or consume it. Damage remains single-target and
unchanged by the projectile variant.

After the eighth release, the extended-range engagement ends. The unit
approaches within its ordinary 3.5-tile range and starts a fresh one-second
charge. If already within that range, the ninth release follows one second
later. Ordinary projectiles travel at four tiles per second. This explicit
ability transition does not change other units' committed attack rules.

Freeze/stun hold charges and attack-speed changes scale them. Flying movement
still crosses Walls. Native defender shots retain their flying origin and
eligible target layer; released shots retain their variant, speed and damage
after the shooter leaves. Original body poses follow the captured phase
offset. Scouting and home army preparation warm both projectile variants.

Only an initial army carrying Super Minion enables the change. Versions 186
and earlier preserve their previous offense. The separate three-shot garrison
ability, ordinary Minion, source stats, assets, audio, village save format and
replay envelope are unchanged. Existing fresh-body deployment rules remain in
effect; modern Recall/Clone ammunition parity is outside this change.

## Validation

`tests/attacking-super-minion-long-shots.test.ts` covers all eleven source
tiers from near, extended and distant starts. It checks eight releases,
native projectile variants and speeds, physical ammunition use, the ninth
normal-range charge, ground/air defenders, single-target damage, mixed-target
stock, canceled charges, Freeze, speed scaling, Wall crossing and shots whose
shooter has left. A separate assertion retains the defensive three-shot rule.

Actual full-opening Storage and lured Golem/Dragon recordings reconstruct
complete portable states forward and backward under versions 186 and 187.
`tests/browser/attacking-super-minion-long-shots.spec.ts` checks both ordinary
boosting endpoint tiers on phone and desktop, home preloading without a
battle, large and ordinary original projectile meshes, body poses, exact
seeking, read-only drawing, reduced motion, asset requests and WebGL health.
Screenshots go to ignored `output/playtest/`.
