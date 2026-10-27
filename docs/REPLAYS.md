# Recorded attacks

Audited and committed September 11, 2026. The latest five completed campaign or practice attacks now support **Watch replay**, both from their result screen and from the village's Battle log. Twenty result summaries are still retained. Attacks completed before this feature have no recording.

Playback has pause/play, restart, a draggable timeline, ±10-second jumps, First deployment, and 1×/2×/4× speed. Space toggles pause. Camera dragging, zooming, and defense inspection remain available; deployment, spell casting, hero activation, and surrender are disabled. Completion leaves the battlefield visible, with Restart and Back to log available. Replay controls adapt to phone portrait and landscape widths.

## Reproduction and isolation

`src/game/replay.ts` defines a versioned initial snapshot containing the actual enemy layout, defense levels and upgrade state, original army/spells, troop and spell research levels, King level/Town Hall, and starting unit identifier. A compact event stream records successful troop deployments, spell casts, hero deployment, manual hero activation, and battle termination, in order at simulation-step boundaries. Failed inputs and selection/camera movements are not recorded. The actual simulation deltas are preserved, including scouting time. Automatic hero activation, traps, mortar impacts, and combat outcomes are reproduced by the normal simulation.

Troop and spell research levels are frozen at attack entry. Research that finishes at home during an attack applies to the next attack. While watching a replay, home research advances from the home level, never from the recorded troop or spell level. This closes a timing dependency that would otherwise change damage midway through a recording.

Playback runs a separate GameModel and exposes only its battlefield to the scene. It never spends home troops or spells, pays loot, changes trophies/stars/statistics, or appends a result to the home log. Home collectors and upgrade timers continue their normal wall-clock behavior while watching. Restart creates a fresh simulation from the stored snapshot, so later layout changes, upgrades, or empty army camps cannot alter an old replay.

## Persistence and limits

The [army facility progression pass](FACILITY-PROGRESSION.md) retained combat version 16 before the spell rules changed. Barracks, Laboratory and Spell Factory health is captured in each battle snapshot, so the new home-village values do not reinterpret old recordings. A replay regression checks exact playback of the former Barracks health after the viewing village has adopted the new table.

Recordings travel with normal IndexedDB/localStorage saves and JSON export/import. Import validation bounds step/action counts, timestamps, coordinates, types, research, hero values, and initial building data. Existing saves and result records without a replay remain valid. Only the latest five result entries retain recording payloads; all twenty retain their summaries.

The current recording version is **140**, with playback compatibility for **34–140**. The following early history describes versions 34–38; later boundaries are documented below. Version 38 adds explicit, bounded garrison rosters and deterministic release state; earlier versions reject that setup field. Version 37 adds the passive Clan Castle building and its Lightning immunity; earlier versions reject that building kind. Version 36 introduces original-speed tracking Cannon projectiles and retains the prior Cannon rules for 34/35; version 35 introduces original-speed Mortar flight and retains fixed flight for 34. New Cannon/Mortar presentation histories reconstruct from simulation time without changing the old physical states. Immutable archived-code witnesses verify the supported historical paths. See the [Cannon reference](../reference/cannon/README.md), [Mortar reference](../reference/mortar/README.md) and [QA record](QA.md).

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
