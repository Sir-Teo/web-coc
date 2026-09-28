# Ladder matches

The live game moves trophies through multiplayer attacks against other players' villages. This build has no server, so trophies stayed at a new village's 1,248 and the league and its Star Bonus never changed. Ladder matches are the project's own stand-in. **Nothing in them comes from the client**: the opponent pool, the trophy offer and the rules below are invented, and are kept in `src/game/ladder.ts`.

## Rules

- **Opponent.** A native Goblin map or Challenge layout (never a fan-made one) whose suggested Town Hall is closest to yours, within one level of the closest match. It carries an invented trophy count up to 100 above or below yours. The pick is seeded by `ladderSeed`, the number of matches started, so the Campaign screen's preview is the match you get, and each match started moves on to a new opponent.
- **Offer.** With `gap = opponent − yours`, a three-star win pays `round(30 + gap / 12)` trophies, clamped to 1–59, and a defeat costs `round(20 − gap / 12)`, clamped to 1–39. One and two stars pay a third and two thirds of the win, rounded. No stars loses the stake. Trophies never drop below zero.
- **Battle.** 30 seconds of scouting and three minutes to attack, as in practice. There is no loot, and campaign stars and inventory are untouched. Deployed troops are spent as in a campaign attack. Stars bank toward the Star Bonus.
- **Records.** The raid log marks the attack LADDER with its trophy change. Replays and exported replay files carry the match, and validation rejects a ladder match with loot, run as practice or on anything but a native layout.

## Limits

This is not matchmaking. There are no real opponents, defenses against your village, shields, Legend League or ranked seasons.
