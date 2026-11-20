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

## Remaining parity work by player impact

| Priority | Gap against the pinned build | Comparison required |
| --- | --- | --- |
| 1 | Village-to-battle and first-session UI. Web drawers, compact navigation, Campaign previews, deployment feedback and result/replay transport differ or lack native evidence. | An authorized version-matched capture from Village through Shop or Army, map selection, scouting, first deployment, results and replay. Include both phone orientations and preserve the labels, available actions and field framing at each state. |
| 2 | Live unit, defense and terrain rendering. Payback’s Cannon body is identified, but its camera registration, initial aim, firing pose and destruction presentation remain unverified. Geared visuals, time-based effects, lighting and other families also remain open. | Start with pinned-client Payback captures of object 500000002 on entry, immediately before and during the first shot, and just after destruction. Match terrain, zoom and attacker location, and use the footprint and nearby terrain as registration landmarks. For other defenses, match level, mode and animation time and record the runtime atlas. |
| 3 | Audio playback and mix. Three triggers are verified in the web graph. Native source identity does not establish mix or sequencing. | Synchronized native and web audio captures of equivalent inputs, including planning-to-combat and result transitions, plus mute and resume. Compare cue identity, onset, channel levels and loop or sting boundaries. |
