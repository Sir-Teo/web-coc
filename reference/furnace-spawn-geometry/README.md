# Stable Furnace release geometry

The pinned 18.400.21 Furnace rows declare `BunkerSpawnDist=100` (one tile) and total stocks
19, 20, 21 and 22. See the [Furnace dossier](../official-wiki/troops/furnace.md), revision
**625281**. The existing local controller distributes releases in six directions using
`angle = (releaseIndex / 6) * Math.PI * 2`. The precise original client's angle selection is
unavailable; this change preserves the local rule and does not claim native angle parity.

A complete portable battle with a Furnace at `(6.9, 11.5)` and a nearby Life Gem Warden
exposed host-dependent sine rounding. At zero-based release index 4, Node returned
`sin(4 / 6 * PI * 2) = -0.8660254037844385`; Chromium returned `-0.8660254037844384`.
The different Firemite position entered unit separation and changed parent, Warden and aura
positions by one binary64 step. The first full-state mismatch appeared by battle time 20.
Health, source stats and release counts were the same, but replay state was not bit-identical
across runtimes. Version 149 and 150 both reproduced this independently of the life-aura fix.

Version 151 pins all 22 existing release direction pairs as binary64 constants in
`src/game/native-furnace-geometry.ts`. Values retain the previous Node computation, including
its multi-turn angle rounding. Runtime Furnace releases no longer call host sine/cosine.
The source radius, local release schedule, stock, birth times, health and collision rules
remain unchanged. Only carried Furnace rosters enable this geometry. Other radial summoners
retain their own behavior. This fixes the observed Furnace path; it does not establish global
cross-runtime equality for every remaining host-trig calculation.

Versions 150 and earlier retain their original host math. Their full portable replay tests
compare historical recordings within the same runtime; exact cross-runtime identity is not
asserted for the known historical sine difference. Current browser tests compare complete
Node-recorded battles against Chromium with no rounded fields or omitted coordinates.

`tests/furnace-spawn-geometry.test.ts` checks the problematic direction without calling host
trig, exact previous Node combat through the complete source stock at all four levels, scoped
capability allocation, and portable forward/reverse snapshots. The browser spec
`tests/browser/furnace-spawn-geometry.spec.ts` uses the original reproducing lane for minimum
and maximum source levels, on desktop and phone, with full current cross-runtime snapshots,
historical same-runtime snapshots, rewind, read-only rendering and reduced motion.
