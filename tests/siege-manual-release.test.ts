import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { GameModel } from '../src/game/model';
import { maxTroopLevel } from '../src/game/data';
import { replayBattle } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { siegeSelfDestructAbility } from '../src/game/native-siege-release';
import { nativeUnitStats } from '../src/game/native-units';
import { logLauncherBattle } from './fixtures/attacking-log-launcher';
import { flameFlingerBurstBattle } from './fixtures/flame-flinger-burst';
import { troopLauncherBattle } from './fixtures/attacking-troop-launcher';
import {
  RELEASE_SIEGES,
  siegeReleaseBattle,
  siegeReleasedRecording,
  siegeUnreleasedRecording,
} from './fixtures/siege-release';

const OLD: Record<string, string> = {
  'wallwrecker:1': '6481bdfc605bda13bead12cb88fcddb11abcf4ab6e8b2c0bb33a6670cef2e95b',
  'wallwrecker:6': 'bcc134981878cf1caf6595e2f4a40900a07277e5d925e633de82442affb8c4cf',
  'battleblimp:1': 'c0be131c17d1af3b5786bb9a7a793fe8ce4fb972c9bd82ce45cf342e6baddb0b',
  'battleblimp:6': 'e379caa0a4f3ee6f17a4a780843e3cdcf48f7bac6757db1c0d7b135a0d25947b',
  'stoneslammer:1': '7255e129b5bcddb3d448d49551c1771b48b9263e735010b5b9b2cb7559d5ffd8',
  'stoneslammer:6': 'bad644c192c59c8e99a256a68e086fbf2fe25bc46b1a4d020b48b4f3b09203d6',
  'siegebarracks:1': '35e5157eb4ecba55ec93d9d67c96770c8c09fce24184beea5592b0fb7085a217',
  'siegebarracks:6': 'fe6f88a02f95fb2ccad90afa3a59f21d1085f1c29fa0fa79d01377c8075555d0',
  'loglauncher:1': 'b15a106a389a00848b31043e322c2b020b817348bba1583bdf58d1464786121c',
  'loglauncher:6': 'bdb30ab132748fc435581de20e4a7d1781ad6f54ebc0760e67a56fafb4432769',
  'flameflinger:1': 'abcebb377cef6928ed30e88ceb6aeb183b7b3c7cfa920ddd5cd3f62651f50cfc',
  'flameflinger:5': '616d101f1885ba2f368d1919f5e58d5d086eaf68d58228df353b3cebeafc9de0',
  'battledrill:1': 'edf67fc57e315b4aa1ebeba00822176bee5a10ce501c08cbebebb4099f5177cf',
  'battledrill:6': '195ecb26a8477e106c149ca9d130411efa0b3fe57e4aca97cf9f472666d60b5a',
  'trooplauncher:1': '063946c395ba13558aaa822b64e8afee26b4340a00889b490a624209a246b008',
  'trooplauncher:4': '18b98b75ecd0c76f198a666809ac445859f08117313035a7d9e6fc641fb4606a',
};

for (const kind of RELEASE_SIEGES)
  for (const level of [1, maxTroopLevel(kind)]) {
    it(`${kind} ${level} retains untouched version231 states and unactivated current behavior`, () => {
      const old = siegeUnreleasedRecording(kind, level, 231),
        current = siegeUnreleasedRecording(kind, level),
        viewer = new GameModel();
      expect(createHash('sha256').update(JSON.stringify(old.snapshots)).digest('hex')).toBe(
        OLD[`${kind}:${level}`],
      );
      for (const snapshot of current.snapshots) delete snapshot.battle.nativeSiegeManualRelease;
      expect(current.snapshots).toEqual(old.snapshots);
      expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(old.data))))).toBe(
        true,
      );
      for (const snapshot of [...old.snapshots, ...old.snapshots.slice().reverse()]) {
        viewer.seekReplay(snapshot.at);
        while (viewer.replay!.seeking) viewer.step(0.05);
        expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(snapshot.battle);
      }
    });

    it(`${kind} ${level} records manual self-destruct and reconstructs complete portable states`, () => {
      expect(siegeSelfDestructAbility({ kind }, level)).toBeTruthy();
      const r = siegeReleasedRecording(kind, level),
        viewer = new GameModel();
      expect(r.data.actions.filter((a) => a.type === 'siege-end')).toHaveLength(1);
      const ended = r.snapshots.find((s) => s.at === r.endedAt)!;
      expect(ended.battle.units.find((u) => u.id === r.id)!.hp).toBe(0);
      expect(ended.battle.units.find((u) => u.id === r.id)!.defeatedAt).toBe(r.endedAt);
      expect(ended.battle.siegeDeployed).toBe(true);
      expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
      for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
        viewer.seekReplay(snapshot.at);
        while (viewer.replay!.seeking) viewer.step(0.05);
        expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(snapshot.battle);
        const before = JSON.stringify(viewer.battle);
        expect(viewer.endSiege()).toBe(false);
        expect(JSON.stringify(viewer.battle)).toBe(before);
      }
    });
  }

it('ending is once-only and does not free the one-siege deployment slot', () => {
  const r = siegeReleaseBattle('battleblimp');
  r.battle.remaining.wallwrecker = 1;
  expect(r.model.endSiege()).toBe(true);
  expect(r.model.endSiege()).toBe(false);
  expect(r.data.actions.filter((a) => a.type === 'siege-end')).toHaveLength(1);
  r.model.activeTroop = 'wallwrecker';
  expect(r.model.deploy(5, 5)).toBe(false);
  expect(r.battle.siegeDeployed).toBe(true);
});

it('the manual ability bypasses Freeze and immortality rather than applying damage', () => {
  const r = siegeReleaseBattle('battledrill');
  r.unit.native!.effects = { frozenUntil: 100, immortalUntil: 100 };
  expect(r.model.endSiege()).toBe(true);
  expect(r.unit.hp).toBe(0);
});

it('rejects missing, defeated, historical and finished siege controls', () => {
  expect(new GameModel().endSiege()).toBe(false);
  const r = siegeReleaseBattle('loglauncher', 1, 231);
  expect(r.model.deployedSiege).toBeUndefined();
  expect(r.model.endSiege()).toBe(false);
  r.battle.nativeSiegeManualRelease = true;
  r.unit.hp = 0;
  expect(r.model.endSiege()).toBe(false);
  r.unit.hp = r.unit.maxHp;
  r.battle.finished = true;
  expect(r.model.endSiege()).toBe(false);
});

it('accepts the action only with its new combat version and a carried siege', () => {
  const r = siegeReleasedRecording('stoneslammer');
  r.data.version = 231;
  expect(() => parseReplayFile(JSON.stringify(makeReplayFile(r.data)))).toThrow();
  r.data.version = 232;
  r.data.initial.army.stoneslammer = 0;
  expect(() => parseReplayFile(JSON.stringify(makeReplayFile(r.data)))).toThrow();
});

it('enables manual release only for current armies carrying siege machines', () => {
  const r = siegeReleaseBattle('siegebarracks');
  expect(replayBattle(r.data.initial, 231).nativeSiegeManualRelease).toBeUndefined();
  expect(replayBattle(r.data.initial, 232).nativeSiegeManualRelease).toBe(true);
  r.data.initial.army.siegebarracks = 0;
  expect(replayBattle(r.data.initial, 232).nativeSiegeManualRelease).toBeUndefined();
  expect(siegeSelfDestructAbility({ kind: 'giant' }, 1)).toBeUndefined();
});

for (const kind of ['battleblimp', 'stoneslammer'] as const)
  it(`${kind} keeps its source death blast and delay after manual ending`, () => {
    const r = siegeReleaseBattle(kind),
      target = r.battle.buildings.find((b) => b.id === 2)!,
      hp = target.hp,
      stats = nativeUnitStats(kind, 1);
    expect(r.model.endSiege()).toBe(true);
    r.until(stats.deathDelay - 0.05);
    expect(target.hp).toBe(hp);
    r.until(stats.deathDelay + 0.05);
    expect(target.hp).toBeCloseTo(hp - stats.deathDamage, 8);
  });

for (const afterFirst of [false, true])
  it(`ending Siege Barracks ${afterFirst ? 'after' : 'before'} its first wave loses only unspawned stock`, () => {
    const r = siegeReleaseBattle('siegebarracks', 6);
    r.until(afterFirst ? 1.35 : 0.8);
    expect(r.model.endSiege()).toBe(true);
    r.until(20);
    const children = r.battle.units.filter((u) => u.native?.owner === r.unit.id);
    expect(children).toHaveLength(afterFirst ? 2 : 0);
    expect(children.every((u) => u.kind === 'pekka' && u.hp > 0)).toBe(true);
  });

it('a rolling log continues its physical contacts after manual ending', () => {
  const r = logLauncherBattle(1, 232);
  r.step();
  expect(r.model.endSiege()).toBe(true);
  r.until(2);
  expect(r.unit.hp).toBe(0);
  expect(r.battle.nativeRollingLogs![0].hit.length).toBeGreaterThan(0);
  const wall = r.battle.buildings.find((b) => b.id === 2)!;
  expect(wall.hp).toBeLessThan(wall.maxHp);
});

it('released Flame Flinger projectiles and all three burn areas survive manual ending', () => {
  const r = flameFlingerBurstBattle(1, 232);
  r.untilShots(3);
  expect(r.model.endSiege()).toBe(true);
  r.until(8);
  expect(r.unit.native!.attacks).toBe(3);
  const burns = r.battle.nativeSpells!.filter((cast) => cast.name === 'FireSpiritExplosion');
  expect(burns).toHaveLength(3);
  expect(burns.every((cast) => cast.hits > 0)).toBe(true);
});

it('an airborne Troop Launcher barrel still delivers after manual ending', () => {
  const r = troopLauncherBattle(1, 232);
  r.untilShots(1);
  expect(r.model.endSiege()).toBe(true);
  r.until(r.packets[0].impact + 1.3);
  expect(r.packets).toHaveLength(1);
  expect(r.spawns).toHaveLength(7);
  expect(r.battle.units.some((unit) => unit.hp > 0 && unit.level === 9)).toBe(true);
});
