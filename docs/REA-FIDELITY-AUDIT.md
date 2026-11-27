# Shipped asset and phone-flow fidelity audit

Baseline `c1f2a843`, pinned client 18.400.21, bundle
`7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`. The [asset guide](ASSETS.md) and
[full-client index](../reference/full-client/README.md) identify which assets are sourced,
authored or generated from retained project inputs. This audit used those retained
references and the packaged web build. The target is full observable parity
with that pinned build. An intentional web difference still counts as a parity
gap. Package integrity is a prerequisite for the visual and interaction checks.

## Asset coverage

| Family | Verified in the package or in use | Evidence still open |
| --- | --- | --- |
| Terrain and buildings | Scene texture paths close in the package. Inspected village terrain, buildings, build grid and Mortar pickup in portrait and landscape. Compared Shop and battlefield presentation with the existing asset ownership notes. | Exact native camera, lighting, placement ghost and Shop layout. The legacy/generated bodies and preview images documented in [Assets](ASSETS.md) and [the inventory](CONTENT-INVENTORY.md) still need individual state comparisons. |
| Units, effects and portraits | The building/trap gallery has 552 referenced portraits and the roster gallery has 271. Observed Barbarian deployment and Giant Smash's Giant placement and Wall Breaker prompt. | All directional animation frames, effect timing and render tiers. A catalog portrait can exist while gameplay uses a separate source or authored fallback. |
| HUD, icons and fonts | Confirmed the runtime loads the retained Campaign, Shop and Settings images in the village. Two WOFF2 files ship. [HUD](../reference/hud/README.md) identifies the source slots; [fonts](../reference/fonts/README.md) identifies the English source faces. | Native widget layout, typography per control, and uncaptured UI states. DOM controls, responsive safe areas and some auxiliary icons are web choices. |
| Audio | Package integrity covers 496 Ogg and four MP3 files. Retained [village](VILLAGE-SOUNDS.md), [troop](TROOP-SOUNDS.md) and [music](../reference/music/README.md) evidence identifies source cue mappings. | Three triggers now have measured runtime output (below). Other cues, timing, gain, pitch and mixing still need comparison. |

Baseline inventory found **3,929 physical files**, of which **3,918** live under
`assets/`. The service-worker manifest's **3,927 URL entries** matched packaged SHA-256
prefixes with zero missing paths or mismatches. The root URL aliases `index.html`;
the generated worker, its manifest and Vite's build manifest are the three physical files
outside that URL index. The package contains 2,840 WebPs, four PNGs, two WOFF2s,
500 audio files, and 583 HTML, SVG, manifest, JSON, CSS and JS files. Full
retained SHA-256 pins also matched both font files, all eight music tracks,
363 troop/effect sound entries and 13 village sound entries.

Of 511 JSON files under `assets/`, 480 carry scene graphs. All **1,159 texture
references** in those graphs resolved, spanning **1,002 distinct paths**. All **823
catalog rows** also resolved to shipping files. These are package integrity and
reference-closure checks. Independent source decoding and comparing the rendered
pixels of every file were outside this pass.

## Interaction coverage

| Journey | Observed in packaged Chromium at 390×844 and 568×320 | REA scope and web decisions |
| --- | --- | --- |
| Village and Shop | Opened Shop, picked up a Mortar and canceled the preview. Inspected the game canvas behind the drawer and the placement grid. | Retained building and [progression](FACILITY-PROGRESSION.md) evidence supports identities, tiers and availability. Drawer, pickup, confirmation and cancel UI are local. |
| Army and loadout | Opened Army and inspected the roster art, housing, filters and action targets. **Fixed mismatch** at 568×320 where search covered part of Spells. Compact controls now occupy two rows. | [Army unlocks](ARMY-UNLOCKS.md) and retained roster data support eligibility and housing. Filter placement and focus behavior are local. This pass did not check every Hero Equipment or preset flow. |
| Campaign | Opened the map, scouted Payback, deployed and opened results by touch. Inspected map hierarchy, deployed troop, HUD and result. | [Campaign rules](CAMPAIGN-RULES.md) describes source layouts and supported combat rules. Local matchmaking shortcuts, list composition and result presentation have separate Web CoC behavior. |
| Guided Practice | Opened Giant Smash, tapped the opening Giant marker, saw the Wall Breaker step, skipped guidance and reached results. **Fixed mismatch** at 568×320 where the fourth result action wrapped and clipped Return to village. | [Practice guide](PRACTICE-MODE.md) traces the source roster and ordered deployment steps. Banner, skip target and result action arrangement are Web CoC choices. |
| Replay and Settings | Sought the Campaign result recording to completion, opened Settings, and reloaded the two raid records. Inspected the transport and dialog over the field. | Native equivalents for the transport, settings order, keyboard focus and detailed result animation remain unverified. Web playback and save behavior were exercised. |

Both baseline tours completed with 337 distinct successful asset URLs per viewport
(including the substituted read-only diagnostic hook), zero asset HTTP errors, and
zero page errors. All 78 visible DOM image observations were decoded. Review used
the rendered screenshots as well as runtime requests and live touch inputs.

The corrected tours captured **26 states**, with 85 decoded visible DOM image
observations and the same successful asset URL count at each viewport. Adding
one Archer was reflected in the Army housing count. Four Practice result buttons
fit at 568×320, and the Army category controls and filters hit their own targets.
The targeted [HUD regression](../tests/browser/hud-layout.spec.ts) and
[Practice regression](../tests/browser/practice-mode.spec.ts) retain those checks.
The packaged main stylesheet increased by **596 bytes before compression**.
The changes are scoped to compact layout CSS. No new assets, per-frame work
or simulation rules were added.

## Runtime follow-up

**Audio.** In packaged 390×844 Chromium a trusted touch unlocked a fresh audio
context. Gold collection played decoded `coins_collect_01.ogg` (86,336 mono
samples), and a Barbarian deployment played decoded `barb_deploy_11v3.ogg`
(27,200 mono samples). The Home theme played `home_music_part_1.ogg` with the
media clock advancing. A Web Audio analyser connected at the output measured
non-zero peaks of approximately 0.0583, 0.0353 and 0.000142, respectively, in
those observed windows. Music played with effects disabled. Disabling both
suspended audio, and reload retained both mute settings and created no context
before a gesture. This establishes measured signal from the application graph.
Physical audibility and exact native mixing, cue onset, gain and pitch remain
open. [Village cues](VILLAGE-SOUNDS.md) · [Troop cues](TROOP-SOUNDS.md) ·
[Music source](../reference/music/README.md).

**Cannon.** The normal family has distinct flattened preview/icon files and
layered live bodies. Packaged Chromium decoded all 21 previews and 21 icons.
A disposable level-ten village exercised the live body, then Practice deployment,
a Cannon shot and replay. The browser suite compares all 21 normal live bodies
against the retained independent texture composition at one sampled pose, within
its pixel tolerance. The state gallery covers normal setup, construction,
upgrade and ruin across 21 levels, plus placement previews. The gallery now
waits for all on-demand levels before it synchronously switches between them.
Payback’s Tutorial Cannon (object 500000002 at source tile 21,22) names
`basic_turret_lvl1` in the retained [NPC building table](../reference/campaign/npc-buildings.json).
It now uses the retained normal level-one portrait with its frame-zero body
and base. This verifies the body identity, while frame zero and the shared web
anchor remain presentation choices pending a matched capture. Its separate
NPC weapon and combat behavior are unchanged.
[Cannon source and pose limits](../reference/cannon/README.md).

## Village-to-replay sequence

The retained sources establish the states below. The Chromium observations
above are the web baseline. Package closure verifies the presence of files,
while an observable match requires a corresponding pinned-client state.

| Scene | Established by pinned evidence | Missing comparison |
| --- | --- | --- |
| Village | Building identities, tiers and prerequisites, plus individual HUD asset slots. | Initial camera and HUD composition after village entry. |
| Army | Troop and spell eligibility, housing and fixed lesson levels. | Original Army entry, filters, readiness messaging and transition to Attack. |
| Campaign / Practice select | Campaign layout and dependency records. Practice label, Town Hall gate and fixed army rows. | Original mode navigation, selected card, lock and army preview presentation. |
| Scout | Payback and Giant Smash terrain and building placements. Giant Smash's first prompt and marked start position. | Original scouting entry, camera setup, control availability and appearance. |
| Deploy | Giant Smash's first Giant and subsequent Wall Breaker instructions, counts and forced placement fields. | Matched frames before the tap, at acceptance and when the next instruction appears. |
| Results | Practice closing question, saved best stars and finite loot rules. | Exact result transition, feedback, and original action order. |
| Return / replay | Web save and replay checks preserve the army actually used and record the result once. | Original post-result navigation, mode history and replay controls. |

The Practice scout now previews the levels actually supplied (Giant Smash
brings 13 Giants, 2 Wall Breakers and 11 Goblins at level 2). The Web CoC
Battle Log carries the Practice identity through reload and opens the same
lesson preview. Returning restores focus to the originating action. The
preview and log controls are web behavior and still need a native comparison.
[Practice catalog and guide](PRACTICE-MODE.md) · [Campaign rules](CAMPAIGN-RULES.md).

## Shared attacker death art

The Archer and other attacking troops assigned to `barbarian_death_1`
now show its later frames in live combat and replay. The generic 1.5-second
fade previously cut off the shared clip around frame 36. The retained
24-fps clip has 143 frames and the final structurally empty run starts at
frame 138. All 513 referencing rows across 59 retained troop packs agree.
The renderer now uses the source opacity and retires the pose at that
empty run. The battle clock, result grace, combat state and sound assignments
keep their existing behavior. Native runtime lifetime and composition
alongside other effects remain unverified.

[Independent death-frame witness](../reference/garrison/README.md#original-dragon-death-timeline) ·
[Troop sound assignments](TROOP-SOUNDS.md)

A TH6 Practice stress run used three 45-Archer waves and reached 86
casualties. Each wave began with a real touch, followed by a fixed roster
batch and 70 deterministic ticks sampled in compact landscape. Across three
packaged runs per build, the median wave frame interval was 16.7 ms with
a 16.8 ms p95. Median presentation work changed from 2.2 to 2.3 ms and its
p95 from 4.4 to 4.5 ms. Longer-tail spikes varied by run. The comparison
uses cloud Chromium, fixed full detail and manual ticks. It does not
measure physical-device input latency.

## Giga Bomb reveal

All four pinned Giga Bomb levels name `Giga Bomb Appear`. Its retained
effect row binds `gen_appear_fx` and the Grass emitter. The web renderer
now draws that effect from the trap’s recorded activation state, including
at the same instant when seeking in replay. The reveal follows the existing
web simulation clock. The native runtime onset, interaction with other
layers, and fuse audio playback remain outside this comparison.

## First-session Builder’s Huts

The retained starting grant, Campaign records, Practice instructions and HUD
exports do not establish the original opening dialogue or scene sequence.
The first-run watch, collect, build and train coach remains the web flow.

The retained level-one `worker_building` root contains the named
`builder_out` sign and separate sleep markers. Home used to sample both
without selecting a state. Idle huts now hide the absent-builder sign.
Each active builder reservation shows one sign on the awake frame, without
sleep markers. Home assigns those visuals in the order of completed huts
because the save records a reservation count and has no worker identity.
The original allocation and animation timing remain unverified.

[Builder’s Hut slots and states](../reference/builder-hut/README.md) ·
[Starting grant](../reference/townhall/README.md)

## Results and Army spell details

The web result uses a text heading and CSS rays for the banner, three styled
star glyphs, CSS resource badges, and SVG button icons. The retained HUD
exports do not identify matching result-specific frames or establish native
replay handoff controls. The pinned music catalog does identify both outcome
stings. The web Music channel selects `winwinwin.mp3` for a starred result and
`battle_lost_02.mp3` for zero stars. The separate web victory effects tone,
native cue onset and native audio mix have no matched capture.

The 18 playable spell rows in the pinned roster specify the same export for
`BigPicture` and the roster icon. Spell details now use that retained export
through the same resolver as the Army card. Troop details have a separate
source convention. Dragon, for example, names `unit_dragon_big` in
`sc/info_dragon.sc`; its detail art is outside this comparison.

[Outcome music catalog](../reference/music/catalog.json) ·
[Standalone roster exports](../reference/full-client/roster.json)

## Shared HUD art bindings

| Runtime control or state | Asset used | Pinned comparison |
| --- | --- | --- |
| Village Attack | Campaign map image and sliced background | `hud_button_fight` clip 201, frame 0 (`no_stars`), and shape 55. The web entry opens the single-player map, so alternate mode children are absent. |
| Village Shop and Settings | Separate retained normal-state PNGs | `ui_bottom_right` supplies Shop shape 21791 and Settings clip 22637. Their native badges and alternate states are outside the retained capture. |
| Village and combat resource badges | CSS coin, droplets and gem | No equivalent per-state source export was established in this pass. |
| Scouting and combat deployment cards, plus Army and composition previews | Standalone UI portraits from the pinned roster index | 57 troop and 18 spell bindings checked. 62 already used the corresponding UI asset. Ten troops and three spells previously used art from the Characters or Spells collections. The cards now use the declared frame-zero exports. The selected and exhausted card treatments are local CSS. |
| Combat exit and speed, Campaign lock, result and replay controls | SVG glyphs, text and CSS stars | Native inactive, pressed, filled-star and transition frames remain unverified. |
| Shared headings and body text | Clash Headline and Clash Text | Both bundled families map to the pinned English HUD names, Supercell-Magic and CCBackBeat Light. Per-control text transforms and layout still need matched reference. |

Decoded RGBA hashes for all 75 packaged roster icons and the four captured
HUD images matched their source records. Both packaged font checksums also
matched. Those checks establish asset identity. The phone-sized Chromium
tour separately checked which icons Village, Army, scouting and live combat
actually displayed.

[HUD source slots](../reference/hud/README.md) ·
[Font source records](../reference/fonts/README.md) ·
[Standalone roster exports](../reference/full-client/roster.json)

## Goblin Forest battlefield

The pinned stage-2 layout and the live battle agree on all 17 buildings:
a 4×4 Goblin Town Hall, a 3×3 Archer Tower, fourteen 1×1 walls and a
2×2 passive Goblin Hut. All are level one, and the layout has no traps.
The board adds the existing two-tile coordinate offset. The retained
placement rows specify no facing or starting ruin. The Hut's five Balloon
entries are template data. The battle does not field them.

All 13 props retain their pinned tiles and footprint sizes. Four pines,
two of each of three Sharp Stones, two torches and one windmeter now use
their corresponding retained exports. The authored silhouettes remain
available while the source portraits load. Their render anchors and
size follow the existing Home Village prop treatment. Alpha, camera and
terrain backdrop remain local presentation. The exact native map projection,
prop motion and destruction presentation remain unverified. The Goblin Hut
still uses the existing ruin treatment
after its foreground mesh is removed.

[Campaign layout provenance](../reference/campaign/README.md) ·
[Goblin building source](GOBLIN-BUILDINGS.md) ·
[Web terrain and camera](TERRAIN-CAMERA.md)

## Early Campaign prop coverage

The pinned first four boards contain 175 buildings and traps and 217 prop
placements. The renderer now selects a retained portrait when the exact
export name and footprint agree. This preserves distinct stones, fallen
trees, trunks, mushrooms, and the down-arrow flag in their recorded roles.

| Board | Props | Retained portraits before | Retained portraits after |
| --- | ---: | ---: | ---: |
| Payback | 14 | 10 | 14 |
| Goblin Forest | 13 | 13 | 13 |
| Goblin Outpost | 91 | 72 | 82 |
| Rocky Fort | 99 | 76 | 92 |

An offline reference check covers 6,214 prop rows on all 107 retained layouts.
Of these, 5,498 match a retained portrait by export and footprint. The early
fallback rows are Tombstones, Dark Tombstones, and the Goblin Pole. No
alternate facing was established for these prop placements. The retained
down-arrow flag preserves its own artwork rather than using a mixed flag
silhouette. Authored terrain, initial camera, and static prop registration
remain web presentation. The Campaign and Home Village renderers now use the
same footprint-centred projection for 5,292 placements across 21 retained
obstacle exports. Campaign had applied a fixed vertical origin of 88% even
to crops with different recorded origins and footprint sizes. Prop tiles
and depth keys still come from the existing layout projection.
[Campaign layout provenance](../reference/campaign/README.md) ·
[Retained obstacles](../reference/obstacles/catalog.json) ·
[Retained decorations](../reference/decorations/catalog.json)

## Campaign selection and progression

The runtime's 107 imported names and stage numbers match the pinned catalog.
The audit also compared all 91 dependency edges and the source
`AlwaysUnlocked` flags. Both Payback and Goblin Forest are open at the start,
even though the latter has a dependency entry. Goblin Outpost requires a star
in Goblin Forest, and Rocky Fort requires a star in Goblin Outpost.

The map and scout preview now name the required village when a node is locked.
Branch labels follow Web CoC's existing interpretation that a star in any
listed predecessor opens the node. The source proves the edges and the
early linear path, while the original branch policy, node layout, input
sequence, star badge art, and action arrangement remain unverified.
[Campaign source and interpretation boundaries](../reference/campaign/README.md).

## Early Home Village resource buildings

The early save contains 16 non-wall buildings, including two mines, two
collectors, and four storages at levels one and two. Their world bodies already
use retained scene packs. The default placement and forest-and-stream
terrain come from Web CoC. The retained references establish building
exports, but do not establish the original starting layout, camera, tile
composition, or selection animation.

The selected building, Details, and Shop now use the pinned body-and-base
portraits for Gold Mines, Elixir Collectors, Gold Storage, and Elixir Storage
at all 72 supported levels. This closes the mismatch between rendered world
building tiers and the generic low-level portraits previously shown in cards.
A selected producer's Collect button now uses the corresponding web resource
glyph. The prior button showed a gold coin for Elixir and Dark Elixir too.
Resource art and selection behavior remain web presentation, while the
resource-specific audio mappings are retained separately.
The world renderer now reads the fill timeline from each building export.
Elixir Storage levels 2–4 have 100 fill frames in the retained graph, while
the other levels have 141. Using the shared atlas's longer range wrapped a
full level-2 tank to frame 40 in Home and Practice. The tank now uses frame
99 at full capacity without changing resource balances or footprints.
[Building exports](../reference/full-client/catalog.json) ·
[Terrain and camera](TERRAIN-CAMERA.md) · [Collection sounds](VILLAGE-SOUNDS.md).

The Home Village's Barracks, Laboratory, and Spell Factory already use the
retained level-specific world bodies and bases. Their selection and Details
portraits for levels 1–8 previously fell back to generic or tier-group art.
The HUD now uses the matching static body/base portraits at those 24 levels
and continues to resolve the other 20 to their existing catalog portraits.
During a Barracks upgrade the world draws the pinned upgrade layer over the
current body. The portrait advances with the completed level. The source establishes
these asset identities. The original interaction layout, camera and upgrade
animation timing still need a matched capture.

The Barbarian and Archer Army cards resolve to the retained standalone UI
icons. Their combat packs match the pinned hashes, with 243 directional
walk, idle and attack references across 27 level rows. In a paused replay,
adaptive rendering could leave the preceding walk pose on screen after
seeking to an attack. The paused redraw now samples the current pose.
This verifies the selected exports and the Web CoC replay transition.
Original-client pose timing and facing thresholds remain unverified.
[Roster icons](../reference/full-client/roster.json) ·
[Combat pack index](../reference/full-client/troop-art.json).

The Payback and Home Village Practice replay checks follow Archer deployment,
arrow flight, and the first post-flight tick in live combat, continuous
playback, and a paused seek after rewinding. The scene now retains the
opening deployment cue from continuous playback when the first action is
recorded at step zero. It still discards queued effects from the preceding
battle. The brief deployment particles are Web CoC feedback. A paused seek
reconstructs retained projectile and battle state without replaying these
one-shot particles.

A cold portable replay with a level-3 Archer and an active level-7 Freeze
field exposed a second problem. The Archer stayed on its fallback sprite
after the combat graph arrived, until the viewer moved the camera or the
replay clock. Graph and level-page readiness now refresh the unit layer
at the same replay tick. Freeze bottle and frost use their retained cast
state when seeking backward and forward.
[Freeze effect rows](../reference/freeze-spell/effects.json).

## Remaining parity work by player impact

| Priority | Gap against the pinned build | Comparison required |
| --- | --- | --- |
| 1 | Village-to-battle and first-session UI. Web drawers, compact navigation, Campaign previews, deployment feedback and result/replay transport differ or lack native evidence. | An authorized version-matched capture from Village through Shop or Army, map selection, scouting, first deployment, results and replay. Include both phone orientations and preserve the labels, available actions and field framing at each state. |
| 2 | Live unit, defense and terrain rendering. Payback’s Cannon body is identified, but its camera registration, initial aim, firing pose and destruction presentation remain unverified. Geared visuals, time-based effects, lighting and other families also remain open. | Start with pinned-client Payback captures of object 500000002 on entry, immediately before and during the first shot, and just after destruction. Match terrain, zoom and attacker location, and use the footprint and nearby terrain as registration landmarks. For other defenses, match level, mode and animation time and record the runtime atlas. |
| 3 | Audio playback and mix. Three triggers are verified in the web graph. Native source identity does not establish mix or sequencing. | Synchronized native and web audio captures of equivalent inputs, including planning-to-combat and result transitions, plus mute and resume. Compare cue identity, onset, channel levels and loop or sting boundaries. |

### Campaign scout defense summary

Builderopolis places 44 Builder's Huts and one level-2 Goblin Hall. The
pinned weapon rows identify 36 armed huts and an armed Hall. The web scout
summary now includes those weapons and uses the Goblin Hall identity.
Passive huts, Hidden Teslas and traps stay outside the summary. This is a
correction to the web preview's layout data. The native scout panel's exact
composition, reveal policy and timings remain outside the retained evidence.
[Campaign layout](../reference/campaign/runtime.json) ·
[Builder's Hut weapon rows](../reference/builder-hut/combat.json) ·
[Goblin weapon rows](../reference/late-goblin-buildings/README.md).

### Trap presentation audit

The [pinned combat tables](../reference/full-client/combat.json) and the
[village art index](../reference/full-client/village-art.json) establish source identity.
All 165 armed, triggered, and spent references resolved across 55 level rows in
the Bomb (14), Giant Bomb (12), Air Bomb (13), Spring Trap (13), and Tornado Trap
(3) world packs.

| Family | Runtime comparison | Evidence still needed |
| --- | --- | --- |
| Bomb and Giant Bomb | Shared renderer selects the three retained body exports. Impact still uses the web blast cue. Spring's instant-resolution issue does not apply to their timed fuses. | Version-matched impact and reveal assignments for the ordinary variants, and matched capture before changing fuse-to-animation synchronization. |
| Spring Trap | Instant ejection used to skip the triggered body. All 13 levels now use the authored 22-frame, 24 fps timeline recorded in the [Spring Trap pack](../public/assets/village-native/springtrap/graph.json) before the spent export. The renderer reads the trigger time from battle state and the existing visibility filter still removes the body before activation. | Native composition, sound, and synchronization with ejection remain unverified. |
| Air Bomb | The shared renderer binds the floor body states and the flight renderer draws all seven projectile variants in the [retained projectile index](../reference/full-client/projectile-art.json). Flight starts when trap state is created and ends on resolution. It uses the recorded target point in current replays and the original moving target in older ones. The existing splash cue still owns the impact. | Original-client trajectory, launch timing, composition, and audio are unverified. |
| Skeleton Trap and Seeking Air Mine | Dedicated armed/body and trigger paths use the [coffin](../reference/skeleton-trap/native.json) and [mine](../reference/seeking-mine/native.json) references. The coffin expires by the existing presentation window. Mine combat eligibility was outside this pass. | Matched native captures for frame-by-frame timing. |
| Tornado, Freeze, Ghost, Shrink, Santa, and Pumpkin Campaign variants | Separate runtime paths retain the variant-specific body, cast or spawn art, where available in [Campaign references](../reference/tornado-trap/README.md). Some transient effects are live-only under the existing presentation policy. | Verify matched native composition and the intended web seek behavior before changing transient effects. |
| Giga Bomb | Previously qualified reveal, outside the patch. | Matched native fuse audio and effect composition. |

The Spring change touches the renderer only. Trap state, ejection, damage, saves,
and versioned recording rules use the existing model paths.

Packaged Chromium touch checks at 390×844 and 568×320 deployed one Archer into
a level-one Spring Trap from a disposable Practice village. At 0.30 seconds the
baseline selected the spent export, while the candidate selected frame 6 of the
triggered export in both live play and paused replay. The troop and trap states
matched at that tick. The trap remained hidden while scouting and after seeking
back before activation, and used the spent export after the clip.

Air Bomb flight was verified in packaged Chromium with a touch-deployed Balloon
against level 1 at 390×844 and level 13 at 568×320. At 0.45 seconds, the candidate
showed the assigned projectile and shadow in live play, paused seek, and a
restarted replay at the same simulation tick. Scouting and rewind before
activation showed neither. Both builds emitted one splash at 0.95 seconds per
raid, with matching trap and troop state. The interpolation follows Web CoC's
existing fuse and aim. The retained rows establish the flight art and shadow,
while the original-client trajectory and timing remain unverified.

### Building destruction presentation

The [Dark Elixir Storage rows](../reference/dark-storage/native.json) inherit
`DestroyEffect: Elixir Storage Destroyed` across all 13 levels. The
[retained effect graph](../public/assets/effects-native/elixir-storage-destroyed/graph.json)
assigns storage debris, Smoke, and Grass. Its sound path, volume, pitch bounds,
and delay match the existing destruction cue. Web CoC previously drew generic
sparks and smoke here. It now samples the assigned effect from the battle-only
destruction timestamp, including after replay seeks. While the effect art loads,
the generic cue remains available. The existing ruin is retained because the
named glass-pit export was referenced but its drawable graph was unavailable
in this audit.

The [Wizard Tower](../reference/wizard-tower/body.json) and
[Bomb Tower](../reference/bombtower/body.json) assign a damaged export
across 17 and 13 levels respectively. Each family's ruins use its
retained texture page 25. If that page is unavailable, Web CoC keeps
local rubble visible, then replaces it with the authored meshes when
the page arrives. This also applies to paused replays after an asset
retry.

The Cannon and Archer Tower have retained destruction assignments and dedicated
render paths. The late Goblin Hall has a sampled collapse export and an assigned
destruction effect. The early [Goblin Town Hall row](../reference/goblin-buildings/native.json)
names `Town Hall Destroyed`, but that effect graph is missing from the packaged
effect index. Castle ruin and original-client results composition remain unverified.
The storage patch changes neither star calculation nor battle settlement.

Packaged Chromium touch checks at 390×844 and 568×320 used two P.E.K.K.As in
the same disposable Practice village. At 6.10 seconds both builds showed the
storage destroyed and 16% destruction, with zero stars. The candidate showed
the assigned debris in live play and a paused seek. The debris expired while
the ruin remained, and rewinding restored the intact body with no debris.
Both builds reached the same two-star, 50% result.

### Scouting and first live deployment audio

In a fresh packaged Payback flow, the retained [interface cue](VILLAGE-SOUNDS.md)
started once for each tested Village selection, Army opening, training tap and
troop selection. Entering scouting started the same click and an extra
generated deployment tone in the baseline, with zero units on the field.
Campaign, guided Campaign, and Ladder entry now reserve deployment audio for
actual field actions. Their existing haptic feedback remains in place.

Trusted touch at 390×844 and 568×320 started one `barb_deploy_11v3.ogg` buffer
on the accepted field tap in both builds, followed by a pinned Barbarian swing
take and `barbarian_hit_stuff2.ogg`. All named buffers in the trace had nonzero
decoded samples. Sound effects stayed muted after reload and a Settings tap
started no audio. In the landscape replay, later attack and hit buffers matched
across both builds, while the first deployment at replay time zero started no
Barbarian buffer in either. That existing replay case is separate from this
scout-entry fix. The retained [battle cue rows](TROOP-SOUNDS.md) identify the
assets and do not establish original-client scout onset or mix.

### Tick-zero replay deployment audio

Checkpoint `64b5926c` retained the opening spawn event across a replay scene
rebuild. Its regression measured five Archer spawn sparks at step zero. In
Payback, the event and troop survived that rebuild, but the troop sound log
first saw the ordinary Barbarian already on the field. Its implicit arrival
clock therefore suppressed the opening voice.

Current playback carries the deployed actor ID on the existing spawn event.
Autoplay at recording time zero queues the pinned Barbarian take once for that
playback. The sample may begin at offset zero when decoded within a two-second
playback window. A seek, mute, or session change discards pending sound.
Restart creates its own opening. Later combat audio and normal explicit
birth-time cues stay on the existing timeline. This is Web CoC replay
consistency. The [retained troop rows](TROOP-SOUNDS.md) establish the source
sample identity. Original-client replay onset and mix remain unverified.

Packaged Chromium at 390×844 and 568×320 reproduced zero Barbarian buffer
starts in warm and cold baseline replays. The candidate started one
`barb_deploy_11v3.ogg` buffer at offset zero in each case, including when its
request was held until 0.8 seconds of playback. A touch restart started one
new buffer. A paused seek to zero with a pending decode stayed silent after
resume, as did playback with Sound effects muted after reload.

## Milestone 2 UI/UX alignment (portraits, transitions, tactical panels)

Milestone 2 closed the next tier of HUD, info-panel, battle-transition, and
replay-transport alignment gaps against the pinned `18.400.21` client without
breaking existing layout or asset contracts:

- **Native portraits and resource-collection presentation**: Wall HUD portraits
  (levels 1–19) now resolve to the packaged `/assets/catalog-native/wall/`
  exports via `buildingPortrait()`, while Hero Hall roster cards for Archer
  Queen, Minion Prince, Grand Warden, Royal Champion, and Dragon Duke use their
  packaged `/assets/catalog-native/roster/hero-*.png` icons (preserving the
  Barbarian King portrait contract). Resource HUD icons received beveled
  coin/droplet/gem facet styling, and collection flights in
  `src/ui/resource-flight.ts` follow curved parabolic trajectories while
  preserving exact start and counter-center landing endpoints.
- **Cloud-parting transitions and live star celebrations**: Switching between
  Home Village, Scouting/Battle, and Replay now triggers a non-blocking
  (`pointer-events: none`) billowing cloud veil (`src/ui/cloud-transition.ts`),
  and earning stars mid-battle triggers a centered `#star-callout` celebration
  (`VICTORY!`, `2 STARS!`, `3 STARS!`). Both respect `prefers-reduced-motion`
  and `.reduce-motion`.
- **Context dock, placement confirm, and tap feedback**: The placement banner
  adds a green confirm button (`Confirm placement`) wired to
  `VillageScene.confirmGhostPlacement()` alongside Cancel, building selection
  emits a 280 ms golden isometric tile ripple, and `.building-context` uses
  medallion portrait framing.
- **Info stat bars, deployed-army results, and replay timeline markers**:
  Troop Info, Spell Info, and Hero Hall stat panels render Clash two-tone
  `.stat-bar` progress bars; battle results include a compact `.result-army`
  deployed-unit summary (collapsing to a single scrollable strip on short
  landscape viewports such as `568×320`); and `#replay-progress` renders
  color-coded troop, spell, hero, and ability ticks inside `.replay-track-wrap`
  while preserving `44×44` touch targets and narrow-viewport grid spans.
- **Loading splash and onboarding polish**: `#loading` uses a sunlit crest
  medallion and magenta-violet Elixir progress bar, and `.coach-banner` cards
  use elevated Clash parchment framing.

Verified in Vitest (613 suites, 9,256 tests), strict TypeScript + production
build, and Chromium E2E specs (`tests/browser/rea-milestone2.spec.ts`,
`native-hud.spec.ts`, `hud-layout.spec.ts`, `campaign-row-layout.spec.ts`,
`battle-toast-layout.spec.ts`, `placement-preview.spec.ts`, `camp-art.spec.ts`,
and `replay-tools.spec.ts`). Original-client transition timings, result layout
proportions, and cloud textures remain web presentation pending matched
captures.

## Milestone 3 UI/UX alignment (sculpted emblems, diegetic canvas UX, audio, Edit Mode, Battle & Campaign)

Milestone 3 closed the next major tier of visual emblem fidelity, on-canvas
diegetic interaction, native audio coverage, Village Edit Mode usability, and
battle/campaign polish against the pinned `18.400.21` client without breaking
existing layout, accessibility, or asset contracts:

- **Sculpted vector Clash emblems (`src/ui/clash-emblems.ts`)**: Replaced plain
  geometric circles, text stars, and generic icons across the Home and Battle
  HUD with beveled Clash emblems — cobalt 5-point XP star (`xpStarSvg`),
  tier-colored League shield crests (`leagueCrestSvg`), gold/elixir/dark/gem
  resource emblems (`resourceEmblemSvg` wired through `src/ui/icons.ts`),
  Builder hammer badge (`builderHammerSvg`), village protection shield
  (`shieldCrestSvg`), and 3-tier golden/metallic Battle & Campaign stars
  (`clashStarsMarkup`).
- **Diegetic on-canvas UX (`src/game/scene.ts`, `src/ui/hud.ts`)**: Added a
  floating world-space building nameplate (`Name` + `Level N`) above the
  selected building; animated curved golden/red corner move arrows around
  draggable/moving footprints; floating on-canvas green check / red X placement
  buttons (`#canvas-place-actions`, synced to the footprint screen anchor)
  complementing the placement banner; animated pulsing crimson no-deploy
  perimeter hatching in scouting/battle (`deploymentBoundary`); and animated
  collector readiness halos + floating coin/elixir/dark loot bubbles above
  damaged storages during raids.
- **Native sound bank expansion (`src/game/audio.ts`)**: Wired 10 already
  packaged original `.ogg` village/UI cues (`EXTRA_NATIVE_SOUNDS`) with
  per-building category selection cues (`buildingAudioCue`), distinct UI
  card/upgrade/star/invalid-action/cloud-sweep/countdown-tick sound effects,
  and full respect for sound mute settings without modifying
  `reference/village-sounds/sounds.json`.
- **Village Edit Mode upgrades (`src/game/model.ts`, `src/ui/hud.ts`)**: Added
  Drag-to-Swap for equal-footprint buildings (with full undo support), **Scout
  View** (hides traps/hidden Teslas so players can inspect defender visibility),
  and **Photo Mode** (hides HUD chrome with a minimal floating `Exit photo`
  pill for unobstructed village screenshots).
- **Battle HUD, Army drawer, Blacksmith, and Campaign polish**: Added a
  Clash-authentic orange **Next** matchmaking button during Ladder scouting
  (`nextLadderMatch()`), floating hero ability-ready pills (`.hero-ability-pill`)
  and non-shifting glow hints (`.troop-card.ready-next`), a sticky live
  **Current Army** overview bar with 1-tap troop/spell removal chips inside
  `.army-head` (with responsive `<= 700px` grid row placement and compact
  short-landscape sizing), two-tone Blacksmith equipment `.stat-bar` meters,
  4-layer volumetric cloud transitions with radial sunburst in
  `src/ui/cloud-transition.ts`, and a List / **Goblin Trail Map** toggle in the
  Campaign modal.

Verified in Vitest (`tests/rea-milestone3.test.ts` plus full suite: 614 suites,
9,261 tests), strict TypeScript (`npm run typecheck` and `npm run
typecheck:tests`), production build (`npm run build`), and Chromium E2E specs
(`tests/browser/rea-milestone3.spec.ts`, `rea-milestone2.spec.ts`,
`hud-layout.spec.ts`, `native-hud.spec.ts`, `native-campaign.spec.ts`,
`camp-art.spec.ts`, and `siege-manual-release.spec.ts`). Original-client cloud
textures, nameplate typography proportions, and Goblin Trail Map map-art
illustrations remain web presentation pending matched captures.

### Milestone 4 — Dynamic Audio Mixing, Live Canvas Feedback, and Battle/Replay/Campaign Clarity

Implemented the next web-verifiable Clash of Clans `18.400.21` fidelity wave
across P3 audio dynamics, P2 live battlefield/village world feedback, and P1
HUD/campaign/replay ergonomics:

- **P3 Dynamic Audio Mixing & Additional Native OGG Cues (`src/game/music.ts`, `src/game/audio.ts`, `src/ui/hud.ts`)**:
  - Added smooth Web Audio gain-ramp track fade-ins and temporary music ducking
    (`Music.duck(factor, holdMs, releaseMs)`, `isDucked`) during celebratory
    chimes (victory stars and Home upgrade completions) without modifying
    `reference/village-sounds/sounds.json`.
  - Wired 4 additional already-packaged `18.400.21` native `.ogg` cues into
    `EXTRA_NATIVE_SOUNDS` (`native-invalid`, `native-mode-toggle`,
    `native-star-chime`, `native-spell-revive`), connecting `playInvalid()`,
    `playModeToggle()` across defense mode/rotation controls, and the 3-star
    celebration chime.
- **P2 Live Canvas Celebrations & Construction Life (`src/game/model.ts`, `src/game/scene.ts`)**:
  - Added enemy Town Hall destruction shockwave, gold ember burst, brief camera
    shake, and floating world banner (`TOWN HALL DESTROYED!`) via
    `showTownHallDestroyed()`.
  - Extended building upgrade completions in `finishedAt()` with `sourceId` so
    Home village upgrades, research, and hero completions emit rising world
    badges (`LEVEL N!`, `BUILT!`, `RESEARCH READY!`, `HERO READY!`) paired with
    subtle music ducking.
  - Added subtle construction hammer sparks on active Home upgrade sites at
    full detail (`detailLevel === 0`).
- **P1 Battle HUD, Replay Ergonomics, Shop, & Campaign Trail (`src/ui/rea-helpers.ts`, `src/ui/hud.ts`, `src/ui/rea-fidelity.css`)**:
  - Added live battle star milestone pills (`★ 50%`, `★ Town Hall`, `★ 100%`)
    that highlight in real time, a pre-deploy scouting countdown bar
    (`#battle-prep-bar`), a full-width non-shifting `.deploy-label.spell-armed`
    highlight, and a Battle Result star-condition breakdown (`.result-milestones`,
    hidden on `568×320` short landscape so all 4 Practice buttons remain
    unclipped).
  - Enhanced Replay controls with interactive `Next event` jumping
    (`nextReplayEventTime()`), per-marker tooltips (`title`), and a single-row
    responsive shortcut grid preserving `>= 44×44` touch targets at `320×740`
    and `568×320`.
  - Added biome-grouped Goblin Trail Map zone headers (`campaignBiome()`) with
    per-biome star tallies and a `NEXT FRONTIER` beacon, Shop `"NEW"` corner
    badges on unlocked unbuilt tiles, and fixed a Milestone 3 `clashStarsMarkup`
    argument-order regression across all 6 HUD call sites so star ribbons
    always render 3 sculpted SVG stars.

Verified in Vitest (`tests/rea-milestone4.test.ts` + `tests/rea-fidelity.test.ts`
and full 615-suite run: 9,268 tests passing), strict TypeScript
(`npm run typecheck` and `npm run typecheck:tests`), Vite production build
(`npx vite build`), and Chromium E2E specs
(`tests/browser/rea-milestone4.spec.ts` 4/4, `replay-tools.spec.ts` viewport
layout, `hud-layout.spec.ts` 8/8, `practice-mode.spec.ts` 28/28,
`rea-milestone2.spec.ts` 3/3, `rea-milestone3.spec.ts` 4/4). Matched live
`18.400.21` client captures and ARM64 Android native binary instrumentation
remain external follow-up outside this x86_64 Linux workspace.


