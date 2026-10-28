# Angry Spell and pending attack charges

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
The [combat tables](../full-client/combat.json) define Angry Spell's granted
`AngrySpellAnger` ability. The existing local spell handler already clears a
touched troop's selected target and path to force defense selection.

A version-196 actual-spell recording exposed an inconsistent second target:
Archer and Dragon charge states remained committed to the mine after selection
was cleared. At 1.7 seconds each had a null selected target, active Anger and a
pending charge on building 2. The Archer mine fell from 952 to 944 HP by 2.8
seconds; the Dragon mine fell from 785 to 610. They continued attacking the
old resource until it fell. Bowler's shared state and Electro Dragon's separate
charge could also retain their former target.

## Recording version 197

Battles carrying Angry Spell cancel the pending troop charge when the granted
preference forces selection. The shared attack controller clears its committed
target, engagement and body offset. Bowler also discards the active pre-attack
cue. Electro Dragon clears its separate pending charge and animation origin.
The next selection immediately chooses an eligible defense.

Spent time, recovery, audio history and event sequence remain intact. Already
released projectiles, Electro Dragon arcs and resolved hit histories continue
normally. The change does not refund an attack or restart/bypass recovery.
The five existing per-family cancellation rules remain available to their
original historical versions. Versions 196 and earlier preserve the former
behavior for other attackers. The new capability is conditional on a carried
Angry Spell; village saves, spell values, troop stats and assets are unchanged.

This repairs an internal inconsistency with the established forced-selection
rule. It adds no new claim about modern native timing or pixel parity.

## Validation

`tests/angry-charge-reset.test.ts` uses actual deployment and Angry Spell inputs
for Archer, Dragon, Minion, Baby Dragon, Bowler and Electro Dragon at spell
levels 1/4 under versions 196/197. Complete portable states reconstruct forward
and backward. Historical controls retain their committed mine; current actors
clear it and select the Cannon immediately.

A farther legal Bowler drop places its active pre-attack cue across spell
arrival and verifies cancellation without a stale cue. A separately timed
actual cast lands during Bowler recovery and verifies that recovery retains
the same remaining amount. A Wizard fireball released before retargeting stays
in flight and damages its original target afterward. Existing fixture callers
retain their inputs; optional drop and cast times support these cases.

`tests/browser/angry-charge-reset.spec.ts` checks phone and desktop current and
historical Archer/Bowler/Electro Dragon fights plus current Dragon. It compares
complete states, reconstructed original pre-attack cues, decoded Bowler samples,
reverse seeks, read-only rendering, reduced motion, asset requests and WebGL
health. Screenshots go to ignored `output/playtest/`.
