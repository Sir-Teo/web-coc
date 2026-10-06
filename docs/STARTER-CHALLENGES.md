# Starter Challenges

The live game gives Town Halls 2 to 6 a free reward track, which the wiki calls the [Starter Challenges](https://clashofclans.fandom.com/wiki/Starter_Challenges) (revision 615217, read through the MediaWiki API on October 6, 2026) and the client titles the **Starter Pass**. Completing challenges earns points, and points unlock 26 reward tiers that can be claimed at any time. It is not time-limited: it ends when the Town Hall reaches 7, and then every tier not yet claimed is granted, even if its points were never earned.

## Source

`python3 scripts/import-native-starter-challenges.py` reads the pinned client's tables into `reference/starter-challenges/catalog.json`; `--check` verifies it reproduces.

- `logic/starter_pass.csv` lists the 60 challenges in order, each with the Town Hall that reveals it (`TownHallUnlock`, one below the Town Hall named in the task: TH2 tasks read 1). Its first 26 rows also carry the tiers: `TierScores`, `RewardType` and `RewardAmount`.
- `logic/starter_pass_tasks.csv` gives each challenge's type and how its progress counts (`Best` or `Accumulative`), its points (`Score`), its targets (`Quantity`, `Quantity2`) and its subject (`Data1`: a building, troop or resource).
- `localization/texts.csv` gives the titles and descriptions, with the client's `<num>`, `<num2>` and `<building>` filled in. Building names come from their `TID` in `logic/buildings.csv`.
- The panel's title is the client's own "Starter Pass", with its line "Starter Pass ends when you reach Town Hall 7".

The 60 challenges are worth 5,600 points, as the wiki states. The tiers run from 100 to 5,000 points and pay Gold, Elixir, Gems and magic items, ending with a Book of Building. The client pays 250,000 Gold and 250,000 Elixir at 3,000 and 3,200 points, where the wiki's table says 200,000; this game follows the client.

## How progress counts

Each Town Hall reveals its challenges, and revealed challenges never expire. A challenge is done when its progress reaches its quantity, and its points count from then on. The table names no prerequisites, so every challenge of a revealed Town Hall shows at once; the wiki says some are revealed by completing others.

| Type                                                                    | Counted from                                                                                                                      |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Upgrade Building (24)                                                   | The village: how many buildings of the kind stand at the level or above.                                                          |
| Repair Clan Castle                                                      | Whether a Clan Castle stands.                                                                                                     |
| Claim Achievements                                                      | Achievement tiers claimed.                                                                                                        |
| Single Player stars                                                     | Stars on the Goblin campaign map, as the achievements count them.                                                                 |
| Start building upgrades, research, wall upgrades, obstacles, collection | Each one as it happens, after the challenge is revealed.                                                                          |
| Loot (total)                                                            | Gold and Elixir looted in campaign raids, before storage limits.                                                                  |
| Loot in a single battle                                                 | The best single raid. The client asks for a Multiplayer Battle, but ladder matches carry no loot here, so a campaign raid counts. |
| Multiplayer stars, ruins, deployed housing, stars with a troop          | Ladder matches, this game's stand-in for Multiplayer Battles (as for the achievements).                                           |

Five challenges cannot be completed here, and the panel says why:

- the clan ones (join a clan, request reinforcements, donate troops and spells);
- Speedy Stars, which needs stars earned within a battle's first minute (battles keep no star times).

The two Practice Mode ones ("Win 3x/9x total Stars from Practice Levels") count the best stars on each [Practice level](PRACTICE-MODE.md).

They only cost points, since Town Hall 7 grants every tier anyway.

## Rewards

A tier can be claimed once its points are earned. Gold and Elixir need room in the storages for the whole amount ("Storage Full" otherwise). Gems are added, and a magic item beyond its limit is sold for its gems, as the Trader does. When the Town Hall goes from 6 to 7, every unclaimed tier is paid: resources up to the storages' room, items sold when there is none. A balance already above the room is never lowered, and a village already past Town Hall 7 never sees the Starter Pass.

The Awards button's badge counts claimable tiers with the achievements, and the profile shows a Starter Pass card (points and a Challenges button) while it runs. The panel shows the points, the reward track and the revealed challenges by Town Hall, done ones last. The track scrolls sideways, so a phone keeps every tier without the dialog scrolling. Its Claim buttons are 44 px tall.

## Saves

`starter` holds the counted progress by challenge, the claimed tier indices and, once Town Hall 7 is reached, `ended`. Validation rejects unknown challenges, negative or fractional counts, unknown or repeated tiers.

## Tests

`tests/starter-challenges.test.ts` checks:

- the client totals, and the subjects every challenge names;
- that each Town Hall reveals its set;
- building progress read from the village;
- upgrade and collection counting;
- campaign loot against ladder-only multiplayer counts, including the Archers challenge;
- tier claims, the full-storage refusal and the Town Hall 7 grant;
- that a Town Hall 8 village gets nothing and keeps its balance;
- save validation.

`tests/browser/starter-challenges.spec.ts` runs at 390 and 1440 px. It opens the panel from Awards, claims a tier and checks the touch-sized Claim button, the sideways track and the page's own width. `achievements.spec.ts` now counts Starter Pass tiers in the Awards badge.
