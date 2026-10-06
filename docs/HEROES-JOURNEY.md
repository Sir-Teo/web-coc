# Hero's Journey

The Hero Hall's reward track. The client has no table for it (its rewards are server-configured), so the track comes from the wiki snapshot `reference/official-wiki/heroes-pets/heros-journey.md` (revision 625220). `node scripts/import-heroes-journey.mjs` turns that page into `reference/heroes-journey/catalog.json`, and `--check` confirms the committed catalog still matches it.

## Rules implemented

- **Opening.** From Town Hall 7 with a Hero Hall. The Hero Hall card shows a Journey button, with a badge while a reward is waiting.
- **Progress.** Every hero's level added together. 113 tiers run from 2 to 480.
- **Rewards.** Elixir and Dark Elixir go into storage and any excess is reported as lost. Ore is capped by the Blacksmith's storage. Magic items go into the item inventory. Skins are recorded but not drawn.
- **Equipment tiers.** They grant the hero's first Epic item not yet owned, from the wiki's fixed order, at the stated level (capped at the item's maximum). If every Epic is already owned, they pay 50 Starry Ore instead.
- **Hero Quests.** Starting a quest tier runs a 14-day quest; one runs at a time.
  - **Counting.** Stars count only from ladder matches, this game's stand-in for multiplayer (see [LADDER.md](LADDER.md)). The named hero must be deployed; for an item quest, that hero must also carry the item. If the Epic isn't owned, the hero's starting item counts instead.
  - **Payout.** 15 stars open three Ore Chests (Shiny, Glowy, Starry) rolled from the normal ranges for your Town Hall (Town Hall 7 uses the Town Hall 8 row).
- **Magic items.** Items obey the client's limits, and a reward that does not fit is sold for its gems; the notice says so. Book of Heroes finishes a hero's or pet's running upgrade, Hero Potions field heroes and pets at their Town Hall maximum, Runes fill storages and Pet Potions speed the Pet House (see [MAGIC-ITEMS.md](MAGIC-ITEMS.md)).

## Not implemented

- The seven-day auto-claim and auto-sell of unclaimed rewards: rewards here wait indefinitely.
- Resuming a failed quest for gems: the wiki gives no price, so an expired quest simply ends.
- The accelerated Ore Chest ranges: the wiki doesn't say who qualifies. The table is imported but not used.
- The Mighty Morsel is held but has no effect: the client's tables do not describe it.
