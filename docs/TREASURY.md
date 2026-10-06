# Treasury

The Clan Castle's **Treasury** is where the Star Bonus is banked, as in the original ("Clan War and Star Bonus loot is greatly protected inside the Treasury"). Open it from the Clan Castle's card (the Treasury button); the button shows a red badge once a resource has filled.

## Source

`reference/leagues/catalog.json` holds the Treasury per Town Hall, read by `scripts/import-native-leagues.py` from the pinned client's `logic/townhall_levels.csv`. The columns used are `TreasuryWarGold`, `TreasuryWarElixir` and `TreasuryWarDarkElixir`; the plain `TreasuryGold`, `TreasuryElixir` and `TreasuryDarkElixir` columns hold a legacy zero. `logic/globals.csv` sets `TREASURY_SIZE_BASED_ON_TH` to TRUE, and the values match the wiki's [Treasury](https://clashofclans.fandom.com/wiki/Treasury) table for a player outside a clan (Template:Treasury revision 618957 and Treasury revision 623778, read through the MediaWiki API on October 6, 2026):

| Town Hall | Gold and Elixir | Dark Elixir |
| --------- | --------------- | ----------- |
| 1         | 50,000          | 0           |
| 2         | 200,000         | 0           |
| 6         | 1,200,000       | 0           |
| 7         | 1,600,000       | 8,000       |
| 10        | 2,800,000       | 14,000      |
| 17        | 5,600,000       | 30,000      |
| 18        | 6,000,000       | 32,000      |

The same import reads the Town Hall upgrade boost: `TH_UPGRADE_STAR_BONUS_BOOST_MULTIPLIER` (4) from the globals and each level's `StarBonusBoostHours` (none below Town Hall 4, then 72 hours, 96 from Town Hall 7 and 120 from Town Hall 10).

## Rules

- **Banking.** With a Clan Castle built, collecting the Star Bonus puts its Gold, Elixir and Dark Elixir in the Treasury, up to its room. As the wiki describes for a full Treasury, whatever does not fit is lost. Ore still goes to the Blacksmith. A village without a Clan Castle has no Treasury, so the bonus pays into its storages as before; this is the game's own rule, since the original always has a castle, even if only as a ruin.
- **Collecting.** Collect moves every resource at once. What a full storage cannot take stays in the Treasury, as the wiki states. Collected resources count toward "Resources collected", and collected Gold counts toward Clan War Wealth (see [ACHIEVEMENTS.md](ACHIEVEMENTS.md)).
- **Size.** The Treasury follows the Town Hall alone. Clan Perks raise it in the original, but this village has no clan.
- **Town Hall boost.** Finishing a Town Hall upgrade to level 4 or higher multiplies the Star Bonus by four for that level's hours, counted from when the upgrade finished. The boost covers resources and ore, as the wiki says. The Star Bonus card shows the boost and the time it has left, and the reward it shows includes it. A later upgrade's boost never shortens one already running.
- **Saves.** `treasury` holds the three amounts, which must be whole and not negative. `starBonus.boostUntil` holds when the boost ends.

Not included: Clan War, Clan War League and Clan Games deposits, Clan Perk sizes, and the 3% an attacker steals from the Treasury, because nobody attacks this village. The Star Bonus is also still claimed with its Collect button rather than paid out when the fifth star is scored.

## Tests

`tests/treasury.test.ts` checks:

- the Town Hall sizes against the wiki table;
- that a bonus is banked up to the room and the rest is lost;
- collecting everything at once, with leftovers kept;
- the Clan War Wealth and "Resources collected" counts;
- the castle requirement;
- the boost's hours and multiplier, including its expiry;
- save validation.

`tests/browser/treasury.spec.ts` runs at 390 × 844 and 1440 × 960. It collects a boosted bonus into the Treasury, opens it from the Clan Castle card, checks the full-Treasury badge, the rows and the touch-sized Collect button, and collects into the storages.
