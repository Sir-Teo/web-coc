import { freshNativeCampaign } from '../game/native-campaign';
import { GameModel, makeBuilding, type Save } from '../game/model';
import {
  BUILDINGS,
  buildingHp,
  maxTroopLevel,
  SPELL_KEYS,
  TROOP_KEYS,
  type TroopKind,
  type SpellKind,
} from '../game/data';
import { migrateSave, validateSave } from '../game/save';

const balances = ['gold', 'elixir', 'dark', 'gems'] as const;
type Balance = (typeof balances)[number];
function integer(value: number, min: number, max: number) {
  if (!Number.isInteger(value) || value < min || value > max)
    throw Error(`Enter a whole number between ${min} and ${max}.`);
}

/** Test mutations are atomic, validated, and independent of renderer state. */
export class DeveloperControls {
  private saved: Save;
  constructor(
    private model: GameModel,
    checkpoint?: Save,
  ) {
    const restored = migrateSave(checkpoint);
    this.saved = structuredClone(restored && validateSave(restored) ? restored : model.state);
  }
  private edit(change: (draft: GameModel) => void) {
    if (this.model.battle) throw Error('Return home before editing the village.');
    const draft = new GameModel(structuredClone(this.model.state));
    change(draft);
    draft.tick(Date.now());
    if (!validateSave(draft.state)) throw Error('That change would create an invalid village.');
    this.model.state = draft.state;
    this.model.cancel();
    this.model.endEdit();
    this.model.tick(Date.now());
    this.model.changed();
  }
  get checkpointSave() {
    return structuredClone(this.saved);
  }
  checkpoint() {
    if (this.model.battle) throw Error('Return home before taking a checkpoint.');
    this.saved = structuredClone(this.model.state);
    return this.checkpointSave;
  }
  restore() {
    // Restore gameplay data; leave current audio/accessibility settings in effect.
    const settings = structuredClone(this.model.state.settings);
    this.model.returnHome();
    this.model.endEdit();
    this.model.state = { ...this.checkpointSave, settings };
    this.model.cancel();
    this.model.tick(Date.now());
    this.model.changed();
  }
  setResources(values: Partial<Record<Balance, number>>) {
    this.edit((m) => {
      for (const [key, value] of Object.entries(values)) {
        if (!balances.includes(key as Balance)) throw Error('Unknown resource.');
        integer(value, 0, 999999999);
        m.state[key as Balance] = value;
      }
    });
  }
  fillResources() {
    this.edit((m) => {
      m.state.gold = m.resourceCap('gold');
      m.state.elixir = m.resourceCap('elixir');
      m.state.dark = m.resourceCap('dark');
      m.state.gems = 10000;
    });
  }
  setArmy(
    troops: Partial<Record<TroopKind, number>>,
    spells: Partial<Record<SpellKind, number>> = {},
  ) {
    this.edit((m) => {
      for (const [key, value] of Object.entries(troops)) {
        if (!TROOP_KEYS.includes(key as TroopKind)) throw Error('Unknown troop.');
        integer(value, 0, 9999);
        m.state.army[key as TroopKind] = value;
      }
      for (const [key, value] of Object.entries(spells)) {
        if (!SPELL_KEYS.includes(key as SpellKind)) throw Error('Unknown spell.');
        integer(value, 0, 999);
        m.state.spells[key as SpellKind] = value;
      }
      m.state.queue = [];
      m.state.spellQueue = [];
    });
  }
  setTownHall(level: number) {
    integer(level, 1, 8);
    this.edit((m) => {
      const hall = m.townhall!;
      hall.level = level;
      delete hall.upgradeEnd;
      delete hall.upgradeStart;
      hall.maxHp = hall.hp = BUILDINGS.townhall.hp * (1 + (level - 1) * 0.25);
    });
  }
  maxBuildings() {
    this.edit((m) => {
      for (const b of m.state.buildings) {
        if (b.kind !== 'townhall') b.level = Math.max(b.level, m.maxLevel(b.kind));
        b.hp = b.maxHp = buildingHp(b.kind, b.level);
        delete b.upgradeEnd;
        delete b.upgradeStart;
        delete b.constructing;
      }
    });
  }
  maxResearch() {
    this.edit((m) => {
      m.state.troopLevels = Object.fromEntries(
        TROOP_KEYS.map((k) => [k, maxTroopLevel(k)]),
      ) as Record<TroopKind, number>;
      delete m.state.research;
    });
  }
  unlockKing() {
    this.edit((m) => {
      if (m.townhallLevel < 4) {
        const hall = m.townhall!;
        hall.level = 4;
        hall.hp = hall.maxHp = BUILDINGS.townhall.hp * 1.75;
        delete hall.upgradeEnd;
        delete hall.upgradeStart;
      }
      let hall = m.state.buildings.find((b) => b.kind === 'herohall');
      if (!hall) {
        for (let y = 2; y < 24 && !hall; y++)
          for (let x = 2; x < 24 && !hall; x++) {
            if (m.canPlace('herohall', x, y)) {
              hall = makeBuilding(m.state.nextId++, 'herohall', x, y);
              m.state.buildings.push(hall);
            }
          }
      }
      if (!hall) throw Error('Make room for a Hero Hall first.');
      delete hall.constructing;
      delete hall.upgradeEnd;
      delete hall.upgradeStart;
      m.tick(Date.now());
    });
  }
  setKingLevel(level: number) {
    this.edit((m) => {
      if (!m.state.king) throw Error('Unlock the King first.');
      integer(level, 1, m.heroMaxLevel);
      m.state.king = { level };
    });
  }
  finishTimers() {
    this.edit((m) => {
      const now = Date.now();
      for (const b of m.state.buildings) if (b.upgradeEnd) b.upgradeEnd = now;
      if (m.state.king?.upgradeEnd) m.state.king.upgradeEnd = now;
      if (m.state.research) m.state.research.end = now;
      m.tick(now);
    });
  }
  unlockCampaign() {
    this.edit((m) => {
      m.state.stars = m.state.stars.map((s) => Math.max(1, s));
      m.state.nativeCampaign ??= freshNativeCampaign();
      m.state.nativeCampaign.stars = m.state.nativeCampaign.stars.map((s) => Math.max(1, s));
    });
  }
  endBattle(victory: boolean) {
    const battle = this.model.battle;
    if (!battle || battle.finished || this.model.replay) throw Error('Start an attack first.');
    if (victory) {
      this.model.discardRecording();
      for (const b of battle.buildings) b.hp = 0;
    }
    this.model.finishBattle();
  }
}
