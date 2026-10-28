# Deployment-relative troop lifecycles

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.

The archived [Druid dossier](../official-wiki/troops/druid.md), revision **624267**, specifies
a healer phase lasting 30 seconds after deployment. The character rows set `EvolveTime=30000`
at all six levels. The [Furnace dossier](../official-wiki/troops/furnace.md), revision **625281**,
and [Siege Barracks dossier](../official-wiki/spells-siege-super/siege-barracks.md), revision
**624362**, describe health draining over each deployed structure's own lifetime.

| Unit | Source lifetime | Source stock | Source HP by level |
| ---- | --------------- | ------------ | ------------------ |
| Furnace | `BunkerDegenerationTime=60000` | 19, 20, 21, 22 Firemites | 1530, 1620, 1710, 1800 |
| Siege Barracks | `BunkerDegenerationTime=30000` | P.E.K.K.As: 1, 1, 1, 1, 2, 2; Wizards: 6, 8, 10, 11, 11, 12 | 3300, 3700, 4100, 4500, 4800, 5100 |
| Druid | `EvolveTime=30000` | No bunker stock | 1300, 1400, 1500, 1600, 1700, 1850 |

Siege Barracks has `SpawnIdle=1300`. The existing local controller releases its P.E.K.K.As at
that deadline and distributes Wizards through the remaining lifetime. Furnace's existing local
spacing is lifetime divided by stock plus two. The exact native Furnace interval is unavailable;
this change retains that interpretation and changes only its deployment origin.

Previously ordinary deployment omitted `Unit.spawnedAt`. The bunker and evolution controllers
therefore used battle time zero. A level-1 Furnace deployed at 10 seconds immediately lost
256.275 HP and released three Firemites with birth times before its own deployment. A level-1
Siege Barracks lost 1105.5 HP and immediately released a P.E.K.K.A and two Wizards. A Druid
deployed at 10 seconds transformed at battle time 30, after only 20 seconds in human form;
one deployed after battle time 30 transformed on its first update.

Version 149 records the actual birth time when these three kinds are deployed. Their existing
controllers already read that canonical timestamp. Damage, stock, spacing, transformation on
lethal damage, and source stats retain their existing rules. Other deployed troop kinds receive
no new timestamp or lifecycle metadata. Summoned bodies already have their own scheduled birth
times. Versions 148 and earlier retain the historical origin. Recall stock and retained evolution
progress are separate behaviors; this boundary does not establish native rules for those cases.

The existing audio journal also reads the canonical birth time for a deployment cue. These
three units now use their actual deployment instant rather than the first presentation frame;
normal short-window cue deduplication remains in effect.

`tests/deployment-lifecycle.test.ts` checks every source level, full bunker release counts,
no pre-birth children, Druid deployments at 10 and 40 seconds, historical behavior, exact physics
for deployment at zero, and complete portable forward/reverse snapshots. The browser spec
`tests/browser/deployment-lifecycle.spec.ts` checks current and historical behavior on desktop
and phone, original parent/child/Bear meshes, read-only rendering, reduced motion and rewind.

## Version 182: fixed Siege Barracks roster

The source stores `BunkerTroops` as the array `[PEKKA, Wizard]` across its first
two rows. This is independent of the per-level `BunkerTroopCount1` and
`BunkerTroopCount2` columns. The
[archived source comparison](../official-wiki/spells-siege-super/siege-barracks.md)
explicitly records that distinction. The generic inherited-row reader treated
the second name as a level-2 change, so levels 2–6 released Wizards in their
first wave as well. A runtime probe confirmed one Wizard at level 2 and two
Wizards at level 6 at the 1.3-second deadline.

The version-182 Siege Barracks adapter reads the two fixed names separately:
every tier now releases its 1/1/1/1/2/2 P.E.K.K.As, then 6/8/10/11/11/12 Wizards.
Both kinds use the attacker's own recorded Laboratory levels. The existing
deployment-relative 30-second drain, 1.3-second first release, later Wizard
spacing and loss of unspawned stock on early defeat retain their rules. Exact
modern executable wave timing remains unverified. Only initial armies carrying
Siege Barracks enable this roster decoder; version 181 and earlier retain the
inherited primary type, including the correct level-1 P.E.K.K.A.

The source-derived preload demand also follows bunker children. Siege Barracks
warms the required Laboratory-tier bodies, direct projectiles and original
attack samples before deployment, using the historical roster for old replays.
Furnace warms its inherited Firemite tier through the same path. This adds no
village save format or portable replay envelope.

`tests/siege-barracks-roster.test.ts` checks all six tiers at base and maximum
research, every first-wave type and full stock, health drain, early defeat,
historical types, preload tiers and complete portable recordings. Browser
checks in `tests/browser/siege-barracks-roster.spec.ts` inspect levels 1, 2 and 6
under both versions on phone and desktop: scouting preloads bodies, shots and
samples, the original first-wave meshes draw, and full forward/backward replay
state, read-only rendering and reduced motion agree.
