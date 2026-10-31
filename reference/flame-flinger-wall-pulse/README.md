# Flame Flinger preferred Wall pulse damage

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
All five `FireCatapultProjectile` rows cast `FireSpiritExplosion` at their own
level. That spell declares `Damage=1`, `PreferredTarget=Wall` and
`PreferredTargetDamageMod=25`, in addition to its separate ramping poison damage.
See the [combat tables](../full-client/combat.json) and
[pinned comparison](../official-wiki/spells-siege-super/flame-flinger.md).

Previously the local spell handler ignored the preferred target for its flat
area damage. A real level-one projectile left a pool whose first pulse dealt
3.56 to both an adjacent Wall and a storage, both outside its direct impact
radius. Version **226** applies the source preference to the flat component:
1 becomes 25 against Walls, adding **24 damage per pulse**. The poison ramp is
unchanged. First-pulse damage is therefore 27.56 against that Wall and 3.56
against the storage; at full exposure those pulses reach 57 and 33 respectively.
At level five the corresponding maximum pulses are 77 and 53.

The separation is consistent with the older public native reference:
[`LogicSpell.cs` at commit 52c5953](https://github.com/bns34/Supercell.Magic-my-turn/blob/52c5953f5e5802c64ac36e53d5599f8700976085/Supercell.Magic.Logic/GameObject/LogicSpell.cs#L765)
passes the preferred target/modifier to `AreaDamage`; its separate `AreaPoison`
call passes no preferred target. That reference predates Flame Flinger and does
not establish modern executable parity. This correction therefore preserves the
existing poison adapter and does not multiply the poison component by 25.

The pool retains its existing 2.5-tile footprint area, 75 pulses at 0.4-second
intervals, 30-second pulse window and five-second exposure ramp. The existing
immediate-hit-spell adapter retains the 0.5-second first-hit delay after impact.
Its flat damage, poison, ground/air behavior, trap and Overgrowth gates retain
their existing paths. Only an attacking `FireSpiritExplosion` in a new carried
Flame Flinger army acquires `nativeFlameFlingerWallPulse`. Other spells are
unchanged, including Lightning and Earthquake.

The machine's separate 8× direct Wall multiplier, projectile flight, health-loss
ticks and ordinary release clock are retained. This does not implement its
three-projectile burst. The pinned wiki's per-projectile damage and the source
DPS/cycle relationship remain unresolved; current generic direct damage and
readouts stay in place. No source artwork, body phase, transport behavior or
replay envelope changes are introduced.

Current Info explains the maximum burn pulse, interval, radius, duration, extra
Wall damage, direct Wall hit and health drain. Values come from its projectile,
hit-spell and character rows. Historical battle inspection retains its old guide.

Four complete version-225 recordings, covering tiers 1/5 from two deployment
distances, were captured twice and imported/compared forward and backward before
implementation. Their state hashes remain pinned. Current portable states use
the same checks. Model tests cover all five tiers, unchanged ordinary targets,
75 pulses after caster loss, exact radius boundaries, trap/Overgrowth protection,
Lightning controls and old/new capability. Browser checks cover full portable
states, original body/projectile meshes, the isolated Wall pulse difference,
rewind, reduced motion and source Info across phone, landscape and desktop.
Screenshots remain in ignored `output/playtest/`.
