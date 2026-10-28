# Super Wall Breaker attack-completion death blast

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
All ten `characters.Super Wall Breaker` tiers in [the combat tables](../full-client/combat.json)
declare `AttackCount=1`, a separate `DieDamage` of 105–413, radius 1.6 tiles
and no death-damage delay. Their ordinary attack deals 34–170 damage before
the unit is defeated. Ground defenders can receive the casualty blast;
airborne defenders cannot.

The older [LogicCharacter](https://github.com/bns34/Supercell.Magic-my-turn/blob/52c5953f5e5802c64ac36e53d5599f8700976085/Supercell.Magic.Logic/GameObject/LogicCharacter.cs)
checks the completed attack count, kills the character and subsequently
executes its separate death damage. The retained file has SHA-256
`d8981e7fd21011ee1615b3bd26fa03f8b9ebc16ec4d98390b9d45a76f8f15a5a`.
This corroborates the separate lifecycle; modern executable timing and pixel
parity remain unverified.

The retained [wiki revision 624690 comparison](../official-wiki/spells-siege-super/super-wall-breaker.md)
explicitly corroborates 40-fold Wall damage for both the ordinary attack and
death explosion at every source tier: death damage is 4,200–16,520 against
Walls. The older engine predates this Super Troop and is supporting evidence
for its casualty lifecycle, rather than the modern Wall multiplier.

Actual version-203 deployments against an unarmed Storage reproduce only
34 damage at tier 1 and 170 at tier 10. The single-attack path sets the unit's
death as already processed, so the shared casualty pass skips its death
effect. A live Cannon defeating the unit before its first attack correctly
schedules the existing blast. That path applies ordinary death damage to Walls
instead of the source preference multiplier.

## Recording version 204

A carried Super Wall Breaker completing its single attack now enters the
shared casualty pass. That pass marks the casualty processed and schedules
the source death damage once. The next combat update resolves it using the
existing death-blast path. Storage therefore receives 139 total damage at
tier 1 and 583 at tier 10. A pending last-unit blast keeps an unfinished
battle alive and can award its final stars.

The queued blast captures the source Wall multiplier and applies it only to
Wall buildings, including deaths before a first attack. Non-Wall buildings
and ground defenders receive ordinary death damage. This restores 5,560–23,320
combined attack/death damage against a surviving Wall across the ten tiers.
Existing 0.8-tile attack splash and 1.6-tile death geometry, attack timing,
movement, assets and sounds remain in use.

Versions 203 and earlier retain their historical completed attack, casualty
damage and state shape. Cannon casualties without nearby Walls retain the
same physical states after removal of the new capability and Wall-only blast
metadata. Village save format is unchanged.

## Validation

`tests/attacking-super-wall-breaker-death.test.ts` covers all ten tiers from
near/far, one direct attack followed by one blast, ground/air filtering,
the final-unit result, historical attacks and the carried-roster capability.
Every tier checks the 40-fold Wall bonus after an attack and compares old/new
Wall damage for a pre-attack casualty, including ordinary Storage collateral.
Actual deployments against Storage, a live Cannon and a full Wall barrier
compare complete portable states before death, with a pending blast, after
resolution and after settling, in both seek directions under versions
203/204 and tiers 1/10. The tier-one Cannon case separately verifies exact
physical-state equality across the version boundary.

`tests/browser/attacking-super-wall-breaker-death.spec.ts` checks current and
historical fights at phone/desktop viewport widths, full Node/Chromium
state equality, original living bodies, reverse seeks, read-only drawing,
reduced motion, asset requests and WebGL health. Screenshots are written to
ignored `output/playtest/`. These viewport checks do not measure physical
phone performance.


## Recording version 205: fresh in-range charge

All ten source tiers specify `AttackSpeed=1000`,
`NewTargetAttackDelay=1000` and no cooldown override. The shared
[older-engine split-clock adapter](../attacking-giant/README.md) gives a
one-second fresh charge, zero recovery and zero initial precharge. The unit
completes one attack before its separate death effect; it does not repeat.
Modern native executable first-hit timing remains unverified.

Version 204 waits from target selection, so walking can spend the entire
delay. Actual near Storage deployments enter range at 0.35 seconds and hit
at 1.05 seconds, crediting only 0.75 seconds of charging. A farther drop
enters range and hits at 1.65 seconds. Version 205 starts the complete charge
in range: the same drops hit at 1.3 and 2.6 seconds. The source body samples
the controller's captured action offset while the charge is pending.

Buildings and blocking Walls share the release path. Wall-preferring source
traits explicitly keep nearby defenders from canceling the building charge;
the early UI roster's missing Wall flag no longer controls that decision.
Freeze/stun hold the charge, action-rate modifiers and Shrink scale it, and
a replacement target starts a fresh charge. Angry Spell cancels a pending
charge before forced retargeting. Defeat before release resolves only the
casualty blast. The version-204 death behavior and Wall multiplier remain
in use, along with existing movement, routing, collision and splash geometry.
No assets, audio samples or numerical stats change. Versions 204 and earlier
retain their attack timing and former phase state shape.

`tests/attacking-super-wall-breaker-windup.test.ts` checks all ten tiers from
near/far, direct-plus-death damage, Freeze/stun, fast/slow clocks, Shrink,
replacement targets, defender exclusion, defeat during charge, trap
eligibility and carried-roster gating. Real Storage, live Cannon and full
Wall-barrier deployments compare complete portable states in both seek
directions at tiers 1/10 under versions 204/205. Actual Angry Spell levels
1/4 separately check canceled pending charges and portable retarget states.

`tests/browser/attacking-super-wall-breaker-windup.spec.ts` checks current and
historical fights, original living bodies, source charge offsets, full
Node/Chromium states, reverse seeks, read-only drawing, reduced motion,
asset requests and WebGL health at phone/desktop widths. Screenshots go to
ignored `output/playtest/`.
