# Revenge Deck direct counterattacks

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
The [archived Revenge Deck dossier](../official-wiki/heroes-pets/revenge-deck.md), revision
**625297**, describes a passive counter with an independent 800 ms cooldown per attacker.
The client item `Draconic Counter` selects ten `DragonScaleReflect` tiers across 27 item levels.

| Item level from | Card damage | Healing |
| --------------- | ----------- | ------- |
| 1               | 150         | 30      |
| 3               | 155         | 32      |
| 6               | 160         | 35      |
| 9               | 165         | 39      |
| 12              | 175         | 43      |
| 15              | 185         | 46      |
| 18              | 195         | 49      |
| 21              | 205         | 52      |
| 24              | 215         | 55      |
| 27              | 225         | 60      |

All tiers use `ReflectProjectile=ddreversalcardprojectile`, speed 1650 hundredths of a tile per
second. These flat damage and heal amounts do not receive outgoing attack boosts or difficulty
modifiers. Healing still observes the shared rules for a living, healable recipient.

Version 143 replaces the previous cumulative-damage/last-attacker lookup and shared cooldown
with a consumed journal of actual direct hits. Each entry keeps its canonical hit time,
attacker ID and the Duke's hit position. Independent attacker deadlines allow two towers
within 800 ms to receive two cards. Simultaneous cards include the attacker in their IDs so
the renderer and effect journal retain both. The original source projectile art is reused.

The source must still be alive when passive upkeep consumes the hit. Buildings and negative-ID
defenders resolve separately; cards aimed at enemy units carry the defender target layer.
Direct Tesla, Inferno, piercing weapon, defending Hero, Skeleton and Guardian attacks supply
their real source IDs. Primary garrison hits use the shared protection path. Traps, spells,
non-damage and secondary splash, chain, death, aura and poison effects do not enqueue counters.
Blocked damage cannot reuse an earlier attacker. Pending hits are cleared on Recall or a
successful Revive/Phoenix restoration. Versions 142 and earlier keep their former shared
cooldown, sampling time and projectile IDs.

The full client `MovableCharacterDamageOverrides` behavior is unavailable. The event journal,
fixed-step upkeep and building-footprint distance are explicit local adapters. The source
`ReflectedRange=100000` remains 1,000 tiles under the existing hundredths-of-a-tile conversion;
the wiki's uncertain 25-tile limit is not substituted. This does not claim exhaustive native
reflection behavior for every weapon or sub-frame ordering. Contacts of piercing projectiles
and a defense's committed ricochet targets retain their existing direct-hit classification.

Tests cover all 27 flat damage/heal pairs, per-attacker cooldown boundaries, same-frame hits,
distinct card IDs, excluded damage, blocked hits, a destroyed attacker and an actual Dragon
counter landing. Two actual Archer Towers verify the corrected behavior through portable
forward/backward replay snapshots. Desktop and phone Chromium check exact Node/browser state,
original cards and Hero bodies, simultaneous card meshes, historical playback, reduced motion
and read-only redraws.
