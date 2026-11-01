# Sharing an army

Open **Quick armies** from the Army drawer. **Share current army** shares the
active composition; each saved slot also has **Share**. A phone's share sheet
opens where supported, otherwise the link is copied to the clipboard. If the
browser refuses sharing or copying, a selected link appears in the Army link
field for copying by hand. Dismissing a share sheet leaves the current draft
alone.

Open a local link, or paste a local/original-game army link or raw original-game
code into **Army link**, to preview its troop and spell
counts, siege reserves, ordered heroes, equipment and pets. Opening a link does
not change the army. **Use shared army** replaces the composition after the
village's normal housing, building unlock and Super Troop checks pass. Locked or
oversized compositions explain the problem and cannot be used. The current
research levels remain in effect; links carry no research or potion levels.
Unavailable heroes, equipment and pets follow the same substitution rules and
preview notes as saved Quick armies. The resulting army can be saved in a slot.

A link received during an attack waits for the player to return home and open
Quick armies. It does not interrupt or alter combat. The link leaves the address
after being offered, so reloading does not offer it repeatedly. Hosted subpaths
are retained, while transient query parameters are omitted from outgoing links.

## Format and boundaries

`src/game/army-share.ts` owns the local version-1 composition format, carried by
`#army=1.…`. Outgoing shares are **Crown & Clan links**, using a separate format from the
live game’s army codes. Incoming original-game codes use their pinned roster
indices through a [dedicated adapter](../reference/army-codes/README.md). The link contains bounded UTF-8
JSON encoded as URL-safe base64. It includes a short name, known troop/spell
counts and optional hero loadouts. No account, village balances, permanent
research, saved layouts or battle recordings are exported. Clan Castle donations
and cargo are outside the current composition model.

The decoder caps code length, rejects unsupported versions, malformed JSON/UTF-8,
unknown roster entries, repeated entries, invalid counts, more than three siege
reserves, repeated heroes/pets and foreign equipment. It reconstructs fresh
whitelisted objects, discarding unrelated fields. Import applies the existing
atomic preparation command; a refused army cannot partially replace the current
one. Save and combat versions do not change.

## Validation

Focused model checks cover real Cookbook loadouts, Unicode names, siege reserve
counts, bounded malformed inputs, whitelist behavior, housing/unlock/battle
refusals, saved/current export, hero order, equipment restoration and unavailable
hero/pet handling. Existing Quick army, Cookbook, save and icon checks exercise
the shared snapshot path. Browser scenarios cover real share/import buttons,
previews before application, phone/landscape/desktop layouts, share and clipboard
refusals, cancellation, new navigation and links received during an attack.
Screenshots stay in ignored `output/playtest/`.

Original-game imports use the pinned client's troop/spell GlobalIDs and original
hero, equipment and pet record order. Unknown or unsupported units are rejected.
Clan Castle troops/spells and Grand Warden ground/air mode appear as explicit
exclusions before using the army and in the completion message; they are not
silently applied or converted into ordinary troops. Newer original-game roster
entries may remain unsupported until this pinned client is updated.
