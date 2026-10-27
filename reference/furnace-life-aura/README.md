# Furnace life-aura degeneration

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
The [Furnace dossier](../official-wiki/troops/furnace.md), revision **625281**, describes a
60-second lifetime with fixed health degeneration. It explicitly states that bonus health
from Life Gem extends that lifetime because the degeneration rate stays fixed.

The [Life Gem dossier](../official-wiki/heroes-pets/life-gem.md), revision **623272**, maps
the item's `GrandWardenLifeAura` ability to `Life Gem Aura.ExtraHealthPermil` and
`ExtraHealthMax`. Its 18 equipment levels grant caps of 640, 640, 750, 750, 750, 830, 830,
830, 930, 930, 930, 1010, 1010, 1010, 1120, 1120, 1120 and 1200 HP. Each cap is lower than
the percentage grant for every Furnace level. The [Apprentice Warden dossier](../official-wiki/troops/apprentice-warden.md),
revision **624360**, and `Apprentice Aura` rows grant 20%, 22%, 24% and 26% without a cap.
Overlapping life auras use the strongest grant.

Previously the Furnace controller directly subtracted degeneration from base HP, bypassing
the existing temporary-health pool. In an actual unarmed campaign attack, a level-1 Furnace
beside a Life Gem Warden died at 60.05 seconds with all 640 bonus HP still unused. Aura pulses
continued refreshing the pool's expiry but could never spend it on degeneration.

Version 150 consumes active temporary health before base HP at the existing fixed rate,
`base maximum HP / 60`. It reuses the existing strongest-source pool and its expiry; aura
pulses do not refill consumed health. This is degeneration rather than enemy damage, so it
does not create incoming-hit journals, damage counters, shield interactions or reflection.
Expired bonus health is not spent. Siege Barracks keeps its existing decay path and is
excluded from life auras by the pinned spell's siege immunity.

For example, a level-1 Furnace drains 25.5 HP/s. A continuous level-1 Life Gem grants 640
HP and extends its lifetime by `640 / 25.5`, to approximately 85.1 seconds at 20 Hz. Its
19-Firemite stock remains finite; the longer life creates no extra releases. All four
Furnace levels retain their source HP, stock and base drain rates. Release spacing retains
the [existing local interpretation](../deployment-lifecycle/README.md).

Only carried Furnace rosters with Life Gem or an Apprentice Warden enable this adapter.
Versions 149 and earlier preserve the unused bonus pool and former lifetime. Plain Furnace
battles retain exact version-149 physical state and allocate no aura-decay capability.

`tests/furnace-aura-decay.test.ts` checks every Life Gem and Apprentice level, all Furnace
levels, actual overlapping auras, fixed lifetime and finite stock, complete portable
forward/reverse snapshots and historical isolation. `tests/browser/furnace-aura-decay.spec.ts`
checks minimum/maximum Life Gem levels in current/historical desktop and phone playback,
including original Furnace meshes, full battle state, read-only rendering, reduced motion
and reverse seeks. Fixtures use actual troop/hero deployment inputs and valid campaign
metadata, with no artificial damage, health or freeze changes.
