# Shipped asset and phone-flow fidelity audit

Baseline `c1f2a843`, pinned client 18.400.21, bundle
`7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`. The [asset guide](ASSETS.md) and
[full-client index](../reference/full-client/README.md) identify which assets are sourced,
authored or generated from retained project inputs. This audit used those retained
references and the packaged web build.

## Asset coverage

| Family | Verified in the package or in use | Evidence still open |
| --- | --- | --- |
| Terrain and buildings | Scene texture paths close in the package. Inspected village terrain, buildings, build grid and Mortar pickup in portrait and landscape. Compared Shop and battlefield presentation with the existing asset ownership notes. | Exact native camera, lighting, placement ghost and Shop layout. The legacy/generated bodies and preview images documented in [Assets](ASSETS.md) and [the inventory](CONTENT-INVENTORY.md) still need individual state comparisons. |
| Units, effects and portraits | The building/trap gallery has 552 referenced portraits and the roster gallery has 271. Observed Barbarian deployment and Giant Smash's Giant placement and Wall Breaker prompt. | All directional animation frames, effect timing and render tiers. A catalog portrait can exist while gameplay uses a separate source or authored fallback. |
| HUD, icons and fonts | Confirmed the runtime loads the retained Campaign, Shop and Settings images in the village. Two WOFF2 files ship. [HUD](../reference/hud/README.md) identifies the source slots; [fonts](../reference/fonts/README.md) identifies the English source faces. | Native widget layout, typography per control, and uncaptured UI states. DOM controls, responsive safe areas and some auxiliary icons are web choices. |
| Audio | Package integrity covers 496 Ogg and four MP3 files. Retained [village](VILLAGE-SOUNDS.md), [troop](TROOP-SOUNDS.md) and [music](../reference/music/README.md) evidence identifies source cue mappings. | Audio was muted during the touch flow. Per-cue playback, gain, pitch and mixing need a separate audible or instrumented comparison. |

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
