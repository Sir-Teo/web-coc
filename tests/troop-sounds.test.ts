import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import source from '../reference/troop-sounds/sounds.json' with { type: 'json' };
import { GameModel } from '../src/game/model';
import { emptyArmy } from '../src/game/army';
import { CUE_HORIZON } from '../src/game/sample-audio';
import {
  BattleSoundLog,
  DESTROYED_EFFECT,
  effectCue,
  troopSample,
  troopSoundCues,
  troopSoundEffect,
  troopSoundFiles,
} from '../src/game/troop-sounds';

function battle() {
  const m = new GameModel();
  m.state.army = { ...emptyArmy(), swordsman: 10, archer: 10 };
  m.startBattle(0);
  m.activeTroop = 'swordsman';
  return m;
}
const spot = (m: GameModel) => {
  for (const [x, y] of [
    [2, 24],
    [24, 2],
    [46, 24],
    [24, 46],
  ])
    if (!m.deployBlocked(x, y)) return [x, y] as const;
  throw Error('No free deploy spot');
};

describe('troop sounds', () => {
  it('reads every troop’s deploy, attack and death effects from the client', () => {
    expect(Object.keys(source.troops)).toHaveLength(78);
    expect(source.troops.swordsman).toEqual({
      name: 'Barbarian',
      deploy: 'Barbarian Deploy',
      attack: 'Barbarian Attack',
      die: 'Barbarian Die',
    });
    // The Barbarian's three deploy takes are alternatives, all at the client's 40% volume.
    expect(source.effects['Barbarian Deploy'].map((t) => t.sound)).toEqual([
      'sfx/barb_deploy_11.ogg',
      'sfx/barb_deploy_11v2.ogg',
      'sfx/barb_deploy_11v3.ogg',
    ]);
    // A Wizard's attack changes with its level, as its character rows do.
    expect(troopSoundEffect('wizard', 1, 'attack')).toBe('ps_chr_WizardAttack_01');
    expect(troopSoundEffect('wizard', 4, 'attack')).toBe('ps_chr_WizardAttack_Lvl2');
    expect(troopSoundEffect('wizard', 99, 'attack')).toBe('ps_chr_WizardAttack_Lvl4');
    expect(troopSoundEffect('golemite', 1, 'deploy')).toBeUndefined();
    expect(source.effects[DESTROYED_EFFECT][0].sound).toBe('sfx/building_destroyed_01.ogg');
  });

  it('ships each sound unchanged and pinned', () => {
    for (const [path, sound] of Object.entries(source.sounds)) {
      const data = readFileSync(`public/${sound.path}`);
      expect(data.length, path).toBe(sound.bytes);
      expect(createHash('sha256').update(data).digest('hex'), path).toBe(sound.sha256);
    }
    const files = troopSoundFiles('swordsman');
    expect(files).toContain('sfx/barbarian_death_01.ogg');
    expect(files.every((f) => f in source.sounds)).toBe(true);
  });

  it('picks one take per event, the same every time, with its pitch in range', () => {
    const a = effectCue('Barbarian Attack', 'troop:7:attack:3.5', 3.5)!;
    expect(effectCue('Barbarian Attack', 'troop:7:attack:3.5', 3.5)).toEqual(a);
    const takes = source.effects['Barbarian Attack'];
    const take = takes.find((t) => troopSample(t.sound) === a.sample)!;
    expect(take).toBeDefined();
    expect(a.volume).toBe(take.volume);
    expect(a.pitch).toBeGreaterThanOrEqual(take.minPitch);
    expect(a.pitch).toBeLessThanOrEqual(take.maxPitch);
    // Different events spread over the takes.
    const used = new Set(
      Array.from({ length: 40 }, (_, i) => effectCue('Barbarian Attack', `k${i}`, 0)!.sample),
    );
    expect(used.size).toBe(takes.length);
  });

  it('cues deploys when a troop arrives and deaths when it falls, never on a seek', () => {
    const m = battle(),
      log = new BattleSoundLog();
    expect(troopSoundCues(m.battle, log)).toEqual([]);
    const [x, y] = spot(m);
    expect(m.deploy(x, y)).toBe(true);
    const u = m.battle!.units.at(-1)!;
    const deploy = troopSoundCues(m.battle, log).find((c) => c.key === `troop:${u.id}:deploy`)!;
    expect(deploy.at).toBe(m.battle!.elapsed);
    expect(deploy.sample).toMatch(/^troop-barb_deploy_11/);
    // It stays the same cue on later frames, then plays out.
    m.battle!.elapsed += 0.2;
    expect(troopSoundCues(m.battle, log).find((c) => c.key === deploy.key)).toEqual(deploy);
    u.hp = 0;
    u.defeatedAt = m.battle!.elapsed;
    expect(troopSoundCues(m.battle, log).map((c) => c.key)).toContain(`troop:${u.id}:die`);
    m.battle!.elapsed += CUE_HORIZON + 1;
    expect(troopSoundCues(m.battle, log)).toEqual([]);
    // A log that starts (or seeks) with troops on the field stays silent for them.
    const fresh = new BattleSoundLog();
    m.battle!.elapsed = 0.3;
    u.hp = u.maxHp;
    delete u.defeatedAt;
    expect(troopSoundCues(m.battle, fresh)).toEqual([]);
  });

  it('logs attacks and ruins until they have played out, and forgets them on a seek back', () => {
    const m = battle(),
      log = new BattleSoundLog();
    const [x, y] = spot(m);
    m.deploy(x, y);
    const u = m.battle!.units.at(-1)!;
    troopSoundCues(m.battle, log);
    m.battle!.elapsed = 2;
    log.attack(m.battle!, u);
    log.destroyed(m.battle!, 10.5, 12.5);
    const keys = troopSoundCues(m.battle, log).map((c) => c.key);
    expect(keys).toContain(`troop:${u.id}:attack:2`);
    expect(keys).toContain('destroyed:10.5:12.5');
    m.battle!.elapsed = 1;
    expect(troopSoundCues(m.battle, log).filter((c) => !c.key.endsWith(':deploy'))).toEqual([]);
  });
});
