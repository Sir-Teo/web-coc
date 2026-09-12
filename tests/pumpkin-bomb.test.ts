import { describe, expect, it } from 'vitest';
import { BUILDINGS, trapDamage } from '../src/game/data';
import { GameModel, makeBuilding, makeNpcBuilding, type FX, type Unit } from '../src/game/model';
import {
  NATIVE_CAMPAIGN,
  nativeBuildings,
  nativeCampaignIssues,
} from '../src/game/native-campaign';
import { validNpcBuilding } from '../src/game/npc-buildings';
import { PUMPKIN_BOMB, pumpkinFrame } from '../src/game/pumpkin-bomb';
import { battleTrapStats, stepTraps } from '../src/game/traps';
import { REPLAY_VERSION, validateReplay } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { validateSave } from '../src/game/save';
import { pumpkinBattle } from './fixtures/pumpkin-battle';

function arena() {
  const m = new GameModel();
  m.startBattle(0);
  m.discardRecording();
  const b = m.battle!,
    trap = makeNpcBuilding(9000, 'pumpkin-bomb', 10, 10);
  b.buildings = [trap, makeBuilding(9001, 'townhall', 30, 30)];
  b.started = true;
  const effects: FX[] = [];
  const effect = (fx: FX) => effects.push(fx);
  const unit = (x: number, kind: Unit['kind'] = 'giant') => {
    const u: Unit = {
      id: 10000 + b.units.length,
      kind,
      x,
      y: 10.5,
      hp: 5000,
      maxHp: 5000,
      cooldown: 100,
      target: null,
      path: [],
      pathAt: 0,
      attacking: false,
    };
    b.units.push(u);
    return u;
  };
  return { m, b, trap, effects, effect, unit };
}

describe('native campaign Pumpkin Bomb', () => {
  it('enables all four complete layouts without changing normal Bomb progression', () => {
    const stages = NATIVE_CAMPAIGN.flatMap((s, i) =>
      s.traps.some(([id]) => id === 12000003) ? [i] : [],
    );
    expect(stages).toEqual([9, 10, 19, 32]);
    expect(
      stages.map((i) => {
        expect(nativeCampaignIssues(i)).toEqual([]);
        return nativeBuildings(i).filter((b) => b.npc === 'pumpkin-bomb').length;
      }),
    ).toEqual([1, 2, 3, 4]);
    expect(battleTrapStats(makeNpcBuilding(1, 'pumpkin-bomb', 1, 1))).toMatchObject(PUMPKIN_BOMB);
    expect(trapDamage('bomb', 1)).toBe(20);
    expect(BUILDINGS.bomb.trap?.delay).toBe(1.5);
    expect(Object.hasOwn(BUILDINGS, 'pumpkin-bomb')).toBe(false);
  });

  it('conceals the passable trap during scouting and ignores incoming damage', () => {
    const { m, trap, b } = arena();
    b.started = false;
    expect(m.visibleBuilding(trap)).toBe(false);
    expect(m.deployBlocked(10.5, 10.5)).toBe(false);
    m.damage(trap, 10000);
    expect(trap.hp).toBe(1);
    m.activeSpell = 'lightning';
    b.spells.lightning = 1;
    m.castSpell(10.5, 10.5);
    expect(trap.hp).toBe(1);
    expect(b.destruction).toBe(0);
    m.damage(b.buildings[1], 1e9);
    m.step(0.05);
    expect(b.destruction).toBe(100);
    expect(b.stars).toBe(3);
  });

  it('activates at the exact ground radius, ignores flying and dead troops, and names itself', () => {
    const { m, b, trap, unit, effects, effect } = arena();
    const flying = unit(10.5, 'dragon'),
      target = unit(12.001);
    unit(10.5).hp = 0;
    stepTraps(b, 0.05, effect);
    expect(b.traps[trap.id]).toBeUndefined();
    target.x = 12;
    stepTraps(b, 0.05, effect);
    expect(b.traps[trap.id].targetId).toBe(target.id);
    expect(m.visibleBuilding(trap)).toBe(true);
    expect(flying.hp).toBe(5000);
    expect(effects).toContainEqual(expect.objectContaining({ type: 'trap', text: 'Pumpkin Bomb' }));
  });

  it('applies 25 ground splash damage once at two seconds, even if the trigger target dies', () => {
    const { b, trap, unit, effects, effect } = arena();
    const target = unit(10.5),
      edge = unit(13.5),
      outside = unit(13.501),
      air = unit(10.5, 'balloon');
    b.elapsed = 0.05;
    stepTraps(b, 0.05, effect);
    target.hp = 0;
    b.elapsed = 2.049;
    stepTraps(b, 0.001, effect);
    expect(edge.hp).toBe(5000);
    b.elapsed = 2.05;
    stepTraps(b, 0.001, effect);
    expect([target.hp, edge.hp, outside.hp, air.hp]).toEqual([0, 4975, 5000, 5000]);
    expect([edge.x, edge.y, edge.springUntil]).toEqual([13.5, 10.5, undefined]);
    expect(b.traps[trap.id].resolved).toBe(true);
    stepTraps(b, 0.05, effect);
    expect(edge.hp).toBe(4975);
    expect(effects.filter((fx) => fx.type === 'blast')).toHaveLength(1);
  });

  it('does not damage escaped targets or continue after a battle ends', () => {
    const { m, b, unit, effect } = arena();
    const u = unit(10.5);
    stepTraps(b, 0.05, effect);
    u.x = 13.501;
    b.elapsed = 2;
    stepTraps(b, 2, effect);
    expect(u.hp).toBe(5000);
    const pending = arena(),
      other = pending.unit(10.5);
    stepTraps(pending.b, 0.05, pending.effect);
    pending.m.finishBattle();
    pending.m.step(3);
    expect(other.hp).toBe(5000);
    m.finishBattle();
  });

  it('registers the empty reveal, ignition, held final frame, spent pose and reduced motion', () => {
    const state = { activatedAt: 2, resolved: false, targetId: 1, x: 1, y: 1 };
    expect(pumpkinFrame(undefined, 0)).toBe(0);
    expect(
      [2, 2 + 18 / 24, 2 + 19 / 24, 2 + 43 / 24, 4].map((t) => pumpkinFrame(state, t)),
    ).toEqual([1, 19, 20, 44, 44]);
    expect(pumpkinFrame(state, 2.5, true)).toBe(0);
    expect(pumpkinFrame(state, 3, true)).toBe(44);
    expect(pumpkinFrame({ ...state, resolved: true }, 4)).toBe(0);
  });

  it('reconstructs a real Rat Valley activation, damage and rewind through exported replay', () => {
    const m = pumpkinBattle(),
      b = m.battle!;
    const trap = b.buildings.find((v) => v.npc === 'pumpkin-bomb')!;
    for (let i = 0; i < 80; i++) m.step(0.05);
    expect(b.traps[trap.id]).toMatchObject({ activatedAt: 0.05, resolved: true });
    expect(b.units[0].hp).toBe(b.units[0].maxHp - 25);
    m.finishBattle();
    const final = structuredClone(b),
      recording = structuredClone(m.state.raidLog![0].replay!);
    expect(recording.version).toBe(REPLAY_VERSION);
    expect(validateReplay(recording)).toBe(true);
    expect(validateSave(m.state)).toBe(true);
    const replay = parseReplayFile(JSON.stringify(makeReplayFile(recording)));
    expect(replay.initial.buildings.find((v) => v.id === trap.id)?.npc).toBe('pumpkin-bomb');
    m.returnHome();
    const home = structuredClone(m.state);
    expect(m.openReplay(replay)).toBe(true);
    const seek = (time: number) => {
      m.seekReplay(time);
      for (let i = 0; i < 100 && m.replay!.seeking; i++) m.step(0.05);
      expect(m.replay!.seeking).toBe(false);
    };
    seek(1e6);
    expect(m.battle).toEqual(final);
    seek(1);
    const mid = structuredClone(m.battle);
    expect(m.battle!.traps[trap.id].resolved).toBe(false);
    seek(0);
    expect(m.battle!.traps).toEqual({});
    seek(1);
    expect(m.battle).toEqual(mid);
    seek(1e6);
    expect(m.battle).toEqual(final);
    expect(m.state).toEqual(home);
  });

  it('rejects Pumpkin identity in home saves, practice, old replay versions and wrong archetypes', () => {
    const m = pumpkinBattle();
    m.finishBattle();
    const r = structuredClone(m.state.raidLog![0].replay!);
    const index = r.initial.buildings.findIndex((b) => b.npc === 'pumpkin-bomb');
    for (const mutate of [
      (v: typeof r) => {
        v.version = 27;
      },
      (v: typeof r) => {
        v.initial.practice = true;
      },
      (v: typeof r) => {
        v.initial.buildings[index].level = 2;
      },
      (v: typeof r) => {
        v.initial.buildings[index].kind = 'giantbomb';
      },
    ]) {
      const invalid = structuredClone(r);
      mutate(invalid);
      expect(validateReplay(invalid)).toBe(false);
    }
    expect(validNpcBuilding('pumpkin-bomb', 'bomb', 1)).toBe(true);
    const home = new GameModel();
    home.state.buildings.push(makeNpcBuilding(home.state.nextId++, 'pumpkin-bomb', 2, 2));
    expect(validateSave(home.state)).toBe(false);
  });
});
