# Attacking Bowler windup and recovery

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
The [Bowler dossier](../official-wiki/troops/bowler.md) and character rows describe a 2200 ms
attack interval and `NewTargetAttackDelay=1100`. The existing source-derived `splitTiming`
interpretation gives 700 ms recovery, 1500 ms full windup and 1100 ms initial charge, leaving
a 400 ms fresh-target wait. All ten pinned Bowler levels use those timing values.

The older [LogicAttackerItemData](https://github.com/bns34/Supercell.Magic-my-turn/blob/52c5953f5e5802c64ac36e53d5599f8700976085/Supercell.Magic.Logic/Data/LogicAttackerItemData.cs)
subtracts default recovery above 1500 ms and converts the new-target field into initial
charge. This is the same interpretation used for [defending Bowler](../garrison/README.md).
The older engine corroborates the local timing rule; modern native executable parity is
unavailable.

Previously the attacking generic path treated the raw 1.1 s field as a wall-clock delay from
target acquisition, including travel. Real unarmed campaign probes at level 1 showed:

| Deployment x | First in-range update | First release | Wait after entering range |
| ------------ | --------------------- | ------------- | ------------------------- |
| 11.4 | 0.05 s | 1.15 s | 1.1 s |
| 6.9 | 1.85 s | 1.85 s | 0 |

Version 156 gives attacking Bowler a separate active-time windup/recovery controller.
A fresh target starts charging on reaching range, after recovery left. The first attack
therefore takes 0.4 s including the first 50 ms update; same-target releases stay 2.2 s apart.
An immediate target switch after release waits 0.7 + 0.4 = 1.1 s. Each active tick advances
once, preserves overshoot and uses the existing attack-interval scale. Freeze/stun holds both
phases, and poison/attack-speed boosts scale them together. A committed charge can complete
while following a retreating defender; the existing ground router handles the approach.

The original attack pose maps the remaining windup to the source one-based `ActionFrame`,
then follows through during recovery. Its captured animation offset also holds through full
Freeze and survives reverse seeks. This is a deterministic presentation alignment using the
existing source clip metadata.

The existing release handlers are retained: native boulders/bounces against buildings and
walls, and the established defender-targeted arrow path against defending units. This boundary
does not add new defender-targeted boulder flight/art or attacking Bowler throw audio. Source
stats, projectile damage and bounce rules retain their existing values. Only armies carrying
Bowler enable the controller; versions 155 and earlier keep the acquisition-time delay.

`tests/attacking-bowler-windup.test.ts` covers all ten levels and both approach distances,
first/repeat timing, Freeze in windup and recovery, retargeting, moving defenders, exact
single-hit defender damage, faster/slower clocks and complete current/historical portable
reverse seeks. Portable fixtures use actual deployment inputs with valid campaign metadata;
controlled status/retarget checks are separate isolated model tests. The browser spec
`tests/browser/attacking-bowler-windup.spec.ts` verifies full Node/Chromium states, original
meshes, read-only/reduced rendering and rewind on desktop and phone.

## Native defender boulders and fixed landings (recording version 157)

The pinned Bowler character rows declare `ProjectileBounces=2`, `ChainShootingDistance=400`
and `DamageRadius=30`: two total impacts, a four-tile bounce extension, and 0.3-tile splash.
Their level-specific `trollBoulder_*` projectile rows use speed 475, or 4.75 tiles/s.
DPS at levels 1–10 is 60, 72, 84, 96, 102, 108, 114, 126, 140 and 160; each throw deals
that value × 2.2. These are source facts. As in the [garrison implementation](../garrison/README.md),
the second point is fixed from the original launch aim. This follows the older chained
projectile interpretation; native 18.400.21 executable geometry remains unavailable.

Before version 157, the attacker still used the legacy arrow against defending units.
The native building path's second leg could also select a building near its destination,
used a 0.5-tile radius floor and could track an attacker when its ID overlapped the original
building. Version 157 replaces the defender arrow with the actual native projectile and
captures its original aim. The primary hit tracks normally; the fixed second point extends
the original source-to-aim ray by four tiles and never reacquires a target.

Each landing uses the source 0.3-tile ground splash. The captured direct primary hit is
excluded from the accompanying area pass so it takes damage once. Impact timestamps, rather
than update-frame end time, exclude defenders not yet born. Both legs survive the thrower's
death. Windup, recovery, damage boosts and source stats keep their version-156 rules.
Only carried Bowler armies enable this boundary. Historical recordings through version 156
retain their old arrow, tracking and radius behavior. No new art/audio asset is required;
the already imported boulder and trail now cover defender-targeted flight too. Attacking
throw audio remains a separate binding.

`tests/attacking-bowler-boulders.test.ts` checks all ten levels, source flight speed and
single splash damage, air exclusion, moving targets, fixed landings, an integer-grid building
0.4 tiles outside the landing, source-ID overlap, post-death completion, exact birth/impact
ordering, scoped allocation and complete current/historical portable reverse seeks. The real
Castle-release fixture uses ordinary deployments with no injected health/status state.
`tests/browser/attacking-bowler-boulders.spec.ts` checks complete Node/Chromium snapshots,
original first-leg and second-leg meshes, historical arrows, rewind, reduced motion and
read-only rendering on desktop and phone.


## Original boulder impact audio (recording version 158)

The same pinned client projectile rows declare `BounceEffect=trollBoulder_bounce` for all
ten attacking levels. `DestroyedEffect` is `trollBoulder_destroyed` through level 7 and
`trollBoulder_destroyed_lvl8` for levels 8–10. The importer follows each character level's
projectile link and retains both effect bindings; it does not infer names from the level.
The original effect rows bind:

| Phase | Source sound | Volume | Pitch | Delay |
| --- | --- | --- | --- | --- |
| First bounce | `sfx/rock_troll_hit_02.ogg` | 50% | 96–104% | 0 |
| Final shatter, both variants | `sfx/rock_troll_explo_01.ogg` | 40% | 98–102% | 0 |

The new bounce Ogg is copied unchanged: 17,176 bytes, SHA-256
`3b19a27dce6a965dcb7b83bea0b51917ddeeeebaea3fc423bb1beb98ae532687`.
The existing 14,242-byte shatter Ogg retains SHA-256
`412228f1a90526911d899b4c60e5d35c366a1122c28d97b09700a24de9915bcd`.
Both match the immutable full-client manifest. The catalog now has 374 effects and 360 sounds.

The simulation captures one compact record per resolved impact, with the projectile's exact
impact time, source level and leg index. The first leg plays the bounce effect; the fixed
second landing plays its declared destroyed effect. Recent records expire after the shared
ten-second audio horizon. Stable projectile/phase keys reconstruct sample offsets after a
seek and retain released tails after the actor falls. Cues read battle state without mutation.
Only decoded original cues cover generated impact feedback; unavailable samples keep the
existing fallback and retry lifecycle. Older player Bowler battles neither bind nor preload
the new impact sounds. Existing Seeking Shield and defending Bowler bindings are independent.

Fifteen focused checks cover all ten source levels, both phases and pitch ranges, exact
version-157 physical parity, post-death tails and retirement, historical preloads, and full
portable replay snapshots in both directions. Chromium checks on phone and desktop exercise
actual Ogg decoding, gain, replay-speed pitch, seek offsets, generated-tone coverage, pause,
reduced motion and a paused 503/reconnect recovery. These verify this adapter's lifecycle;
no native executable audio trace is available. Attacking throw-windup audio remains separate
work; its pre-attack sample needs an active-time clock rather than an impact binding.


## Original attacking throw audio (recording version 159)

All ten pinned attacking Bowler character levels inherit `PreAttackEffect=trollAttack`.
The two original takes, already shipped for [defending Bowler](../garrison/README.md#bowler-windup-audio-recording-version-155),
are `sfx/rock_troll_throw_01.ogg` (14,410 bytes, SHA-256
`7d2f694ba4ecc831b1dfb8edfa2525ec0eaf9faf5b093ec85c6fd31441e5c399`) and
`sfx/rock_troll_throw_02.ogg` (13,716 bytes, SHA-256
`89b15e79122c8c1a4d65b211b03c006444d6056c6d4d669d945c294f549621a0`).
Both declare volume 70%, pitch 98–102% and zero delay. The importer now retains the attacking
character's own pre-attack link. No file or effect is added: 374 effects, 360 sounds remain.

The local audio clock follows active wall time independently of poison/boost-scaled attack
time, matching the established Electro Dragon and defending Bowler convention. A fresh target
preloads the source-derived 1.1 s initial charge, then advances only the active portion of its
first update. A fresh target acquired during recovery waits without sounding. Repeat same-target
windups begin at age zero after recovery; a partial crossing advances only its wall-time fraction.
Freeze/stun holds and suspends the active cue; thaw resumes its saved age and stable key.

Release captures the virtual start so the approximately 2.435/2.348-second take can finish
naturally after the 1.5 s full windup. Already released tails continue during later Freeze or
after death. Target loss cancels unfinished cues, and reacquisition allocates a new key even
when the target ID repeats. Each actor retains at most 16 completed starts. Presentation reads
this metadata without changing combat. Version 158's separate bounce/shatter clocks remain.

This is the same explicit local phase alignment used by the defending adapter. The older
component's concrete-target branch invokes the pre-attack listener while advancing windup;
its listener implementation and a modern native audio trace are unavailable. Exact native
sample startup/offset parity is therefore unverified. The active-wall-time convention also
means attack-speed modifiers change combat duration without stretching the original recording.

Only carried player Bowler armies enable this capability. Earlier player battles neither
play nor preload these two takes through the player binding. Existing defending Bowler audio
still warms its own takes independently. There is no new generated launch tone to replace:
the ordinary projectile event only emits its existing visual muzzle feedback.

`tests/attacking-bowler-audio.test.ts` checks all ten levels, fresh/repeat phases, source takes
and pitch, release continuity, full and partial Freeze, attack-speed independence, recovery
retargets, unique keys after cancellation, death, bounded history, defender-targeted throws, exact physical
version-158 parity (including every sampled Freeze/Poison state), and full current/historical
portable replays at two approach distances. Controlled status checks are isolated model tests;
portable fixtures use ordinary deployments. Chromium tests exercise decoded source buffers,
gain, replay-speed pitch, sample offsets, pause/reverse/reduced rendering, historical player
silence/preloads, and a 503/reconnect recovery without advancing paused playback.


## Original impact phases and retained flight art (recording version 161)

The pinned projectile rows declare separate first-bounce and destroyed effects.
`trollBoulder_bounce` contains sound only, while `trollBoulder_destroyed` and the level-8+
variant contain the original shatter emitter. Previously the generic projectile renderer
also drew that destroyed burst at the first landing. Version 161 suppresses that first burst
and its generic impact fallback; the boulder continues to its fixed second landing, where
its declared destroyed graph draws normally. The existing first-bounce audio remains.

Recent original attacker flight packets now survive their removal from the live projectile
list. Copies capture the source level, original launch point and native identity; a per-update
ID map refreshes the primary's tracked coordinates and impact time before resolution. The
fixed second packet retains its own immutable landing. Histories retire deterministically
after ten battle seconds, and are absent in older replays. The renderer uses those packets
after cold seeks and during the existing battle-finish presentation grace. This is retained
presentation metadata; hit timing, target tracking and damage calculations are unchanged.

Both final graph variants already ship in the native effect index. The level-specific effect
identities come from the retained, hash-pinned projectile bindings shared with the sound
catalog; art selection does not depend on audio being enabled or decoded. Original graphs
warm with the carried army and retained history. Final contacts keep their existing fallback
until graph readiness, including after a 503; the intentionally visual-free first contact
needs none. Reduced motion retains the existing final-impact fallback. No art is fabricated
and no new asset file is required. Native trajectory/pixel parity remains subject to the
local projection limits described above.

`tests/bowler-impact-art.test.ts` covers all ten retained attacker packets, live tracking,
fixed second points, post-death retention and expiry, source graph variants, cold warm-up,
exact version-160 physical parity and full portable seeks for both attacking and defending
Bowlers. It also samples original final particles after real Freeze and lethal Lightning.
Chromium checks inspect the intended projectile's original shatter meshes rather than other
throws still on screen, verify first-bounce suppression and late-art fallback, and exercise
phone/desktop, cold seeks, reverse/reduced rendering and paused graph recovery. The source
art is original; event alignment and projection are deterministic local adaptations.
