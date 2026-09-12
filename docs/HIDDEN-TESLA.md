# Hidden Tesla audit

The game uses native Tesla polygons, texture pixels and timeline data for all 17 source levels. Home Village purchases retain the existing Town Hall 7–8 ceilings: two towers up to level 3 at TH7, three up to level 6 at TH8. Higher levels are supported entities in campaign data and portable replays. The playable native campaign remains its first 50 villages; Invaders still requires the unsupported Bomb Tower level 3.

## Pinned source and combat values

Client **18.400.21**, public asset bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`. [The native reference](../reference/tesla/README.md) records SHA-256 pins for the building/global/effect/particle CSVs, SC graph, SCTX textures and five original sounds. `reference/tesla/combat.json` supplies every row below directly to the runtime. Values are undiscounted destination-level costs and timers.

| Level | HP | DPS | Gold to build/upgrade | Seconds | Required TH |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 600 | 34 | 250,000 | 7,200 | 7 |
| 2 | 630 | 40 | 350,000 | 10,800 | 7 |
| 3 | 660 | 48 | 500,000 | 14,400 | 7 |
| 4 | 690 | 55 | 600,000 | 21,600 | 8 |
| 5 | 730 | 64 | 800,000 | 43,200 | 8 |
| 6 | 770 | 75 | 1,200,000 | 86,400 | 8 |
| 7 | 810 | 87 | 1,400,000 | 108,000 | 9 |
| 8 | 850 | 99 | 1,600,000 | 129,600 | 10 |
| 9 | 900 | 110 | 2,100,000 | 151,200 | 11 |
| 10 | 980 | 120 | 3,000,000 | 172,800 | 12 |
| 11 | 1,100 | 130 | 3,100,000 | 216,000 | 13 |
| 12 | 1,200 | 140 | 3,700,000 | 259,200 | 13 |
| 13 | 1,350 | 150 | 5,100,000 | 302,400 | 14 |
| 14 | 1,450 | 160 | 6,500,000 | 345,600 | 15 |
| 15 | 1,550 | 170 | 8,200,000 | 432,000 | 16 |
| 16 | 1,650 | 180 | 15,000,000 | 604,800 | 17 |
| 17 | 1,750 | 190 | 25,000,000 | 1,123,200 | 18 |

The source specifies a 2×2 footprint, `Hidden=TRUE`, trigger radius 600, attack range 700, attack speed 600 ms and both ground/air targeting. Local distance units divide by 100. Damage is DPS × 0.6. No projectile is configured; instantaneous damage remains the local interpretation of the attack/hit effects.

## Battle behavior and recordings

- Home Teslas are visible. Completed towers start concealed in each attack. Constructing and upgrading towers remain visible and damageable but cannot fire.
- A living ground or air troop within six tiles of the tower center reveals it permanently. Offensive units discard their target and route; healers retain their friendly assignment.
- Concealed towers do not appear in deployment boundaries, pointer picking, scouting text or campaign miniatures. Navigation, crowd separation and offensive target selection ignore them. Central damage handling rejects direct, splash and spell damage, including Lightning stun.
- All towers count toward destruction. Surviving hidden towers reveal when displayed destruction exceeds 50%, meaning 51% with the local floor-based percentage. The source global alone does not prove native fractional rounding.
- An emerged tower hits one eligible ground or air target immediately, then at 0.6-second intervals within seven tiles. It retains the target until death or range loss. P.E.K.K.A receives ordinary damage and priority. Lightning interrupts attacks like other defenses.
- Battle reveal timestamps drive the native presentation. Replay version 32 remains unchanged because this integration preserves the existing simulation for levels 1–6. Export/import and seeks reconstruct the same reveal, HP and attack results, including supported level-17 fixtures. Home purchase ceilings remain independent of replay entity validation.

## Live presentation

`src/game/tesla-poses.ts` samples the retained graph. Source coordinates use a uniform scale of 1.2 and anchor `(0, 40)` relative to the local footprint center. DOM and placement portraits are original source polygons rendered at density 2; their 320×380 canvases have explicit transparent margins. Live selection and progress bars use foreground bounds, including separate construction and ruin bounds.

- The original reveal is 18 frames at 24 fps. Its first frame is empty, followed by opening trapdoors, rising tower parts and the separately rendered `tesla_appear_fx` dust/debris clip.
- Once raised, the root holds source frame 17 while the named `idle_electricity` child advances from its placement time. This keeps the original final composition visible across idle loops. The handoff is a documented local interpretation: the native executable's reveal-to-setup transition has not been observed, and the level-17 setup/trigger electricity exports differ.
- Native additive electricity groups use isolated GPU buffers through `NativeSceneView`. All source polygon transforms, color transforms, texture sampling regions and draw ordering are preserved. Home idle uses the home render clock; battle and replay use battle time. Camera zoom controls physical buffer resolution.
- Construction uses `teslatower_const`; upgrades combine the static setup body with `teslatower_upg`. Both source scaffold timelines repeat a single composition. The generic construction crane is removed for this building.
- Destruction uses frame zero of `destroyedBuilding_2s_pit_wood`. Its six frames are alternate compositions, so the local renderer holds one rather than cycling through rubble variants. Native variant selection remains unverified. The original ground hole and wood replace the generic ruin sprite/shadow, including destruction during emergence.
- The original `tesla_appear_01.ogg` plays at source volume 70% and pitch 100%, subject to the shared mixer gain. A stable battle cue supports pause, replay speed and rewind; it joins the existing Santa/X-Bow sample synchronization.
- Reduced motion shows the fully raised body immediately, suppresses idle electricity and reveal debris, and retains the reveal audio. Seeks to scouting destroy concealed scene objects and group buffers. Battle transitions and scene shutdown dispose their retained objects/listeners.

## Remaining fidelity work

The lightning beam and attack crackle are still locally authored. The native import contains arc, secondary attack and hit-particle exports plus zap/pickup/drop sounds; their emitter behavior, trajectory registration, random row selection and audio scheduling still need integration. Additional grass emission and native reveal camera shake are also pending. The temporary beam uses the source body extent for its muzzle and a local rise interpolation.

Original asset pixels and sampled scene compositions have independent source-reference tests; complete native-client frame equivalence is not established. World projection, reveal handoff, damage timing, retarget semantics and ruined-frame choice need native executable evidence. Physical device qualification and WebKit offline behavior also remain unchecked.

## Verification

`tests/tesla-art.test.ts` checks all 17 held reveals, independent idle clocks, backward/long seeks, reduced motion and source construction/upgrade/damage compositions. `tests/hidden-tesla.test.ts` checks all source combat rows and existing concealment/targeting/range mechanics, plus level-6 and level-17 portable replay round trips. Native source pixels and isolated group compositing retain their earlier independent raster/GPU checks.

`tests/browser/hidden-tesla.spec.ts` exercises desktop/phone Info and reload, concealment, ground/air hits, destruction during emergence, touch construction, reduced motion, level-7/17 group playback and identical meshes after seeking, plus native reveal sound speed/gain/stop behavior. See [QA.md](QA.md) for verified run results and remaining limits.
