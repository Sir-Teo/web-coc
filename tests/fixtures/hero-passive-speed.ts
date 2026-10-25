import { emptyArmy, emptySpells } from '../../src/game/army';
import { GameModel, makeBuilding } from '../../src/game/model';
import { replayBattle, REPLAY_VERSION, type ReplayData } from '../../src/game/replay';
import type { HeroKind } from '../../src/game/native-hero-data';
import type { HeroItemSetup } from '../../src/game/native-heroes';

/** Source-level-one Heroes with source maximum equipment; bonuses are per item. */
export const passiveSpeedCases: {
  name: string;
  kind: HeroKind;
  items: HeroItemSetup[];
  damage: number;
  rate: number;
  speed: number;
  charged?: number;
}[] = [
  {
    name: 'Vampstache',
    kind: 'king',
    items: [{ slug: 'vampstache', level: 18 }],
    damage: 266.4,
    rate: 1.2,
    speed: 0.22,
  },
  {
    name: 'Snake Bracelet',
    kind: 'king',
    items: [{ slug: 'snake-bracelet', level: 27 }],
    damage: 212.4,
    rate: 1.2,
    speed: 0.1,
  },
  {
    name: 'Haste Vial',
    kind: 'champion',
    items: [{ slug: 'haste-vial', level: 18 }],
    damage: 513.6,
    rate: 1.2,
    speed: 0.16,
  },
  {
    name: 'Rage Gem',
    kind: 'warden',
    items: [{ slug: 'rage-gem', level: 18 }],
    damage: 235.8,
    rate: 1.8,
    speed: 0.22,
  },
  {
    name: 'Dark Crown',
    kind: 'prince',
    items: [{ slug: 'dark-crown', level: 27 }],
    damage: 147.05,
    rate: 0.85,
    speed: 0.11,
  },
  {
    name: 'Noble Iron',
    kind: 'prince',
    items: [{ slug: 'noble-iron', level: 18 }],
    damage: 147.05,
    rate: 0.85,
    speed: 0.18,
    charged: 770,
  },
  {
    name: 'Vampstache and Snake Bracelet',
    kind: 'king',
    items: [
      { slug: 'vampstache', level: 18 },
      { slug: 'snake-bracelet', level: 27 },
    ],
    damage: 356.4,
    rate: 1.2,
    speed: 0.32,
  },
  {
    name: 'Noble Iron and Dark Crown',
    kind: 'prince',
    items: [
      { slug: 'noble-iron', level: 18 },
      { slug: 'dark-crown', level: 27 },
    ],
    damage: 147.05,
    rate: 0.85,
    speed: 0.29,
    charged: 770,
  },
];

export function passiveSpeedBattle(index = 0, version = REPLAY_VERSION) {
  const source = passiveSpeedCases[index];
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    ...[0, 1, 2, 3].map((i) =>
      makeBuilding(
        2 + i,
        source.kind === 'prince' ? 'cannon' : 'airdefense',
        8 + i * 5,
        5,
        source.kind === 'prince' ? 21 : 16,
      ),
    ),
  ];
  model.state.nextId = 1000;
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = emptySpells();
  model.state.king = undefined;
  model.startBattle(0, true);
  const recording = (model as unknown as { recording: ReplayData }).recording;
  recording.version = version;
  recording.initial.heroes = [{ kind: source.kind, level: 1, items: source.items }];
  model.battle = replayBattle(recording.initial, version);
  if (!model.deployNativeHero(source.kind, 5, 6.5))
    throw Error('Passive speed Hero deployment failed');
  const battle = model.battle;
  const hero = battle.nativeHeroes![0];
  const unit = battle.units.find((u) => u.id === hero.unitId)!;
  return { model, battle, hero, unit, source };
}

export function passiveSpeedRecording(index = 0) {
  const { model, battle, unit, source } = passiveSpeedBattle(index);
  const attacks: { at: number; damage: number; interval: number; projectile?: string }[] = [];
  let previousHp = new Map(battle.buildings.map((b) => [b.id, b.hp]));
  model.onEffect = (effect) => {
    if (effect.sourceId !== unit.id) return;
    if (effect.type === 'projectile') {
      const p = battle.projectiles!.find((p) => p.id === effect.projectileId)!;
      attacks.push({
        at: battle.elapsed,
        damage: p.damage,
        interval: unit.cooldown,
        projectile: p.native?.name,
      });
    } else if (effect.type === 'hit' && effect.targetBuilding) {
      const target = battle.buildings.find((b) => b.id === effect.targetId)!;
      attacks.push({
        at: battle.elapsed,
        damage: previousHp.get(target.id)! - target.hp,
        interval: unit.cooldown,
      });
    }
  };
  const step = () => {
    if (battle.elapsed > 15 || battle.finished || unit.hp <= 0)
      throw Error('Passive speed checkpoint was not reached');
    previousHp = new Map(battle.buildings.map((b) => [b.id, b.hp]));
    model.step(0.05);
  };
  const snapshots: { at: number; battle: unknown }[] = [];
  const snapshot = () =>
    snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
  while (!attacks.length) step();
  while (battle.elapsed < attacks[0].at + 0.2 - 1e-9) step();
  snapshot();
  const first = battle.elapsed;
  while (attacks.length < 2) step();
  while (battle.elapsed < attacks[1].at + 0.4 - 1e-9) step();
  snapshot();
  const compared = battle.elapsed;
  while (attacks.length < 3) step();
  while (battle.elapsed < attacks[2].at + 0.3 - 1e-9) step();
  snapshot();
  const final = battle.elapsed;
  step();
  model.finishBattle();
  return {
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
    snapshots,
    attacks,
    first,
    compared,
    final,
    unitId: unit.id,
    source,
  };
}
