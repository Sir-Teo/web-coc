# Meteor Staff target selection

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
The [archived Meteor Staff dossier](../official-wiki/heroes-pets/meteor-staff.md), revision
**624746**, specifies a periodic meteor at the nearest defense regardless of distance, then
the nearest building when no defense remains. It explicitly excludes targets under
Invisibility or Overgrowth. The [client manifest](../full-client/manifest.json) pins the source
tables; `character_items.Meteor Staff` maps 27 equipment levels to ten `MPMeteorStaff` ability
tiers, whose `CastSpellTarget` is `Defense` and `CastSpell` is `MPMeteorStaffSpell`.

| Item level from | Cooldown | Damage |
| --------------- | -------- | ------ |
| 1               | 10 s     | 250    |
| 3               | 9.5 s    | 300    |
| 6               | 9 s      | 350    |
| 9               | 8.5 s    | 400    |
| 12              | 8 s      | 450    |
| 15              | 7.5 s    | 500    |
| 18              | 7 s      | 575    |
| 21              | 6.5 s    | 650    |
| 24              | 6 s      | 750    |
| 27              | 5 s      | 850    |

Every spell tier retains radius 200 hundredths of a tile, one hit, deployment 800 ms,
charging 300 ms and hit delay zero. Area damage reaches both ground and air defenders. The
original target position stays fixed once a meteor is committed. The existing ready cooldown
is consumed only by a successful cast; this correction does not reinterpret cooldown phase
across Recall or resurrection.

Previously, the selector accepted every living static defense without checking visibility and
had no ordinary-building fallback. Version 141 checks the shared building targetability rules,
including unrevealed Teslas, Invisibility and Overgrowth. Walls and traps cannot be selected.
The shared activated-weapon classification includes a live Town Hall or Builder weapon in the
defense preference. Eligible defenses take priority at any range; ordinary buildings supply
fallback. Defending units are not a fallback target for this spell.

Nearest distance uses the established two-dimensional building-footprint adapter, with stable
building IDs breaking exact ties. The full client selector is not exposed by the source tables;
footprint distance and tie ordering remain local conventions. One scan selects the target
without allocating or sorting a target list. Version 140 and earlier retain their prior rules.

Coverage checks all 27 item levels against the cooldown/damage table, cast and impact boundaries,
visibility, unrevealed Tesla exclusion, ordinary fallback, retry after no eligible target,
activated-defense preference and exact normal-combat equality with version 140. Portable Prince
recordings use actual Invisibility inputs, with the building already hidden before selection,
and inspect complete forward/backward snapshots. Browser checks cover desktop and phone,
historical selectors, health changes, original Hero bodies and read-only reduced-motion redraws.

## Version 142 original presentation

The [effect index](effects.json) records source fingerprints, every original phase, the impact
camera row and the complete owned-file total. `scripts/import-meteor-staff-art.py --check`
verifies graph bytes, decoded source texture pixels and files. `--download-missing` permits
missing original inputs to be fetched only from the pinned bundle and checked against its
fingerprints. No source exports are skipped. The three-file pack totals **918,413 bytes**:
113,945 bytes of original graph and two unchanged cropped texture pages, 786,126 and 18,342 bytes.

`MPMeteorStaff.ActivationEffect` names `ps_chr_mp_MeteorStrike_StartAura`. Its three emitter rows
attach to the Prince, do not detach after start and survive parent death. The finite aura follows
his current displayed ground point with the shared flying-unit lift and original effect offsets.
A cast retains its initial origin; Recall updates that retained point before removing its owner,
so subsequent samples can finish the effect there. The source attachment and projection remain
shared local adapters; the full client bone-placement code is unavailable. Static aura/residue
exports retain their animated descendants rather than collapsing their timing to one frame.

The spell's `PreDeployEffect`, `ps_chr_mp_MeteorStrike_Projectile`, contains one 800 ms meteor
using the original 24-frame clip. `DeployEffect`, `ps_chr_mp_MeteorStrike_Impact`, begins at the
source 800 ms deployment, before the later 1.1-second damage pulse. It spawns
`ps_chr_mp_MeteorStrike_ImpactCrater` with zero delay. That explicit spawned phase retains the
150-frame crater and animated residue, each scaled to its source 2,500 ms particle lifetime.
The detached meteor and impact keep their original target position through owner movement,
death or Recall. The casting aura is associated with each actual periodic cast; this follows
the source activation/cooldown relationship without reconstructing the entire client scheduler.

Three original `Ability_MP_MeteorStaff_Fall_0*.ogg` takes use 70% volume, and three impact takes
use 100%; all use 95–105% pitch and zero sound delay. Samples are copied unchanged and verified
by `scripts/import-native-troop-sounds.py --check`. Visual impact also declares camera strength
70 for 1,000 ms and disables replay shake. Presentation uses the shared local 0.32 world-pixel
mapping (22.4 maximum per axis), smooth deterministic 30 Hz knots and decay. Reduced motion
disables the moving art and impulse. End Battle cannot invent a later unresolved impact.

The equipment is an additional source spell entry for presentation and sound, without a player
spell card. Its carried roster warms art and all six samples before deployment. Ready art and
decoded audio independently cover generated cast feedback. HTTP failures use existing bounded
retry and reconnect recovery while paused. Older version 141 recordings retain their former
presentation and request no new optional art or samples.

All 27 item levels preserve version 141 simulation, cooldown and RNG after removing the added
presentation metadata. Actual Prince/Invisibility/Recall inputs cover first/final tiers, moving
attachment, a detached owner, fixed target art, source phases, spawned crater, cue gain/pitch,
portable forward/backward snapshots and historical silence. Browser checks cover original
desktop/phone meshes and Hero bodies, Recall, exact Node/browser battle equality, reduced motion,
actual Web Audio, live/replay camera rules and paused asset recovery. Checkpoints are relative to
the actual fixed-step cast time; they preserve the existing cooldown's sampling boundary.
