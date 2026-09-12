# Verification record

## September 11 — native King progression and default equipment

The King now uses twenty native base-stat and upgrade records, early Town Hall scaling, and fixed level-1 Barbarian Puppet/Rage Vial equipment. Both items activate from TH4. Eight researched Barbarians spawn in two timed waves, with independent boost deadlines; automatic activation occurs on lethal damage. The Hero Hall panel shows equipped totals, attack timing, movement, recovery and item effects. See [KING-COMBAT.md](KING-COMBAT.md) for immutable source URLs/hashes and the native-engine behavior still unverified.

**641 model/asset tests pass across 55 files**, including twenty new King cases. Coverage includes all supported progression records, upgrade payment/deadlines/reload, legacy paid upgrades, early scaling, passive bonuses, fixed recovery, lethal activation/overkill, summon birth times, researched levels, owner death, damage/movement boosts, spell interactions, and exported replay reconstruction. Delayed projectile, destruction-bomb and spell effects cannot affect a summon before its scheduled birth. The final TypeScript check and production build pass.

The **288-battle campaign matrix** passes, retaining a veteran three-star approach to every stage (47 three-star results and one zero-star result across all veteran approaches). The matrix does not deploy heroes; these results validate the existing campaign, not hero-inclusive balance.

**36 distinct browser scenarios pass per engine** in Chromium with Metal and WebKit at 2× density. All five new feature scenarios pass in both engines: native upgrade/stat/save details at 1440px/390px/320px, TH4 touch activation and upgrade gating, timed waves, gold boost tint, pause, reduced motion, repeated replay seeking and cleanup. Existing hero, spell, trap, Skeleton Trap and replay scenarios also pass. Screenshots of the panel, equipment, summon wave and early ability were visually inspected, including the final production captures.

The final Chromium selection passed all 36 cases. WebKit passed 35 initially; the desktop replay-drag fixture attempted to drag before the slider was re-enabled after seeking. After adding an enabled-control wait, both desktop and phone drag cases passed on unchanged game source, completing the 36-case union. An earlier new-feature fixture also needed the renderer's normal sync after a manual seek; that fixture correction preceded the final runs. These are recorded as corrected test runs, not an uninterrupted clean broad WebKit run.

**Production checks pass in both engines without reported browser errors.** The independent hero runner creates a validated save through the model, owns its production preview, and uses shipping UI controls to import, upgrade, deploy, activate, surrender and watch the replay. Both engines reconstruct all eight summons. Chromium also retains the upgraded King and completes combat/replay after an offline reload; WebKit offline behavior was not exercised. General production checks cover boot, menus, artwork, collection, tab handoff and replay. Offline Chromium uses **167 cached files**, cache `crown-clan-c8fa258b6bbb`.

Final runtime source SHA-256 is `d17707c0ff0982e5cb9f2ad510a47346666d17915461ea03b761f46d891cc679` (62 files), unchanged during final browser and production runs. Evidence: `output/playtest/king-verification.json`, `king-source-final.json`, `king-models-final.log`, `king-campaign.json`, `king-build-final.log`, `king-chromium-final.log`, `king-webkit-final.log`, `king-webkit-seek.log`, `king-production-report.json`, `king-hero-production-report.json`, `king-panel-*.png`, `king-equipment-*.png`, `king-puppet-wave-*.png`, `king-early-ability-*.png`, and `production-hero-*.png`.

Combat version is 23; save version remains 4. Equipment selection/upgrading, Blacksmith/ores, defending heroes and later heroes remain unfinished. Existing King artwork is reused and is not pixel matched. Native action timing/targeting/rounding, full content, online systems and physical-device quality remain open; the production-clone goal is incomplete.

## September 11 — Skeleton Trap WebKit follow-up

All **44 remaining WebKit scenarios pass** at 2× density on committed gameplay source `220b0df`, using the normal 30-second timeout. Together with the 24 scenarios already verified, both Chromium and WebKit now have all **68 distinct passing scenarios** from the Skeleton Trap regression selection. This closes the interrupted coverage recorded below. Runtime source stayed at SHA-256 `4faa04b4de79e585904868b19dc60c5048b8f7894de18127b2b0c09860d85540`; no gameplay changes were made during the run. Machine load had eased before the follow-up.

Evidence: `output/playtest/skeleton-webkit-completion.json`, the exact selection in `skeleton-webkit-pending.json`, and the updated `skeleton-verification.json`. The full game, remaining native behavior and physical-device quality are still incomplete.

## September 11 — Skeleton Traps and defending units

Skeleton Traps now have two TH8 levels, persistent ground/air modes, timed spawning and separate defending units. Skeletons pursue eligible attackers, jump their own walls and draw retaliation from eligible troops. Projectile and spell allegiance is explicit. Wizard fireballs now use native five-tile/s fixed-point flight. See [SKELETON-TRAP.md](SKELETON-TRAP.md) for immutable client sources, exact values and remaining behavioral approximations.

**621 model/asset tests pass across 54 files** with `npx vitest run --maxWorkers=2`; the final TypeScript check and production build pass. Twenty-nine new simulation/save/replay cases cover mode/layer eligibility, trigger boundaries, sequential spawning after target loss, exact scheduled times across wide frames, spawn idle, cadence, point-target approaches, wall jumping, target priorities, retaliation, projectile tracking and misses, splash allegiance, spell interactions, attack exhaustion, finish guards, saved layouts and portable replay equality/seeking. Three asset cases verify distinct alpha states/poses and clear atlas margins.

The **288-battle campaign matrix** passes with one trap in each mode on stages 8–12. Every stage retains a veteran three-star route. Veteran results are 47 three-star approaches and one zero-star approach (final fortress from the south, 32%). Healer/P.E.K.K.A and Dragon armies each clear all 48 approaches. This checks the authored local campaign, not multiplayer balance.

**All seven new browser scenarios pass in Chromium with Metal and WebKit at 2× density.** They cover Shop gating, every texture, instant touch placement, the two-trap limit, the five-hour upgrade, mode changes/Info/layout/reload at 1440px/390px/320px, coffin states, six poses for each defender mode, ground/air hit anchors, pause stability, marker layering, replay reconstruction, reduced motion and cleanup. The UI audit corrected the Shop category; coffin opening now follows actual spawn state instead of a floating-point time comparison. Visual review caught health markers hidden by airborne sprites; a retained layer above troops now keeps the red bars and skulls visible. Final screenshots were inspected, including the battle close-up.

**Chromium has 68 distinct passing scenarios in this pass. WebKit has 24, including all seven feature cases.** The expanded WebKit rerun is incomplete: during heavy workstation load, two older defeat scenarios last timed out in setup, and the broad batch was stopped with further scenarios unrun. These are recorded as pending coverage, not passes. Chromium's four earlier setup timeouts passed when rerun separately. The final marker change is covered by eleven Chromium cases, all seven WebKit feature cases and both production smoke checks. The source fingerprints and exact scenario unions are in `output/playtest/skeleton-verification.json`.

The initial model run under load exposed two test-harness limits. The 288-battle functional matrix now has a 60-second timeout; it is not a frame-time benchmark. The replay speed test controls monotonic time so speed conversion is independent of the 8ms execution budget, which remains covered separately. Final model validation used two workers. No runtime time budget was relaxed.

The final production build passes Chromium and WebKit with no reported browser errors. All five new WebPs load. Chromium reloads, opens Army and watches a replay offline with **167 cached files**, cache `crown-clan-927fa46e8846`. Save version remains 4; combat version is 22. Original PNGs and exact built-in prompts are preserved in art commit `41b544f`; deterministic rebuilding of the five derivatives (223,482 bytes total) passes. Glow/checkerboard and clipped-frame candidates were rejected before acceptance.

Evidence: `output/playtest/skeleton-verification.json`, `skeleton-source-final.json`, `skeleton-models-final.log`, `skeleton-campaign.json`, `skeleton-build-final.log`, `skeleton-chromium{,-final}.log`, `skeleton-webkit{,-final,-feature}.log`, `skeleton-production-report.json`, `skeleton-info-*.png`, `skeleton-coffins-*.png`, `skeleton-defenders-*.png`, `skeleton-replay-*.png` and the retained source/atlas contact sheets.

Remaining work includes the interrupted broader WebKit coverage, native target/alert scoring, directional animation, Clan Castle troops and defending heroes, higher Town Halls/content, accounts/multiplayer/clans, and physical-device performance/endurance. The full production-clone goal remains open.

## September 11 — Bomb Tower

Bomb Towers now complete the main TH8 defense roster with native level 1–2 progression, fixed-point ballistic throws and a separate destruction bomb. The death charge waits one second, damages ground troops within 2.75 tiles once, and is canceled when a raid finishes. Two original tower sprites, complete previews, a four-pose roof Bomber and an exposed bomb provide the presentation. See [BOMB-TOWER.md](BOMB-TOWER.md) for immutable primary sources and unresolved native behavior.

**589 model/asset tests pass across 52 files.** Seventeen new simulation/save/replay cases cover numerical progression, target retention, flight speed, moving/dead targets, source destruction, splash boundaries, air immunity, cadence, inactive construction/upgrades, exact fuse boundaries, killing-projectile timestamps, death chains, finish modes, army exhaustion, actor timing and exported replay equality/seeking. The asset case verifies both base/preview pairs, four distinct alpha poses, the exposed bomb and clear margins; deterministic derivative checks pass.

**53 distinct browser scenarios pass per engine** in Chromium with Metal and WebKit at 2× density. Seven new cases cover the Shop gate and every texture, current/next-level Info and reload at 1440px/390px/320px, touch placement with the complete preview, construction/upgrade timers, all Bomber poses, ballistic flight/shadow, stable launch anchors after destruction, ground-level charge layering, exact fuse resolution, reduced motion and repeat replay seeks without duplicate actors. Existing defense, trap, air-control, Tesla, late-troop, projectile, defeat and replay/file scenarios also pass. The first touch fixture read the preview before a rendered frame; the subsequent fixture incorrectly expected the void `upgrade()` method to return true. Both were corrected. Each broad run passed 52 cases, and the corrected touch case passed separately on the unchanged runtime source.

The **288-battle campaign audit** passes with one tower added to stages 9–12. Every stage still has a veteran three-star route. Veteran results are 46 three-star, one one-star (final fortress from the east, 67%) and one zero-star (final fortress from the south, 35%). Healer/P.E.K.K.A and Dragon armies each clear all 48 approaches. These authored scenarios are not multiplayer balance validation.

Production checks pass in Chromium and WebKit at 2× density without reported errors, including all six new asset requests. Chromium reload, Army and replay work offline with **162 cached files**, cache `crown-clan-cafcde86c6b7`.

Runtime source SHA-256 `18643a54e4923c69e6815de52cfacded890d37492c2704381ea011eb7b30fa0b` remained unchanged during the final browser and production runs. Evidence: `output/playtest/bombtower-verification.json`, `bombtower-source.json`, `bombtower-check.log`, `bombtower-art.log`, `bombtower-campaign.json`, `bombtower-{chromium,webkit}.log`, `bombtower-touch-{chromium,webkit}.log`, `bombtower-production-report.json`, `bombtower-contact.png` and `bombtower-{info,flight,fuse,blast}-*.png`. The original PNGs and exact prompts are committed under `art/source/bombtower-v1/`. Native upgrade/terminal-frame behavior, animation, sound and pixel matching remain explicit fidelity gaps; the full game and online systems are unfinished.

## September 11 — Hidden Tesla

Hidden Teslas now extend the TH7–8 defense catalog with six native numerical level records and six original sprites. Concealment covers targeting, paths, crowd separation, deployment boundaries, pointer picking, scouting text, campaign miniatures and all building damage paths. Reveal is permanent after six-tile proximity or 51% displayed destruction. Electrical attacks hit one ground/air target at seven tiles every 0.6 seconds. Upgrading Teslas are visible but inactive; fresh attacks and replay seeking reconstruct their state. See [HIDDEN-TESLA.md](HIDDEN-TESLA.md) for primary sources and explicit fidelity limits.

**571 model/asset tests pass across 50 files.** Twenty-five new simulation/save/replay cases cover all ten troop triggers, dead/out-of-circle exclusions, native progression, hidden Lightning and splash immunity, hidden paths, forced retargeting, upgrading visibility, exact 50/51 thresholds, target retention, P.E.K.K.A behavior, cadence, interruption and exported replay equality/seeking. The asset test verifies six distinct transparent sprites and clear margins; the production derivatives rebuild byte-for-byte.

**46 distinct browser scenarios pass per engine** in Chromium with Metal and WebKit at 2× density. Eight Tesla scenarios cover catalog gates and all textures, Info/reload at 1440px, 390px and 320px, actual hidden picking/text/deployment boundaries, emergence and ground/air bolts, replay seeks, mobile construction, upgrading visibility, reduced motion and destruction during emergence. Review caught the need to reset crop and ground position when a rising tower becomes rubble; the final regression verifies that path. Info captures now wait for the panel animation before screenshots. Existing air-control, defense, trap, late-troop, defeat and replay/file scenarios also pass.

The **288-battle campaign audit** passes with one or two Teslas added to stages 7–12. The veteran army has a three-star route through every village: 47 three-star results and one zero-star result, the final fortress from the south (40% destruction). Healer/P.E.K.K.A and Dragon armies each clear all 48 approaches. This remains authored single-player difficulty, not verified multiplayer balance.

Production checks pass in Chromium and WebKit without reported errors, including all six new asset requests. Chromium reload, Army and replay work offline with **156 cached files**, cache `crown-clan-d9b142e1ae6d`. Runtime source SHA-256 `627ad6193dd4a7c0b296e7314a043a8713d8aba4450d9ac02f470ed3c0c81a69` stayed unchanged during the final browser and production checks. Six generated originals and exact prompts are committed under `art/source/tesla-v1/`; unwanted glow and baked-checkerboard candidates were rejected.

Evidence: `output/playtest/tesla-verification.json`, `tesla-check-final.log`, `tesla-art.log`, `tesla-campaign.json`, `tesla-chromium.log`, `tesla-defenses-chromium.log`, `tesla-webkit.log`, `tesla-production-report.json`, `tesla-contact.png`, and `tesla-{info,hidden,rise,zap}-*.png`. Native fractional-threshold handling, reveal/retarget timing, animation, sound and pixel matching remain approximations. The complete content catalog and online systems are unfinished.

## September 11 — directional air control

Air Sweepers and Seeking Air Mines now extend the local TH1–8 roster. Four Sweeper levels use native health/cost/time/push tables, eight free rotation directions, a traveling gust, zero-damage defense preference and Lightning interruption. Mines use 1,500 single-target damage, five-space eligibility and 3.5 tiles/s homing. Authored campaign stages 6–12 add Sweepers; stages 8–12 add mines. [AIR-CONTROL.md](AIR-CONTROL.md) records the unresolved native cone interpretation, gust geometry/easing and mine activation/target-loss behavior.

**545 model/asset tests across 48 files pass.** The new 25 simulation/save/replay cases cover direction bounds, layout save/undo/redo, front/rear/blind-spot acquisition, all four push strengths, traveling fronts and five-second cadence, ground immunity, interruption, source destruction, defense preference, Balloons/Healers/Dragons, homing speed, single-target damage, inactive traps and exported JSON replay equality. Two asset cases verify 32 distinct transparent directional frames plus three mine states. The final strengthened export test also passes after assigning the exported JSON payload back to the recording.

**35 distinct browser scenarios pass per engine** in Chromium using Metal and in WebKit at 2× density. New checks cover catalog gates, all sprite keys, rotation/Info/layout restore/reload at 1440px, 390px and 320px, touch placement with a real construction timer, instant mine arming, flying mine/gust display and replay seeking. Existing defense, trap, late-troop, replay and replay-file scenarios pass. The initial flight capture was after impact and was moved earlier; the touch fixture's `count` typo was corrected to `countOf`. Verification records the exact union of passing cases, rather than presenting the initial failing runs as clean.

The **288-battle campaign matrix** still finds a three-star veteran approach for every stage. The veteran army earns 47 three-star results and one two-star result across four approaches. The Healer/P.E.K.K.A and Dragon armies each clear all 48 approaches; this remains an authored campaign, not validated multiplayer balance.

Production checks pass in Chromium and WebKit with no reported errors, including all new asset requests. Chromium reloads, opens Army and plays a replay offline with **150 cached files**, cache `crown-clan-a4f74e1abfa3`. Runtime source stayed unchanged during browser and production checks. The 35 original sprites rebuild byte-for-byte with `node scripts/air-control-assets.mjs --check`; generation prompts and accepted PNGs are committed under `art/source/air-control-v1/`.

Evidence: `output/playtest/air-control-verification.json`, `air-control-check.log`, `air-control-export-final.log`, `air-control-art.log`, `air-control-campaign.json`, `air-control-chromium*.log`, `air-control-webkit.log`, `air-control-touch-*.log`, `air-control-production-report.json`, and `air-control-{rotation,info,flight,replay}-*.png`. Native animation comparison, remaining content and online services remain unfinished.

## September 11 — Healer, Dragon and P.E.K.K.A

The elixir Barracks roster now reaches TH8: ten troops, with explicit level 1–3 records for Healer, Dragon and P.E.K.K.A. Primary client CSV records drive health, damage/healing, cadence, housing, movement, range and research. Healer pulses heal living ground groups at their fixed landing location, with hero modifiers and diminishing contributions. Dragon breath applies direct splash; P.E.K.K.A uses heavy ground melee. See [LATE-TROOPS.md](LATE-TROOPS.md) for the immutable data URLs, hashes, exact tables, generated artwork prompts and native behavior still approximated.

**518 model/asset tests in 46 files pass.** Thirty new roster cases cover supported levels and unlocks, research payment/reload, batch capacity, presets, ground-only healing, moving targets, source death, stacking, heroes/Rage, air defense eligibility, battle completion, breath splash, wall strikes, old save formats, invalid levels/counts and deterministic replay. Three asset tests verify all twelve distinct transparent animation frames and matching portraits. A further regression preserves older developer checkpoints. The expanded **288-battle campaign matrix** retains the original four compositions and adds Healer/P.E.K.K.A and Dragon armies. Both new TH8 armies clear all 48 of their stage/approach combinations; this exposes the limited difficulty of the current authored campaign rather than establishing multiplayer balance.

**54 distinct browser scenarios pass in each of Metal Chromium and WebKit at 2× density**, including five new scenarios for the roster's real training/research/info/hotkey controls at 1440×960, 390×844, 844×390 and 568×320, plus battle animation/effects. Coverage also includes existing armies, presets, unlocks, imports, research, effects, replays, pointer input and developer controls. Final affected tests reran successfully: **17 per engine**. AIR badges no longer overlap troop counts on phones or home trays. Dragon flames originate at the mouth and healing orbs at the hands; effects freeze on pause, expire with battle time and clear on exit. The final battle and phone captures were visually reviewed.

Regression work corrected old fixtures that assigned level 4/5 to every troop, and an older unlock test that skipped closing the restored Army drawer. The expanded run also exposed a WebKit developer-panel focus defect: pointer clicks did not focus the submit button before the panel rebuilt. Focus now returns explicitly to the action button or form submitter. Developer checkpoints migrate the roster before validation. These cases pass after the fixes.

The final build and production checks pass in Chromium and WebKit without reported browser errors. All six new WebPs are required by the production smoke check and rebuild byte-for-byte from retained sources. Chromium reloads, opens Army and watches a replay offline with **115 cached files**, cache `crown-clan-232ab3215dc3`. Save version remains 4; combat version 18 records the ten-troop roster and retains older result summaries without attempting incompatible playback.

Evidence: `output/playtest/late-troops-verification.json`, `late-troops-models-verified.log`, `late-troops-campaign.json`, the engine-specific `late-troops-*-{regression,remaining,gameplay,final}.log` files, `late-troops-build-verified.log`, `late-troops-production-report.json`, `late-troops-rebuild.log`, `late-troops-battle-*.png`, `late-troops-tray-*.png` and `healer-info-*.png`. The verification JSON lists the exact passing scenario union and source fingerprint. Generated source artwork was committed separately as `7f25962`.

The full production-clone goal remains open: exact Healer AI, native target/hitbox/windup behavior, defending troops, per-level/directional artwork, higher Town Halls and later content, accounts/multiplayer/clans and physical-device endurance/performance are incomplete.

## September 11 — consistent spell colors and a forked Lightning strike

Healing bottles and auras now use yellow, while Rage uses purple; Lightning keeps blue. The original SVG generator is isolated in `scripts/spell-assets.mjs`, imported by the full asset pipeline and verified with `--check` in CI. Three versioned 256×256 WebPs replace the old URLs, retaining real alpha and totaling 14,002 bytes. A single blue/white forked Lightning graphic replaces the three rectangular beams and uses the existing paused/reduced-motion/cleanup lifecycle. These are authored visual approximations; native silhouettes and deployment staging remain open. See [SPELL-PROGRESSION.md](SPELL-PROGRESSION.md).

**All 11 affected browser scenarios pass in each of Metal Chromium and WebKit at 2×**, covering every spell's researched details at four viewports, paused spell/effect timing, reduced motion and cleanup. Battle captures in both engines show yellow and purple aura footprints and the forked bolt; the graphic reaches alpha 0.5 at 130ms and is destroyed on exit. The generated assets and final spell screens were visually inspected. The preceding **484 model/asset cases and 66 distinct browser scenarios per engine** remain the broader validation; this follow-up changes presentation and asset routing only.

The build and production checks pass in both engines without reported errors. Production now requires all three new spell assets. Chromium reloads, opens Army and watches a replay offline with 109 cached files, cache `crown-clan-5f6da844dc59`. Save and combat formats are unchanged. Evidence: `output/playtest/spell-art-verification.json`, `spell-art-{chromium,webkit}.log`, `spell-art-assets.{log,json}`, `spell-art-build.log`, `spell-art-production-report.json`, `spell-art-capture.{mjs,json}`, `spell-art-battle-*.png`, `spell-art-lightning-fade-*.png` and the refreshed `spell-*-max-*.png` screens.

## September 11 — native spell research, effects and details

Lightning, Healing and Rage levels 1–5 now use explicit research prices, durations, laboratory gates and combat values from Supercell's published game CSV. Lightning uses footprint intersections, storage/Town Hall immunity and defense interruption. Healing delivers 41 discrete pulses with the current 55% hero multiplier. Rage adds researched damage and movement boosts, preserves attack cadence, applies half boosts to heroes, does not stack and lingers after the last pulse. See [SPELL-PROGRESSION.md](SPELL-PROGRESSION.md) for the immutable reference, hashes, tables and remaining timing limitations.

**484 model/asset tests across 44 files pass**, including 36 new spell cases. Coverage includes all twelve research transitions, payment/reload/deadlines, independent laboratory construction, shared troop/spell research, spell unlocks, all five levels' effects, footprint/radius boundaries, immunity, stun/reset, launched shots, healing overlap, Rage/hero interaction, malformed saves and frozen battle/replay levels. The import regression also reproduced coercion of `['heal']` into a spell name; validation now requires an actual string and safely rejects malformed objects. The **192-battle campaign matrix** passes without changes to its spell-free compositions or stage tuning.

**66 distinct browser scenarios have passing coverage in each of Metal Chromium and WebKit at 2× density.** Nine new scenarios cover four spell research/detail viewports and nested dialog focus/scroll restoration. The surrounding gameplay, troop research, facility progression, heroes, Army presets, effects and replay/export/import flows pass. Closing an Army-origin dialog now restores its drawer, scroll and launching control; three existing navigation checks and the production script were updated to assert this behavior. The detail measurements wait for the entrance animation and scroll the action to the center, avoiding transient transforms and fractional edge clipping. All eight dedicated spell cases pass in each engine after those measurement corrections, and the affected hero navigation case also passes again in both.

Desktop, portrait and both landscape sizes were visually inspected. The final build and production checks pass in Chromium and WebKit without reported browser errors. Chromium reloads, opens Army and plays a replay offline with 109 cached files, cache `crown-clan-ed015a1e2d83`. Save version remains 4. Combat version 17 preserves older result summaries while recording spell levels for current playback and portable files. New spell browser coverage is included in WebKit CI.

Evidence: `output/playtest/spell-progression-verification.json`, `spell-progression-tests-verified.log`, `spell-import-regression-before.log`, `spell-progression-campaign.json`, `spell-progression-{chromium,webkit}-{final,regression,verified}.log`, `spell-progression-hero-{chromium,webkit}.log`, `spell-progression-build-verified.log`, `spell-progression-production-report.json`, and `spell-{research,healing,lightning-max,heal-max,rage-max}-*.png`. Native bottle deployment timing, later spell types, defending troops, full hero equipment and final spell artwork remain unfinished.

## September 11 — normalize countdown rounding at hour boundaries

Long countdowns round the total minutes before splitting hours and minutes. A timer just below three hours now reads `3h` instead of `2h 60m`. Seconds remain visible below an hour, and actual research/construction deadlines and gem prices are unchanged.

The new regression reproduces the original defect before the fix. **33 focused timer and progression cases pass**, including two new formatting cases covering 16 concrete boundary values. The preceding full suite's 446 cases remain the broader validation. Both landscape research scenarios pass again in each of Metal Chromium and WebKit at 2×, asserting the actual live `3h` label while retaining payment, independent construction, scrolling, Finish and Close checks. The updated 568px screenshot was visually reviewed.

The build and production checks pass in both engines without reported errors. Chromium also reloads, opens Army and plays a replay offline with 109 cached files, cache `crown-clan-8715614afee5`. Evidence: `output/playtest/countdown-verification.json`, `countdown-regression-before.log`, `countdown-regression-final.log`, `countdown-{chromium,webkit}.log`, `countdown-build.log` and `countdown-production-report.json`.

## September 11 — compact research and stable dialog refreshes

Research now places its active timer and Laboratory status beside compact troop cards on short landscape screens. The first two research actions fit at 568×320; three cards fit at 844×390. Research, Finish and Close retain 44px touch targets. The status column stays visible while scrolling the catalog. Updating an already open dialog also stops replaying its fade/scale entrance animation; opening a new dialog still animates.

The two new landscape cases initially exposed the repeated entrance animation, then the smallest viewport exposed a clipped Finish button during simultaneous research and construction. Both defects are corrected. **All seven final research-layout and modal-focus cases pass in each of Metal Chromium and WebKit at 2× density.** The preceding broader 38-case run passed its other 37 cases in each engine, including facility progression, starter/specialist research, details and gameplay. Together with the facility pass, **51 distinct browser scenarios per engine have passing coverage**. Active and scrolled landscape screenshots were visually inspected, including the fully visible 568px Finish action. Model validation remains the preceding 446 passing cases; this follow-up changes presentation only.

The final production build and both browser checks pass without reported errors. Chromium reloads, opens Army and plays a replay offline with 109 cached files, cache `crown-clan-fed32f664d4f`. Save and replay formats are unchanged. Evidence: `output/playtest/research-layout-verification.json`, `research-layout-{chromium,webkit}-final.log`, `research-layout-{chromium,webkit}-compact.log`, `research-layout-build-compact-final.log`, `research-layout-production-report.json` and `research-landscape-{active,scrolled}-*.png`. Screenshot review found a separate countdown rounding defect ("2h 60m" just below three hours), corrected in the follow-up recorded above.

## September 11 — native army facilities and independent Laboratory timers

Barracks levels 1–10, Laboratory levels 1–6 and Spell Factory levels 1–3 now use explicit native health, elixir prices and durations. Two accepted legacy Factory levels also have explicit values. Purchases enforce one Barracks, a Laboratory from TH3 and a Spell Factory from TH5. The highest completed factory supplies housing; imported duplicate buildings and excess prepared spells remain saved without multiplying that capacity. The Army drawer explains excess troop or spell housing and allows removal. Research and Laboratory construction now run independently in either start order, using the completed building level until its upgrade finishes. See [FACILITY-PROGRESSION.md](FACILITY-PROGRESSION.md) for tables, sources and compatibility.

**446 model/asset tests across 42 files pass**, including 27 new cases. Each of the 19 purchasable facility levels is exercised through payment, reload and exact deadline completion. Coverage also includes every TH1–8 count/level gate, stale direct-placement rejection, paid legacy queues and deadlines, preserved health fractions and buildings, spell capacity recovery, both Laboratory start orders, gem completion and exact playback of previous facility health. The unchanged **192-battle campaign matrix** still finds a three-star veteran approach for every stage, and the actual starter can win the opening raid. No campaign layout or multiplier changed.

**44 distinct browser scenarios have passing coverage in each of Metal Chromium and WebKit at 2× density.** The initial selection passed 37 cases in each engine; six new cases assumed literal spaces between table-cell text, and one old drag test tried to buy a second Barracks. The new checks now assert individual cells, and the drag test uses an available Laboratory while retaining actual pointer placement/count assertions. All **24 affected and surrounding scenarios pass** in each engine after those corrections. The eight dedicated facility cases pass again after screenshot framing changes. Phone captures additionally wait for the toast opacity to reach zero; the three affected phone cases are rerun in each engine. The factory-unlock fixture now funds the real prices and gem skips with sufficient storage instead of relying on the former prototype prices.

Desktop, portrait and landscape Info/research panels and the phone excess-spell warning were visually inspected. The production build passes; Chromium and WebKit report no browser errors at 2×. Chromium reloads, opens Army and plays a replay offline with 109 cached files, cache `crown-clan-ccf7526b270b`. Save version stays 4 and replay version stays 16: prior facility health remains in recorded snapshots and is not reinterpreted. New browser coverage is included in WebKit CI.

Evidence: `output/playtest/facility-progression-verification.json`, `facility-progression-tests.log`, `facility-progression-campaign.json`, `facility-progression-{chromium,webkit}.log`, `facility-progression-{chromium,webkit}-final.log`, `facility-progression-{chromium,webkit}-visual.log`, `facility-progression-{chromium,webkit}-capture.log`, `facility-progression-build-final.log`, `facility-progression-production-report.json` and `facility-{research,info,legacy-spells,shop}-*.png`. The remaining facility silhouettes, later troop/spell unlocks, spell research, Dark army facilities and broader economy remain unfinished.

## September 11 — readable troop details in compact landscape

Troop Info now places the portrait beside its stat grid on short landscape screens. A compact fixed header keeps the troop name and a 44px Close button, while removing repeated headings and branding. All five specialist panels show at least their first six stats immediately at both 844×390 and 568×320, with remaining stats, tactics and the 44px Train action reachable by scrolling. Desktop and portrait layouts keep their existing arrangement. Final WebKit Wizard and Chromium Wall Breaker screenshots were visually reviewed at those two landscape sizes.

**13 affected UI scenarios pass in each of Metal Chromium and WebKit at 2× density**, including research, details, starter progression and Balloon behavior. After the final header refinement, all four detail scenarios pass again in each engine, covering five specialist panels per viewport, stat placement and overflow, Train interactions and actual Close behavior. The added 568×320 research and detail cases bring this troop progression pass to **46 distinct passing browser scenarios per engine** across the recorded runs. The preceding combat commit's 419 model/asset tests remain the model validation; this follow-up changes only presentation CSS and its browser coverage.

The final build and production checks pass in both engines at 2× without reported browser errors. Chromium reloads, opens Army and plays a replay offline with 109 cached files, cache `crown-clan-5e5c7e9556f5`. Evidence: `output/playtest/troop-details-verification.json`, `troop-details-{chromium,webkit}.log`, `troop-details-{chromium,webkit}-final.log`, `troop-details-build-final.log`, `troop-details-production-report.json`, and `troop-roster-{wizard,wall-breaker}-{844,568}-{chromium,webkit}.png`.

## September 11 — complete supported troop combat and research tables

All seven supported troop types now use explicit Home Village level 1–5 records. This pass adds Giant, Wizard, Balloon, Goblin and Wall Breaker health, hit/DPS values, movement, range, cadence, prices, research durations and laboratory gates. It removes the prototype 30% level multiplier, corrects Wizard splash to 0.3 tiles at full collateral damage, applies researched Balloon death damage at 1.2 tiles, and separates Wall Breaker contact (hit plus death) from early defeat (death only). Goblins prefer and deal double damage to Dark Elixir buildings. Info includes movement speed, damage on destruction and wall contact totals, with a 44px Train action. Save version stays 4 and paid legacy research remains intact. Combat version 16 retains old summaries without incompatible playback. See [TROOP-PROGRESSION.md](TROOP-PROGRESSION.md).

**419 model/asset tests across 41 files pass**, including 32 new progression/combat/replay cases. All 25 added level records are exercised through deployed health and research. Tests cover native movement and range boundaries, Giant cadence/defense preference, Goblin Dark Elixir targeting, Wizard fractional impact/splash, all researched death-damage levels, Rage affecting only Wall Breaker attack damage, one-time explosions and exact JSON/replay reproduction of a 187.5-damage hit. Two mortar fixtures now hold their intended targets in the impact area; the corrected faster Giant movement had allowed them to walk out of the splash circle.

The **192-battle campaign matrix** preserves the previous level-three, 160-space army as a mid-research scenario and adds a TH8 level-five, 200-space roster containing all seven troop types. All 12 stages have a three-star veteran approach; the actual untouched starter can still win the first raid. The mid-research army now falls short of fully clearing the final fortress. Each scenario has compatible Town Hall, laboratory, barracks and camp gates. No campaign layout, multiplier or reward was changed to retain the old balance.

**44 distinct browser scenarios pass in each of Metal Chromium and WebKit at 2× density.** Six new cases inspect research gates, payment, reload, gem completion and five detailed troop panels at 1440×960, 390×844 and 844×390. The existing gameplay, projectile, Balloon, specialist animation, starter research, replay/seek/export/import, tab ownership, context recovery and twenty-raid transition scenarios also pass. A new test initially matched both the background and modal Train buttons; its selector is now scoped to the detail panel. That revealed the real 43px button height, corrected to 44px. The final 11 affected UI scenarios pass in each engine. Desktop and phone details were visually reviewed; the landscape panel remains scrollable but dedicates substantial initial space to its portrait.

The production build passes. Chromium and WebKit production checks report no errors; Chromium also reloads, opens Army and plays a replay offline with 109 cached files, cache `crown-clan-c4947205fb08`. A Metal mixed-roster sample at 1440×960 CSS / 2880×1920 buffer pixels averages 60 FPS in the village and battle, with 16.8ms p95 frames over each four-second sample. It deploys 84 level-five units occupying 200 spaces, with 82 living at the end of the sample, on Apple M5 Pro. The new `--army=mixed` benchmark option makes that composition repeatable. This does not establish physical-phone or sustained thermal performance.

Evidence: `output/playtest/troop-roster-verification.json`, `troop-roster-tests-final.log`, `troop-roster-campaign.json`, `troop-roster-{chromium,webkit}.log`, `troop-roster-{chromium,webkit}-final.log`, `troop-roster-build-final.log`, `troop-roster-production-report.json`, `troop-roster-performance.json`, and `troop-roster-{research,wizard,wall-breaker}*.png`. Full native roster, spell/hero balancing, economy, per-level and directional art, authentic campaign content and online services remain unfinished.

## September 11 — native starter combat and laboratory progression

Barbarian and Archer levels 1–5 now use explicit Home Village HP, damage, research cost/time and laboratory tables. Their movement speeds are 2.2 and 3 tiles/second; ranges are 0.4 and 3.5 tiles; attacks occur once per second. Current, deployed and next-level preview values share one lookup. The pathfinder adds a short final segment within the last reachable cell so a 0.4-tile melee weapon can actually reach a building. Regular wall attacks no longer receive the prototype's hidden 1.6× bonus. Save version remains 4; paid legacy research keeps its deadline and existing levels. Combat version 15 prevents older recordings from playing with changed rules while retaining their result summaries. See [STARTER-TROOP-PROGRESSION.md](STARTER-TROOP-PROGRESSION.md) for sources and exact values.

All **387 model/asset tests across 40 files pass**, including 17 new starter-progression and short-reach cases, deterministic replay/seek, wall/projectile interactions and the 144-battle campaign audit. Every authored stage remains clearable with the existing veteran fixture; the actual unupgraded starter army can still win the opening raid. Campaign layouts and multipliers were not changed. Tests tied to the former research costs, 130-second assumed raid completion and six-second wall breach were updated to the native costs and full battle/breach duration; damage and collision assertions remain. Old replay version assertions now track the current version while explicitly testing legacy snapshots.

**27 distinct browser scenarios pass in each of Metal Chromium and WebKit at 2× density.** They cover native research previews, paid reload and gem completion at 1440px and 390px, Lab 3 gating, details, actual gameplay, replay recording/seek/export/import, graphics recovery, tab ownership and twenty repeated raid transitions. The initial Chromium run found an old replay-layout fixture comparing physical camera width with CSS width; the corrected check includes pixel density and retains every hit-target assertion. Screenshot capture waits for loading and modal transitions, and desktop research/phone details were visually reviewed.

The build and production checks pass in both engines at 2×, including deployment, research, replay, tab handoff and landscape resizing. Chromium reloads, opens Army and plays a replay offline with 109 cached files, cache `crown-clan-ff5998a0267f`; no browser errors were reported. The new browser regression is included in WebKit CI.

A separate Metal benchmark deploys a capacity-valid 200-unit army (100 level-one Barbarians and 100 level-one Archers). At 1440×960 CSS pixels / 2880×1920 buffer pixels, idle and battle both average 60 FPS, with 16.8ms 95th-percentile frames over each four-second sample. All 200 units remain present during the battle sample. The reported renderer is Apple M5 Pro; this is a short Mac benchmark, not physical-phone or thermal certification. Other troop, spell, hero and building statistics still contain unaudited values.

Evidence: `output/playtest/starter-progression-verification.json`, `starter-progression-tests-final.log`, `starter-progression-campaign.json`, `starter-progression-chromium.log`, `starter-progression-chromium-final.log`, `starter-progression-chromium-ui.log`, `starter-progression-webkit.log`, `starter-progression-webkit-ui.log`, `starter-progression-build.log`, `starter-progression-production-report.json`, `starter-progression-performance.json`, `starter-combat-performance.mjs`, and `starter-{research,stats}-{390,1440}-{chromium,webkit}.png`.

## September 11 — Barbarian identity, portrait and walk cycle

The starter melee troop now uses the Barbarian name and a new matching portrait and four-frame walk atlas throughout preparation, camps, combat and replay. The built-in image-generation tool produced the source artwork using a Supercell character reference. A corrected source replaces the initial opaque checkerboard and repeated stride; the deterministic importer removes its magenta matte, registers the hair, preserves a shared scale and aligns feet. The retained `swordsman` save/replay key, combat stats and save/replay versions are unchanged. See [BARBARIAN-ART.md](BARBARIAN-ART.md) for sources, exact prompts, importer details and remaining animation gaps.

All 37 focused model/asset cases pass across Barbarian artwork, facing, army preparation/unlocks and deterministic replay. Exact asset rebuilds pass. Ten distinct browser scenarios pass in each of Metal Chromium and WebKit at 2× density: army roster, starter naming/portraits and save reload, camp texture/idle, ground-troop animation, and desktop/phone replay. Initial new-fixture failures used a battle-only selector in the village and assumed Phaser retained a fetchable image URL; the final checks use the accessible village card and compare the decoded camp texture pixels directly with the shipping atlas. Screenshots wait for the details modal animation before capture. The portrait and enlarged phone camp were visually reviewed.

The build and production checks pass in Chromium and WebKit at 2×, including the new required artwork, deployment, replay, tab handoff and landscape rotation. Chromium reloads, opens Army and plays a replay offline with 109 cached files, cache `crown-clan-9eaad3630bed`; no browser errors were reported. The new art rebuild and presentation tests are included in CI. This pass covers one low-level appearance; level variants, full directional/attack/death art and physical-phone verification remain open.

Evidence: `output/playtest/barbarian-verification.json`, `barbarian-chromium.log`, `barbarian-chromium-final.log`, `barbarian-webkit.log`, `barbarian-webkit-final.log`, `barbarian-build.log`, `barbarian-production.log`, `barbarian-production-report.json`, `barbarian-details-{chromium,webkit}.png` and `barbarian-camp-phone-{chromium,webkit}.png`.

## September 11 — compact village controls and landscape spacing

Collect no longer covers Zoom out in the compact village HUD. The initial hit-test probe found obstructed controls in nine of thirteen viewport sizes, including hidden activity buttons at 320×568 and several controls at 568×320. The new compact stylesheet gives the side tools explicit clearance above bottom actions and 44×44 CSS-pixel targets. Short portrait views use side grids and place Collect between Attack and Shop; landscape places Collect beside Shop with a separate camera row above. A short army tray hugs its contents, while a developed roster retains horizontal scrolling. Safe-area variables reserve space at the screen edges. See [COMPACT-HUD.md](COMPACT-HUD.md).

The initial 25-case gameplay/UI selection passes in each of Chromium and WebKit. A seven-case Retina selection also passes in Chromium. Six of seven initially pass in WebKit; the new developed-village fixture retained a DOM handle while a pending HUD redraw replaced it. Reading the control and its rectangle in one browser evaluation corrects that test race, while preserving the real center click and required zoom change. All four final compact-HUD cases pass at 2× in both Metal Chromium and WebKit, with the touch case retaining its 3× setting. Across the selections, 29 distinct scenarios per engine have passing coverage.

The dedicated layout cases check 19 viewports for both starter and developed villages: 38 combinations per engine. Five points in each main control must hit that control, and clicking the exact center of Zoom out must change zoom. Small-screen Settings and Collect actions, 3× touch rotation, inset spacing, scrolling to Train, Army/Shop drawers, Edit camera controls and first-run coaching are exercised. Small starter trays are checked for unwanted empty width. Screenshots at 320×480, 568×320 and 844×390 were visually reviewed. The inset case reserves CSS space; physical-device ergonomics remain unverified.

The production build passes Chromium and WebKit at 2× density without reported errors, including actual deployment, collection flights, replay, tab handoff and rotation. Chromium reloads, opens Army and plays a replay offline with 107 cached files, cache `crown-clan-002840677071`. The new layout regression is included in WebKit CI and the Retina configuration. This pass changes CSS and its import only; simulation, save/replay rules and source artwork are unchanged, so model and asset suites were not rerun.

Evidence: `output/playtest/hud-spacing-baseline.json`, `hud-spacing-after.json`, `hud-layout-chromium.log`, `hud-layout-webkit.log`, `hud-layout-retina-chromium.log`, `hud-layout-retina-webkit.log`, `hud-layout-final-chromium.log`, `hud-layout-final-webkit.log`, `hud-layout-build.log`, `hud-layout-production-report.json`, and `hud-layout-*-320x480-*.png` / `hud-layout-*-568x320-*.png` / `hud-layout-*-844x390-*.png`. The consolidated record is `hud-layout-verification.json`.


## September 11 — native Retina and 3× rendering

The canvas now uses physical display pixels with a 16-million-pixel allocation budget and GPU dimension limits. The former 390×844 buffer stayed at that size even on a 3× screen; it now renders at 1170×2532. A 1440×960 Retina view renders at 2880×1920. Camera framing, gesture tolerances, DOM shop dragging, context anchors and resource flights remain in CSS coordinates. Fractional-density rounding uses separate camera axes. Resize and live display changes preserve world focus and CSS zoom, cancel old gestures, and remap stationary mouse input. See [DISPLAY-DENSITY.md](DISPLAY-DENSITY.md).

Two allocation tests pass. The browser matrix contains 35 distinct passing Chromium cases across the focused 19-case default-renderer run, 21-case Retina Metal gameplay run and native pinch case. WebKit passes 33 cases, including 2× terrain/camera coverage and 3× touch input. Two CDP-only capabilities—live density switching and native multi-touch injection—are tested in Chromium. The live-switch test caught devicePixelRatio changing without a resize or media-query notification; a lightweight pre-step comparison now catches that condition. Two existing fixtures also needed explicit waits for a drawer redraw and asynchronous animation cancellation; their original held-button and particle assertions remain intact.

Each density profile resolves alternating one-physical-pixel stripes. The final strengthened graphics-recovery reference includes buildings, troop sprites, text and terrain; three profiles pass in each of Metal Chromium and WebKit with zero changed RGBA pixels after context restoration. The Retina WebKit run also repeats the existing 180 terrain coverage views, field-boundary probes and 15 full-frame comparisons against the old stencil. CI includes the density scenarios and an additional six-case Retina terrain/camera selection.

Both hardware benchmarks use headless Chromium 153.0.8010.12 and the reported Apple M5 Pro Metal renderer, with no other browser test suite from this task running. At 1440×960 CSS/2880×1920 pixels (2×), idle, native 200-troop camps, the 660-actor legacy roster and battle each measure 60 FPS, with 16.7 ms 95th-percentile frames. At 390×844 CSS/1170×2532 pixels (3×), all four samples also measure 60 FPS, with 16.7–16.8 ms 95th-percentile frames. Host load averages are recorded in the reports. The phone-sized run still uses the Mac GPU; physical phones/tablets and longer thermal sessions remain unverified.

The production build passes Chromium and WebKit at 2×, including buffer-size assertions, real deployment, replay, tab handoff and landscape resizing. Chromium reloads, opens Army and plays a replay offline: 107 cached files, cache `crown-clan-55031cfd516c`. No browser errors were reported. This rendering pass does not change game rules, saves, replay versions or source artwork; the last complete model/asset suite remains the 366-test camp-art run in the historical record.

Visual follow-up: at 844×390, Collect covers the center of Zoom out. A DOM hit test returns `collect` at the zoom button's center (x≈804.6, y≈271.6). This separate CSS control-layout defect is resolved in the compact HUD pass recorded above. Higher-density rendering also does not add missing source-art detail, world-text texture resolution, native content or backend services.

Evidence: `output/playtest/display-unit.json`, `display-chromium.log`, `display-retina.log`, `display-webkit.log`, `display-pinch.log`, `display-restoration-metal.log`, `display-restoration-webkit.log`, `display-build.log`, `display-production-report.json`, `display-retina-performance.json`, `display-phone-performance.json`, `display-phone-camps.png`, `display-landscape-followup.json`, and `display-landscape-followup.png`. The consolidated record is `display-verification.json`.


## September 11 — reduce terrain overdraw and verify Metal rendering

The turf mask now draws only the four corners of its bounding rectangle outside the buildable diamond. It removes two full-viewport stencil inversion draws per frame, while retaining the same repeating texture, tint, alpha, clipping, world detail and troop roster. The matching subtract operation still clears the mask before later world objects render. Gameplay, saves, replay rules and artwork are unchanged.

Nine focused browser cases pass in each of Chromium and WebKit. The new regression compares every RGBA framebuffer pixel against the previous inverted-diamond implementation in 15 views per engine: five fractional camera/zoom settings across phone portrait, phone landscape and desktop sizes. Every comparison has zero changed pixels and exactly two fewer draw calls. Existing checks cover all 1,936 grass tile centers, edge clipping, later objects outside the stencil, context restoration, sprite raster equivalence and 180 terrain coverage views per engine. Six additional cases pass in Chromium with ANGLE Metal, including the same pixel comparison and graphics restoration.

Profiling showed approximately 0.4 ms of JavaScript rendering work per frame. Changing the texture batch limit gave no consistent improvement, so batching remains unchanged. Removing the turf overlay temporarily raised the same frozen scene from 54 to 60 FPS. An initial alternating-mask probe measured 56 FPS for each inverted-mask sample and 58/60 FPS for the corner mask, with zero changed pixels in five full-frame comparisons. The longer SwiftShader run overlapped other browser workloads and measured 40/40 and 27/31 FPS for old/new pairs; its native 200-troop sample measured 50 FPS and the legacy roster 41 FPS. These shared-host results do not establish a stable global frame-rate improvement. The verified reduction is two full-screen passes with identical tested output.

The benchmark now supports `--compare-field-mask`, which alternates both implementations twice on the same frozen 200-troop village and restores the original scene configuration afterward. macOS `--metal` explicitly requests ANGLE Metal and rejects a silent renderer fallback. With the reported **Apple M5 Pro Metal renderer**, headless Chromium 153.0.8010.12 at 1440×960 and 1× pixel ratio held **60 FPS** idle, in battle, with 200 native troops and with 660 legacy actors. Its 95th-percentile frames were 16.7–16.8 ms. Both masks reached the same 60-FPS cap on this hardware. High-DPI rendering and physical phone/tablet performance remain unverified.

The production build passes Chromium and WebKit without reported errors. Chromium reloads, opens Army and plays a replay offline with 107 cached files, cache `crown-clan-38e6420cd7a5`. The existing terrain WebKit CI selection automatically includes the new framebuffer case. See [TERRAIN-CAMERA.md](TERRAIN-CAMERA.md) for implementation and benchmark commands.

Evidence: `output/playtest/field-mask-verification.json`, `render-profile-baseline.log`, `render-profile.json`, `render-profile.cpuprofile`, `render-layers-profile.json`, `field-corners-profile.json`, `field-mask-chromium.log`, `field-mask-webkit.log`, `field-mask-metal.log`, `field-mask-build.log`, `field-mask-production-report.json`, `field-mask-performance.json`, and `field-mask-metal-performance.json`.


## September 11 — eight camp level sprites and open gathering areas

All 366 model and asset tests pass across 37 files. Eight original built-in ImageGen sprites replace the camp's two tent-and-wall tiers, with clean alpha, explicit level selection, measured ground origins, untinted materials and matching placement previews. Camps retain 4×4 placement while home troops can gather on their outer tiles and avoid the central fire pit, buildings, walls, trees and rocks. Higher rock-ring camps leave stone debris; cooking-support camps leave wood debris. Health and upgrade bars follow the actual sprite origin. Exact prompts, source files and importer are documented in [CAMP-ART.md](CAMP-ART.md).

The first 23 focused browser scenarios pass in each engine. An expanded nine-case pass found one new test fixture with an empty army, which correctly could not start practice. Retaining one troop fixes that fixture; all four camp-art cases then pass in Chromium and WebKit, alongside the five previously passing combat-presentation cases. The combined runs provide 29 distinct passing scenarios per engine. Visual review found an immediate phone screenshot could precede the changed scene's render; camp-art captures now wait for `postrender`. The eight-level gallery, upgrade Info, mixed village roster, phone placement and open camp gathering were visually inspected after that correction.

The final production build passes Chromium and WebKit without reported errors, and requires successful loading of all eight camp textures. Chromium reloads, opens Army and plays a replay offline with 107 cached files, cache `crown-clan-75c106fb5d57`. Rebuilding the accepted sources byte-matches all eight committed WebPs.

`performance-check.mjs --camps` now measures native TH8 housing (four level-six camps, 200 one-space troops) separately from the preserved 660-actor legacy roster. The final headless Chromium/SwiftShader sample at 1440×960 measured 40 FPS idle, 37 FPS with 200 troops, 35 FPS with 660 actors and 40 FPS in battle, with 33.4 ms 95th-percentile frames. Host load rose from 4.45 to 8.10 during this sample on 18 logical CPUs. An earlier sample measured 28/39/31/45 FPS, and another browser renderer was observed using several CPU cores afterward. These are shared-host samples, not a controlled regression comparison or a physical-device certification. A reliable 60-FPS result remains unverified; performance, closer native art matching and animated camp fire remain open.

Evidence: `output/playtest/camp-art-verification.json`, `camp-art-unit.json`, `camp-art-chromium.log`, `camp-art-webkit.log`, `camp-art-final-chromium.log`, `camp-art-final-webkit.log`, `camp-art-verified-chromium.log`, `camp-art-verified-webkit.log`, `camp-art-final-build.log`, `camp-art-final-production-report.json`, `camp-art-rebuild.log`, `camp-art-performance.json`, `camp-art-final-performance.json`, `camp-level-gallery-webkit.png`, `camp-open-gathering-webkit.png`, `camp-art-info-webkit.png`, and `camp-cutouts-on-grass.png`.


## September 11 — native camp capacity and progression

All 363 unit tests pass across 36 files, including all 144 campaign attacks. Six dedicated camp cases cover native values, count/level ceilings, actual capacity, paid deadlines, old prepared armies and replay health. A further focused six-case run passes after strengthening the old deadline test: a purchased ten-minute upgrade stays unfinished at five minutes and completes at its saved deadline.

The initial 40-scenario browser selections each passed 39 scenarios in Chromium and WebKit. Both found the same outdated expectation that a second Giant could be added to the corrected starter's 27/30 army. The test now removes the first Giant and verifies that the unlocked Add control becomes available again. All five corrected/focused scenarios pass in each engine, providing 40 distinct passing scenarios per engine across the runs. Camp Info/Upgrade, shop counts, legacy reload and above-capacity remove/add flows are included; phone Info and capacity-warning screenshots were visually reviewed.

The new TH2 village has one completed level-two camp and 30 spaces. Explicit tables now drive camp housing, health, prices, timers, counts and occupant distribution. Existing camps, prepared armies and purchased deadlines are preserved. New recordings use combat version 14; older snapshots retain their original health as incompatible summaries. See [CAMP-PROGRESSION.md](CAMP-PROGRESSION.md). Native per-level camp artwork remains a separate unfinished pass.

Production Chromium and WebKit pass without reported errors. Chromium reloads, opens Army and plays a replay offline with 99 cached files, cache `crown-clan-4e0af935cc71`. The final formatting cleanup builds the identical cache. CI includes the new camp browser cases in its WebKit selection.

Evidence: `output/playtest/camp-progression-verification.json`, `camp-progression-unit.json`, `camp-progression-deadline-unit.json`, `camp-progression-chromium.log`, `camp-progression-webkit.log`, `camp-progression-rerun-chromium.log`, `camp-progression-rerun-webkit.log`, `camp-progression-production-report.json`, `camp-progression-final-build.log`, `camp-progression-info-chromium.png`, and `camp-over-capacity-320-webkit.png`.


## Native army footprints and save recovery — September 11, 2026

All 357 unit tests pass across 35 files. The full Chromium run passed 159 of 161 scenarios. The two failures were an Archer Tower test destination newly blocked by the enlarged camp and a wall-layout test reading a child element after a redraw detached it. The destination now uses clear ground; the layout test reads one DOM snapshot. The final 19 focused scenarios pass in each engine, giving 161 distinct Chromium and 36 distinct WebKit scenarios with passing coverage across the runs. A separate catalog rerun hit its 30-second timeout while both rendering suites were active; batching the level comparisons reduced browser round trips and the revised test passes in both engines.

Army Camp and Hero Hall use 4×4 footprints, proportionately larger artwork, and corrected camp gathering centers. Three campaign placements clear the expanded geometry. Save format 4 validates each historical geometry before relocating conflicts, preserves every accepted building and paid deadline, migrates layout slots and leaves unplaceable imports untouched. Dense tests cover mixed legacy defense/army footprints, fragmented layouts, ongoing obstacle removal, deterministic ordering and an impossible custom import. Startup offers recovery downloads when saved data cannot be opened and never rolls newer unplaceable progress back to an older usable copy. Replay version 13 retains older snapshots as summaries under their original bounds.

Production checks pass in Chromium and WebKit with no reported errors. Chromium reloads, opens Army and plays a replay offline with 99 cached files, cache `crown-clan-5e4a18a5f79f`. The first production attempt could not deploy from six fixed canvas positions; a bounded scan of visible canvas ground now waits for pointer processing and still requires an actual deployed troop. The final formatting build produces the identical verified cache. Phone Camp/Hall previews, mixed camp occupants, and recovery downloads were visually reviewed. These changes correct geometry and reliability; native camp capacity, health, economy and per-level artwork remain unfinished. See [NATIVE-GRID.md](NATIVE-GRID.md) and [CAMP-PRESENTATION.md](CAMP-PRESENTATION.md).

Evidence: `output/playtest/army-footprints-verification.json`, `army-footprints-final-unit.log`, `army-footprints-final-targeted.log`, `army-footprints-chromium.log`, `army-footprints-webkit.log`, `army-footprints-final-chromium.log`, `army-footprints-final-webkit.log`, `army-footprints-production-report.json`, `army-footprints-final-build.log`, `army-footprint-camp-chromium.png`, `army-footprint-herohall-webkit.png`, `camp-roster-phone.png` and `save-recovery-webkit.png`.

## Terrain fitted to the buildable field — September 11, 2026

All 345 unit tests pass. After correcting the clipping issues found during development, all 26 focused browser scenarios pass in each of Chromium and WebKit. These cover all 1,936 buildable tile centers, turf alignment and clipping at all four edges, subsequent world-object rendering, graphics-context restoration, camera coverage, actual placement, building artwork, collection, replay and twenty raid transitions. The terrain asset rebuild check and final production build also pass.

The new 1672×941 backdrop fits at 1.35× world size. The accepted refinement reduces conspicuous grass patches, and a 64×32 repeating turf texture replaces fixed prototype dirt strips. All sampled buildable centers sit on grass; the earlier backdrop failed the same palette check at 18 centers. The first masking approach used a Canvas-only API; the new framebuffer test caught the ineffective WebGL clipping. A later probe caught a stencil-release option that did not inherit the inverted mask setting. The release now explicitly matches those settings, and both browsers verify drawing outside the field after it.

The final production check reports no errors in either browser. Chromium reloads, opens Army and plays a replay offline with 99 cached files, cache `crown-clan-5d332058113c`. Phone, desktop overview and western-boundary screenshots were visually inspected with normal scene objects. The image tool returned 1672×941 despite the initial 4K request; no upscaling or 4K claim is made. Full native scenery composition, building-level artwork and device performance certification remain open. See [TERRAIN-CAMERA.md](TERRAIN-CAMERA.md) and `art/source/terrain-field-v4.json` for source details and exact prompts.

Evidence: `output/playtest/terrain-field-verification.json`, `terrain-field-production-report.json`, `terrain-field-check.log`, `terrain-field-final-build.log`, `terrain-field-verified-chromium.log`, `terrain-field-verified-webkit.log`, `terrain-field-final-phone.png`, `terrain-field-final-overview.png` and `terrain-field-final-west-edge.png`.

## Expanded village and native defense footprints — September 11, 2026

All 345 unit tests pass, including dense legacy migration, saved layouts, damaged-health and paid-deadline preservation, expanded-grid pathfinding and campaign viability. The full Chromium run passed 150 of 154 scenarios. After fixes, 26 focused scenarios pass, covering all four failures and a new deterministic input regression: 155 distinct Chromium scenarios have passing coverage across the full run and follow-up. All 46 focused WebKit scenarios pass. CI now includes the native-grid, building-art and placement-preview cases in its WebKit selection.

The field now has 44×44 buildable tiles, with 3×3 Cannons, Archer Towers and Mortars. Save format 3 relocates conflicting legacy defenses deterministically and reports moved buildings once. Sixteen campaign placements were corrected. Combat version 12 retains older result summaries while refusing playback under changed geometry. Browser testing found an overwritten scene-ready callback hiding the migration notice, an older-backup fixture incorrectly using the current save version, and a redraw that could detach a pressed Save button or interrupt Army category scrolling. These are resolved; the input fix is described in [INPUT-GESTURES.md](INPUT-GESTURES.md).

The final production build passes Chromium and WebKit without reported errors. Chromium reloads, opens Army and plays a replay offline with 98 cached files, cache `crown-clan-272db0eddc04`. Phone placement at (43,43), the normal phone village and the desktop grid overview were visually reviewed. The larger field is usable, but the existing terrain source is softer at its increased display scale. The two-tile simulation border is local; remaining catalog dimensions and per-level artwork still need work. See [NATIVE-GRID.md](NATIVE-GRID.md).

Evidence: `output/playtest/native-grid-verification.json`, `native-grid-production-report.json`, `native-grid-final-check.log`, `native-grid-chromium.log`, `native-grid-fixes-chromium.log`, `native-grid-final-webkit.log`, `native-grid-final-phone.png`, `native-grid-final-overview.png` and `native-grid-far-corner-webkit.png`.

## Placement preview follows the active pointer and camera — September 11, 2026

All 22 targeted browser scenarios pass in each of Chromium and WebKit after the placement follow-up. Coverage includes stationary-pointer keyboard pan, zoom and viewport resize; DOM shop pointer retention through a scene refresh; return to canvas input on release; actual shop placement by tap/drag; touch input; phone layouts; and the building-art cases. The earlier appearance pass completed 338 unit tests and 27 browser scenarios per engine (46 distinct browser scenarios across the two phases).

The final production build passes both engines without reported errors; Chromium also reloads, opens Army and plays a replay offline with 98 cached files, cache `crown-clan-300ec5409ef6`. The new regressions reproduced a stale preview after a camera transform and a 440-world-pixel jump to an outdated canvas pointer during a shop drag. Holding the economy clock ensures its periodic refresh cannot mask the camera defect.

The preview sprite and footprint now use the same snapped tile and validity result each frame. A phone capture after zooming a stationary cursor shows the upgraded Gold Mine over the blocked footprint; the measured anchor error is zero world pixels. See [BUILDING-PRESENTATION.md](BUILDING-PRESENTATION.md). Evidence: `output/playtest/placement-preview-verification.json`, `placement-preview-production-report.json` and `placement-camera-phone-webkit.png`.

## Consistent building artwork during movement — September 11, 2026

All 338 unit tests and 27 targeted browser scenarios in each of Chromium and WebKit pass. The production build passes both engines with no reported errors; Chromium also reloads, opens Army and plays a replay offline with 98 cached files, cache `crown-clan-f0d4678aece6`.

Moving previews retain the placed building's level artwork, size and ground anchor, and refresh when a paid upgrade finishes. The progression panel uses the artwork for its displayed level. The initial catalog check reproduced the old shrinking preview; the corrected run compares every building kind at four requested levels. A phone relocation checks blocked placement, cancellation, actual pointer placement and reload without resource or builder changes. Its first proposed destination overlapped a Gold Mine; the corrected fixture uses clear village tiles.

Visually reviewed the phone Archer Tower moving preview and the TH5 progression card. See [BUILDING-PRESENTATION.md](BUILDING-PRESENTATION.md) for implementation and remaining artwork limits. Evidence: `output/playtest/building-appearance-verification.json`, `building-appearance-production-report.json`, `upgraded-building-move-*.png` and `progression-level-art-webkit.png`.

## Wall balance, free placement and early Cannon progression — September 11, 2026

All 338 unit tests pass. The health/free-placement/TH1 Cannon pass completed 39 targeted browser scenarios in each of Chromium and WebKit. The subsequent TH5 elixir correction completed nine Wall scenarios in each engine, including one new case (40 distinct scenarios covered across the two phases). The final production build passes both engines without reported errors; Chromium also reloads, opens Army and plays a replay offline with 98 cached files, cache `crown-clan-bf593c648a1d`.

Walls use the official reduced level-1–7 health values. New pieces cost zero, remain placeable with an empty treasury, and stop at the Town Hall count limit. TH1 supports two Cannons and their level-2 upgrade. Saved damaged Walls retain their damage fraction after health reconciliation; paid legacy deadlines survive reload. Combat version 11 prevents playback of recordings made under the older Wall health rules while preserving their summaries.

Supercell’s TH5 elixir announcement resolves the conflicting community prose: level 4 → 5 Walls can use elixir. Exact-budget selection works with zero gold, mixed rows containing lower-level pieces reject elixir without partial charges, and successful upgrades persist without timers or reserved builders. See [WALL-PROGRESSION.md](WALL-PROGRESSION.md) and [DEFENSE-SOURCE-AUDIT.md](DEFENSE-SOURCE-AUDIT.md) for sources and remaining limits.

Phone screenshots were visually reviewed for the actual free Wall shop tile, destination health, and elixir-funded group controls. The shop evidence initially captured the horizontal list before the Wall tile was scrolled into view; the capture now explicitly reveals that tile. Earlier test fixtures were updated for free placement, earlier Wall destruction and the reduced health of a Wall Breaker target. Evidence: `output/playtest/wall-current-verification.json`, `wall-current-production-report.json`, `free-wall-shop-*.png`, `th5-elixir-walls-*.png` and `th1-cannon-gate-*.png`. Native footprints, the full catalog, remaining building/troop balance, artwork and online systems are still incomplete.

## Defense source reconciliation — September 11, 2026

All 335 unit tests pass after updating the five defense cost/time tables and the official low-level Cannon health/damage values. The full Chromium run passed 142 of 143 scenarios; its only failure expected the obsolete six-hour Air Defense level-2 timer. The corrected two-hour assertion then passed in Chromium and WebKit, giving all 143 Chromium scenarios passing coverage across the full run and targeted rerun. Nineteen focused WebKit scenarios pass. Production checks pass in both engines with no reported errors, including offline reload, Army and replay in Chromium with 98 cached files.

Migration checks cover old paid construction and upgrade deadlines across reloads: reaching the newly shortened duration cannot finish a previously purchased job early or charge it again. Actual projectile tests verify every accepted Cannon damage tier. The Lightning damage fixture now uses level-4 Cannons so their health exceeds the fixed spell damage, preserving the test's full-damage assertion. Combat version 10 identifies the Cannon correction and retains incompatible result summaries.

Phone Cannon and Wizard Tower Info screens were visually reviewed for health, fractional damage, revised prices/times and control reachability. See [DEFENSE-SOURCE-AUDIT.md](DEFENSE-SOURCE-AUDIT.md) for the rejected stale entries, source limitations and next Wall/TH1 corrections. Evidence: `output/playtest/defense-current-verification.json`, `defense-current-production-report.json` and `*-progression-*.png`.

## Trap progression and vertical spring feedback — September 11, 2026

All 330 unit tests pass, including exact trap price boundaries, instant placement with occupied builders, paid upgrade reloads, accepted legacy levels, blast-radius edges, spring targeting and half hero damage, healing during stun, and campaign viability. Eighteen browser scenarios pass in each of Chromium and WebKit, covering the four phone placement/upgrade flows, hidden traps, replay playback, effect timing and vertical spring presentation. The production build passes both engines without reported errors; Chromium also reloads, opens Army and plays a replay offline with 98 cached files.

The spring arc follows battle time, pauses without drifting, and becomes stationary with reduced motion. Visual review exposed two simultaneous activation labels and sounds; instantaneous springs now emit only their spring feedback, with a browser regression assertion. Phone Info screenshots were checked for damage, growing Giant Bomb radius, spring capacity and upgrade prices/timers. Combat version 9 keeps older summaries while refusing incompatible playback.

The initial new browser fixture used an ambiguous upgrade selector; scoping it to the Info panel resolved the fixture failure. Source reconciliation rejected stale trap references and also exposed a need to re-audit the earlier defense price/time tables. Remaining timing and art limits are explicit in [TRAP-PROGRESSION.md](TRAP-PROGRESSION.md). Evidence: `output/playtest/trap-verification.json`, `trap-production-report.json`, `*-audit-*.png` and `spring-toss-*.png`.

## Air Defense and Wizard Tower — September 11, 2026

All 307 unit tests pass after replacing prototype health, damage, prices and timers with explicit level tables. Twenty-five browser scenarios pass in each of Chromium and WebKit, covering all five defense Info panels, paid upgrade reloads, shop gates, traps, village editing, replay playback, seeking and file sharing. The production build passes both engines with no reported errors; Chromium also reloads, opens the Army drawer and plays a replay offline with 98 cached files.

New combat checks exercise every accepted Air Defense/Wizard Tower damage level, range edges, firing cadence at 20/30/60 fps, inactive upgrades, air-only single-target rockets, rocket impact after launcher destruction, and Wizard Tower's exact one-tile splash boundary on both layers. An existing hero replay fixture needed extra defensive crossfire to reach automatic Iron Fist under the corrected tower health/damage. The replay is still compared exactly against its recording. Combat version 8 preserves older result summaries while refusing incompatible playback.

Phone screenshots were visually reviewed for fractional damage, prices, timers and the singular “1 tile” label. See [AIR-WIZARD-PROGRESSION.md](AIR-WIZARD-PROGRESSION.md) for source values and remaining limits. Evidence is recorded in `output/playtest/air-wizard-verification.json` and `air-wizard-production-report.json`.

## Mortar artwork — September 11, 2026

Six original level sprites replace the two atlas tiers across the village, Info, paid upgrades and moving previews. All 282 unit tests pass. Eighteen targeted scenarios pass in each of Chromium and WebKit, including all six muzzle anchors, airborne shells after launcher destruction, reduced motion, replay seeking and shared defense presentation. Production checks pass in both engines; Chromium reloads, opens the Army drawer and plays a replay offline with 98 cached files. All six new Mortar textures are explicitly required by the production check. The deterministic asset check also passes.

Visual review covers transparent edges against grass, a six-level gallery, the phone Info panel and shell flight. The first new Info test incorrectly tried to reopen a still-open sheet after an upgrade; it now checks the live update. Source alpha near 253 was normalized to full opacity, and generated checkerboard backgrounds were rejected. See [MORTAR-ART.md](MORTAR-ART.md) for provenance and remaining fidelity limits. Detailed evidence is in `output/playtest/mortar-art-verification.json`.

## Earlier milestones

Verified locally on September 10, 2026. The hero/progression pass has **99 passing simulation/save tests**, a successful production build, and **71 precached files**. All **43 browser scenarios** pass across the full run and targeted rerun: the first run passed 40/42, revealing one obsolete Town Hall expectation and a real phone Army-menu clipping bug. After fixing both and adding a dark-elixir collection case, all 22 affected hero/army/expansion/specialist scenarios passed. Other scenarios retained their passing full-run result.

Production checks in Chromium and WebKit pass for boot, shop, research, tab handoff, imported hero saves, gem-finished hero upgrades, pointer deployment and H-key ability use. Chromium also reloads and plays the upgraded hero offline with cached artwork. Reports: `output/playtest/production-report.json` and `hero-production-report.json`. Run `node scripts/production-check.mjs` and `node scripts/hero-production-check.mjs` after a build with the development and preview servers running.

## Defect audit — economy, persistence, editing and escaping (September 11, 2026)

Regression coverage now includes the following economy, persistence, editing and imported-content safeguards. The current verification results are recorded in `output/playtest/replay-audit-verification.json`; older pass counts below describe earlier milestones.

- **Free resources from every new producer.** `makeBuilding` seeded 1,800 stored resources for mines and collectors — intended only for the opening village, but `place` uses the same helper. A Gold Mine cost 1,800 elixir and paid back 1,800 gold; a Collector did the reverse. New buildings now start empty and `initialSave` seeds its own.
- **Collecting from buildings that were not finished.** `collect` tested only `stored >= 1`, so the Collect button drained a mine that was still under construction or mid-upgrade — the renderer already suppressed the bubble for those, so the model and the view disagreed. Collection now skips anything with a timer running.
- **A raid abandoned by closing the tab spent the army for nothing.** Troops leave the camps on deploy and the battle is not part of the save, so a refresh or an app switch lost them with no loot, trophies or stars. `suspendBattle` now settles an attack that has committed troops exactly as surrendering does, and leaves a scouted-but-untouched attack free.
- **Markup in an imported village reached the DOM.** `validateSave` accepts any layout name, and the layout panel interpolated it into `innerHTML` unescaped, unlike the army preset names beside it. The name is now escaped; a browser scenario imports a scripted name and asserts no element is built from it.
- **Restoring a layout could stack two buildings on the same tiles.** Stored arrangements say nothing about buildings raised since, and neither the restore nor save validation checked, so the corruption survived a reload. Restores, undo and redo are now applied only as a whole, and refused with an explanation otherwise.
- **Wall builder rules were inconsistent.** Gold/elixir upgrades and new placement require a free builder, complete instantly, and never reserve that builder afterward.
- **Empty collections all reported the same reason.** Full storages, a Dark Elixir Drill with no storage to empty into, and an unfinished building each said "your collectors are working". Each now names what is actually blocking it.
- **Loot bars promised more than the raid could bank.** `finishBattle` clamped the award to storage headroom while the bars showed the full amount, so a 100% raid into full storages read 8,500 gold during the battle and 0 on the result. Headroom is captured at the start of a campaign attack and the bars, the result and the award now agree. Replays keep showing what the recorded attack earned.

Not changed: dark elixir still needs a Dark Elixir Storage before any can be kept, which is deliberate and separately tested. Only the silent failure around it was fixed.

## Hero and progression pass

- Added 12 model cases covering Hero Hall completion, TH4/TH7/TH8 gates, dark-elixir charges, builder reservations, one-time offline completion, gem finishes, legacy and malformed saves, dark drill downtime and overflow, hero-only combat, duplicate/blocked deployment, ability healing/rage/summons, automatic activation, spring damage/no ejection, defeat/reuse, history, independent building ceilings, and construction/upgrade affordability at every supported tier.
- Added five browser cases covering new art and shop gates, the progression panel, upgrade persistence, real pointer deployment and keyboard ability activation, fresh repeat attacks, portrait/landscape controls, dark collection and reload.
- Fixed the expanded Army action list clipping its first buttons behind the phone drawer header. Actions use a two-column grid and remain scrollable in short viewports. Rechecked existing army/preset and specialist flows.
- Hero-card health updates preserve the actual button node until its interaction state changes. Disabled/spent/dead states update without replacing the card on every economy tick.
- Production hero checks exercise actual import, upgrade, finish, practice, deployment and ability controls; production needs no development model exposure. Chromium repeats this flow offline. Both engines report no browser or asset errors.
- Screenshots under `output/playtest/`: `heroes-desktop.png`, `heroes-mobile.png`, `heroes-landscape.png`, `hero-battle-desktop.png`, `progression-desktop.png`, `progression-mobile.png`, `dark-elixir-village.png`, and `production-hero-*.png`.
- The first screenshots caught a modal mid-animation; final visual captures disable CSS animation. Reviewed source sprites, desktop hero panel/battle, and phone hero/progression panels.
- Reference rules, local balance choices, migration behavior and remaining features are documented in [HERO-PROGRESSION.md](HERO-PROGRESSION.md). Source artwork and exact generation prompts are in [HERO-ASSETS.md](HERO-ASSETS.md).

## Defense and trap pass

- Added 13 simulation/save cases in `tests/defenses.test.ts` for trap placement and count/unlock gates, collisions, construction and upgrades, save round trips and level rejection, concealment, path/deployment exclusion, troop targeting, Bomb/Giant Bomb fuses and escape, air-only tracking splash, single-target springs, ejected death-bomb suppression, oversized knockback, collision-safe pushback, anti-stacking, bomb damage during spring knockback, inactive upgrading traps, fresh practice arming, spell immunity, full-clear scoring, and Wizard Tower targeting/splash.
- Added five browser cases in `tests/browser/defenses.spec.ts`: missing-asset detection and correct shop unlocks; pointer placement, trap info, upgrade and reload; concealed practice traps, pointer activation and repeat reset; phone portrait/landscape controls; campaign miniature concealment and visible Wizard Towers.
- Fixed small ground-trap selection beneath neighboring rooftops, selected shop-category visibility after redraw, and the initial position of a troop ejected before its first rendered frame.
- Original generated RGBA sources are preserved outside the production build. The five shipped WebPs are built with `scripts/defense-assets.mjs`; prompts and source paths are in [DEFENSE-ASSETS.md](DEFENSE-ASSETS.md). Rebuilding all five sprites produced identical SHA-256 hashes (`output/playtest/defense-asset-hashes.json`).
- The 144-battle campaign audit passes after adding traps to stages 2–12 and Wizard Towers to stages 6, 8, 10 and 12. Every stage has a three-star veteran approach, stage 1 remains approachable, and starter armies cannot fully clear the final fortress. The final defense multiplier changed from 1.7339 to 1.55 to offset the new defenses.
- Visually reviewed desktop and phone trap shop, trap information in portrait/landscape, activation in practice, and a campaign Wizard Tower. Screenshots: `traps-shop-desktop.png`, `traps-shop-mobile.png`, `trap-info-desktop.png`, `trap-info-mobile.png`, `trap-info-landscape.png`, `trap-trigger-practice.png`, and `wizard-tower-campaign.png` under `output/playtest/`.
- Live-game costs/timers, exact catalog progression, additional defense and trap types, physical-device performance, and asynchronous defensive attacks remain outside this pass. The enlarged tank fixture tests a future oversized troop branch; the current roster itself has no troop above the spring capacity.

## Army preparation and practice pass

- Added 15 simulation/save tests for free instant preparation, weighted spell housing, editing and underflow, active-battle guards, one-time legacy queue migration, preset capacity and persistence, bounded names, atomic replenishment, practice isolation, campaign results, and the twenty-entry battle log.
- Added five browser tests for real add/remove controls, spell capacity, preset names and reload, practice deployment/casting/surrender, repeat attacks, log persistence, and portrait/landscape results.
- Fixed a redraw race that could replace an in-progress preset name. Unsaved input survives rerenders and is cleared when importing another village.
- Reset scene objects when the battle instance changes, including an immediate result-to-repeat transition. If replenishment fails because a facility is upgrading, repeat attack returns to the Army drawer instead of starting with an incomplete composition. Practice also preserves imported resources above current storage caps.
- Screenshots: `quick-armies-desktop.png`, `quick-armies-mobile.png`, `practice-desktop.png`, `practice-mobile.png`, `practice-result-desktop.png`, `practice-result-mobile.png`, `practice-result-landscape.png`, `campaign-result-landscape.png`, `battle-log-desktop.png`, and `battle-log-mobile.png`, under `output/playtest/`.
- Remaining system-level differences and next priorities are explicit in [EXPERIENCE-PARITY.md](EXPERIENCE-PARITY.md). Passing these tests does not imply complete CoC parity.

## Specialist raiding pass

- Added 13 simulation/save tests in `tests/raiding.test.ts`: Goblin preference and double damage, fallback targeting, path-aware wall breaching, a single explosion per Wall Breaker, weaker researched death bombs, no-wall fallback, training/research/replenishment, mortar blind spot and air immunity, delayed splash and dodging, shells surviving the firing mortar, defense target retention, partial resource looting, full-clear loot, and version-2 save migration.
- Added five browser tests in `tests/browser/raiding.spec.ts`: troop portraits and details, training plus reload, troop/spell hotkeys and actual deployment, mobile tray bounds and selected-card visibility, older-backup import, and enemy mortar inspection during scouting.
- Updated old fixed army fixtures to contain zero of the new troop types, retaining the existing 144-battle campaign balance audit.
- The new sprites use their original generated alpha, with a procedural bob and attack impulse instead of a directional walk atlas.

## Earlier automated coverage (army and practice baseline)

- **74 simulation and save tests pass.** Placement collisions and bounds, construction completion, builder reservations, upgrades, offline resource caps, production resuming after upgrades, storage saturation, instant troop preparation, camp capacity, malformed-save rejection, A\* navigation, deployment boundaries, a complete opening battle, one-time quest rewards, crowd separation, corrupted backup recovery, and IndexedDB unavailability. Research is gated by laboratory level, charges once, completes offline once, and increases deployed troop health and damage. Batch preparation is atomic, troops and spells cost no elixir, and army replenishment checks both housing limits before changing either composition.

  New in this pass:
  - **Scouting phase** — the battle clock holds for thirty seconds, starts on the first deploy, and starts on its own when scouting expires. `deployBlocked` is asserted to be the same predicate the red boundary is drawn from, so the line the player sees and the rule the model enforces cannot drift apart.
  - **Air layer, in both directions** — a ground-only cannon leaves a balloon untouched over 6 seconds of simulation; an air defense leaves a swordsman untouched over the same window; an air defense does tear into a balloon. A wall line stops a ground troop and takes damage from it, while a balloon crosses the same line and leaves every segment at full health.
  - **Spells** — brewing respects spell factory capacity and refuses (without charging) beyond it; Lightning damages every building inside its radius exactly once and nothing outside it; Rage measurably increases damage dealt over a fixed window against an identical control run; Healing restores a wounded troop standing inside it without exceeding its maximum; auras expire and stop applying.
  - **Town Hall gating** — independent per-building TH1–8 ceilings now control upgrades and first unlocks. Info panels report the next required Town Hall. Building counts remain locally tuned.
  - **Timer and gem curves** — upgrade seconds increase monotonically per level, a late Town Hall upgrade exceeds an hour, and the gem curve hits its documented anchors (1 gem at a minute, 20 at an hour, 260 at a day).
  - **Edit mode** — dragging relocates, occupied ground is refused without mutating the building, undo and redo restore exact positions, three layout slots store and restore, and the state stays valid throughout.
  - **Save migration** — a version-1 village fails validation, migrates cleanly, keeps its gold and its existing troop levels, gains `balloon: 0` and an empty spell book, and loads into a working model. A building level above that building's maximum is rejected.
  - **Second pass** — the wall tool re-arms after each segment and puts itself down when the next one is unaffordable; a felled balloon damages the buildings inside its radius exactly once and nothing outside it; a drag across four tiles is a single undo step; research climbs to level 5 behind a matching laboratory and stops there, with the laboratory ceiling asserted equal to the troop ceiling; the tutorial's `built` counter ignores walls, its `trained` counter follows batch size, and a battle's carried spell book keeps a slot recorded after the spell is spent.

- **33 browser tests pass in Chromium.** Boot, collection, pointer selection, upgrading and gem completion, save persistence through reload, shop filtering, placement and cancellation, instant army preparation, actual troop deployment and simulated battle results, campaign unlocking, settings, modal keyboard focus, camera zoom/pan/reset, portrait layout, landscape layout, touch selection, stable sheets during passive resource ticks, export, valid import, invalid import rejection, research at desktop/phone sizes, research persistence, exclusive tab handoff with the newest save, forced WebGL context loss/restoration, and twenty consecutive raids with object cleanup and a final save reload.

  New in this pass:
  - The shop **drawer** is asserted not to block the playfield (`scene.uiBlocked === false`), while a real dialog still does.
  - A building is placed **twice** — once by tapping its price and then tapping the map, and once by dragging the tile art out of the drawer and dropping it on the village — with the building count checked after each.
  - **Drag-deploy**: a press-then-drag across the grass deploys more than two troops along the path and starts the battle; a **double-tap** on one spot deploys five.
  - The **scouting banner** is visible before the first deploy and gone after it, and the destruction bar appears once the battle is live.
  - A **spell** is selected and cast, and the resulting aura is confirmed in the model.
  - **Surrender** opens a confirmation, "Keep fighting" dismisses it, and confirming produces the result screen.
  - The **info sheet** renders its stat table with exactly two improved rows for an Air Defense (hitpoints and damage, not range or attack speed) and shows a real cost and build time.
  - **Edit mode** is driven with the mouse: a building is dragged to a new tile, undo restores it, redo re-applies it, and a layout slot stores more than forty positions.
  - **Town Hall gating** is checked in the shop: a locked building's buy button is disabled and its tile carries no drag handle until the Town Hall is raised.
  - **First-run coaching** shows step 1, rings the Collect button, advances to step 2 and moves the ring to the Shop once a collection lands, marks a filled store with `.full`, and stays dismissed across a reload after Skip.
  - **Wall runs**: three walls are laid with three taps without reopening the shop, the placement banner survives each one, and Escape puts the tool down.

- **Production smoke checks pass in Chromium and WebKit.** The optimized build boots, renders the game, and opens the shop drawer and the laboratory without JavaScript errors. A second tab waits and resumes after the owner closes in both engines.
- **Offline reload passes in Chromium.** The service worker pre-caches the complete production asset manifest (62 files); a disconnected reload renders the village and opens the army drawer. Cache matching tolerates Vary headers on these same-origin static files. Cached assets include local fonts.
- The earlier full rebuild verified the original 46 shipping images. The two added specialist sprites were also rebuilt and checked for identical SHA-256 hashes; both retain genuine alpha transparency.
- TypeScript checking and the Vite production build pass.

## Campaign and endurance evidence

`output/playtest/campaign-balance.json` records 144 complete fixed-step battles: 12 stages × 3 army compositions × 4 starting approaches. All twelve authored layouts are distinct and every occupied tile is checked for overlaps and bounds.

| Army      | Composition (swordsmen / archers / giants / wizards) | Research | Spaces |
| --------- | ---------------------------------------------------- | -------- | -----: |
| Starter   | 14 / 12 / 3 / 3                                      | Level 1  |     53 |
| Developed | 18 / 18 / 8 / 6                                      | Level 2  |    100 |
| Veteran   | 20 / 20 / 16 / 10                                    | Level 3  |    160 |

These are deliberately **ground-only, spell-free** armies, so the matrix measures the same thing it did before the air layer and spells were added. The starter army clears the opening stage, the veteran army clears every stage from all four tested approaches, and the starter army cannot three-star the final fortress. They do not establish balance for every player strategy, and in particular they do not measure balloon-led or spell-supported attacks.

Air defenses were added to stages 5–12 (one each for 5–8, two each for 9–12). Because they cannot fire at ground troops, they are pure additional structure for these ground armies — they raise the bar for 100% destruction without adding threat. Defense damage now scales 12% per building level, and the per-stage `defense` multipliers were divided by the level factor for each stage's enemy tier, so enemy output is unchanged and this matrix stays comparable with the previous run.

The twenty-raid browser check runs full simulated battles, enters results, returns home, and samples scene object counts after effects expire; the recorded counts are in `output/playtest/raid-endurance.json`. Accelerated battles are a transition/cleanup check, not a multi-hour memory certification.

The session mechanism uses an exclusive origin-scoped browser lock; see [Web Locks API documentation](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API). Only the owner loads and mutates a village. The waiting page acquires ownership after the first tab closes. This requires HTTPS or a trustworthy local origin.

## Performance evidence

Headless Chromium on the local macOS workstation, 1440×960 viewport, device scale factor 1, four-second sampling windows:

| State                                  | Mean frame rate | 95th percentile frame duration |
| -------------------------------------- | --------------: | -----------------------------: |
| Village, decorative troops active      |          59 FPS |                        16.8 ms |
| Opening battle, starting army deployed |          57 FPS |                        16.8 ms |

The specialist-pass sample records 59 FPS in the village and 57 FPS with the full starting army, including Goblins, Wall Breakers and Balloons. Both 95th-percentile frame times were 16.8 ms. These are local observations, not a physical-device performance guarantee. Re-run `node scripts/performance-check.mjs` against the development server for a new report.

The defense-pass static build is approximately 4.2 MB on disk. Its 53 optimized game images occupy approximately 2.6 MB. Original PNGs stay outside the shipped build. The Phaser engine is separately cacheable, approximately 357 KB gzipped; application JavaScript is approximately 45 KB gzipped.

## Visual review

This pass also checks the Goblin and Wall Breaker details on desktop and phone, the expanded army drawer, battle tray scrolling, mortar range inspection, and the phone timer/loot/scouting layout. The redundant delayed welcome toast was removed so it cannot obscure a dialog or scouting controls.

Screenshots in `output/playtest/` cover the home village, the shop and army drawers, the campaign, the scouting phase, an active battle with a red boundary and a cast spell, victory, edit mode, the saved-layouts panel, the building info sheet, mobile portrait, touch-selected buildings, landscape phone, Chromium/WebKit production shop, offline army drawer, and the laboratory on desktop and phone. Reviewed for alpha artifacts, consistent scale and anchors, HUD obstruction, responsive dialog bounds, selection readability, wall connections, and troop animation.

Resolved in the second pass:

- The deployment-boundary cache was keyed only on surviving building ids, so two stages with the same ids and the same survivor count could show a stale outline; the stage index is now part of the key.
- Edit mode recorded one undo entry per tile crossed, so reversing a single drag took as many presses of undo as tiles; a drag now opens exactly one entry.
- A tap that could not deploy still armed the double-tap window, so the next tap deployed five where the player expected one.
- The laboratory could be upgraded to level 8 while research stopped at troop level 3, leaving four levels that bought nothing. Research runs to troop level 5. The new Town Hall progression pass allows laboratory level 6 at TH8; research beyond troop level 5 remains unfinished.
- `retrain` returned a bare `undefined` when it had brewed spells but no troops to train, which read as a silent failure.
- Relocating a building outside edit mode pushed an entry onto an undo stack nothing could reach.

Resolved during the first pass:

- The red deployment boundary was first drawn in the overlay layer and crossed over rooftops; it now draws in a ground-marks layer beneath every building.
- Opening the building info sheet cleared the very selection it describes, because every panel ran `model.cancel()`; the info panel now preserves it.
- The shop tile's price button also started a drag, so a single tap ran `beginBuild` twice; the price button is now a tap target and the rest of the tile is the drag handle.
- Battle labels ("Total destruction", the loot caption) were unreadable over bright terrain and now carry a stronger shadow; loot totals moved inline onto their bars.
- The scouting banner overlapped the toast strip and moved below it.
- The edit-mode caption and hint collided with the toolbar; the hint folded into the caption and the caption moved to the top.
- Starting gold initially exceeded the starting storage capacity, which silently made collection a no-op.
- The starting village's air defense was first placed on ground the shop tests build on.

Resolved in the previous pass (retained):

- Rejected an animation sheet with a baked-in checkerboard; normalized a real-alpha replacement.
- Corrected atlas extraction order and cell boundaries.
- Added continuous wall connections and a coherent fortification layout.
- Kept menus mounted during passive resource ticks and kept the import file input outside replaced dialog markup.
- Restored keyboard focus to current DOM controls after modal closure; made the background HUD inert beneath dialogs.
- Prevented a corrupt local backup from hiding a healthy IndexedDB save.
- Fixed cached-module misses caused by Vary headers during disconnected reloads.
- Stopped upgrading collectors from producing during their construction interval.
- Added deterministic troop separation and consistent attack/death feedback.
- Replaced repeated enemy layouts and eliminated overlapping enemy footprints in later stages.
- Added explicit troop research and removed the hidden laboratory damage multiplier so displayed troop damage matches normal attacks.
- Protected saves from concurrent tabs, including reloading the latest state when ownership transfers.

The visual review also covers the first-run coaching banner (`coach-desktop.png`), the player profile and achievement list (`profile-desktop.png`), and the five-level research panel (`research-desktop.png`).

## Known limits

- Army preparation is now free and instant. Build, upgrade, and research prices/timers still use a simplified local economy. Factory capacity grows by two housing spaces per level; exact live-game progression remains unimplemented.
- The campaign matrix does not cover balloon-led, specialist-led, or spell-supported attacks; focused interaction tests cover the new specialists.
- Specialist health/damage and the resource loot shares are tuned for this local campaign, not the current live game economy.
- Air troops have a float cycle but no distinct attack or death animation.
- Most buildings share base artwork at levels 1–4 and final-tier artwork at level 5 and above. Walls have distinct artwork at levels 1–8 and Mortars at levels 1–6; the other buildings still need per-level art.
- Physical iOS/Android performance, multi-hour sleep/resume endurance, and accessibility review remain release gates.

## Replay audit — September 11, 2026

- Recording, seeking, speed controls, portable files and read-only playback are covered by model tests and real browser input in Chromium and WebKit.
- Version 4 records raid-limited storage headroom. Regression cases compare final loot and results, verify that home research uses home levels while watching, and bound tiny-step playback and reconstruction work.
- Imported replay limits preserve older recordings as incompatible summaries. Unsupported new recordings are omitted without invalidating the village save.
- Portrait and landscape playback targets are at least 44 CSS pixels; the 320px layout and 844×390 production view were visually reviewed.
- `npm run test:production` now records a practice attack through the canvas, watches/seeks/restarts/exits the replay in Chromium and WebKit, compares home resources/army, and reopens the saved recording offline in Chromium.
- Reports and screenshots: `output/playtest/replay-audit-verification.json`, `production-replay-*.png`, and `replay-controls-*.png`.
