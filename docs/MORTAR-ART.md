# Original Mortar artwork, levels 1–18

The live Mortar uses the [pinned original-client artwork](../reference/mortar/README.md) from client 18.400.21. All eighteen normal levels have their own source body and portrait. Five lossless texture crops retain the original polygons, transforms, colors and nested animation. Native barrels select one of eight directional views, with gearup explicitly disabled.

The original base, construction placeholder, upgrading scaffold and ruined body share a local world registration: scale 1.2, source anchor (0,80). Portraits use common source bounds [-84,-22,89,146] at two pixels per source unit. The selection proxy and placement preview use the same registration as the native assembly. Paid upgrades update the body and the context/Info artwork without moving the building. Retained level-eighteen villages render their actual level, while normal home construction still follows the Town Hall eight catalog.

Live combat uses original shells, source shadows, launch smoke/fire, three impact tiers, repeated grass rows, rubble/debris and five original Ogg sounds. The projectile keeps its launch origin after target loss or destruction. All temporary views are reconstructed from simulation time, including backward seeks, and removed on completion or leaving playback. Reduced motion hides airborne effects and keeps the original ring or later-level crater as ground feedback.

The original asset data does not establish the game's private projection or particle equations. The eight nearest map-direction sectors, 115-pixel sinusoidal visual arc, altitude conversion and shared particle motion remain local interpretations. Source speed controls physical arrival; there is no claim of native executable parity or an authored barrel recoil animation.

The browser checks compare every live normal assembly with its independent source portrait, exercise all eighteen levels in every building state, verify phone upgrade and placement UI, and reconstruct effects/audio across desktop and both phone orientations. A frozen original shell, trail and smoke also undergo WebGL context loss and restoration with a byte-for-byte canvas comparison. Details and source reproduction commands are in the reference above.

The earlier generated six-level artwork remains under `art/source/mortar-levels-v1` and `public/assets/buildings/mortar-levels-v1` as historical provenance and inputs to legacy asset scripts. It is no longer requested by the live Mortar. The original import and independent GPU witnesses are preserved separately from that earlier generated work.
