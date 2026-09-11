import { developedSave } from './fixtures/developed-village';
import { describe, expect, it } from 'vitest';
import { GameModel } from '../src/game/model';
import { emptyArmy, emptySpells } from '../src/game/army';
import { validateSave } from '../src/game/save';

function upgradeFacilities() {
  const model = new GameModel(developedSave());
  model.townhall!.level = 8;
  model.state.elixir = 3000000;
  const barracks = model.state.buildings.find((b) => b.kind === 'barracks')!;
  const factory = model.state.buildings.find((b) => b.kind === 'spellfactory')!;
  factory.level = 2;
  model.state.spells = { rage: 0, heal: 2, lightning: 0 };
  model.upgrade(barracks.id);
  model.upgrade(factory.id);
  expect(barracks.upgradeEnd).toBeGreaterThan(model.clock);
  expect(factory.upgradeEnd).toBeGreaterThan(model.clock);
  return { model, barracks, factory };
}

describe('army preparation during facility upgrades', () => {
  it('keeps free preparation available, but grants new housing only on completion', () => {
    const { model: m, barracks, factory } = upgradeFacilities();
    m.clearArmy();
    m.state.elixir = 0;
    const capacity = m.spellCapacity;
    m.train('giant', 5);
    m.brew('lightning', capacity);
    expect(m.state.army.giant).toBe(5);
    expect(m.spellHousing).toBe(capacity);
    m.brew('heal');
    expect(m.state.spells.heal).toBe(0);
    expect(m.state.elixir).toBe(0);
    expect(m.busy).toBe(2);
    expect(m.state.queue).toEqual([]);
    expect(m.state.spellQueue).toEqual([]);
    m.tick(Math.max(barracks.upgradeEnd!, factory.upgradeEnd!));
    expect(m.spellCapacity).toBe(capacity + 2);
    m.brew('heal');
    expect(m.state.spells.heal).toBe(1);
    expect(m.busy).toBe(0);
  });

  it('preserves the upgrade timers and preparation access when reloading a village', () => {
    const { model, barracks, factory } = upgradeFacilities();
    model.clearArmy();
    expect(validateSave(model.state)).toBe(true);
    const reloaded = new GameModel(JSON.parse(JSON.stringify(model.state)));
    for (const building of [barracks, factory])
      expect(reloaded.state.buildings.find((b) => b.id === building.id)?.upgradeEnd).toBe(
        building.upgradeEnd,
      );
    reloaded.train('wallbreaker', 5);
    reloaded.brew('heal');
    expect(reloaded.state.army.wallbreaker).toBe(5);
    expect(reloaded.state.spells.heal).toBe(1);
    expect(reloaded.spellCapacity).toBe(model.spellCapacity);
    expect(validateSave(reloaded.state)).toBe(true);
  });

  it('equips quick armies and replenishes the last army during both upgrades', () => {
    const { model: m } = upgradeFacilities();
    const army = { ...m.state.army },
      spells = { ...m.state.spells };
    m.saveArmyPreset(0, 'Available while upgrading');
    m.state.lastArmy = army;
    m.state.lastSpells = spells;
    m.clearArmy();
    m.loadArmyPreset(0);
    expect(m.state.army).toEqual(army);
    expect(m.state.spells).toEqual(spells);
    m.clearArmy();
    expect(m.retrain()).toBe(true);
    expect(m.state.army).toEqual(army);
    expect(m.state.spells).toEqual(spells);
    expect(m.retrain()).toBe(true);
    expect(m.state.army).toEqual(army);
    expect(m.state.spells).toEqual(spells);
    m.state.armyPresets![0]!.spells.lightning += 1;
    m.loadArmyPreset(0);
    expect(m.state.spells).toEqual(spells);
    expect(m.state.army).toEqual(army);
  });

  it('keeps new construction unavailable and rejects compositions without partial changes', () => {
    const { model: m, barracks, factory } = upgradeFacilities();
    const army = { ...m.state.army },
      spells = { ...m.state.spells };
    m.saveArmyPreset(0);
    m.state.lastArmy = army;
    m.state.lastSpells = spells;
    m.clearArmy();
    barracks.constructing = true;
    m.train('swordsman');
    m.loadArmyPreset(0);
    expect(m.retrain()).toBe(false);
    expect(m.state.army).toEqual(emptyArmy());
    expect(m.state.spells).toEqual(emptySpells());
    barracks.constructing = false;
    factory.constructing = true;
    m.train('archer');
    const before = { ...m.state.army };
    m.brew('lightning');
    m.loadArmyPreset(0);
    expect(m.retrain()).toBe(false);
    expect(m.state.army).toEqual(before);
    expect(m.state.spells).toEqual(emptySpells());
    expect(m.spellCapacity).toBe(0);
    m.tick(factory.upgradeEnd!);
    m.brew('heal');
    expect(m.state.spells.heal).toBe(1);
  });
});
