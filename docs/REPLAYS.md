# Recorded attacks

Audited and committed September 11, 2026. The latest five completed campaign or practice attacks now support **Watch replay**, both from their result screen and from the village's Battle log. Twenty result summaries are still retained. Attacks completed before this feature have no recording.

Playback has pause/play, restart, a draggable timeline, ±10-second jumps, First deployment, and 1×/2×/4× speed. Space toggles pause. Camera dragging, zooming, and defense inspection remain available; deployment, spell casting, hero activation, and surrender are disabled. Completion leaves the battlefield visible, with Restart and Back to log available. Replay controls adapt to phone portrait and landscape widths.

Compact screens keep every action visible with icons for Play/Pause, Restart,
First deployment, Export and Back to log. Accessible names and tooltips retain
their full labels; keyboard order, slider scrubbing and speed selection stay
the same. All targets remain at least 44×44 pixels. The responsive browser test
also bounds panel height at 190 pixels in narrow portrait and 136 pixels in
landscape, leaving more of the recorded battlefield visible. Desktop controls
retain their text labels. This presentation change adds no recording version.

## Reproduction and isolation

`src/game/replay.ts` defines a versioned initial snapshot containing the actual enemy layout, defense levels and upgrade state, original army/spells, troop and spell research levels, King level/Town Hall, and starting unit identifier. A compact event stream records successful troop deployments, spell casts, hero deployment, manual hero activation, and battle termination, in order at simulation-step boundaries. Failed inputs and selection/camera movements are not recorded. The actual simulation deltas are preserved, including scouting time. Automatic hero activation, traps, mortar impacts, and combat outcomes are reproduced by the normal simulation.

Troop and spell research levels are frozen at attack entry. Research that finishes at home during an attack applies to the next attack. While watching a replay, home research advances from the home level, never from the recorded troop or spell level. This closes a timing dependency that would otherwise change damage midway through a recording.

Playback runs a separate GameModel and exposes only its battlefield to the scene. It never spends home troops or spells, pays loot, changes trophies/stars/statistics, or appends a result to the home log. Home collectors and upgrade timers continue their normal wall-clock behavior while watching. Restart creates a fresh simulation from the stored snapshot, so later layout changes, upgrades, or empty army camps cannot alter an old replay.

## Persistence and limits

New recordings stay inline in the synchronous local backup until IndexedDB
confirms their separate payloads. An immediate reload or an interrupted database
write can therefore recover the recording as well as its result summary. Once
confirmed, the backup drops its inline payloads and routine village saves remain
small. Completion of an older transaction leaves a newer backup intact. If a
fresh recording exceeds local-storage quota, the smaller village backup still
saves while IndexedDB stores the payload. The existing village and replay file
formats are unchanged.

`tests/save.test.ts` covers the pre-commit backup, cleanup, concurrent writes,
database failure and quota fallback. The desktop and phone recording workflows
in `tests/browser/replay.spec.ts` exercise immediate reload and playback from
the recovered log.

The [army facility progression pass](FACILITY-PROGRESSION.md) retained combat version 16 before the spell rules changed. Barracks, Laboratory and Spell Factory health is captured in each battle snapshot, so the new home-village values do not reinterpret old recordings. A replay regression checks exact playback of the former Barracks health after the viewing village has adopted the new table.

Recordings travel with normal IndexedDB/localStorage saves and JSON export/import. Import validation bounds step/action counts, timestamps, coordinates, types, research, hero values, and initial building data. Existing saves and result records without a replay remain valid. Only the latest five result entries retain recording payloads; all twenty retain their summaries.

The current recording version is **187**, with playback compatibility for **34–186**. The following early history describes versions 34–38; later boundaries are documented below. Version 38 adds explicit, bounded garrison rosters and deterministic release state; earlier versions reject that setup field. Version 37 adds the passive Clan Castle building and its Lightning immunity; earlier versions reject that building kind. Version 36 introduces original-speed tracking Cannon projectiles and retains the prior Cannon rules for 34/35; version 35 introduces original-speed Mortar flight and retains fixed flight for 34. New Cannon/Mortar presentation histories reconstruct from simulation time without changing the old physical states. Immutable archived-code witnesses verify the supported historical paths. See the [Cannon reference](../reference/cannon/README.md), [Mortar reference](../reference/mortar/README.md) and [QA record](QA.md).

Version 30 added campaign-only Santa Trap identity, five deterministic timed strikes and rewindable native animation/audio (see [SANTA-TRAP.md](SANTA-TRAP.md)). Earlier schemas carrying Santa Trap identity are rejected. Version 29 supports level-three/four Skeleton Traps, all four/five scheduled defenders and distinct spawn offsets. Older snapshots with trap levels above two are rejected before version 29. Version 28 adds native Pumpkin Bomb identity, 25 ground splash damage and an independently timed two-second fuse (see [the source and timing limits](../reference/pumpkin-bomb/README.md)). Version 27 snapshots native versus authored campaign identity, native scenery and layouts up to 600 entities. Native loot allocation and Tutorial Cannon target classification use the new rules. Version 26 preserved campaign-only Goblin building identities and the tutorial Cannon weapon. Version 25 snapshots finite campaign inventory, removes campaign time limits/trophy changes, records storage overflow, and fixes a ranged-unit path endpoint (see [CAMPAIGN-RULES.md](CAMPAIGN-RULES.md)). Version 24 added Blacksmith loadouts, item levels and Earthquake Boots. Version 23 applies native King level stats, early Town Hall scaling, default Puppet/Vial equipment, fixed recovery, timed summons and birth-aware effects (see [KING-COMBAT.md](KING-COMBAT.md)). Version 22 added Skeleton Traps, defending-unit combat, saved/exported ground/air modes, and five-tile/s fixed-point Wizard fireballs (see [SKELETON-TRAP.md](SKELETON-TRAP.md)). Version 21 added fixed-point Bomb Tower projectiles, delayed destruction charges and four campaign placements (see [BOMB-TOWER.md](BOMB-TOWER.md)). Version 20 added concealed Tesla targeting/pathing, reveal state and instant electrical attacks (see [HIDDEN-TESLA.md](HIDDEN-TESLA.md)). Version 19 added saved Sweeper directions, traveling gusts, interrupted air movement and homing Seeking Air Mines (see [AIR-CONTROL.md](AIR-CONTROL.md)). Version 18 added the Healer, Dragon and P.E.K.K.A roster and healing projectiles. Version 17 snapshots spell levels and applies native spell research/effects, pulse timing, Rage boosts and Lightning immunity/stun (see [SPELL-PROGRESSION.md](SPELL-PROGRESSION.md)). Version 16 applied the remaining supported troop tables, specialist movement/ranges, Wizard splash, researched Balloon/Wall Breaker death damage and Goblin Dark Elixir targeting (see TROOP-PROGRESSION.md). Version 15 applied native Barbarian/Archer stats, their movement and ranges, short melee approach points and normal wall attack damage (see STARTER-TROOP-PROGRESSION.md). Version 14 applied the audited Army Camp hitpoints. Version 13 corrected Army Camp and Hero Hall to 4×4 footprints and adjusted three campaign placements. Version 12 expanded the map and corrected Cannon, Archer Tower and Mortar to 3×3 footprints. Older snapshots keep their original grid validation and remain readable as summaries; see [NATIVE-GRID.md](NATIVE-GRID.md). Version 11 corrected low-level Wall health against the official June 2025 balance changes. Version 10 corrected low-level Cannon health and damage. Version 9 updated trap damage, Bomb fuse timing, Giant Bomb radii and spring stun behavior. Version 8 updated Air Defense and Wizard Tower health/damage and Wizard Tower splash radius. Version 7 aligned Mortar impact rounding with other projectiles. Version 6 updated Mortar progression and combat and discarded outstanding shells when a battle ends. Version 5 updated Cannon/Archer Tower damage and range plus defense firing cadence. Version 4 recorded raid-limited storage headroom and kept playback loot/results independent of the viewing village. Version 3 introduced Balloon splash; version 2 added timed projectile damage. Increment it whenever combat rules or campaign multipliers change in ways that affect playback. Incompatible recordings remain in the save with their result summary, but cannot be played. Compatibility is limited to the explicitly supported versions; earlier rules are not emulated. Portable file sharing and seeking work. No hosted replay sharing service, defense replay, or online opponent recording exists yet.

Each new recording is bounded to 60,000 steps (50 minutes at the normal fixed 20 Hz), 2,000 inputs, 700 carried troops and 100 carried spells, sufficient for the supported village catalog. Normal playback and seeking process at most 100 recorded steps per update and yield after an 8ms work budget (checked between simulation steps); excess playback time carries forward. This keeps very small imported deltas from exhausting the full recording in a single frame. Untimed campaign scouting records no idle frames. Unsupported debug step durations or oversized recordings disable recording without interrupting the attack; the result log explains recording-budget exhaustion. Earlier combat versions retain their 6,000-step/230-second validation budget. A developer-tool forced victory deliberately discards its recording, since direct hitpoint edits are not player inputs.

## Seeking and portable files

The timeline accepts pointer dragging and keyboard Home/End. Changes snap to a recorded simulation boundary. Jump ±10 seconds for a quick review, or use First deployment to skip scouting. Scrubbing pauses playback. Button-based jumps preserve whether playback was running or paused; seeking backwards from a completed replay leaves it paused for inspection.

Seeking reconstructs an isolated simulation from the initial snapshot in chunks of at most 100 simulation steps per update. Reconstruction emits no sound or combat effects. New seeks supersede pending ones, and exiting cancels pending work. The battlefield switches to the reconstructed state only when it is ready; camera position and zoom stay put. Scene sprites and transient combat effects are reset, so buildings and troops that were destroyed later can reappear correctly. The slider stays mounted throughout a pointer drag even if another HUD update occurs.

**Export replay** in the log or playback controls creates a `.crown-replay.json` file. **Open shared replay** in the log accepts that file, including when the local log is empty. All playback controls provide at least 44×44 CSS-pixel targets on supported portrait and landscape screens. Shared replays are temporary: they never become a village result record and close on page reload. Keep the downloaded file to watch it again or send it using your own preferred channel.

`src/game/replay-file.ts` owns the separate `crown-clan-replay` file envelope, version 1. Exports whitelist combat fields, clear collector inventories, and exclude village balances, presets, log history, and unknown imported fields. The replay includes raid-capped loot capacity needed to reproduce the result, without exporting wallet balances or total storage capacity. Files are capped at 512 KB and checked against the replay validator and current combat version. Village backups, malformed files, and incompatible versions are rejected without changing the active village or playback. A shared recording cannot interrupt a live attack. No file is uploaded to a service.

## Verification

Eight simulation/save tests cover exact campaign and practice combat reproduction; all seven troop types and three spells; manual and automatic hero activation; traps and mortar fire; research finishing during a raid; scouting timeout and automatic termination; pause/speed/restart; JSON round trips; retention/version handling; and malformed data rejection. Equality checks include unit positions and health, building damage, targets, paths, active spells, traps, shells, loot, and destruction. The home save is compared before and after playback.

Two browser tests create attacks through real pointer deployment, surrender, reload the save, and play them from the log on desktop and phone. They verify pause, speed, completion, restart, exit, control bounds, unchanged army/rewards/history, and absence of page errors. Screenshots are in `output/playtest/replay-desktop.png` and `output/playtest/replay-phone.png`.

Production Chromium and WebKit additionally passed recorded campaign playback at 844×390, including pause, speed, restart, exit, and unchanged resources/army. Landscape Battle log navigation is now reachable through a two-column village tool rail. Reports and screenshots are under `output/playtest/replay-production-*`.

Six additional model tests cover seek equivalence at earlier/later/final positions, silent reconstruction, superseding requests, cancellation, playing/paused state, First deployment, standalone replay round trips, export filtering, invalid files, version/size limits, and active-attack guards. Three additional browser scenarios exercise keyboard and pointer scrubbing, live HUD updates during dragging, revived sprites, camera preservation, file downloads/uploads, repeated imports, error feedback, and persistence isolation. Screenshots: `output/playtest/replay-seek-*` and `output/playtest/replay-imported.png`.

The September 11 audit added regression coverage for nearly full storages, exact replay results, viewing-village capacity independence, research completion while watching older levels, tiny imported time steps, roster limits, saveable oversized debug raids, and older recording retention. Invalid new recordings are omitted before saving their result; older combat versions retain their original validation limits and remain readable as summaries.

A September 12 browser regression found that live HUD updates could overwrite a pointer-dragged slider when it lacked keyboard focus. `updateLive` now preserves the value throughout pointer scrubbing, independently of focus. The browser test deliberately blurs the held slider, triggers a model update, verifies its exact unquantized input value, and completes the drag. Keyboard seeking and post-release reconstruction remain unchanged.

## Version 41: Archer Tower tracking

Version 41 gives Archer Tower arrows source-tier projectile variants and bounded source-speed tracking. Their arrival deadline follows the original target's moving position rather than remaining fixed at launch. Versions 34–40 preserve their prior arrow objects and deadlines; ordinary troop arrows keep their existing behavior. A battle opts in only when its initial layout contains an Archer Tower. The original version-40 level-ten recording retains 836 complete-state hashes captured from commit `c613024`; all match under current legacy playback. New level 1, 7, 10 and 12 recordings pass complete combat, reverse seeking, standalone export/import and home isolation, with every state matching across Node, Chromium and WebKit.

## Version 44: late Goblin Map

Version 44 adds the late single-player campaign families and levels (see [CAMPAIGN-RULES.md](CAMPAIGN-RULES.md#late-goblin-map-villages-6290)): higher Wall, storage, collector, Air Defense and trap levels; Eagle Artillery, Scattershot, Monolith, Spell Tower and Tornado Trap kinds; Goblin Freeze Trap, Ghost Trap, Communications Mast, Goblin Hall, Goblin Castle, Foreboding Cave and Goblin Boss Hall identities; explicit Spell Tower weapons; every late garrison family and level; armed Builder's Huts with Defending Builders; and up to 1,000 buildings. Their battle state lives under `battle.late` and advances in four fixed phases per step, so seeking and portable files reconstruct it exactly. Version-44 native campaign battles also use the client's sub-tile building collision for routes, separation, pushback and vortex carries, with straight walks along clear sight lines (`battle.nativeSubtiles`).

Versions 34–43 reject the new kinds, identities, fields, families and levels, keep their previous level ceilings and building limit, and keep whole-tile routes, so their recorded states replay unchanged. Portable replay files carry the Spell Tower weapon. Each family's replay tests record real deployments, export and import portable files, and compare complete battle states across backward seeks in separate viewers.

## Version 54: crowd separation cap and stalled summons

Version 54 changes two combat rules and one piece of stored state; versions 34–53 keep their previous behavior and replay unchanged (`replayBattle` sets the flags only from version 54).

- `battle.separationCap`: crowd separation moves any one unit at most `SEPARATION_TILES_PER_SECOND` (2 tiles/s, 0.1 tile per 50 ms step). Each overlapping pair used to push up to 0.07 tiles with no per-unit bound, so a unit in a dense blob could jump 1.1–1.6 tiles in one step (a Barbarian walks 0.11).
- `battle.stalledSupportEnds`: once nothing is left to deploy, summoned units alone end the battle after 30 seconds without damage to a building (Walls and traps aside) or defender. See [CAMPAIGN-RULES.md](CAMPAIGN-RULES.md#timing-and-results). The stall clock is kept in `battle.progressAt`/`battle.progressHp`.
- `battle.dropFallenPaths`: fallen units and skeletons drop their route waypoints (nothing reads them; a revived hero gets a fresh route), which keeps keyframe clones and saves smaller. Archived battle-state hashes include those waypoints, so older versions keep them.

The same release made several simulation paths faster without changing any result: every version replays bit-identically. Route grids and exact A* results are cached per building list; the cache key now compares list identity, footprints and standing state instead of a 32-bit hash of ids, which collided between equal-size campaign stages (ids are `1000 + index`) and could route a new battle through the previous stage's buildings until its first building fell. That collision could make a live battle and its replay diverge; with the exact key both always search the battle's own layout.

Playback no longer banks an unbounded backlog when a battle simulates slower than real time: the budget is capped at `MAX_REPLAY_BACKLOG_SECONDS` (0.25 s) after each update and cleared on seek, pause and speed change, so a heavy battle at 4× slows down instead of later fast-forwarding up to 100 steps in one frame. Replayed deployments report passive changes (a live HUD refresh), as live deployments do, rather than a full HUD render each.

## Version 55: Helper Hut

Version 55 adds the Helper Hut building (Town Hall 9, see [HELPERS.md](HELPERS.md)). It changes no combat rule: a version-55 battle against a village without a Helper Hut plays exactly as version 54. Recordings before version 55 reject a Helper Hut in their buildings.

## Version 56: Builder's Hut levels 5–8

Version 56 adds the four higher home hut tiers, with original artwork, nail damage and Defending Builder repair levels. Versions 34–55 remain playable with their previous hut ceilings and combat behavior; they reject huts above level 4. Save version 4 is unchanged. See [the source and presentation guide](../reference/builder-hut/README.md).

## Version 57: Freeze on Defending Builders

Full offensive freezes now reach a spawned, visible Defending Builder at his own position. The pinned spell pulse radius and duration hold his movement, target acquisition, repair countdown and recovery timer. Overlaps extend the deadline, and only the frozen portion of each step is removed. His original animation holds with the native freeze tint and resumes after thawing. Earlier recordings retain their prior Builder behavior; no save or replay input fields change. [The replay regression](../tests/defending-builder-freeze-replay.test.ts) reconstructs recorded Earthquake and Freeze casts through backward seeks and compares version-56 playback.

## Version 58: native Lightning on Defending Builders

Native offensive Lightning resets the repair target of active Defending Builders at each strike point, using its original pulse time and radius. The worker drops his path and repair engagement, preserves recovery, then chooses a candidate on his next active step. Versions 52–57 keep their original native spell behavior; the earlier Lightning path remains unchanged. Recorded spell inputs, portable files and backward seeks cover both behaviors.

## Version 59: Poison on Defending Builders

Offensive native poison pulses now slow Defending Builder movement and repair/recovery timers at the worker’s position, using the source SpeedBoost, AttackSpeedBoost and boost duration. Poison never damages the invulnerable worker or reduces the health restored by each repair. Overlapping clouds retain the strongest slow and latest deadline. Only the poisoned, unfrozen part of each simulation step is slowed. The original body uses the shared poison tint, with Freeze taking priority. Versions 58 and earlier retain their original repair behavior.

## Version 60: Poison on defending heroes

Defending heroes now apply native Poison’s signed movement and attack-speed modifiers as slows, and its `HeroDamageMultiplier` to poison damage. Level-1 Poison retains 74% movement speed and 65% attack-clock speed and deals 5% of its ordinary poison damage to a hero. Versions 52–59 retain their previous defending-hero calculations, including the old poison behavior. Actual recorded deployment and spell inputs reconstruct health, movement and attacks through portable files and backward seeks.

## Version 61: Poison slows on garrison and trap defenders

Native poison now slows Clan Castle defenders and Skeleton Trap defenders using the source signed movement and attack-speed modifiers. Garrison recovery, windup and summoning clocks use the slowed action time; Baby Dragon Tantrum multiplies that action time by its existing boost. Air and ground movement use the separate movement modifier. Poison expiry restores normal rates, and frozen, unborn or idle defenders retain their existing timing gates. Versions 60 and earlier keep the previous garrison and skeleton behavior.

## Version 62: overlapping Poison damage on defenders

Overlapping native Poison clouds still accelerate their early damage ramp, but share the strongest active spell’s maximum effective DPS against a defender. A shared battle-clock allowance covers simultaneous and staggered pulses, including the existing hero and Guardian damage reductions. Overlaps also retain the strongest movement/attack slow and latest expiry. Versions 61 and earlier keep their original per-cloud damage calculation. Portable staggered spell inputs reconstruct the shared allowance exactly through backward seeks.

## Version 63: Poison allowance clocks across larger updates

The shared defender Poison damage allowance can no longer move its refill timestamp backward. Native spells retain their cast-order pulse processing; when one update crosses several casts’ pulses, an older pulse cannot refill time already processed by another cast. This keeps the maximum damage rate for larger recorded updates as well as normal 20 Hz play. Versions 62 and earlier keep their original calculation. Recorded one-second steps reconstruct exactly through portable files and backward seeks.

## Version 64: idle garrison Poison avoidance

Idle released garrison troops now leave offensive Poison clouds when they have no eligible attacker, following the source `USE_POISON_AVOIDANCE` rule. Pulse records retain cloud positions through their native boost deadlines. A deterministic local choice selects a nearby clear boundary outside all active clouds; ground troops use their existing pathfinder and flyers move directly. Active combat takes priority, and Freeze holds avoidance movement. Original character poses follow the escape path. Versions 63 and earlier retain their previous idle behavior.

## Version 65: idle Hero and Skeleton Trap Poison avoidance

Idle defending Heroes and Skeleton Trap defenders now use the Poison avoidance rule too. Heroes stay clear while their home point is covered, then resume their original return-home behavior when the cloud ends. These defenders retain static cloud positions through the native final-pulse boost deadline, independently of their last damage exposure. Combat still takes priority and Freeze still holds movement. Skeleton health and speed are unchanged, so a low-level Skeleton can start fleeing and still die before crossing a large cloud. Versions 64 and earlier retain their original behavior.

## Version 66: defensive Poison clocks across larger updates

Defensive native Poison pulses keep their shared attacker damage clock and slow deadline at the latest processed pulse. Catching up multiple clouds in cast order can no longer move either timestamp backward and charge the same exposure time twice. Two staggered Poison Spell Towers now deal the same damage with one-second updates as with 20 Hz updates, including their native hero multiplier. Versions 65 and earlier keep their original calculation. `tests/attacker-poison-clock.test.ts` covers update sizes, actual Spell Tower casts, portable replay files and exact backward seeks.

## Version 67: Hero movement under native Poison spell clouds

Native spell Poison movement modifiers now apply the client’s 50% hero multiplier with integer truncation on both sides of a battle. Spell Tower Poison retains 83% Hero movement speed instead of 65%; attack slow and poison damage stay unchanged. Direct Hero Hunter projectile poison retains its existing behavior. Versions 66 and earlier preserve their previous movement calculation. Recorded King deployments and Poison Spell Tower casts reconstruct exactly through portable files and backward seeks.

## Version 68: distinct Freeze cues on defending units

Full native freezes record a separate defender `frozenUntil` deadline for artwork, alongside the existing stun deadline used by combat. Heroes, Guardians, garrison troops and Skeleton Trap defenders can therefore show the same icy tint as attacking units without coloring Lightning or Totem stuns as Freeze. Freeze takes priority over Poison; thaw and death restore the remaining status or original artwork. Older recordings keep their previous state shape and appearance. Exact replay comparisons confirm that version 68 changes only the new visual fields, with damage, movement and attack timing identical to version 67.

## Version 69: equipment dash contacts and defending Hero thaw timing

Penetrating equipment such as Rocket Backpack now damages each contacted defender directly once. The previous zero-radius area hit could damage multiple defenders at one position for each member of the stack. Defenders that have not spawned yet neither take damage nor consume a dash contact. Defending Heroes also use only the part of an update after their stun or Freeze deadline for movement, cooldown and path timers; the update ending exactly on that deadline stays fully held. Versions 68 and earlier retain their previous damage and timing. Actual Duke activation and Freeze inputs reproduce both rules through portable files, backward seeks and desktop/phone browser checks.

## Version 70: native spell defender immunities and Hero damage

Offensive spell pulses now honor the source’s Hero, Guardian and other-character immunity flags for defending units. This keeps Root Rider’s wall aura from damaging defenders and Driller surfacing from stunning them. Direct damage uses the source `HeroDamageMultiplier` on defending Heroes and the pulse’s scheduled spawn check, matching the existing native status-effect gates. Electro Titan/Electro Boots auras now deal 25% damage to Heroes; Dragon Duke’s dash aura deals 10%. Version 69 and earlier retain their original rules. Actual Root Rider and Electro Boots inputs reconstruct both versions exactly through portable files and backward seeks.

## Version 71: projectile frost captured at launch

Native building-targeted projectiles now carry their frost duration and percentage, including Frozen Arrow equipment values, instead of reconstructing that effect from the shooter’s base character row on impact. Frozen Arrow also selects its source projectile before other equipment projectile overrides. The captured frost survives Recall or a missing shooter and expires relative to the scheduled impact time. Versions 70 and earlier retain their previous projectile names and effect calculation. Actual Queen deployment and Recall inputs reproduce the airborne shot, hit and expiry through portable files and backward seeks.

## Version 72: cumulative Monolith Arrow housing

The Monolith Arrow stage now uses a persistent deployment counter: 25 per Hero, one per owned Siege Machine and normal housing for ordinary troops. Pets, summons and spells do not contribute. Losses and Recall cannot lower the counter, and recalled redeployments retain their original contribution. Exactly 180 and 250 retain the higher stage at each boundary. Recordings reconstruct the counter from deployment inputs; versions 71 and earlier preserve their previous unit-list selection. Real troop, Hero, Siege Machine and Recall inputs cover all three projectile tiers, their damage and exact portable backward seeks.

## Version 73: attacking Headhunter Hero rules

Headhunters prioritize valid defending Heroes across the battlefield, deal the source’s four-times direct damage to them, and jump walls during that chase. Ordinary defenders and Guardians retain normal hit damage. Once no valid Hero remains, ordinary targeting resumes. Real Headhunter deployment and Freeze inputs record a shot against a ground or air Hero; portable files and backward seeks reconstruct its launch and impact exactly. Versions 72 and earlier retain their original targeting, damage and wall routing.

## Version 74: native Headhunter cards against defenders

Defender-targeted Headhunter shots now use the source’s level-specific card and 14-tile-per-second flight instead of a generic 18-tile-per-second arrow. The native impact resolver applies the captured hit to its original ground or air defender, including after the shooter leaves. Versions 73 and earlier preserve their previous arrow and impact time. Real shots reconstruct the flight and hit through portable backward seeks; an intermediate checkpoint verifies that version 73’s arrow has already landed while the new card is still airborne.

## Version 75: aimed area-spell centers

Non-strike native spell pulses now use the aimed center or their following owner's current position.
The generic pulse path previously applied `RandomRadius` to field spells, moving Rage, healing,
Freeze, Invisibility, Earthquake and related areas away from their visible circles. Direct positive-damage
strikes such as Electro Dragon death lightning retain their source scatter. Pulse and feedback cadence
stay intact. Versions 74 and earlier preserve the shifted pulses. Real Giant deployment and Rage inputs
at a wall reconstruct the aimed boundary through portable files and backward seeks.

## Version 76: intrinsic attacker poison-on-hit

Headhunter and Poison Lizard projectiles apply the intrinsic source spell's three-second on-hit
poison to living defenders. The existing continuous on-hit damage interpretation uses the source's
Hero/Guardian modifiers, strongest on-hit refresh and signed slow values. Area and on-hit slows
choose their stronger component; Freeze retains visual priority. Poison Lizard uses its native spit
and can engage nearby unalerted enemy units while preserving wall jumping. The projectile's source
kind/level remains sufficient after Recall removes its owner. Real ground/air attacks, Recall and
expiry reconstruct through portable files and backward seeks. Versions 75 and earlier preserve
their direct-only hits and previous Lizard targeting/projectile.

## Version 77: ranged frost on defending units

Frozen Arrow, Frosty and intrinsic ranged frost use their native projectile and retain frost
strength/duration at launch when attacking defenders. Scheduled impacts apply partial frost
after Recall removes the shooter. Movement and attack clocks use the existing local chill
interpretation, independent of full Freeze/stun and with a blue status cue. Monolith Arrow's
projectile override remains available without adding its building %-HP damage to defenders.
Real ground/air Queen attacks reconstruct through portable files and backward seeks. Versions
76 and earlier preserve their generic defender arrows and direct-only hits.

## Version 78: Royal Champion Haste Vial intervals

Haste Vial's active source interval now governs Royal Champion combat, divided by the equipped
passive attack-speed bonus. Native status modifiers apply afterward. Damage per hit is preserved,
and newly fired attacks return to the passive base interval after expiry. Real Haste activation,
building hits and expiry reconstruct through portable files and backward seeks. Versions 77 and
earlier retain their prior combat rate and uncombined animation override.

## Version 79: equipped Hero life steal

Vampstache's source heal applies once after each actual attack on a building, wall or defender.
Healing caps at maximum HP and cannot revive a fallen Hero. Approach steps and held cooldowns
do not heal. Recorded King duels reconstruct source healing through portable files and backward
seeks. Versions 78 and earlier retain their attacks without life steal.

## Version 80: Invisibility Vial shot damage

The Queen's ordinary attacks capture the active Vial's flat damage bonus at launch, including
hits on buildings and committed defending units. The damage survives ability expiry and Recall;
new shots after expiry return to ordinary damage. Copies outside the Hero roster receive no Vial
bonus. Real activation, expiry and Recall inputs reconstruct through portable backward seeks.
Versions 79 and earlier retain their invisibility without the extra shot damage.

## Version 81: Royal Champion charged spear combat

Rocket Spear activation now supplies range, projectile, flat damage and splash, and each actual
throw consumes one charge. The last charged projectile keeps its snapshot after the effect is
removed; ordinary spears and Haste resume independently. Defender shots use native spear packets
and wall jumping. Rocket splash hits the primary defender once, follows its layer, and uses
impact-time birth/death checks. Real charged and ordinary throws reconstruct through portable
files and backward seeks. Versions 80 and earlier preserve their previous attacks and charges.

## Version 82: Noble Iron deployment shots and charged Hero Recall

Noble Iron starts on the Prince's first deployment without an ability input. Its finite attacks
capture source range, projectile and extra damage; each actual building or defender attack spends
one charge. Recall retains remaining finite-hit Hero equipment effects and restores them on the
new unit. Noble Iron's once-per-roster grant prevents redeployment from refilling spent charges.
Real deployment, depletion, Recall and redeployment inputs reconstruct through portable files and
backward seeks. Versions 81 and earlier preserve their prior combat and Recall behavior. Timed
buff retention and other Recall timer rules remain outside this correction.

## Version 83: Stick Horse deployment timing and combat

Stick Horse starts before the King's first combat sample. Building and defender attacks use its
temporary interval, including passive equipment speed and status scaling. Personal wall jumping
now affects both chase paths; the cached route is discarded when that effect starts or expires.
Real deployment, boosted attacks, expiry and intact-wall traversal reconstruct through portable
files and backward seeks. Versions 82 and earlier retain their previous timing and wall blocking.

## Version 84: passive Hero attack speed retains hit damage

Passive equipment attack speed now preserves per-hit damage while shortening the attack interval,
instead of reducing hit damage and cancelling its nominal DPS gain. The model's unit stats and
native combat stats use the same version gate. Item speed percentages still add; Town Hall
strength, charged shot bonuses and status intervals retain their existing order. Real hits and
projectiles reconstruct through portable files and backward seeks. Versions 83 and earlier keep
their original damage and results. The normal Hero panel shows the current calculation.

## Version 85: Giant Gauntlet melee splash

Active Giant Gauntlet now applies ground splash around the primary building or defender. Nearby
buildings and ground defenders take one hit, with birth checks and existing building immunity.
The effect grants no movement across walls; Stick Horse keeps its own timer. Expiry restores
ordinary hits, and copies outside the Hero roster gain no equipment splash. Actual activation,
splash and expiry reconstruct through portable files and backward seeks. Versions 84 and earlier
preserve primary-only combat and their previous stored metadata.

## Version 86: native jumper routes during defender pursuit

Every native source jumper now retains wall bypass during defender pursuit. Previously only
specific units enabled it in that chase. Ordinary ground routes, target preferences and earlier
special exceptions retain their existing behavior. Real Lassi deployment and Warden pursuit with
recorded lure/Invisibility inputs reconstruct through portable files and backward seeks. Versions
85 and earlier preserve their previous routes and results. Underground movement remains separate.

## Version 87: underground defender pursuit and attack exposure

Burrowers now bypass obstacles during defender pursuit, surface before hitting, and burrow again
when the target moves out of range. Surfaced units can be targeted and damaged, including while
waiting for their next attack. The Battle Drill surfacing transition is shared with building
combat. Real Miner and Diggy attacks and enemy retaliation reconstruct through portable files and
backward seeks. Versions 86 and earlier preserve their previous ground routes and hidden attacks.

## Version 88: Hero defender attack shapes

Heroes now use their source projectile or direct hit against defenders. The Queen fires native
level-specific arrows, including Monolith Arrow's housing-stage selection without paired frost;
the Warden and Dragon Duke deal direct hits because their source rows have no projectile.
Captured damage and frost persist after Recall, and lethal native Hero impacts use their
scheduled deadlines. Copies retain base shapes without roster equipment. Actual attacks and
Recall reconstruct through portable files and backward seeks. Versions 87 and earlier retain
their previous generic packets and sampled lethal timestamps.

## Version 89: Monolith Arrow target-max-HP damage against defenders

The Queen's Monolith Arrow now captures its primary defender's maximum-HP bonus at launch,
using the cumulative housing stage. This applies to ground and air defenders. The bonus adds
after ordinary attack damage scaling and persists alongside captured frost after Recall or
later housing changes. Copies gain no roster item bonus. Actual ground/air Hero hits and Recall
reconstruct through portable files and backward seeks. Versions 88 and earlier preserve their
previous defender damage.

## Version 90: Diggy's defense stun on surfacing

Diggy now applies the source defense stun once per emergence. Repeated surfaced hits leave its
deadline unchanged; leaving building attack range burrows Diggy so a later emergence may stun
again. Existing longer stuns persist, and defenses resume after expiry. Resource buildings and
defending units receive no Diggy stun. Real pet deployment, repeated hits and defense recovery
reconstruct through portable files and backward seeks. Versions 89 and earlier preserve their
previous defense activity and exposure while moving away from a building.

## Version 91: Diggy follows its living Hero's target

Diggy now prefers the assigned living Hero's eligible building or ground defender target.
Hero routes record their actual blocking Wall separately from their destination so the pet can
help break it during either chase. Target changes reset Diggy's route and underground approach;
missing or ineligible master targets use independent selection. Copies borrow no roster master.
Actual King/Champion deployments and an enemy held behind a Wall by Freeze reconstruct through
portable files and backward seeks. Versions 90 and earlier preserve independent pet selection.

## Version 92: native Invisibility target coverage

Player Invisibility now conceals eligible buildings and defending units as well as attackers.
Native Spell Tower Invisibility also conceals defending units, retaining its existing defensive
building coverage and team rule. Concealed targets remain vulnerable to airborne shots and
indirect damage and can keep attacking. Each pulse refreshes the pinned 600 ms linger; expiry
restores target eligibility. Actual casts, retargeting, airborne impacts and an automatically
triggered Spell Tower reconstruct through portable files and backward seeks. Versions 91 and
earlier retain their previous coverage.

## Version 93: native Rage rules

Rage now boosts healing and eligible defending combat units. Preferred-target characters use
the source secondary movement bonus; Heroes receive half of the normal movement and damage
bonus, and Guardians receive full strength. Independent source deadlines prevent a weaker
continuing aura from retaining an expired stronger boost, while permanent equipment boosts
preserve temporary spell bonuses. Each component still uses its strongest active value.
Real healing, Rage Gem and defensive Spell Tower recordings reproduce through portable files,
backward seeking and reduced-motion playback. Versions 92 and earlier retain their original
rules. See [the source and validation details](NATIVE-HEROES.md#version-93-rage-coverage-and-expiry).

## Version 94: per-target troop damage stages

Inferno Dragon and Super Miner now ramp damage against defending units as well as buildings.
Each new target starts at its source base damage, including in-range retargeting; pursuit
clears heat. Source attacks without projectiles resolve directly, and Inferno Dragon applies
its 0.6-second recovery after a target dies. Real recordings reach all stages and restart
against another target through portable files and backward seeks. Versions 93 and earlier
retain their old behavior. See [source and validation details](NATIVE-HEROES.md#version-94-increasing-troop-damage).

## Version 95: Phoenix Egg and temporary revival

Phoenix now waits behind its visible, untargetable Egg until its own Hero is knocked out
after automatic ability activation. It hatches once, launches the source 0.5-second
resurrection projectile and protects the revived Hero for 6/7/8 seconds, matching the bird's
6.5/7.5/8.5-second protection window from knockout. Temporary life cannot be healed and ends
at its deadline. Recall pauses the remaining revival time and does not grant another hatch.
The original Egg, bird and resurrection art, a local countdown bar, and actual Cannon/Recall
recordings reproduce through portable files and backward seeks. Versions 94 and earlier
retain their prior Phoenix behavior. Version 95 also excludes every pet, including the Egg,
from Clone without spending Clone housing; older versions preserve their previous selection.
See [source and validation details](NATIVE-HEROES.md#version-95-phoenix-egg-and-revival).

## Version 96: friendly participation and healing immunity

Waiting Phoenix actors, recalled/ejected allies and future spawns no longer influence
nearby-unit boosts or group following. Healer target selection, native healing chains,
shared recovery and Healer projectiles respect native healing immunity. Eligible nearby
troops still receive splash healing without restoring siege HP. Actual deployments record
Healer retargeting and Baby Dragon Tantrum before/after a Phoenix hatch through portable
files and backward seeks. Versions 95 and earlier keep their previous rules. See
[source and validation details](NATIVE-HEROES.md#version-96-friendly-participation-and-healing-immunity).

## Version 97: Mighty Yak Hero-death rage

A living Mighty Yak gains its source eight-second self-rage when its own Hero falls after
automatic ability activation: +70% damage and +2 tiles/second, with independent expiry under
stronger Rage. Recall does not trigger it, and later Revive/Recall/redeployment does not
grant another use. Real Cannon knockouts and boost expiry reproduce through portable
files and backward seeks. Versions 96 and earlier preserve their original Yak behavior.
See [source and validation details](NATIVE-HEROES.md#version-97-mighty-yak-hero-death-rage).

## Version 98: level-dependent Healer healing on Heroes

Healer pulses capture their caster's source Hero healing ratio: 55% at levels 1–4, rising
to 108% at level 11. The captured value survives caster death and combines once with outgoing
healing and stacking. Ordinary nearby troops retain full healing. Real Cannon wounds and
Hero recovery reproduce through portable files and backward seeks. Versions 97 and earlier
keep the fixed 55% and their original packet shape. See
[source and validation details](LATE-TROOPS.md#version-98-source-hero-healing-ratios).

## Version 99: Unicorn ownership and support

Unicorn prioritizes its own living Hero even when another ally is injured, and rebinds after
Revive or Recall. Its single-target pulse uses the shared healing curve and contributes
only to its recipient within 2.5 tiles. A surviving Unicorn keeps a battle open under the
normal deadline. Actual Cannon wounds to a different ally reproduce that priority with
ground and air Heroes through portable reverse seeks. Versions 98 and earlier keep their
original selection, allocation and completion rules. See
[source and validation details](NATIVE-HEROES.md#version-99-unicorn-ownership-and-support-rules).

## Version 100: native healing projectiles

Unicorn and Druid apply recovery on arrival of their source projectiles, at 12 tiles/second.
Druid selects each next injured ally at the preceding impact, within 4.5 tiles and up to
four distinct recipients. Pulses retain caster tier and outgoing healing after caster
death or transformation; an invalid recipient ends the chain. Original flight art and
captured friendly sound identity follow the same packets. See the
[source and adapter timing details](NATIVE-HEROES.md#version-100-native-healing-flights).
Versions 99 and earlier retain immediate native healing.

## Version 101: ground healer routes

Unicorn and Druid follow allies around buildings with the existing point-target
pathfinder, crossing walls with their source jumper property. Routes refresh for moving
recipients and clear immediately when the recipient changes or disappears. The shared
pathfinding budget also covers these searches. See the
[source and adapter details](NATIVE-HEROES.md#version-101-ground-healer-routes).
Versions 100 and earlier retain straight-line native healer following.

## Version 102: Sneezy modes and Boogers

Sneezy remains a zero-DPS spawner at its source five-tile standoff until its Hero falls,
then switches to its base short-range attack and once-per-raid source self-boost. Its
original Boogers now exist as spawned troops, with a two-living-unit limit, summon
wind-up, trap immunity and Castle-pull exclusion. Original character clips, body scale
and carried-roster asset/audio warming follow these states. See the
[source, source/wiki differences and adapter timing](NATIVE-HEROES.md#version-102-sneezy-modes-and-boogers).
Versions 101 and earlier retain their former Sneezy and missing-Booger behavior.

## Version 103: pet summon ownership after Recall

A recalled pet retains logical ownership of its living and queued summons when
redeployment creates a new unit body. Sneezy's earlier Boogers therefore continue
to occupy its two summon slots, and later replacements stay in the same family.
See the [Recall ownership details](NATIVE-HEROES.md#version-103-pet-summon-ownership-after-recall).
Versions 102 and earlier retain per-body ownership and its original summon counts.

## Version 104: Frosty Frostmites

Frosty summons its source Frostmites on the existing eight-second adapter schedule,
with per-level wave sizes and concurrent limits. Each wall-jumping Frostmite spends
itself on one native ballistic leap, applies primary-once area damage across both
defender layers, and chills affected targets for four seconds at 50%. Original art
and audio warm from the carried Frosty roster. See the
[source and adapter details](NATIVE-HEROES.md#version-104-frosty-frostmites).
Versions 103 and earlier retain their original missing summon lookup.

## Version 105: Yetimite and Firemite defender jumps

Yetimites and Firemites spend themselves on a delayed ballistic leap against defenders,
with primary-once splash on both layers. Their source Castle-pull immunity now applies.
All three mite jump families use the shared 0.01-second simulation floor. Version 104
retains its repeated Yetimite/Firemite melee attacks and 0.12-second Frostmite minimum.
Portable recordings cover natural parent spawns, original jump presentation and sound,
and the retained Firemite burn through reverse seeks. See the
[source and adapter details](NATIVE-HEROES.md#version-105-yetimite-and-firemite-defender-jumps).

## Version 106: activated defense preference

Native troops include activated Town Hall weapons and armed Builder's Huts in Defense
preferences, named-favorite fallback and defender priority. Preferred-target damage uses
the same class at projectile impact time, including Yetimite's combined defense/resource
modifier against an activated Town Hall. Sleeping or unarmed buildings remain outside the
class. Versions 105 and earlier retain their previous static checks. Real Earthquake and
Super Giant inputs cover this change through portable reverse seeks and historical playback.
See the [source and adapter details](NATIVE-HEROES.md#version-106-activated-defense-preference).

## Version 107: Electromite chain lightning

Super Yetis release matching-tier Electromites per 400 lost HP while alive, retaining
the existing total limit and releasing only the remainder on death.
Electromites cast once after their source acquisition delay, chaining up to three
ground/air targets with delayed, diminishing damage and a brief stun. Each building
receives the fourfold source bonus once. Their building preference and Castle-pull
immunity apply, and committed hops retain damage after the caster disappears. Original
lightning, impact and sound events follow captured endpoints and timestamps through
portable reverse seeks. Version 106 and earlier retain their previous direct hits and
missing chain/bonus/stun. See the
[source and adapter details](NATIVE-HEROES.md#version-107-electromite-chain-lightning).

## Version 108: Meteor Golem defender throws

Meteor Golems use original ballistic throws and split against defenders and blocking
Walls. The thrown half appears after its packet damage at the actual impact time;
splash hits both layers and applies Wall modifiers independently. Cloned halves keep
the parent's deadline and cannot merge. Captured packets reconstruct original art and
throw/impact sounds through reverse seeks. Version 107 retains its generic defender
shots, unsplit cloned building attackers and earlier short-flight/birth timing.
See the [source and adapter details](NATIVE-HEROES.md#version-108-meteor-golem-defender-throws).

## Version 109: Electro Dragon charge and mixed-target lightning

Electro Dragons charge their primary building or defender on an active action clock,
then chain across both defender layers and structures. Hops retain captured damage and
tier, prefer maximum health on distance ties and follow a surviving previous target.
Captured zaps reconstruct original lightning and sound through portable reverse seeks;
charge audio and body animation follow the paused charge clock. Pending hops delay raid
completion. Version 108 and earlier retain their previous immediate building hits and
generic defender shots. See the
[source and adapter details](NATIVE-HEROES.md#version-109-electro-dragon-charge-and-mixed-target-lightning).

## Version 110: Super Wizard Chain Magic

Super Wizards strike a building or defender directly, then branch from that primary to
up to nine eligible targets across both defender layers and structures. Every secondary
receives 40% of the captured damage after one 128-ms delay. Branches retain tier, damage
and endpoints through caster death; captured zaps reconstruct original art and audio
through portable reverse seeks. Pending branches delay raid completion. Version 109 and
earlier retain primary-only building hits and generic defender shots. See the
[source and adapter details](NATIVE-HEROES.md#version-110-super-wizard-chain-magic).

## Version 111: Super Archer piercing flight

Super Archer uses an original straight arrow against either primary target type, hitting
crossed buildings and ground/air defenders once at their entry times. It retains captured
damage and tier after the caster leaves and continues four source tiles beyond the aim
point. Crossings resolve in arrival order across arrows; captured records reconstruct
flight, particles and original firing sound through reverse seeks. Pending arrows delay
raid completion. Version 110 and earlier retain instant secondary building damage at
primary impact and generic defender arrows. See the
[source and adapter details](NATIVE-HEROES.md#version-111-super-archer-piercing-flight).

## Version 112: Overgrowth chain absorption and consistent geometry

Overgrown buildings consume secondary Electromite, Electro Dragon and Super Wizard
hops or branches without losing health. Direct acquisition still excludes roots, and
rooting a dragon's charging primary still cancels it. Shared chain distances and committed
dragon chase use consistent arithmetic; versions 111 and earlier retain their original
root exclusion and `Math.hypot` results. Actual Overgrowth inputs cover absorbed hits,
original lightning/audio and Node-to-Chromium states through reverse seeks. See the
[source and adapter details](NATIVE-HEROES.md#version-112-overgrowth-chain-absorption-and-consistent-geometry).

## Version 113: captured Overgrowth root presentation

Actual Overgrowth pulses capture root start/end cycles for original growing, deployed and
retracting art. Active recasts extend the current cycle; expired recasts start another.
Captured expiry cues and ten seconds of retained history reproduce the original retract
sound after direct or reverse seeks. Physical spell rules remain unchanged. Version 112
and earlier omit the new lifecycle records and retain the green status overlay. See the
[source and adapter details](NATIVE-HEROES.md#version-113-original-overgrowth-roots).

## Version 114: retained Overgrowth cast presentation

Original bottle, landing and level-specific field effects use a retained cast timeline.
The live and retained arrays share the same cast while it resolves, preserving its final
hit count after removal from the live spell array. The source landing starts at 0.8 seconds;
the existing physical root pulse remains at 1.5 seconds. Completed casts remain through
the field lifetime and ten-second audio horizon. Fresh forward/reverse seeks reconstruct
original cast cues without relying on the scene's event history or duplicating live cues.
Version 113 retains its original roots and live-only cast presentation; earlier versions
keep their existing fallbacks. See [source and adapter details](NATIVE-HEROES.md#version-114-original-overgrowth-cast-and-field).

## Version 115: retained original Freeze Spell casts

Actual Freeze casts retain their resolving cast object through the original bottle, frost
and glow lifetimes and the ten-second sound seek horizon. All eight level profiles use
source deployment art at 0.8 seconds while preserving the physical pulse at 1.5 seconds.
Fresh seeks beyond the one-pulse live record reconstruct original cast cues without
requiring scene history or duplicating live cues. Version 114 and earlier omit the new
capture flag and records and retain their former presentation. Overgrowth's version-114
cast timing and keys are preserved by the shared pure effect sampler. See
[source and adapter details](NATIVE-HEROES.md#version-115-original-freeze-spell-casts).

## Version 116: versioned source-spell cast history and original Jump

A versioned `nativeSpellArt` list identifies additional source spells whose cast objects
are retained in `nativeSpellCastHistory`; version 116 enables Jump. The shared live
object records completed pulses before the live spell array drops it. Records retire
ten seconds after the last scheduled pulse, preserving final source particles after
Jump's 20–100-second field. Earlier Overgrowth and Freeze histories remain unchanged.
Source landing still starts at 0.8 seconds; physical Jump pulses, wall crossing and
expiry retain their former rules. Version 115 and earlier omit the new capability list
and history and keep their generic Jump presentation. See
[source and adapter details](NATIVE-HEROES.md#version-116-original-jump-spell-fields).

## Version 117: original Rage and Haste fields

The source-spell presentation list adds Rage and Haste; version 116 remains Jump-only.
Both spells use the existing captured cast history, original source phase timing and
cue keys. Physical boosts, movement, damage, pulses and expiry remain unchanged.
The common finite-field presenter also preserves Jump while warming one request per
required pack. Rage's original upper effect reuses its existing native pack, and all
phase packs must be ready before replacing the generic fallback. Version 116 and earlier
retain their previous Rage/Haste presentation. See
[source and adapter details](NATIVE-HEROES.md#version-117-original-rage-and-haste-fields).

## Version 118: original Healing and Poison fields

The source-spell presentation list adds Healing and Poison, preserving version 117's
Jump/Rage/Haste capabilities. Their source cast phases use existing captured history,
finite emitter lifetimes and original cue keys. Healing's source field fades after its
last physical healing pulse; retaining the art does not extend healing. Poison uses
the pinned spell row's declared effect variants. Version 118 also enables `nativeSpellEffectTimelines`: static particle exports sample
their full animated descendant spans. Earlier records retain their prior sampler.
Healing, Poison damage/ramp, avoidance and on-hit poison remain physically unchanged. Version 117 and earlier keep their former
Healing/Poison presentation. See
[source and adapter details](NATIVE-HEROES.md#version-118-original-healing-and-poison-fields).

## Version 119: original Healing pulse graphics

`nativeSpellPulsePresentation` enables Healing's `Heal spell` graphics for each resolved
cast pulse. Positions reconstruct from the captured cast seed and the source two-tile
graphics-only radius; the five-tile healing area and health calculations stay unchanged.
Only the live particle tails are sampled, including the final tail after the live cast
ends. Version 118 retains its field-only geometry. See
[source and adapter details](NATIVE-HEROES.md#version-119-original-healing-pulse-graphics).

## Version 120: original Clone and Invisibility fields

The source-spell presentation list adds Clone and Invisibility. Captured cast history
reconstructs Clone's three phases and Invisibility's two declared phases, including
source particle tails after the live cast ends. Missing upper phases are omitted from
sampling and pack readiness. Version 119 and earlier retain their previous presentation.
Clone housing, copy deadlines, Invisibility targeting, projectile impacts and spell
expiry are physically unchanged. See
[source and adapter details](NATIVE-HEROES.md#version-120-original-clone-and-invisibility-fields).

## Version 121: original Recall cast effects

The source-spell presentation list adds Recall. Its single physical pulse still resolves
at 900 ms. Captured cast history retains the original bottle, shrinking circles, sparks
and cast audio after the live pulse record disappears. All seven levels use the pinned
source phase mapping. Version 120 retains its previous capabilities and presentation.
Recall housing, stored health, pet summon ownership, redeployment and committed
projectiles remain physically unchanged. See
[source and adapter details](NATIVE-HEROES.md#version-121-original-recall-cast-effects).

## Version 122: original unit Recall transitions

`nativeRecallPresentation` retains primary unit disappearance and redeployment events
in `nativeRecallEvents`, including their stable body keys, map positions and battle times.
Original waves, reverse circles, sparks and return audio reconstruct independently of
the live unit or the ended cast. Events retire after ten seconds. Version 121 retains
its cast-only presentation and requests neither the transition pack nor the new return
sample. Stored health, housing and pet/summon ownership remain physically unchanged.
See [source and adapter details](NATIVE-HEROES.md#version-122-original-unit-recall-transitions).

## Version 123: direct Hero Revive targeting

A Revive spell command may include `targetHero`, naming a friendly Hero in the recorded
roster (or the legacy King). The live model resolves that identity to the current body
and retains it through the cast delay; overlapping fallen Heroes no longer make a
direct control choose the lower-ID body. Ordinary map casts keep their nearest-target
selection and existing health-restoration timing. Earlier versions reject this new
action field, and the portable serializer retains it only for a valid Revive command.

`nativeReviveTargets` enables the original winged-heart indicator and direct controls.
Older playback keeps its prior presentation and never requests the indicator pack.
The new marker remains read-only during playback. See
[source and control details](NATIVE-HEROES.md#version-123-direct-hero-revive-targeting).

## Version 124: original Lightning cast and impact effects

The source-spell presentation list adds Lightning. All thirteen levels retain the
original falling bottle, deployment winds, three sky bolts and resolved impact through
captured cast history. Charging art begins at 800 ms; the single physical hit still
resolves at 900 ms. The original crater can remain visible until 7.401 seconds after
the cast without extending damage or stun. Original audio keeps its existing four cue
keys. Version 123 and earlier retain their previous presentation and never request
the new pack. See
[source and adapter details](NATIVE-HEROES.md#version-124-original-lightning-cast-and-impact-effects).

## Version 125: original Earthquake fields and persistent scars

The source-spell presentation list adds Earthquake. All eight levels reconstruct their
original bottle, level-specific rings, debris and long-lived ground scars from captured
cast history. Damage remains five pulses from 1.5 to 3.1 seconds. Source-derived
`retainSeconds` extends the Earthquake history bound to 303.3 seconds after casting,
covering its finite ground particles throughout a normal battle. Other captured spells
keep their former retirement rules. Version 124 and earlier request no Earthquake pack
and retain their previous presentation. See
[source and adapter details](NATIVE-HEROES.md#version-125-original-earthquake-fields-and-persistent-scars).

## Version 126: original Skeleton and Bat spell summon fields

The source-spell presentation list adds `Skeleton Spell` and `Bat Spell`. All eight
levels of each spell retain their original bottle, skull rays, rings and summon-field
edge/glow. Source-derived `retainSeconds` covers the full spawning window and its visual
tail, including fields that outlive the former ten-second history bound. Physical
summon counts, first groups, release times, shields, positions and combat remain
unchanged. Version 125 and earlier retain their former presentation and request neither
new pack. See
[source and adapter details](NATIVE-HEROES.md#version-126-original-skeleton-and-bat-spell-summon-fields).

## Version 127: original Totem and delayed Angry spell effects

The source-spell presentation list adds `Totem Spell` and `AngrySpell`. Totem retains
its original vial and impact effects at 800 ms; its chained summon still creates the
unit at 1.4 seconds. Source-verified `silentChildren` lets that effectless chained spell
share its parent's fallback handoff. Older recordings retain their previous feedback.

Angry's upper effect and original upper sound start 300 ms after deployment, at 1.1
seconds. Its long-lived source paint remains visible through captured history, with a
201.2-second conservative tail bound. The fifty physical pulses, friendly defense-target
preference and ability expiry remain unchanged. Version 126 and earlier keep their
former presentation and sound timing and request neither new pack. See
[source and adapter details](NATIVE-HEROES.md#version-127-original-totem-and-delayed-angry-spell-effects).

## Version 128: original Ice Block platform and melting sequence

The source-spell presentation list adds `Ice Block`. Its bottle, 800-ms impact,
100-ms-delayed platform and resolved end effect reconstruct from captured history.
The end effect begins after the single 1.5-second pulse; its own 6300-ms emitter delay
places the melt at 7.8 seconds. Source particle tails remain finite and independent of
the unchanged seven-second protection and defense freeze. Earlier recordings retain
their former presentation and request no new pack. See
[source and adapter details](NATIVE-HEROES.md#version-128-original-ice-block-platform-and-melting-sequence).

## Version 129: original Revive success presentation

The source-spell presentation list adds `Revive`. Its bottle stays at the cast point;
a successful restoration captures `revivePresentation` with the actual Hero ID,
position and scheduled pulse time. The original wings, ground symbol and activation
sound reconstruct from that result, including when an ordinary tile cast restores a
Hero elsewhere. Wasted or superseded casts emit no success feedback. Health restoration
and targeting remain unchanged. Version 128 keeps its former presentation and audio
clock and requests no new pack. See
[source and adapter details](NATIVE-HEROES.md#version-129-original-revive-success-presentation).

## Version 130: original Warden Fireball

Warden Fireball now launches the equipment level's original projectile and resolves its captured
area damage after the source 1.5-second flight. It selects a visible defense first, retains its
selected point if the target disappears, and hits buildings and both defender layers without
borrowing ordinary Warden attack bonuses. Its launch journal reconstructs the original flight,
explosion and activation audio through cold imports and backward seeks. Versions 129 and earlier
retain their previous activation behavior. See the [Fireball source and verification notes](../reference/fireball/README.md).

## Version 131: Queen Giant Arrow

The Queen now launches the equipped Giant Arrow along her copied target direction. Its captured
source damage reaches buildings and both defender layers at the ray's arrival times, with double
damage against Air Defenses. The projectile survives Recall or defeat and ends at the map boundary.
New recordings with this equipment resolve Giant Arrow and Super Archer contacts together in time
order. The source body and scaled trail reconstruct from captured state; older projectiles retain
their prior clocks. Versions 130 and earlier preserve their previous activation without this ray.
See the [source, collision adapter and construct limitation](../reference/giant-arrow/README.md).

## Version 132: Giant Arrow construct triggers

A live Giant Arrow now sustains a native Invisibility Spell Tower damage trigger after its Queen
has been recalled or defeated. Captured construct identity and the ray's map-exit deadline join
the existing attacker survival check at release. Expired arrows and immune contacts cannot keep
a tower trigger alive; Freeze may delay the weapon clock past the construct's expiry. Rage and
Poison proximity rules stay unchanged. Version 131 retains its former cancellation behavior.
See [source details and construct verification](../reference/giant-arrow/README.md).

## Version 133: Royal Champion Frost Flake

Frost Flake now launches four to seven distinct source projectiles and captures full freeze
durations at activation. Defenses take priority; remaining slots use visible ordinary buildings
or defending units. The source damage and freeze survive Recall or defeat, and expiry follows
the scheduled impact. Captured activations and last flight points reconstruct the original art
and audio after portable seeks. Version 132 and earlier keep their previous activation.
See [source mapping, flight conventions and verification](../reference/frost-flake/README.md).

## Version 134: Barbarian King Spiky Ball

Spiky Ball captures its source damage and distinct visited objects across two to eight contacts.
Each ricochet launches at the previous scheduled impact, with short contacts resolved in arrival
order within the fixed sample. The ball survives Recall or defeat, with original body, trail,
contact effects and audio reconstructed from its captured legs. Version 133 and earlier keep
their previous activation and projectile queue behavior. See [source rules and flight conventions](../reference/spiky-ball/README.md).

## Version 135: Minion Prince Dark Orb

Dark Orb captures its five-tile corridor, source damage and partial frost across both defender
layers. Its 1.25-second maximum lifetime bounds the path; damage, contact points and slowing
survive Recall or defeat. All enabled hero corridors share Super Archer arrival ordering. The
original masked crystal, portal, contacts and final impact reconstruct from battle time. Version
134 and earlier keep their previous activation. See [source rules, mask validation and aiming conventions](../reference/dark-orb/README.md).

## Version 136: Royal Champion Seeking Shield

Seeking Shield captures four distinct contacts at 1,000–2,500 damage. Manual activation uses the
source 933 ms windup and 1.2-second ordinary attack pause; knockout activation releases immediately.
Defenses take priority, with other buildings and both defender layers available afterward. Pending
throws and later bounces survive Recall or defeat. Original spinning body, shadow, glow trail and
final destroyed effect/audio reconstruct from captured state. Version 135 and earlier retain their
previous activation. See [source timing, targeting and flight conventions](../reference/seeking-shield/README.md).

## Version 137: Moving equipment flight history

Frost Flake, Spiky Ball and Seeking Shield now retain timestamped aims for defending-unit targets.
Original trail particles sample the aim at their birth time, so playing every frame, skipping
rendered frames and seeking directly produce the same positions. Stationary samples prevent a
later movement from changing an earlier interval; final samples use the scheduled impact time.
Building-targeted shots allocate no extra history. Damage, deadlines, target selection and RNG
remain unchanged, verified against version 136. Older recordings keep their previous endpoint-only
presentation. See [capture and rendering details](NATIVE-HEROES.md#version-137-moving-equipment-flight-history).

## Version 138: Passive hero auras after resurrection

Revive and Phoenix now restart Electro Boots, Rage Gem and Life Gem auras on their revived owner.
Only passive-aura guards reset; spent active abilities, finite-hit charges and other equipment
state remain. Superseded fields cannot replay missed pulses across the knockout. The resumed
field uses the canonical resurrection time for that body; a subsequent Recall redeployment uses
its own deployment clock. Version 137 and earlier retain their previous aura loss after revival.
See [lifecycle rules and source evidence](../reference/hero-aura-revival/README.md).

## Version 139: Hero self-regeneration clocks

Giant Gauntlet, Healer Puppet, Action Figure, Electro Boots and Fire Heart no longer bank healing
while their owner is dead or held in Recall. A restored or redeployed body starts a fresh source
interval; uninterrupted elapsed samples resolve every due pulse at its scheduled time. Full-health
and healing-ineligible pulses are consumed without becoming future credit. Phoenix temporary life
remains unhealable. Version 138 and earlier retain their prior catch-up behavior. See [source rates,
phase conventions and validation](../reference/hero-regeneration/README.md).

## Version 140: Original Electro Boots activation

Electro Boots retains a stationary passive activation at initial deployment, Recall redeployment
and successful aura resurrection. Original source art and sound reconstruct from the captured
origin and canonical time without following later movement. The source camera impulse runs only
in live battles and respects reduced motion. Ready art and decoded audio independently replace
generated deployment sparks and tone; unavailable assets retain fallback and retry while paused.
Combat, RNG, item values and manual ability use remain identical to version 139. Older recordings
retain their previous presentation. See [source rows and lifecycle conventions](../reference/electro-boots/README.md).

## Version 141: Meteor Staff target selection

Meteor Staff now selects a targetable defense, then falls back to the nearest ordinary building
when no targetable defense remains. Invisibility, Overgrowth and unrevealed Teslas prevent
selection; Walls and traps are excluded. Activated Town Hall and Builder weapons use the shared
defense classification. The existing source cooldown, fixed cast position, 1.1-second damage
delay and two-tile area damage remain. Version 140 and earlier retain the previous selector.
See [source evidence, geometry and validation](../reference/meteor-staff/README.md).

## Finishing source spell effects

Original spell fields use the shared two-second presentation grace after a live battle ends,
so a winning Lightning pulse retains its bolt, impact and crater while combat remains frozen.
Presentation can continue already started phases; it cannot start unresolved phases after an
early End Battle. One cleanup frame runs when grace expires before unchanged frames can be
skipped again. Cold seeks to a finished recording stay settled, and reduced motion remains
respected. Combat version 141 and portable simulation state are unchanged. See [lifecycle and
validation details](../reference/field-spells/README.md).

## Version 142: Original Meteor Staff presentation

The Prince's periodic cast now retains its attached aura origin and the source fall, impact and
spawned crater. Its aura follows the displayed owner and preserves the last attached point
through Recall. The falling meteor and impact stay at the captured spell target. Original fall
and impact audio, source camera feedback and finite art reconstruct through portable seeks.
The visual impact begins at 800 ms, before the unchanged 1.1-second damage pulse. Version 141
retains its prior presentation and source-sample silence. See [original phases, parent handling
and validation](../reference/meteor-staff/README.md#version-142-original-presentation).

## Version 143: Garrison protection and individual Revenge Deck counters

Released Clan Castle damage observes the shared attacker shields, invulnerability and temporary
HP rules. Its original damage values and canonical event clocks are retained. Revenge Deck
consumes direct-hit records with independent attacker cooldowns, original counter cards and
distinct simultaneous projectile IDs. Secondary damage cannot reuse a stale attacker. Earlier
versions retain raw garrison damage and the shared counter cooldown. See the [garrison protection
reference](../reference/garrison/README.md#shared-attacker-protection-recording-version-143)
and [Revenge Deck reference](../reference/revenge-deck/README.md).

## Version 144: Snake Bracelet progress through Recall

A recalled King's accumulated Snake Bracelet damage travels with his returning Hero card.
Redeployment restores the total before passive upkeep, preserving partial progress toward the
next 300-damage summon and the per-battle source cap. Earlier versions retain their previous
body-local damage reset. Unrelated Heroes receive no new Recall state. See the [Snake Bracelet
reference](../reference/snake-bracelet/README.md).

## Version 145: Normal and Super Yeti stock through Recall

Each recalled normal or Super Yeti retains damage progress and the number of mites already
released. Separate queues follow the matching troop health queues, preserving individual stock
when multiple units are recalled or the two troop types are redeployed in a different order.
Damage after return completes partial thresholds, and death releases only the remaining stock.
Version 144 and earlier retain their previous body-local reset. See the [Yeti Recall
reference](../reference/yeti-recall/README.md).

## Version 146: Original later-garrison primary audio

Later Clan Castle and Ghost Trap defenders play source-bound deployment, primary attack,
successful impact and death cues. Electro Dragon chains retain separate source cues at each
resolved jump. The reserve and its possible children preload through the shared sample loader;
untriggered Ghost Traps warm Royal Ghost's new files. Dragon/Balloon's audio path and all combat
physics are retained. Older versions keep their former silence for these later defenders.
See the [garrison audio reference](../reference/garrison/README.md#original-later-defender-primary-audio-recording-version-146).

## Version 147: Shared damage protection for trap-born Ghosts

Ghost Trap layouts enable the existing shared garrison damage handler even when no Clan Castle
is present. Royal Ghost attacks therefore obey shields, invulnerability and temporary HP, and
actual HP damage advances equipment such as Snake Bracelet. Castle setups retain their existing
version-143 boundary; trap-only recordings through version 146 keep raw damage. See the
[trap-born damage reference](../reference/garrison/README.md#trap-born-damage-protection-recording-version-147).

## Version 148: Witch summon ownership through Recall

Returning Witch and Super Witch bodies retain their original summon owner, total released
count and next summon deadline. Existing children therefore continue to occupy that caster's
source limit, including the single Big Boy limit. Overdue deadlines resume at redeployment
without banking historical summons. Separate per-kind queues follow the matching recalled
health queues. Versions 147 and earlier keep their former ownership/cooldown reset.
See the [Witch Recall reference](../reference/witch-recall/README.md).

## Version 149: deployment-relative troop lifecycles

Furnace, Siege Barracks and Druid now record their actual deployment instant. Their existing
health-decay, child-release and evolution controllers age from that body's birth. Delayed
bunkers no longer lose health or emit backdated troops immediately, and a Druid keeps its
full 30-second healer phase even when deployed after battle time 30. Source stats and the
existing release-spacing interpretation are retained. Versions 148 and earlier preserve the
old battle-zero origin. Only rosters carrying these three kinds enable the adapter. See the
[source values and timing limits](../reference/deployment-lifecycle/README.md).

## Version 150: Furnace spends life-aura health on fixed degeneration

Active Life Gem and Apprentice Warden bonus health now extends Furnace's life at its existing
base degeneration rate. The controller spends the existing strongest-source temporary-health
pool before base HP, without refilling consumed health or adding Firemites beyond its source
stock. This does not create enemy-hit journals or change Siege Barracks decay. Only Furnace
rosters with a carried source of bonus health enable the adapter; versions 149 and earlier
retain their former lifetime. See the [source values and lifetime checks](../reference/furnace-life-aura/README.md).

## Version 151: stable Furnace release geometry

Furnace's 22 finite release directions now use pinned binary64 values instead of host
sine/cosine. This retains the existing Node calculation, radius, schedule, source stock and
collision rules while removing a confirmed Chromium/Node position difference. Only carried
Furnace rosters enable the adapter. Versions 150 and earlier retain their original host math.
Current portable tests compare complete battles across runtimes; historical tests retain
complete snapshots within each runtime. The six-direction layout remains a local interpretation,
not a native-client angle claim. See the [reproducer and numeric scope](../reference/furnace-spawn-geometry/README.md).

## Version 152: defending PEKKA and Valkyrie split timing

Defending PEKKA 8 and Valkyrie 7 now use the existing source-derived split timer: 300 ms
post-hit recovery, a 1500 ms windup, and the native new-target charge. Their fresh first-hit
waits become 1.5 s and 0.3 s, respectively; the same-target period remains 1.8 s. A target
switch spends each recovery tick once. The split controller's half-tile character tolerance
and committed chase also apply, while Valkyrie's damage still requires her self-centered
splash to reach its target. Freeze pauses the clock. Only rosters carrying these two garrison
kinds enable the adapter; versions 151 and earlier keep their previous timing. See the
[source derivation and validation](../reference/garrison/README.md#melee-split-timing-recording-version-152).

## Version 153: one recovery advance when later defenders retarget

Later split-timer defenders now spend each poison/frost-scaled recovery tick once when
acquiring a fresh target. The former path could release the next attack one 50 ms update
early by subtracting recovery before resetting and advancing the new-target clock. First
engagements and same-target periods retain their prior timing. Source projectiles can still
kill after recovery ends, in which case this correction changes no release. Only carried
split families with positive recovery enable the adapter; versions 152 and earlier retain
the historical accounting. The version-152 PEKKA/Valkyrie correction remains in effect.
See the [source clocks and actual target-loss checks](../reference/garrison/README.md#split-family-recovery-on-retargeting-recording-version-153).

## Version 154: original defending Electro Dragon charge audio

Defending Electro Dragons now bind their source `PreAttackEffect` to a captured active-time
charge clock. The existing original sample is warmed from the reserve, begins with the
windup, suspends through Freeze and resumes at its saved audio age. Release, death or target
loss retires the charge cue. Poison/frost retain their existing combat clocks while the
sample uses active wall time, matching the attacking Electro Dragon audio convention.
Only Electro Dragon garrisons enable the adapter. Versions 153 and earlier retain their
previous charge silence; physical combat remains exact after removing audio-only metadata.
See the [source sample and playback validation](../reference/garrison/README.md#electro-dragon-charge-audio-recording-version-154).

## Version 155: original Bowler windup takes and natural tails

Defending Bowlers now use their source `trollAttack` takes during windup. Fresh targets preload
the source's 1.1 s initial charge into the sample age; repeat windups start at zero. Completed
throws keep their one-shot tails after release, with at most 16 captured starts per defender.
Freeze holds active charge age while already released sounds retain their own clock. Two
unchanged, hash-pinned Oggs add 28,126 bytes. Only Bowler garrisons enable the binding, including
in mixed rosters; versions 154 and earlier keep their former silence. Physical combat remains
exact after removing sound metadata. See the [source fields and alignment limits](../reference/garrison/README.md#bowler-windup-audio-recording-version-155).

## Version 156: attacking Bowler charges on engagement

Attacking Bowler now uses source-derived windup/recovery phases rather than treating the raw
new-target field as a delay from target acquisition. Fresh in-range targets take 0.4 s;
same-target periods stay 2.2 s. Freeze holds both phases, attack-speed modifiers scale them,
and retargeting spends recovery once. The original pose aligns its ActionFrame to release.
Existing release handlers remain in effect, including the legacy defender-targeted path.
Only carried Bowler armies enable the controller; versions 155 and earlier retain the old
acquisition-time behavior. See the [source clocks and scope](../reference/attacking-bowler/README.md).

## Version 157: native Bowler boulders against defenders and fixed bounce landings

Attacking Bowler now releases the pinned native boulder against defending troops. It tracks
the first target at 4.75 tiles/s and applies the source 0.3-tile ground splash once. The second
landing extends the captured launch aim by four tiles, remains fixed, and uses that same
source radius; it cannot home onto a nearby building or an attacker with an overlapping ID.
Exact impact clocks exclude defenders born later in the update frame, and released shots
continue after their thrower falls. Only Bowler armies enable these rules; versions 156 and
earlier retain their prior projectile paths. See the [source geometry and verification](../reference/attacking-bowler/README.md#native-defender-boulders-and-fixed-landings-recording-version-157).


## Version 158: original attacking Bowler bounce and shatter audio

Resolved attacking boulders retain their exact impact times, source levels and leg identities
for ten battle seconds. Their first contact plays the source bounce cue and their final
landing the source destroyed cue, including after the thrower dies and after replay seeks.
Decoded samples replace generated impact tones. Only carried Bowler armies enable the adapter;
version 157 and earlier preserve their former cues and preload list. This adds one unchanged,
hash-pinned 17,176-byte Ogg; the final shatter sample was already shipped for Seeking Shield.
Physical combat is unchanged. See the [source bindings and validation](../reference/attacking-bowler/README.md#original-boulder-impact-audio-recording-version-158).


## Version 159: original attacking Bowler throw windups and tails

Attacking Bowler now binds its source `PreAttackEffect=trollAttack` to a separate active-wall-time
clock. Fresh targets use the existing source-derived 1.1 s initial charge; repeat windups start
at zero after recovery. Freeze/stun suspends the active cue and holds its age, including partial
thaws. Released takes keep their natural tails in a bounded 16-start history; target loss and
death cancel unfinished cues. Stable keys and ages reconstruct playback after seeks. Only
carried Bowler armies enable this binding; version 158 and earlier keep their prior player
throw silence and preloads, with existing garrison audio independent. No new asset is needed.
Physical combat remains exact after removing the audio-only capability and nested metadata.
See the [source alignment and limitations](../reference/attacking-bowler/README.md#original-attacking-throw-audio-recording-version-159).


## Version 160: original defending Bowler bounce and shatter audio

Defending Bowler now plays its projectile's source bounce and destroyed cues at the existing
captured first-impact and second-landing times. Ground contacts still sound when the primary
target has fallen; released boulders and their tails continue through Freeze or the thrower's
death. The two existing source Oggs are warmed from enabled Bowler reserves. Only Bowler
garrisons enable the capability; version 159 and earlier retain their former impact silence
and preloads. No new files or physical state are required beyond the capability flag. See
[the source links and actual-input checks](../reference/garrison/README.md#bowler-bounce-and-shatter-audio-recording-version-160).


## Version 161: original Bowler impact phases and retained flight art

Attacking boulders no longer draw a destroyed burst at their first bounce. Their source bounce
effect has sound only; the original shatter belongs to the final landing. Recent attacker flight
packets retain tracked coordinates so original flight tails and final effects reconstruct after
seeks and during the existing finish presentation window. Defending Bowlers draw the original
final shatter from their existing landing records, including after Freeze/death. Indexed final
effects keep their fallback until the original graph is ready; reduced motion keeps its existing
fallback. Only carried attacking/defending Bowlers enable this boundary. Versions 160 and earlier
retain their historical visual paths. Damage, timing and impact audio remain exact after removing
the new capability and flight history. No new art file is added. See [attacking impact art](../reference/attacking-bowler/README.md#original-impact-phases-and-retained-flight-art-recording-version-161)
and [defending final particles](../reference/garrison/README.md#original-bowler-final-shatter-recording-version-161).


## Version 162: attacking Golem family windup and recovery

Attacking Golem and Golemite now spend the source-derived 1.5 s fresh-target windup after
reaching range. Their periods remain 2.4 and 3 s, with 0.9 and 1.5 s recovery; active ticks
spend recovery once and preserve overshoot rather than slipping one 50 ms update late.
Freeze/stun holds the phases; attack-speed modifiers scale both. Building preference,
defender pursuit and blocking-wall attacks share the same release clock. Original action
frames align to the captured windup/follow-through offset. Only carried Golem armies enable
the family, including their naturally spawned Golemites. Version 161 and earlier retain
immediate first hits and their historical cadence. The shared controller preserves Bowler's
existing state shape, timing and audio. See the [source interpretation and actual-input checks](../reference/attacking-golem/README.md).


## Version 163: native Bowler pursuit-wall attacks

Walls encountered while pursuing a defending troop now enter Bowler's native windup and
release the original boulder. Previously that route could reset cooldown and fire a generic
arrow every 50 ms. The committed wall stays selected while the defender is out of reach;
an enemy entering range can interrupt it and starts a fresh defender windup. Visual aim
follows the selected wall. Normal 2.2 s cadence, source splash/bounces and original throw
cues now cover this route. Only carried Bowler armies enable the correction. Version 162
and earlier retain their historical arrow burst exactly. No stat or asset file changes.
See the [actual Castle replay and timing proof](../reference/attacking-bowler/README.md#defender-pursuit-wall-attacks-recording-version-163).


## Version 164: attacking P.E.K.K.A windup and recovery

All thirteen attacking P.E.K.K.A levels now spend a full 1.5 s fresh windup after reaching
range, followed by 0.3 s recovery and the existing 1.8 s period. Their legacy movement and
target-selection route prepares the shared controller for buildings, blocking walls and
eligible defenders. Freeze holds both phases, attack-speed modifiers scale both, and a
retarget spends remaining recovery once. Original action frames follow the captured
windup/follow-through offset. Initial armies carrying P.E.K.K.A or Siege Barracks enable
the change, covering naturally released P.E.K.K.As. Versions 163 and earlier preserve
immediate first hits and historical states. No source stats or assets change. See the
[source interpretation and actual-input checks](../reference/attacking-pekka/README.md).


## Version 165: attacking Valkyrie family swings

Valkyrie and Super Valkyrie now begin their source-derived fresh windups on engagement:
0.3 and 0.6 s, with 1.8 and 1.1 s repeat periods. Valkyrie has 0.3 s recovery;
Super Valkyrie has none. Freeze holds both phases, attack-speed modifiers scale both,
and a retarget spends remaining recovery once before the new target charge. Building,
blocking-wall and defender routes use the same split controller and original action-frame
offsets. Defender-targeted releases now share the source one-tile, ground-only sweep
around the attacker, hitting nearby buildings and defenders once without an additional
primary hit. Initial armies carrying either variant enable this boundary. Versions 164
and earlier retain their acquisition-based building delay, immediate defender attacks
and primary-only defender damage. Each new sweep identifies one original melee swing and
impact cue without an extra visual/damage hit. No source stat or asset changes. See the
[source interpretation and actual-input checks](../reference/attacking-valkyrie/README.md).


## Version 166: attacking Witch family windup and native projectiles

Witch and Super Witch now start a full source-derived 0.7 s windup on engagement, with no
recovery and their existing 0.7 s repeat period. Freeze holds the charge and attack-speed
modifiers scale it. Building, blocking-wall and eligible defender attacks share the same
controller while retaining original actor/action-frame offsets. Witch's ground and air
target capability is preserved; older ground-only families keep their target traits.
Defender release replaces the generic arrow with the original Witch projectile, source
flight speed and a fixed launch aim. One 0.3-tile blast resolves on the selected layer,
without an extra direct hit; air blasts leave buildings and ground defenders untouched. Summon stock, ownership, deadlines and Recall behavior remain in the lifecycle path.
Only carried Witch/Super Witch armies enable this boundary. Versions 165 and earlier keep
immediate first projectiles, defender arrows/homing and historical states. No source stats or assets change. See the
[source interpretation and actual-input checks](../reference/attacking-witch/README.md).


## Version 167: retained Witch flight art after replay seeks

Witch and Super Witch flights now retain immutable presentation packets for three seconds
after landing, matching the renderer's existing retention window. A cold replay seek after
physical impact can reconstruct the remaining original `witch_trail_emitter` particles from
those packets, including after the caster falls. Previously the tail appeared only if that
renderer had seen the projectile in flight. Both paths use the same shipped emitter and
meshes; reduced motion keeps its existing behavior. Only carried Witch families enable this
boundary. Version 166 and earlier retain their historical cold-seek omission. Damage,
projectile timing, targeting and audio remain exact after removing the new presentation
fields. No new art or sound asset is added. See the [source tail and cold-seek proof](../reference/attacking-witch/README.md#retained-flight-art-recording-version-167).


## Version 168: original Witch launch and impact audio after seeks

Witch/Super Witch launches and resolved impacts now keep a bounded physical-event journal.
Replay seeks reconstruct the existing original attack/hit samples, their source alternative
rows and pitches, and natural one-shot offsets independently of caster visibility or death.
The impact timestamp is captured only on actual resolution; ending a battle mid-flight
never invents a landing sound. Released tails continue through caster Freeze. The transient
live path yields to these captured cues to avoid duplicates. Only carried Witch families
enable this boundary. Earlier versions retain their live-only event path. Damage, targeting,
projectile flight and trail art remain exact after removing the new audio fields. No new
sound file is added. See the [source bindings and decoded playback proof](../reference/attacking-witch/README.md#original-launch-and-impact-audio-after-seeks-recording-version-168).


## Version 169: Hound parent attack phases and Lava projectile

Lava Hound and Ice Hound now spend a full 1.5 s first windup after engagement, then
0.5 s recovery within their source 2 s period. Freeze holds both phases, modifiers scale
both, and a retarget spends recovery once. Lava Hound releases the original `hound_projectile`
at 2 tiles/s despite its short attack range; the previous native strike treated it as an
immediate direct hit. Ice Hound retains its direct source two-second, 50% chill. Parent
building preference and ground-only targeting stay in place; Pup attacks and death releases
keep their existing behavior. Original actor action frames follow the captured phase.
Only carried Hound parents enable this boundary. Versions 168 and earlier retain their
historical first hits, direct Lava damage and states. No source stat or asset changes.
See the [source distinctions and actual Air Defense recordings](../reference/attacking-hound/README.md).


## Version 170: portable seeded Hound death positions

Lava Hound and Ice Hound death releases now calculate direction with quarter-turn reduction
and fixed binary64 Horner operations, avoiding host sine/cosine differences in replay state.
The existing seeded turn, radial sample, source distance, finite stock and child attributes
are preserved. Coordinates can differ from the former local path at rounding scale.
Only carried Hound parents enable the new calculation; older versions keep their exact
host-math path. Real Monolith wave recordings compare complete Node/Chromium states in
current playback; historical browser checks remain within one engine. No stats, attack
rule or asset changes. See the [randomized-rule evidence and portability checks](../reference/attacking-hound/README.md#seeded-death-position-portability-recording-version-170).

## Version 171: Giant family attack phases

Giant and Super Giant start a 1.5 s windup after reaching their target and retain
0.5 s recovery within their source two-second period. Freeze/stun hold both phases,
attack-speed modifiers scale both, and retargeting spends remaining recovery once.
Building, wall and ground-defender attacks share the timer; original poses follow
its action-frame offset. Defense preference and Super Giant's Wall multiplier stay
in place. Only carried Giant family armies enable the change. Versions 170 and
earlier retain their immediate first hits, with no save or asset changes. See the
[source distinctions and actual deployment recordings](../reference/attacking-giant/README.md).

## Version 172: Ice Golem melee phases and frost

Ice Golem starts a 1.5 s windup after engagement and retains 0.5 s recovery within
its two-second source period. Building, wall and ground-defender hits share the
clock. Actual defender contacts now apply the source two-second, 50% frost through
the existing partial-frost status system and original blue tint. Source damage,
building frost and death spells retain their existing rules. Only carried Ice
Golem armies enable this change; versions 171 and earlier preserve their immediate
first hits and previous absence of melee defender frost. No save or asset changes.
See [source evidence and actual Cannon/Clan Castle recordings](../reference/attacking-ice-golem/README.md).

## Version 173: Root Rider attack phases

Root Rider starts a 1.5 s windup on engagement and retains 0.7 s recovery within
her source 2.2 s period. Direct building and ground-defender attacks share the
clock; Freeze/stun, attack-speed changes and retarget recovery use the established
split controller. Original poses follow the captured action-frame offset. Her
independent wall aura retains its existing 4,000-damage, 400 ms pulses and wall
crossing rules. Only carried Root Rider armies enable the new attack clock;
versions 172 and earlier retain their immediate first hits. No source stats,
assets or save format change. See [source distinctions and actual recordings](../reference/attacking-root-rider/README.md).

## Version 174: Electro Titan direct attack phases

Electro Titan starts a full 1.5 s whip windup after engagement and repeats at the
same source period. Buildings, blocking walls and ground/air defenders share the
direct release clock; Freeze/stun and attack-speed changes use the established
split controller. Her electric aura keeps its independent 400 ms pulses, source
damage and Wall immunity while a whip charges or Freeze holds it. Original poses
follow the captured action offset. Only carried Electro Titan armies enable the
change; versions 173 and earlier retain their immediate first hits. No source
stat, asset or save changes. See [source distinctions and actual Cannon/Golem/Dragon recordings](../reference/attacking-electro-titan/README.md).

## Version 175: Yeti family claw windups

Yeti and Super Yeti charge for one second after reaching a building, wall or
ground defender, then repeat at their source one-second period. Freeze/stun and
attack-speed changes use the shared charge clock, and original poses follow its
action offset. Recall can cancel a pending first claw; the returning body starts
its own full windup while retaining the existing incoming-damage and mite-stock
queues. Death still releases the finite remainder. Only carried Yeti family
armies enable the change; versions 174 and earlier retain their immediate first
hits. No source stats, assets, save format or mite rules change. See
[source distinctions and actual fight/Recall recordings](../reference/attacking-yeti/README.md).

## Version 176: Super Hog Rider defeat split

A defeated Super Hog Rider now releases its source-level Hog immediately and
throws the Rider in the original 1.3 s flight before landing a second body.
The linked arrival happens once and keeps combat open if the Hog dies with no
reserve army. Cloned children retain the parent's expiry; Spring ejection
suppresses both halves. Only carried Super Hog Rider armies enable the split.
Versions 175 and earlier retain their previous absence of both children. No
source stats, assets, save format or attack clocks change. See the
[source evidence, geometry limits and Monolith recordings](../reference/attacking-super-hog/README.md).

## Version 177: Hog family melee windups

Hog Rider, Super Hog Rider and both split bodies charge for one second after
reaching a building, blocking wall or ground defender, then repeat at the same
source period. Freeze/stun and attack-speed changes use the shared action clock;
original poses follow each body's action frame. Wall jumping, defense preference,
the Rider's doubled Wall damage and the version-176 defeat flight stay in place.
Carried Hog family armies or a Champion's Hog Rider Puppet enable the clock,
including armies with no Hogs. Puppet summons retain their fixed equipment tier
and 250 ms wave spacing; their body art warms before activation. Versions 176 and
earlier retain immediate first hits. No source stats, assets, audio or save format
change. See [source distinctions and actual Cannon/Monolith/Puppet recordings](../reference/attacking-hog/README.md).

## Version 178: surfaced Miner melee phases

Ordinary Miners surface for a 1.5 s windup and retain 0.2 s recovery within their
source 1.7 s period. Buildings and ground defenders share the timer. Exposed
Miners can take damage and trigger traps during a charge; underground travel
retains its existing protections and Wall crossing. A fleeing defender cancels
the old charge before reburrowing, and the next emergence starts a fresh one.
Freeze/stun, attack-speed changes and original poses follow the shared phase
controller. Only carried ordinary Miners enable this change; versions 177 and
earlier retain immediate first hits. Super Miner's damage-ramp ticks, Diggy and
Battle Drill remain unchanged. No source stats, assets, audio or save format
change. See [source distinctions and actual Cannon/Castle recordings](../reference/attacking-miner/README.md).

## Version 179: separate Recall reserves for Super Hog halves

Recall can return the non-clone Super Hog and Super Rider, charging five housing
per body. Separate cards preserve their health and level for redeployment in the
same attack. Returned units start fresh melee clocks and do not charge deployment
housing again. The battle stays open while a returned reserve is available;
recalling the Hog during its sibling's flight does not cancel that arrival.
Only Super Hog Rider armies carrying Recall enable this change. Versions 178 and
earlier retain their exclusion of split bodies. The new `recalled-troop` input
supports portable reconstruction while the file envelope and village save
format stay unchanged. See [source rules, card behavior and live pointer recordings](../reference/super-hog-recall/README.md).

## Version 180: Apprentice Warden charge and native defender shots

Apprentice Warden begins a full source-derived 0.9 s attack charge at engagement,
then repeats at the existing 0.9 s period. Ground and air defenders receive the
original level-specific native projectile after release, with damage at flight
impact. Freeze/stun and attack-speed changes govern the charge; native poses use
its captured action offset. Wall jumping, group targeting and the independent
300 ms health aura keep their existing rules. Only carried Apprentice Wardens
enable the change. Versions 179 and earlier retain their previous first-hit and
defender-shot behavior. See [source limits and portable recordings](../reference/attacking-apprentice/README.md).

## Version 181: Headhunter card charges

Headhunter starts a source-derived 0.6 s charge after reaching a building or
ground/air defender and repeats at the existing 0.6 s period. Hero preference
continues during charges: a newly available Hero interrupts an ordinary target,
while a committed valid Hero stays selected. Native cards retain fourfold direct
Hero damage, normal troop/Guardian damage, 14-tile/s flight and impact-triggered
poison. Freeze/stun, speed modifiers and original poses use the shared clock.
Only carried Headhunters enable the change; versions 180 and earlier retain
their previous first-release timing. See [source limits and actual Hero/Castle recordings](../reference/attacking-headhunter/README.md).

## Version 182: Siege Barracks fixed bunker roster

Siege Barracks reads `BunkerTroops` as the fixed source array `[PEKKA, Wizard]`,
independently of level. Levels 2–6 now release their P.E.K.K.As in the first wave
instead of inheriting Wizard as the primary kind. Per-level stock, own Laboratory
tiers, lifetime, release deadlines and loss of unspawned troops on early defeat
retain their rules. Only carried Siege Barracks enable the decoder. Versions
181 and earlier preserve their old primary types. Scouting also warms both
required child tiers, shots and samples. See [source array evidence and full-stock recordings](../reference/deployment-lifecycle/README.md#version-182-fixed-siege-barracks-roster).

## Version 183: Thrower override phases

Thrower honors `CoolDownOverride=1250` within its 2.5 s source period: a fresh
1.25 s charge followed by 1.25 s recovery. Buildings, blocking Walls and
ground/air defenders share the clock. Native level-specific projectiles travel
at seven tiles per second and deal single-target damage at impact. Freeze/stun,
speed changes, sub-step remainder and original poses follow the phase controller.
Only carried Throwers enable the change; versions 182 and earlier retain their
previous first release and defender-shot behavior. See [source override and actual Cannon/Castle recordings](../reference/attacking-thrower/README.md).


## Version 184: Dragon Rider flying charges

Dragon Rider spends a full source-derived 1.2 s charge at engagement and repeats
at that period with no separate recovery. Native projectiles retain their flying
origin, travel at 9.6 tiles per second, and strike eligible ground or air defenders
at impact. Defense preference, committed building targets, Wall crossing and the
independent delayed ground crash blast keep their existing rules. Freeze/stun,
attack-speed changes and original poses follow the shared phase controller.
Only carried Dragon Riders enable the change; versions 183 and earlier retain
their previous first-release timing and defender shots. See [source limits and actual Air Defense/Castle/Monolith recordings](../reference/attacking-dragon-rider/README.md).


## Version 185: Rocket Balloon source phases and defender blast

Rocket Balloon charges for 0.75 s on a fresh engagement, then repeats its source
three-second cycle with 1.5 s recovery. New targets consume remaining recovery
once before a fresh charge. Buildings and eligible ground defenders use the same
blast centered on the Balloon, with the existing 1.2-tile footprint splash.
Freeze/stun hold the phases; attack-speed changes and original poses follow them.
Defense preference, Wall crossing, four-second deployment boosters and the
independent delayed death blast retain their rules. Only carried Rocket Balloons
enable the change; versions 184 and earlier keep their previous timing and
defender bombs. See [source limits and actual Cannon/Castle/Ice Block/Monolith recordings](../reference/attacking-rocket-balloon/README.md).


## Version 186: Baby Dragon phases and Tantrum rate

Baby Dragon starts a full one-second source charge, with no separate recovery.
Tantrum applies its source 50% attack-rate increase to active action time, giving
a two-thirds-second fresh and repeat charge while alone. Ally arrivals and
separations change the remaining charge rate; damage is captured at release.
Native defender projectiles retain their flying origin, 4.75-tile/s flight and
0.3-tile splash on the struck ground or air layer. Each target takes damage once;
air shots do not splash buildings. Freeze/stun, external speed modifiers and
original poses follow the shared clock. Only carried Baby Dragons enable the
change; versions 185 and earlier retain their previous timing and defender shots.
See [source limits and actual Cannon/Castle/ally-arrival recordings](../reference/attacking-baby-dragon/README.md).


## Version 187: Super Minion offensive Long Shot

Super Minion uses its offensive source ability for the first eight physical
releases: 9.75-tile range and the large native projectile traveling at six tiles
per second. It then approaches within its normal 3.5-tile range and begins a
fresh one-second charge, using its ordinary four-tile/s projectile. Buildings
and ground/air defenders share the stock and source charge. Target changes and
canceled charges do not replenish or spend ammunition. Freeze/stun and speed
changes use the shared clock; released shots retain their captured variant.
Scouting warms both projectile variants. Only carried Super Minions enable the
change; versions 186 and earlier retain their previous offense. Defending Super
Minions keep their separate three-shot ability. See [source limits and full-opening/Castle recordings](../reference/attacking-super-minion/README.md).
