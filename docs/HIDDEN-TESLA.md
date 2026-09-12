# Hidden Tesla audit

The game uses native Tesla polygons, texture pixels, attack/impact clips and original reveal/zap audio for all 17 source levels. Home Village purchases retain the existing Town Hall 7–8 ceilings: two towers up to level 3 at TH7, three up to level 6 at TH8. Higher levels are supported entities in campaign data and portable replays. The playable native campaign remains its first 50 villages; Invaders still requires the unsupported Bomb Tower level 3.

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
- The reveal also emits three original grass pieces selected from `g1`–`g4`. Source settings specify 200 ms emission, 200–600 ms particle lives, a radius of 200 source units, speed 200–780, vertical angles 20–90°, gravity 3000, scale 30–60% and a 300 ms fade. Deterministic local sampling retains normal blending, the original polygons and source ranges. Grass uses the same local ballistic projection as impacts and sorts by projected ground position. Its reveal timestamp reconstructs the burst through pause and seeks; it survives tower destruction, expires and is suppressed by reduced motion.
- The same reveal timestamp drives camera shake for the source's 200 ms window, including replays as specified by `CameraShakeInReplay=TRUE`. The strength field is 20. The local reconstruction converts it to a maximum 6.4 world pixels per axis, interpolates independent 30 Hz noise knots with a smoothstep curve and tapers to rest. Simultaneous reveals add with the same per-axis cap. These amplitude, waveform and combination choices are not verified native camera-engine behavior.
- Once raised, the root holds source frame 17 while the named `idle_electricity` child advances from its placement time. This keeps the original final composition visible across idle loops. The handoff is a documented local interpretation: the native executable's reveal-to-setup transition has not been observed, and the level-17 setup/trigger electricity exports differ.
- Native additive electricity groups use isolated GPU buffers through `NativeSceneView`. All source polygon transforms, color transforms, texture sampling regions and draw ordering are preserved. Home idle uses the home render clock; battle and replay use battle time. Camera zoom controls physical buffer resolution.
- Construction uses `teslatower_const`; upgrades combine the static setup body with `teslatower_upg`. Both source scaffold timelines repeat a single composition. The generic construction crane is removed for this building.
- Destruction uses frame zero of `destroyedBuilding_2s_pit_wood`. Its six frames are alternate compositions, so the local renderer holds one rather than cycling through rubble variants. Native variant selection remains unverified. The original ground hole and wood replace the generic ruin sprite/shadow, including destruction during emergence.
- The original `tesla_appear_01.ogg` plays at source volume 70% and pitch 100%, subject to the shared mixer gain. The two original zap files also supply attack and hit cues. A stable battle cue supports pause, replay speed and rewind; it joins the existing Santa/X-Bow sample synchronization.
- Reduced motion shows the fully raised body immediately, suppresses idle electricity, attack particles and reveal debris, and retains the native audio. Seeks to scouting destroy concealed scene objects and group buffers. Battle transitions and scene shutdown dispose their retained objects/listeners.

## Native attack presentation

The simulation records each Tesla hit in a derived, bounded history: sequence number, battle timestamp, target identity/kind/hero state and impact position. It retains the last 16 shots per tower, over nine seconds of sustained fire. No combat random numbers are consumed, and damage, eligibility and cadence remain unchanged. Replay version 32 reconstructs this history from the existing snapshot and inputs rather than storing visual state in portable files.

`src/game/tesla-effect-poses.ts` consumes the original sparse effect/emitter rows in `reference/tesla/effects.json`. The source configuration now drives:

- One arc for levels 1–3, two for 4–5, three for 6 and five for 7–17. Each arc lasts 180–220 ms. The original 21-frame nested arc clip spans that lifetime under `ScaleTimeline`; its wrapper transforms supply the three original reflected variants. The source's normal/additive distinction for the second variant is retained.
- A separate 700 ms coil burst from level 7 onward, selecting the native level-7/8/9/10 export according to the building row. The source `StartZ=100` projects to 80 local vertical pixels above the footprint center. Its original 30 fps animation is not stretched, and its last 150 ms fade according to the emitter.
- The three source hit emitters. `spark_1` is an empty 16-frame clip in the pinned client and draws nothing. `spark_2` contributes ten small particles over 500–650 ms; `Hit` contributes two selections among `Hit`, `s1` and `s2`, lasting 100–300 ms. Original particle artwork, count, lifetime/scale ranges, emission spacing and fade settings are retained.
- Attack audio selects one of the original `tesla_zap_01` and `tesla_zap_03` rows at volume 40%, using their respective 90–110% and 100–120% pitch ranges. Hit audio uses `tesla_zap_03` at volume 20% and pitch 50–70%. Both files last approximately 0.551 seconds before pitch adjustment. Native reveal, attack, hit and existing Santa/X-Bow samples share one mixer and stop on pause/seek/exit.

All variation is keyed to tower ID, shot sequence and particle slot. Sampling a later frame or seeking backward does not change a previous sample. Arc endpoints follow the actual native reveal geometry and target position. On death they retain the target's last position and freeze the source's emergence height using its recorded destruction time; impact particles retain the impact point. Effects render on the local top layer and survive source/target death for their remaining lifetime, while finished battles clear them. Reduced motion removes the attack meshes but retains the sound cues. The former authored polyline, cubic muzzle-rise approximation and synthesized Tesla crackle have been removed.

## Pickup and placement

Home Village handling now plays the original `tesla_pickup_11.ogg` and `tesla_drop_09.ogg` at source volume 80% and pitch 100%, subject to the shared mixer gain. Both effects use the source three-piece Grass emitter. A bounded transient presentation queue uses the home render clock and is excluded from saves and portable replays. All five original Tesla Ogg files preload with the native textures.

Choosing Move emits one pickup at the original footprint. Failed drops preserve that position and emit no placement effect. A successful mouse/touch drop emits one placing effect at its destination; new construction from the shop emits only placing. Edit-mode dragging emits pickup on the first accepted tile change and placing on release, retaining one undo entry for the entire drag. Cancellation clears the affected action. Interrupted edit gestures, including pointer cancellation, outside release, pinch and resize, end without a drop cue. Scene transitions clear the action queue. Cancelling a shop drag clears the ghost without purchasing the building. The generic build tone is removed from Tesla placement in both canvas and drawer paths, and successful moves/cancellation dismiss stale placement warnings.

Reduced motion suppresses grass while retaining the samples; mute, scene pause, visibility loss and battle transitions stop audio. Grass centers stay at the recorded action positions. The input-to-effect mapping and particle attachment/inertia remain local interpretations, not observed native executable behavior.

## Remaining fidelity work

Particle engine behavior remains a local reconstruction. Arc geometry maps its original x=0..128 span onto the source/target endpoints; width follows the source scale range. The source's targeted start-radius, inertia and rotation semantics are not yet applied to this mapping. Impact movement uses the source angle, speed and gravity ranges with a local isometric conversion (`x/y` at 1/100 tile and altitude at 0.8 screen units), linear size interpolation and one 35% rebound before settling. Native inertia, random variant/audio-row selection, collision restitution, temporal interpolation and projection are unverified. These choices are documented interpretations, not proof of native executable equivalence.

The reveal camera waveform, amplitude conversion, distance attenuation and simultaneous-shake rules still require native executable evidence. Original asset pixels and sampled scene compositions have independent source-reference tests; complete native-client frame equivalence is not established. Grass inertia and depth/collision semantics also remain unverified. World projection, reveal handoff, instantaneous first damage, retarget semantics and ruined-frame choice need native executable evidence. Physical device qualification and WebKit offline behavior also remain unchecked.

## Verification

`tests/tesla-art.test.ts` checks all 17 held reveals, independent idle clocks, backward/long seeks, reduced motion and source construction/upgrade/damage compositions. `tests/hidden-tesla.test.ts` checks all source combat rows and existing concealment/targeting/range mechanics, plus level-6 and level-17 portable replay round trips. `tests/tesla-attack.test.ts` also verifies bounded history, source arc/impact/grass counts, original endpoint span, stable frame sampling and native audio ranges. Twenty-three independent original-texture raster/GPU witnesses include rotated/reflected arc variants, their emitter blend flags, impact textures, the level-10 coil burst and all four grass variants.

`tests/browser/hidden-tesla.spec.ts` exercises desktop/phone Info and reload, concealment, ground/air hits, destruction during emergence, touch construction, reduced motion, level-7/17 group playback and identical meshes after seeking, plus native reveal/attack/hit sound speed/gain/stop behavior and exact attack-mesh equality through pause and seeks. It also checks source/target death positions, particle expiry and scene-listener cleanup. See [QA.md](QA.md) for verified run results and remaining limits.

`tests/tesla-handling.test.ts` covers accepted/failed placements, cancellation, edit history and original handling rows. `tests/browser/tesla-handling.spec.ts` exercises native sound gain and single playback through mouse/touch controls, shop construction, edit undo/redo, gesture cancellation, reduced motion, pause/mute and scene cleanup. The generic shop cancellation regression also lives in `tests/browser/ui-input.spec.ts`.

`tests/tesla-shake.test.ts` checks source settings, boundaries, deterministic sampling, bounded mass reveals and immediate suppression. `tests/browser/tesla-shake.spec.ts` verifies actual camera transforms at desktop/phone sizes, pointer round trips, proportional zoom, scene/replay pause, tower destruction, 1×/2×/4× playback, rewind, finish, home exit and shutdown. The offset is applied during Phaser's camera-transform stage before the combined matrix and its inverse are consumed. Camera scroll remains untouched, and `screenFor` uses the same current transform as pointer picking. The layer composes with existing Phaser effects and restores its hook on shutdown; those other effects retain their existing wall-clock behavior.
