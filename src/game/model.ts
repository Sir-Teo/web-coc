import { campaignBlueprint, CAMPAIGN_LAYOUTS } from './campaign';
import {
  BUILDINGS,
  TROOPS,
  TROOP_KEYS,
  CAMPAIGN,
  type BuildingKind,
  type TroopKind,
  type Resource,
} from './data';
export interface Building {
  id: number;
  kind: BuildingKind;
  x: number;
  y: number;
  level: number;
  hp: number;
  maxHp: number;
  upgradeEnd?: number;
  constructing?: boolean;
  stored: number;
  cooldown: number;
}
export interface QueueItem {
  kind: TroopKind;
  end: number;
}
export interface Save {
  version: 1;
  gold: number;
  elixir: number;
  gems: number;
  trophies: number;
  xp: number;
  buildings: Building[];
  army: Record<TroopKind, number>;
  queue: QueueItem[];
  stars: number[];
  lastTick: number;
  nextId: number;
  tutorial: boolean;
  claimedQuests?: string[];
  troopLevels?: Record<TroopKind, number>;
  research?: { kind: TroopKind; end: number };
  lastArmy?: Record<TroopKind, number>;
  settings: { sound: boolean; music: boolean; reducedMotion: boolean };
  stats: { raids: number; destroyed: number; collected: number };
}
export interface Unit {
  id: number;
  kind: TroopKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  cooldown: number;
  target: number | null;
  path: { x: number; y: number }[];
  pathAt: number;
  attacking: boolean;
}
export interface Battle {
  index: number;
  buildings: Building[];
  units: Unit[];
  remaining: Record<TroopKind, number>;
  elapsed: number;
  started: boolean;
  finished: boolean;
  destruction: number;
  stars: number;
  loot: { gold: number; elixir: number };
  result?: { gold: number; elixir: number; trophies: number; stars: number; destruction: number };
  seed: number;
}
export type FX = {
  type: 'hit' | 'destroy' | 'projectile' | 'collect' | 'spawn' | 'upgrade';
  x: number;
  y: number;
  toX?: number;
  toY?: number;
  color?: number;
  text?: string;
};
export class GameModel {
  state: Save;
  battle: Battle | null = null;
  selected: number | null = null;
  placement: BuildingKind | null = null;
  moving: number | null = null;
  activeTroop: TroopKind = 'swordsman';
  onChange = (_passive = false) => {};
  onEffect = (_fx: FX) => {};
  onToast = (_message: string) => {};
  revision = 0;
  clock = Date.now();
  constructor(saved?: Save) {
    this.state = saved ?? initialSave();
    this.tick(Date.now());
  }
  changed(passive = false) {
    this.revision++;
    this.onChange(passive);
  }
  notify(message: string) {
    this.onToast(message);
  }
  get buildings() {
    return this.battle ? this.battle.buildings : this.state.buildings;
  }
  get capacity() {
    return (
      20 +
      this.state.buildings
        .filter((b) => b.kind === 'camp' && !b.constructing)
        .reduce((n, b) => n + 20 * b.level, 0)
    );
  }
  get armySize() {
    return TROOP_KEYS.reduce((n, k) => n + this.state.army[k] * TROOPS[k].space, 0);
  }
  get queuedSize() {
    return this.state.queue.reduce((n, q) => n + TROOPS[q.kind].space, 0);
  }
  troopLevel(kind: TroopKind) {
    return this.state.troopLevels?.[kind] ?? 1;
  }
  troopStats(kind: TroopKind) {
    const d = TROOPS[kind],
      bonus = 1 + (this.troopLevel(kind) - 1) * 0.3;
    return { ...d, hp: Math.round(d.hp * bonus), damage: Math.round(d.damage * bonus) };
  }
  researchCost(kind: TroopKind) {
    return (
      { swordsman: 6000, archer: 8000, giant: 12000, wizard: 15000 }[kind] * this.troopLevel(kind)
    );
  }
  researchTroop(kind: TroopKind) {
    const lab = this.state.buildings.find((b) => b.kind === 'laboratory' && !b.constructing);
    if (!lab || lab.upgradeEnd) return this.notify('Your laboratory must be ready to research.');
    if (this.state.research) return this.notify('Research is already in progress.');
    if (this.troopLevel(kind) >= 3) return this.notify('This troop is at its maximum level.');
    if (lab.level <= this.troopLevel(kind))
      return this.notify(`Upgrade your laboratory to level ${this.troopLevel(kind) + 1}.`);
    const cost = this.researchCost(kind);
    if (this.state.elixir < cost) return this.notify('Not enough elixir.');
    this.state.elixir -= cost;
    this.state.research = { kind, end: this.clock + (30 + 15 * this.troopLevel(kind)) * 1000 };
    this.notify(`Researching level ${this.troopLevel(kind) + 1} ${TROOPS[kind].name}.`);
    this.changed();
  }
  finishResearch() {
    const r = this.state.research;
    if (!r) return;
    const cost = Math.max(1, Math.ceil((r.end - this.clock) / 10000));
    if (this.state.gems < cost) return this.notify('Not enough gems.');
    this.state.gems -= cost;
    r.end = this.clock;
    this.tick(this.clock);
  }
  get quests() {
    return [
      {
        id: 'gold-rush',
        title: 'Gold rush',
        description: 'Collect 10,000 resources',
        progress: this.state.stats.collected,
        target: 10000,
        reward: 15,
        icon: 'Coins',
      },
      {
        id: 'first-raid',
        title: 'First blood',
        description: 'Complete your first raid',
        progress: this.state.stats.raids,
        target: 1,
        reward: 20,
        icon: 'Swords',
      },
      {
        id: 'wall-breaker',
        title: 'Wall breaker',
        description: 'Destroy 25 enemy buildings',
        progress: this.state.stats.destroyed,
        target: 25,
        reward: 25,
        icon: 'Castle',
      },
      {
        id: 'valley-explorer',
        title: 'Valley explorer',
        description: 'Earn 12 campaign stars',
        progress: this.state.stars.reduce((a, b) => a + b, 0),
        target: 12,
        reward: 40,
        icon: 'Star',
      },
    ].map((q) => ({ ...q, claimed: this.state.claimedQuests?.includes(q.id) ?? false }));
  }
  claimQuest(id: string) {
    const quest = this.quests.find((q) => q.id === id);
    if (!quest || quest.claimed || quest.progress < quest.target) return false;
    this.state.claimedQuests ??= [];
    this.state.claimedQuests.push(id);
    this.state.gems += quest.reward;
    this.state.xp += 20;
    this.notify(`${quest.title} complete! +${quest.reward} gems`);
    this.changed();
    return true;
  }
  get chiefLevel() {
    return Math.max(1, Math.floor(this.state.xp / 100));
  }
  get league() {
    return this.state.trophies >= 1800
      ? 'Gold League I'
      : this.state.trophies >= 1000
        ? 'Silver League II'
        : 'Bronze League I';
  }
  get builders() {
    return this.state.buildings.filter((b) => b.kind === 'builder' && !b.constructing).length;
  }
  get busy() {
    return this.state.buildings.filter((b) => b.upgradeEnd).length;
  }
  resourceCap(kind: Resource) {
    return (
      200000 +
      this.state.buildings
        .filter(
          (b) => b.kind === (kind === 'gold' ? 'goldstorage' : 'elixirstorage') && !b.constructing,
        )
        .reduce((n, b) => n + b.level * 50000, 0)
    );
  }
  tick(now: number) {
    this.clock = now;
    let changed = false;
    let structural = false;
    const dt = Math.max(0, Math.min(now - this.state.lastTick, 8 * 3600000)) / 1000;
    for (const b of this.state.buildings) {
      const productionSeconds = b.upgradeEnd
        ? Math.max(0, Math.min(dt, (now - b.upgradeEnd) / 1000))
        : dt;
      if (b.upgradeEnd && b.upgradeEnd <= now) {
        if (!b.constructing) b.level++;
        b.constructing = false;
        b.upgradeEnd = undefined;
        b.maxHp = BUILDINGS[b.kind].hp * (1 + (b.level - 1) * 0.25);
        b.hp = b.maxHp;
        structural = true;
        this.notify(`${BUILDINGS[b.kind].name} is ready!`);
        this.onEffect({
          type: 'upgrade',
          x: b.x + BUILDINGS[b.kind].size / 2,
          y: b.y + BUILDINGS[b.kind].size / 2,
        });
        changed = true;
      }
      if ((b.kind === 'goldmine' || b.kind === 'collector') && !b.upgradeEnd) {
        const before = b.stored;
        b.stored = Math.min(10000 * b.level, b.stored + productionSeconds * 3 * b.level);
        if (Math.floor(before) !== Math.floor(b.stored)) changed = true;
      }
    }
    while (this.state.queue.length && this.state.queue[0].end <= now) {
      const q = this.state.queue.shift()!;
      this.state.army[q.kind]++;
      structural = true;
      changed = true;
    }
    if (this.state.research && this.state.research.end <= now) {
      const { kind } = this.state.research;
      this.state.troopLevels ??= { swordsman: 1, archer: 1, giant: 1, wizard: 1 };
      this.state.troopLevels[kind] = Math.min(3, this.troopLevel(kind) + 1);
      delete this.state.research;
      this.state.xp += 30;
      this.notify(`${TROOPS[kind].name} upgraded to level ${this.troopLevel(kind)}!`);
      structural = true;
      changed = true;
    }
    this.state.lastTick = now;
    if (changed) this.changed(!structural);
  }
  collect(id?: number) {
    let gold = 0,
      elixir = 0;
    for (const b of this.state.buildings) {
      if ((id === undefined || b.id === id) && b.stored >= 1) {
        const k = b.kind === 'goldmine' ? 'gold' : 'elixir';
        const amount = Math.min(Math.floor(b.stored), this.resourceCap(k) - this.state[k]);
        if (amount <= 0) continue;
        this.state[k] += amount;
        b.stored -= amount;
        if (k === 'gold') gold += amount;
        else elixir += amount;
        this.onEffect({
          type: 'collect',
          x: b.x + BUILDINGS[b.kind].size / 2,
          y: b.y + BUILDINGS[b.kind].size / 2,
          color: k === 'gold' ? 0xffd34b : 0xd567ff,
          text: `+${amount.toLocaleString()}`,
        });
      }
    }
    if (gold + elixir) {
      this.state.stats.collected += gold + elixir;
      this.notify(`Collected ${gold.toLocaleString()} gold · ${elixir.toLocaleString()} elixir`);
      this.changed();
    } else this.notify('Your collectors are working. Come back in a moment.');
  }
  canPlace(kind: BuildingKind, x: number, y: number, ignore?: number) {
    const size = BUILDINGS[kind].size;
    if (
      !Number.isInteger(x) ||
      !Number.isInteger(y) ||
      x < 2 ||
      y < 2 ||
      x + size > 26 ||
      y + size > 26
    )
      return false;
    return !this.state.buildings.some(
      (b) =>
        b.id !== ignore &&
        x < b.x + BUILDINGS[b.kind].size &&
        x + size > b.x &&
        y < b.y + BUILDINGS[b.kind].size &&
        y + size > b.y,
    );
  }
  beginBuild(kind: BuildingKind) {
    const d = BUILDINGS[kind];
    if (this.state.buildings.filter((b) => b.kind === kind).length >= d.max)
      return this.notify(
        `You already have the maximum number of ${d.name.toLowerCase()} buildings.`,
      );
    if (this.state[d.resource] < d.cost) return this.notify(`Not enough ${d.resource}.`);
    if (kind !== 'wall' && this.busy >= this.builders)
      return this.notify('All builders are busy. Finish an upgrade first.');
    this.selected = null;
    this.moving = null;
    this.placement = kind;
    this.changed();
  }
  place(x: number, y: number) {
    if (!this.placement) return false;
    const kind = this.placement,
      d = BUILDINGS[kind];
    if (!this.canPlace(kind, x, y, this.moving ?? undefined)) {
      this.notify('Choose a clear space inside the village.');
      return false;
    }
    if (this.moving !== null) {
      const b = this.state.buildings.find((b) => b.id === this.moving)!;
      b.x = x;
      b.y = y;
      this.selected = b.id;
      this.moving = null;
      this.placement = null;
      this.changed();
      return true;
    }
    if (
      this.state[d.resource] < d.cost ||
      this.state.buildings.filter((b) => b.kind === kind).length >= d.max ||
      (kind !== 'wall' && this.busy >= this.builders)
    ) {
      this.notify('Unable to build. Check your resources and builders.');
      return false;
    }
    this.state[d.resource] -= d.cost;
    const b = makeBuilding(this.state.nextId++, kind, x, y, 1);
    if (kind !== 'wall') {
      b.constructing = true;
      b.upgradeEnd = this.clock + 15000;
    }
    this.state.buildings.push(b);
    this.placement = null;
    this.selected = b.id;
    this.changed();
    this.notify(kind === 'wall' ? 'Wall placed.' : 'Construction started — 15 seconds.');
    return true;
  }
  upgradeCost(b: Building) {
    return Math.floor(BUILDINGS[b.kind].cost * (1 + b.level * 0.8));
  }
  upgrade(id: number) {
    const b = this.state.buildings.find((b) => b.id === id);
    if (!b || b.upgradeEnd) return;
    if (b.kind === 'laboratory' && this.state.research)
      return this.notify('Finish troop research before upgrading the laboratory.');
    if (b.level >= 3) return this.notify('This building is at its maximum level.');
    if (this.busy >= this.builders) return this.notify('All builders are busy.');
    const d = BUILDINGS[b.kind],
      cost = this.upgradeCost(b);
    if (this.state[d.resource] < cost)
      return this.notify(`You need ${cost.toLocaleString()} ${d.resource}.`);
    this.state[d.resource] -= cost;
    b.upgradeEnd = this.clock + (20 + b.level * 10) * 1000;
    this.notify(`Upgrading ${d.name} to level ${b.level + 1}.`);
    this.changed();
  }
  finish(id: number) {
    const b = this.state.buildings.find((b) => b.id === id);
    if (!b?.upgradeEnd) return;
    const cost = Math.max(1, Math.ceil((b.upgradeEnd - this.clock) / 10000));
    if (this.state.gems < cost) return this.notify('Not enough gems.');
    this.state.gems -= cost;
    b.upgradeEnd = this.clock;
    this.tick(this.clock);
    this.changed();
  }
  move(id: number) {
    const b = this.state.buildings.find((b) => b.id === id);
    if (!b) return;
    this.moving = id;
    this.placement = b.kind;
    this.selected = null;
    this.changed();
  }
  cancel() {
    this.selected = null;
    this.placement = null;
    this.moving = null;
    this.changed();
  }
  trainingTime(kind: TroopKind) {
    const barracks = this.state.buildings.filter(
      (b) => b.kind === 'barracks' && !b.constructing && !b.upgradeEnd,
    ).length;
    return TROOPS[kind].time / Math.max(1, barracks);
  }
  private enqueue(kinds: TroopKind[]) {
    if (
      !this.state.buildings.some((b) => b.kind === 'barracks' && !b.constructing && !b.upgradeEnd)
    )
      return this.notify('Your barracks must be ready to train.');
    const space = kinds.reduce((n, k) => n + TROOPS[k].space, 0);
    const cost = kinds.reduce((n, k) => n + TROOPS[k].cost, 0);
    if (this.armySize + this.queuedSize + space > this.capacity)
      return this.notify('Army camps are full. Upgrade or build another camp.');
    if (this.state.elixir < cost) return this.notify('Not enough elixir.');
    this.state.elixir -= cost;
    let end = Math.max(this.clock, this.state.queue.at(-1)?.end ?? 0);
    for (const kind of kinds) {
      end += this.trainingTime(kind) * 1000;
      this.state.queue.push({ kind, end });
    }
    this.changed();
  }
  train(kind: TroopKind, count = 1) {
    if (!Number.isInteger(count) || count < 1 || count > 5) return;
    this.enqueue(Array<TroopKind>(count).fill(kind));
  }
  retrain() {
    if (!this.state.lastArmy) return this.notify('Complete a raid to save an army composition.');
    const kinds: TroopKind[] = [];
    for (const kind of TROOP_KEYS) {
      const ready = this.state.army[kind] + this.state.queue.filter((q) => q.kind === kind).length;
      for (let i = ready; i < this.state.lastArmy[kind]; i++) kinds.push(kind);
    }
    if (!kinds.length) return this.notify('Your previous army is already ready or training.');
    this.enqueue(kinds);
  }
  startBattle(index: number) {
    if (index < 0 || index >= CAMPAIGN.length || (index > 0 && !this.state.stars[index - 1]))
      return;
    if (this.armySize === 0) return this.notify('Train an army before attacking.');
    this.cancel();
    this.state.lastArmy = { ...this.state.army };
    this.battle = {
      index,
      buildings: enemyBase(index),
      units: [],
      remaining: { ...this.state.army },
      elapsed: 0,
      started: false,
      finished: false,
      destruction: 0,
      stars: 0,
      loot: { gold: 0, elixir: 0 },
      seed: 1337 + index,
    };
    this.changed();
  }
  deploy(x: number, y: number) {
    const b = this.battle,
      k = this.activeTroop;
    if (!b || b.finished || b.remaining[k] <= 0) return false;
    if (
      x < 1 ||
      y < 1 ||
      x > 27 ||
      y > 27 ||
      b.buildings.some(
        (v) =>
          v.hp > 0 &&
          v.kind !== 'wall' &&
          x > v.x - 1.5 &&
          x < v.x + BUILDINGS[v.kind].size + 1.5 &&
          y > v.y - 1.5 &&
          y < v.y + BUILDINGS[v.kind].size + 1.5,
      )
    ) {
      this.notify('Deploy on the grass outside the red boundary.');
      return false;
    }
    b.started = true;
    b.remaining[k]--;
    this.state.army[k]--;
    const d = this.troopStats(k);
    b.units.push({
      id: this.state.nextId++,
      kind: k,
      x,
      y,
      hp: d.hp,
      maxHp: d.hp,
      cooldown: 0,
      target: null,
      path: [],
      pathAt: 0,
      attacking: false,
    });
    this.onEffect({ type: 'spawn', x, y });
    this.changed();
    return true;
  }
  step(dt: number) {
    const b = this.battle;
    if (!b || !b.started || b.finished) return;
    b.elapsed += dt;
    for (const u of b.units) {
      if (u.hp <= 0) continue;
      u.cooldown -= dt;
      u.pathAt -= dt;
      u.attacking = false;
      const d = this.troopStats(u.kind);
      let target = b.buildings.find((t) => t.id === u.target && t.hp > 0);
      if (!target) {
        const alive = b.buildings.filter((v) => v.hp > 0 && v.kind !== 'wall');
        const preferred =
          u.kind === 'giant' ? alive.filter((v) => BUILDINGS[v.kind].damage) : alive;
        target = (preferred.length ? preferred : alive).sort(
          (a, c) => distanceTo(u, a) - distanceTo(u, c),
        )[0];
        if (!target) continue;
        u.target = target.id;
        u.path = [];
        u.pathAt = 0;
      }
      const distance = distanceTo(u, target);
      if (distance <= d.range) {
        u.attacking = true;
        if (u.cooldown <= 0) {
          u.cooldown = d.rate;
          const damage = d.damage;
          this.damage(target, damage);
          this.onEffect({
            type: d.range > 2 ? 'projectile' : 'hit',
            x: u.x,
            y: u.y,
            toX: target.x + BUILDINGS[target.kind].size / 2,
            toY: target.y + BUILDINGS[target.kind].size / 2,
            color: u.kind === 'wizard' ? 0xff9c37 : 0xffe2a0,
          });
          if (u.kind === 'wizard') {
            for (const near of b.buildings) {
              if (
                near.id !== target.id &&
                near.hp > 0 &&
                Math.hypot(near.x - target.x, near.y - target.y) < 3
              )
                this.damage(near, damage * 0.35);
            }
          }
        }
        continue;
      }
      if (!u.path.length || u.pathAt <= 0) {
        u.path = findPath(u, target, b.buildings, d.range);
        u.pathAt = 1.5;
      }
      const next = u.path[0];
      if (next) {
        const wall = b.buildings.find(
          (v) =>
            v.kind === 'wall' &&
            v.hp > 0 &&
            Math.floor(next.x) === v.x &&
            Math.floor(next.y) === v.y,
        );
        if (wall) {
          u.attacking = true;
          if (u.cooldown <= 0) {
            u.cooldown = d.rate;
            this.damage(wall, d.damage * 1.6);
            this.onEffect({ type: 'hit', x: wall.x + 0.5, y: wall.y + 0.5 });
          }
          continue;
        }
        const dx = next.x - u.x,
          dy = next.y - u.y,
          len = Math.hypot(dx, dy),
          move = d.speed * dt;
        if (len <= move) {
          u.x = next.x;
          u.y = next.y;
          u.path.shift();
        } else {
          u.x += (dx / len) * move;
          u.y += (dy / len) * move;
        }
      }
    }
    separateUnits(b.units, b.buildings);
    for (const tower of b.buildings) {
      const d = BUILDINGS[tower.kind];
      if (!d.damage || tower.hp <= 0) continue;
      tower.cooldown -= dt;
      if (tower.cooldown > 0) continue;
      const center = { x: tower.x + d.size / 2, y: tower.y + d.size / 2 };
      const targets = b.units.filter(
        (u) => u.hp > 0 && Math.hypot(u.x - center.x, u.y - center.y) < d.range!,
      );
      const target = targets.sort(
        (a, c) =>
          Math.hypot(a.x - center.x, a.y - center.y) - Math.hypot(c.x - center.x, c.y - center.y),
      )[0];
      if (target) {
        tower.cooldown = d.rate!;
        target.hp -= d.damage * CAMPAIGN_LAYOUTS[b.index].defense;
        this.onEffect({
          type: 'projectile',
          x: center.x,
          y: center.y,
          toX: target.x,
          toY: target.y,
          color: tower.kind === 'mortar' ? 0xff7035 : 0x303137,
        });
        if (tower.kind === 'mortar')
          for (const u of targets)
            if (u.id !== target.id && Math.hypot(u.x - target.x, u.y - target.y) < 2)
              u.hp -= d.damage * CAMPAIGN_LAYOUTS[b.index].defense * 0.5;
      }
    }
    const structures = b.buildings.filter((v) => v.kind !== 'wall'),
      dead = structures.filter((v) => v.hp <= 0).length;
    b.destruction = Math.floor((dead / structures.length) * 100);
    b.stars =
      Number(b.destruction >= 50) +
      Number(structures.some((v) => v.kind === 'townhall' && v.hp <= 0)) +
      Number(b.destruction === 100);
    b.loot = {
      gold: Math.floor((CAMPAIGN[b.index].gold * dead) / structures.length),
      elixir: Math.floor((CAMPAIGN[b.index].elixir * dead) / structures.length),
    };
    if (
      b.destruction === 100 ||
      b.elapsed >= 180 ||
      (!b.units.some((u) => u.hp > 0) && !TROOP_KEYS.some((k) => b.remaining[k] > 0))
    )
      this.finishBattle();
  }
  damage(b: Building, n: number) {
    if (b.hp <= 0) return;
    b.hp -= n;
    if (b.hp <= 0) {
      b.hp = 0;
      this.onEffect({
        type: 'destroy',
        x: b.x + BUILDINGS[b.kind].size / 2,
        y: b.y + BUILDINGS[b.kind].size / 2,
      });
      for (const u of this.battle?.units ?? []) {
        u.pathAt = 0;
      }
    }
  }
  finishBattle() {
    const b = this.battle;
    if (!b || b.finished) return;
    b.finished = true;
    const trophies = b.stars ? b.stars * 8 : -10;
    const gold = Math.min(b.loot.gold, this.resourceCap('gold') - this.state.gold),
      elixir = Math.min(b.loot.elixir, this.resourceCap('elixir') - this.state.elixir);
    this.state.gold += gold;
    this.state.elixir += elixir;
    this.state.trophies = Math.max(0, this.state.trophies + trophies);
    this.state.stars[b.index] = Math.max(this.state.stars[b.index] ?? 0, b.stars);
    this.state.stats.raids++;
    this.state.stats.destroyed += b.buildings.filter((v) => v.hp <= 0 && v.kind !== 'wall').length;
    this.state.xp += b.stars * 15;
    b.result = { gold, elixir, trophies, stars: b.stars, destruction: b.destruction };
    this.changed();
  }
  returnHome() {
    this.battle = null;
    this.selected = null;
    this.changed();
  }
}
export function makeBuilding(
  id: number,
  kind: BuildingKind,
  x: number,
  y: number,
  level = 1,
): Building {
  const hp = BUILDINGS[kind].hp * (1 + (level - 1) * 0.25);
  return {
    id,
    kind,
    x,
    y,
    level,
    hp,
    maxHp: hp,
    stored: kind === 'goldmine' || kind === 'collector' ? 1800 : 0,
    cooldown: 0,
  };
}
export function initialSave(): Save {
  let id = 1;
  const b: Building[] = [];
  const add = (k: BuildingKind, x: number, y: number, l = 1) =>
    b.push(makeBuilding(id++, k, x, y, l));
  add('townhall', 11, 10, 2);
  add('goldstorage', 9, 14, 2);
  add('elixirstorage', 15, 10, 2);
  add('cannon', 9, 10, 2);
  add('archertower', 15, 15, 2);
  add('mortar', 13, 16);
  add('laboratory', 17, 20);
  add('barracks', 4, 15, 2);
  add('camp', 10, 21);
  add('camp', 21, 11);
  add('goldmine', 3, 8, 2);
  add('goldmine', 5, 4);
  add('collector', 17, 4, 2);
  add('collector', 21, 7);
  add('builder', 16, 23);
  add('builder', 21, 19);
  add('goldstorage', 6, 20);
  add('elixirstorage', 9, 4);
  add('archertower', 21, 15);
  add('cannon', 5, 11);
  for (let n = 8; n <= 19; n++) {
    add('wall', n, 8, 2);
    if (n !== 13 && n !== 14) add('wall', n, 19, 2);
  }
  for (let n = 9; n < 19; n++) {
    add('wall', 8, n, 2);
    if (n !== 13 && n !== 14) add('wall', 19, n, 2);
  }
  // Walls may border footprints; remove any segment occupying another building's footprint.
  const buildings = b.filter(
    (v) =>
      v.kind !== 'wall' ||
      !b.some(
        (o) =>
          o.kind !== 'wall' &&
          v.x >= o.x &&
          v.x < o.x + BUILDINGS[o.kind].size &&
          v.y >= o.y &&
          v.y < o.y + BUILDINGS[o.kind].size,
      ),
  );
  return {
    version: 1,
    gold: 148250,
    elixir: 96300,
    gems: 250,
    trophies: 1248,
    xp: 1850,
    buildings,
    army: { swordsman: 14, archer: 12, giant: 3, wizard: 3 },
    queue: [],
    stars: Array(12).fill(0),
    lastTick: Date.now(),
    nextId: id,
    tutorial: false,
    settings: { sound: true, music: false, reducedMotion: false },
    stats: { raids: 0, destroyed: 0, collected: 0 },
  };
}
export function enemyBase(index: number) {
  return campaignBlueprint(index).map(([kind, x, y], i) => {
    const b = makeBuilding(1000 + i, kind, x, y, Math.min(3, 1 + Math.floor(index / 4)));
    b.hp *= CAMPAIGN_LAYOUTS[index].health;
    b.maxHp = b.hp;
    return b;
  });
}
export function distanceTo(u: { x: number; y: number }, b: Building) {
  const s = BUILDINGS[b.kind].size;
  return Math.hypot(Math.max(b.x - u.x, 0, u.x - b.x - s), Math.max(b.y - u.y, 0, u.y - b.y - s));
}
// A* on the occupancy grid. Walls carry a break-through cost, buildings are solid.
export function findPath(
  start: { x: number; y: number },
  target: Building,
  buildings: Building[],
  range: number,
): { x: number; y: number }[] {
  const size = 28,
    blocked = new Uint8Array(size * size),
    wall = new Uint8Array(size * size);
  for (const b of buildings) {
    if (b.hp <= 0) continue;
    for (let x = b.x; x < b.x + BUILDINGS[b.kind].size; x++)
      for (let y = b.y; y < b.y + BUILDINGS[b.kind].size; y++) {
        if (b.kind === 'wall') wall[y * size + x] = 1;
        else blocked[y * size + x] = 1;
      }
  }
  const sx = Math.max(0, Math.min(27, Math.floor(start.x))),
    sy = Math.max(0, Math.min(27, Math.floor(start.y))),
    first = sy * size + sx;
  const cost = new Float64Array(size * size).fill(Infinity),
    prev = new Int16Array(size * size).fill(-1),
    closed = new Uint8Array(size * size);
  cost[first] = 0;
  const open = [first];
  let goal = -1;
  while (open.length) {
    let best = 0;
    for (let i = 1; i < open.length; i++) {
      const a = open[i],
        c = open[best];
      if (
        cost[a] + distanceTo({ x: (a % size) + 0.5, y: Math.floor(a / size) + 0.5 }, target) <
        cost[c] + distanceTo({ x: (c % size) + 0.5, y: Math.floor(c / size) + 0.5 }, target)
      )
        best = i;
    }
    const current = open.splice(best, 1)[0];
    if (closed[current]) continue;
    closed[current] = 1;
    const x = current % size,
      y = Math.floor(current / size);
    if (distanceTo({ x: x + 0.5, y: y + 0.5 }, target) <= range) {
      goal = current;
      break;
    }
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx,
        ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const n = ny * size + nx;
      if (blocked[n] || closed[n]) continue;
      const next = cost[current] + 1 + (wall[n] ? 6 : 0);
      if (next < cost[n]) {
        cost[n] = next;
        prev[n] = current;
        open.push(n);
      }
    }
  }
  if (goal < 0) return [];
  const path = [];
  while (goal !== first && goal >= 0) {
    path.push({ x: (goal % size) + 0.5, y: Math.floor(goal / size) + 0.5 });
    goal = prev[goal];
  }
  return path.reverse();
}

/** Local, deterministic crowd separation. A sparse grid bounds neighbor work. */
export function separateUnits(units: Unit[], buildings: Building[]) {
  const solid = new Set<number>();
  for (const b of buildings)
    if (b.hp > 0) {
      const size = BUILDINGS[b.kind].size;
      for (let x = b.x; x < b.x + size; x++)
        for (let y = b.y; y < b.y + size; y++) solid.add(y * 28 + x);
    }
  const buckets = new Map<number, Unit[]>();
  const alive = units.filter((u) => u.hp > 0);
  for (const u of alive) {
    const key = Math.floor(u.y) * 28 + Math.floor(u.x);
    const bucket = buckets.get(key) ?? [];
    bucket.push(u);
    buckets.set(key, bucket);
  }
  const free = (x: number, y: number) =>
    x >= 0.1 && y >= 0.1 && x < 27.9 && y < 27.9 && !solid.has(Math.floor(y) * 28 + Math.floor(x));
  for (const u of alive) {
    const cx = Math.floor(u.x),
      cy = Math.floor(u.y);
    for (let oy = -1; oy <= 1; oy++)
      for (let ox = -1; ox <= 1; ox++) {
        for (const v of buckets.get((cy + oy) * 28 + cx + ox) ?? []) {
          if (v.id <= u.id) continue;
          const spacing = (u.kind === 'giant' ? 0.85 : 0.5) + (v.kind === 'giant' ? 0.85 : 0.5);
          const desired = spacing / 2;
          let dx = v.x - u.x,
            dy = v.y - u.y;
          let distance = Math.hypot(dx, dy);
          if (distance >= desired) continue;
          if (distance < 0.0001) {
            const angle = ((u.id * 127 + v.id * 31) % 628) / 100;
            dx = Math.cos(angle);
            dy = Math.sin(angle);
            distance = 1;
          }
          const push = Math.min(0.07, (desired - Math.hypot(v.x - u.x, v.y - u.y)) * 0.25),
            px = (dx / distance) * push,
            py = (dy / distance) * push;
          if (free(u.x - px, u.y - py)) {
            u.x -= px;
            u.y -= py;
          }
          if (free(v.x + px, v.y + py)) {
            v.x += px;
            v.y += py;
          }
        }
      }
  }
}
