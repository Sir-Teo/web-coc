# Balloon bombs

September 11, 2026. Balloon attacks now apply full attack damage to nearby building footprints when the bomb lands. The local radius is 1.2 tiles. The intended target is damaged once, collateral damage respects the footprint boundary, traps are excluded, and friendly troops are unaffected. Research and Rage scale the damage captured at launch. Destruction of the original target leaves the bomb's last impact point and collateral blast intact.

Bombs aim at the approached point on the building footprint, rather than forcing their destination to the distant center of a large roof. Their visual endpoint is near the ground at that point. This produces a downward drop from each side of a Town Hall while retaining the existing edge-based attack range and defense preference. Long flying movement steps clamp at the approached point instead of overshooting it.

The impact draws a warm isometric ground ellipse beneath airborne troops. Its full width and height project the configured radius using the same tile scale as the village. It grows to that radius and fades; reduced motion uses a stationary flash. The troop information panel now explains the blast and shows its radius. Wizard's existing splash radius is also declared in the troop catalog and displayed in that panel; its damage multiplier remains unchanged.

## Reference boundary

Supercell's [Rocket Balloon announcement](https://supercell.com/en/games/clashofclans/blog/game-updates/rocket-to-victory-2/) documents ground-targeting area splash and a preference for defenses for that variant. The community [Balloon reference](https://clashofclans.fandom.com/wiki/Balloon) also describes ground area damage for the regular troop; its search excerpt was available, while direct page retrieval was blocked. These references support the behavior's direction, not exact certification of this game's geometry or numbers. The 1.2-tile footprint test, impact point and 0.33-second flight remain explicit local tuning.

## Verification

Eight simulation cases cover the impact delay, primary/collateral damage, footprint edges, radius exclusions, traps, research scaling, friendly troops, destruction during flight, four approach directions and long-step movement. The full simulation/campaign/save suite passes 166 tests, including 144 campaign army/approach scenarios. Three browser cases check actual downward endpoints, native ground-blast depth and damage, and the phone information panel. Related movement, destruction and replay-tool scenarios pass in Chromium.

The additional replay implementation in the working tree uses combat version 3 for the changed blast rules. Earlier result summaries remain available; incompatible simulations are not played under these rules. Existing Balloon death damage remains separate from attack splash. Complete airborne death animation, exact live-game statistics, wider air armies and physical-device certification remain open.
