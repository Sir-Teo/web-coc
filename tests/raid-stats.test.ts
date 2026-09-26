import { expect, it } from 'vitest';
import { GameModel, initialSave } from '../src/game/model';
import { emptyArmy } from '../src/game/army';
import { validateSave } from '../src/game/save';
import { freshNativeCampaign } from '../src/game/native-campaign';

it('a raid abandoned without a star is completed, not won', () => {
  const m = new GameModel();
  m.state.army = { ...emptyArmy(), swordsman: 5 };
  m.startCampaign(0);
  m.activeTroop = 'swordsman';
  for (const [x, y] of [
    [2, 2],
    [2, 45],
    [45, 2],
    [45, 45],
  ])
    if (!m.deployBlocked(x, y)) {
      m.deploy(x, y);
      break;
    }
  m.finishBattle();
  expect(m.battle!.stars).toBe(0);
  m.returnHome();
  expect(m.state.stats.raids).toBe(1);
  expect(m.state.stats.wins).toBe(0);
  expect(validateSave(m.state)).toBe(true);
});

it('seeds victories for older saves from the villages that hold a star', () => {
  const save = initialSave();
  delete save.stats.wins;
  save.stats.raids = 7;
  save.nativeCampaign = freshNativeCampaign();
  save.nativeCampaign.stars[0] = 3;
  save.nativeCampaign.stars[1] = 1;
  const m = new GameModel(save);
  expect(m.state.stats.wins).toBe(2);
});
