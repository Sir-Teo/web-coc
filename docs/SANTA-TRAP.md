# Santa Trap and Goblin Picnic

Added September 12, 2026. Goblin Picnic retains its native Santa Trap beneath the P.E.K.K.A statue at native `(34,27)`, simulation `(36,29)`. The trap and statue are passable; the trap stays hidden until a live ground attacker enters its 1.5-tile trigger radius. It is a campaign-only Bomb archetype with a distinct identity, never a home shop item or normal Bomb upgrade.

## Source facts and engine interpretations

[The pinned client evidence](../reference/santa-trap/README.md) identifies `SantaTrap` as `12000007`, with zero direct damage and `Spell=Santas Surprise`. The called level-one spell is `26000006`, with five 180-damage hits, 1.5-tile radius, one-tile scatter, 4.5-second gift-drop time, six-second hit time and 0.1-second spacing. The separate legacy `xmas` spell has different values and is not substituted.

The implementation starts the spell at activation plus `44 / 24` seconds: the source action counter divided by the native trigger clip's frame rate. Selecting the called spell's first level, interpreting that counter as animation frames, assigning the spell to the defending side, and interpreting scatter as a uniform disk remain local engine interpretations. Native client observation is still needed to establish those semantics. The five positions are sampled once with a deterministic local hash of battle seed and trap ID; this is not the native RNG.

Each hit applies damage to living attacking ground and air units within its own saved circular radius. Defending units and buildings are unaffected. Escaping the impact point avoids damage; killing the triggering troop does not move or cancel the saved strikes. A unit born after a scheduled hit cannot receive that earlier hit. Every strike resolves once, and ending the battle cancels remaining damage.

## Presentation

The renderer uses the original setup, trigger and spent gift-box frames, flying hogs, loaded/tipping/empty Santa components, gift variants, red smoke textures, debris, and moving shadows. Component quads retain all six native affine values, including the shear during the sack-tip sequence. Mesh UVs explicitly flip vertically because the native atlas uses top-down image coordinates and Phaser Mesh2D expects GL coordinates. The source atlas pages are unchanged and stay within 4096×4096.

The flight uses its native 24 fps component timeline over a ten-second effect lifetime. Native `ScaleTimeline`, particle coordinates, altitude, gravity and projection conversions are not established. World scale, ground anchors, 210-pixel flight altitude, particle trajectories, fades and gift flight paths are local visual calibration. Impact flash/craters remain local graphics; the native explosion particle set is still pending. These details prevent a claim of complete pixel or motion parity despite the reconstructed source imagery.

All poses and impact marks derive from battle time. Pausing holds them, speed changes follow the simulation, and seeking reconstructs them. Reduced motion removes the flying sleigh and debris and uses stationary gift markers while keeping impact times. Battle replacement, completion and scene shutdown clear retained meshes and sounds.

Four original Ogg samples play through Web Audio, decoded after an audio gesture. Native volume/pitch fields set their relative mix; drop/impact pitches use the middle of the source range, with a local overall mix factor. Playback offsets and rates follow battle time and replay speed. Pause, mute, hidden documents, graphics loss and scene shutdown stop active nodes. Seeking recreates the correct sample offset, and natural completion cannot replay a tail between fixed simulation ticks.

## Campaign and replay

All first 50 native layouts are now supported and reachable under the existing alternative-dependency interpretation. Stages 51–90 still need later defenses, levels, modes, Dark Elixir rewards or garrison mechanics.

Replay version 30 preserves the Santa identity and derives all five strike positions/times through ordinary simulation. Earlier schemas carrying this newly supported identity are rejected. Normal Bomb rules, home progression and earlier result summaries retain their existing behavior. Home saves and practice snapshots reject seasonal NPC identities.

## Verification

`tests/santa-trap.test.ts` covers the source identity, complete layout/progression path, exact trigger/hit boundaries, both attacking layers, allegiance, late spawns, escapes, deterministic scatter, cancellation, portable replay equality and invalid snapshots. The shared fixture deploys one ordinary level-one P.E.K.K.A at the statue in the intact layout; it has 2100 of 3000 HP after five hits.

`tests/santa-art.test.ts` covers native frame boundaries, full shear geometry, gift landing points, reduced motion and twelve timed sound cues. `tests/sample-audio.test.ts` covers decode gating, offsets, speed, pause, seeking, stale callbacks, completed tails, concurrent cues and cleanup.

`tests/browser/santa-trap.spec.ts` exercises the real campaign UI at 1440×960, 390×844 and 844×390, mesh identity/geometry, impact damage, pause/reduced motion, cleanup, exact replay state and decoded audio. A separate GPU readback compares loaded, tipping and empty poses with an independent Canvas composition of the full native scene graph. Production checks import the portable replay, inspect pre-impact and final health, rewind concealment, and require all five atlas pages and four Ogg files; Chromium repeats this after an offline reload. Current results and remaining limits are recorded in [QA.md](QA.md).
