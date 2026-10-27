# Passive hero auras after resurrection

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
The existing comparisons describe [Electro Boots](../official-wiki/heroes-pets/electro-boots.md),
[Rage Gem](../official-wiki/heroes-pets/rage-gem.md) and
[Life Gem](../official-wiki/heroes-pets/life-gem.md).
Their passive ability rows cast `Electro Boots Aura`, `Rage Gem Aura` and `Life Gem Aura` on the
owner. Electro Boots explicitly resumes when the Champion is revived or redeployed. The gem
fields likewise belong to a living equipped Warden rather than a spent player activation.

Previously, the first cast stored the owner's unit ID in its passive deployment guard. A dead
owner ended the spell, but Revive and Phoenix restore that same body ID. Its guard then prevented
a new cast indefinitely. Real Monolith damage reproduced the missing aura for all three items
with both resurrection paths.

Version 138 resets only those passive-aura guards after a successful resurrection. It retires
superseded matching casts before they can resolve overdue pulses through the knockout, then the
normal Hero upkeep creates one fresh field. A pending canonical resurrection time is scoped to
the restored body. Recall resolving in the same spell sample can remove that body before upkeep;
a different redeployed body then starts at its own deployment time.

The new field starts at the resurrection's canonical time, following the existing aura-on-deployment
convention. The client's exact pulse phase across resurrection is not independently verified.
The source radii, pulse periods, owner/hero/siege exclusions, temporary buff persistence, health
grant accounting and damage modifiers use the existing native spell rules. Active abilities,
finite-hit equipment charges and other passive timers are preserved. A naturally exhausted aura
never restarts merely because its living owner's spell is absent.

The version capability is limited to loadouts with these three passive auras. Version 137 and
earlier preserve their previous resurrection behavior. No images, sound files, save migrations
or home equipment changes are needed.

Verification uses valid initial setups and recorded deployment, activation, Freeze and Revive
inputs, with real Monolith knockouts and source Phoenix resurrection packets. Both paths keep
the same Hero body ID. A newly deployed Giant receives the resumed gem bonus; aura casts and hits
continue without duplicate fields. Portable forward/backward seeks match the complete Node battle
state. A composed input recording also resolves Revive and Recall together before redeployment.
Browser checks cover original Hero bodies, phone and desktop views, rendering without simulation
writes, reduced motion and historical playback. Separate regressions retain Phoenix Recall and
Revive touch targeting.

Version 139 separately fixes [self-regeneration timing](../hero-regeneration/README.md) across
resurrection and Recall; the version-138 aura lifecycle remains in use.
