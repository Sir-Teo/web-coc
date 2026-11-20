import { expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { emptyArmy } from '../src/game/army';
import { REPLAY_VERSION, replayBattle, type ReplayData } from '../src/game/replay';

it.each([
  ['ground', 2],
  ['air', 2],
  ['air', 40],
] as const)('the %s Warden uses the source group threshold with %s Archers', (mode, archers) => {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [
    makeBuilding(1, 'townhall', 34, 34, 12),
    makeBuilding(2, 'herohall', 34, 25, 6),
    makeBuilding(3, 'goldstorage', 26, 17, 12),
  ];
  model.state.army = { ...emptyArmy(), archer: archers };
  model.state.heroes = { warden: { level: 20 } };
  model.state.heroLineup = ['warden'];
  model.state.wardenMode = mode;
  model.startBattle(0, true);
  const { recording } = model as unknown as { recording: ReplayData };
  for (const [version, legacy] of [[266, true], [REPLAY_VERSION, false]] as const) {
    const battle = model.battle = replayBattle(recording.initial, version);
    model.activeTroop = 'archer';
    for (let n = 0; n < archers; n++) expect(model.deploy(16, 27)).toBe(true);
    expect(model.deployNativeHero('warden', 16, 18)).toBe(true);
    const warden = battle.units.find(({ hero }) => hero === 'warden')!;
    for (let n = 0; n < 12; n++) model.step(0.05);
    expect(warden.target).toBe(3);
    const following = legacy || archers === 40;
    expect(warden.y > 19).toBe(following);
    expect(warden.x > 17).toBe(!following);
  }
});
