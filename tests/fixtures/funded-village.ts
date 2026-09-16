import { GameModel } from '../../src/game/model';

/**
 * A starter village with money to spend.
 *
 * Storage now holds the original allowance, so a new village opens with the original's own
 * 750 gold and 750 elixir and a Town Hall 2 holds only 7,000 of each. That is the real
 * opening economy, and tests of it say so explicitly. Tests of everything else — obstacles,
 * traps, walls, army unlocks — only need a village that can pay, and say so with this.
 *
 * Storage caps income, never a balance already held, so the grant is spendable as it stands.
 */
export function fundedVillage(gold = 5_000_000, elixir = 5_000_000, dark = 100_000) {
  const m = new GameModel();
  m.state.gold = gold;
  m.state.elixir = elixir;
  m.state.dark = dark;
  return m;
}
