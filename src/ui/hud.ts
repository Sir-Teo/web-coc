import { archerTowerPortrait } from './archer-tower-portrait';
import { darkDrillProduction } from '../game/dark-drill-production';
import { infernoStats, type InfernoMode } from '../game/inferno-weapon';
import { cannonIconAsset } from '../game/cannon-art';
import { darkStorageCapacity } from '../game/dark-storage-stats';
import { campaignStage } from '../game/campaign-catalog';
import { campaignAmount, campaignResourceKeys, type CampaignResource } from '../game/campaign-loot';
import {
  NATIVE_CAMPAIGN,
  NATIVE_COMBAT,
  nativeCampaignIssues,
  nativeUnlocked,
} from '../game/native-campaign';
import { sweeperStats } from '../game/air-control-stats';
import { XBOW, xbowRange, type XbowMode } from '../game/xbow-stats';
import {
  EQUIPMENT,
  EQUIPMENT_KEYS,
  EQUIPMENT_LEVELS,
  oreCapacity,
  ORES,
  ORE_KEYS,
  EARTHQUAKE_BOOTS,
  equipmentStats,
  equipmentQuote,
  validEquipmentKind,
  type EquipmentKind,
  type OreKind,
} from '../game/equipment';
import { isDefense } from '../game/data';
import { campCapacity } from '../game/camp-stats';
import { spellFactoryCapacity } from '../game/facility-progression';
import { BOMB_TOWER, bombTowerDeathDamage } from '../game/bomb-tower';
import { WIZARD_TOWER_PROJECTILES, wizardTowerProjectileTier } from '../game/wizard-tower-stats';
import {
  SKELETON_TRAP,
  skeletonCount,
  skeletonSpawnLevel,
  skeletonStats,
} from '../game/skeleton-stats';
import {
  maxSpellLevelFor,
  SPELL_LEVELS,
  HEAL_PULSES,
  freezeSeconds,
  HEAL_HERO_MULTIPLIER,
  SPELL_PULSE_INTERVAL,
  RAGE_LINGER,
} from '../game/spell-progression';
import { OBSTACLES } from '../game/obstacles';
import { TROOP_ORDER, SPELL_ORDER } from './army-roster';
import { TROOP_UNLOCK, SPELL_UNLOCK } from '../game/army-unlocks';
import { exportReplayFile, parseReplayFile, MAX_REPLAY_FILE_BYTES } from '../game/replay-file';
import { compatibleReplayVersion } from '../game/replay';
import {
  heroStats,
  heroRecovery,
  heroNextRequirement,
  heroTownHallScale,
  heroUpgradeCost,
  heroUpgradeSeconds,
} from '../game/heroes';
import { BUILDING_LEVELS, requiredTownHall } from '../game/progression';
import { armySpace, spellSpace } from '../game/army';
import {
  BUILDINGS,
  buildPrice,
  buildingHp,
  TROOPS,
  TROOP_KEYS,
  SPELLS,
  TROOP_HOTKEYS,
  SPELL_HOTKEYS,
  maxTroopLevel,
  researchLaboratory,
  researchLevelForLab,
  asset,
  defenseDamage,
  defenseDps,
  trapDamage,
  trapStats,
  isTrap,
  isSpellKind,
  springCapacity,
  unlockTownHall,
  MAX_TOWNHALL,
  storageCapacity,
  upgradeSeconds,
  upgradeCost as costFor,
  type BuildingKind,
  type TroopKind,
  type SpellKind,
  type ResearchKind,
} from '../game/data';
import { GameModel, formatTime, BATTLE_SECONDS, type Building } from '../game/model';
/** Title-cased weapon name for the Spell Tower selector. */
const spellTowerLabel = (weapon = 'rage') => weapon[0].toUpperCase() + weapon.slice(1);
import { VillageScene } from '../game/scene';
import { AudioManager } from '../game/audio';
import { exportSave, migrateSave, validateSave, saveGame } from '../game/save';
import { STAR_BONUS_STARS, starBonusReward } from '../game/leagues';
import { icon, resource, coin, elixir, gem } from './icons';
type Panel =
  | 'blacksmith'
  | 'ore-confirm'
  | 'heroes'
  | 'progression'
  | 'research'
  | 'campaign'
  | 'settings'
  | 'achievements'
  | 'star-bonus'
  | 'help'
  | 'info'
  | 'layouts'
  | 'surrender'
  | 'troop-info'
  | 'spell-info'
  | 'army-presets'
  | 'battle-log'
  | null;
/** Shop and army live in a bottom sheet so the village stays visible and clickable. */
type Drawer = 'shop' | 'army' | null;
const n = (v: number) => Math.floor(v).toLocaleString('en-US');
const damageNumber = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 2 });
const gearImage = (kind: EquipmentKind | OreKind, cls = '') =>
  `<img class="${cls}" src="/assets/equipment/${kind}-v1.webp" alt="">`;
const time = (seconds: number) => formatTime(seconds);
const clock = (seconds: number) => {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const button = (action: string, label: string, cls = 'game-btn green', extra = '') =>
  `<button class="${cls}" data-action="${action}" ${extra}>${label}</button>`;
const html = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
const pct = (v: number) => `${Math.max(0, Math.min(100, Number.isNaN(v) ? 0 : v))}%`;
/** The one place that says what a building level actually buys you. */
function statRows(
  kind: BuildingKind,
  level: number,
  xbowMode: XbowMode = 'ground',
  infernoMode: InfernoMode = 'single',
): [string, string, string][] {
  const d = BUILDINGS[kind];
  const rows: [string, string, string][] = [['Heart', 'Hitpoints', n(buildingHp(kind, level))]];
  const trap = trapStats(kind, level);
  if (trap && kind !== 'skeletontrap') {
    rows.length = 0;
    rows.push(['Swords', 'Damage', n(trapDamage(kind, level))]);
    rows.push(['Radar', 'Trigger radius', `${trap.trigger} tile${trap.trigger === 1 ? '' : 's'}`]);
    if (trap.springCapacity)
      rows.push(['Users', 'Spring capacity', `${springCapacity(level)} spaces`]);
    else if (!trap.homingSpeed) rows.push(['Target', 'Blast radius', `${trap.radius} tiles`]);
    if (trap.homingSpeed)
      rows.push(
        ['Target', 'Damage type', 'Single target'],
        ['Gauge', 'Flight speed', `${trap.homingSpeed} tiles/s`],
        ['Users', 'Minimum housing', `${trap.minHousing} spaces`],
      );
    if (!trap.homingSpeed)
      rows.push(['Clock3', 'Fuse / flight', trap.delay ? `${trap.delay}s` : 'Instant']);
    rows.push(['Radar', 'Targets', trap.targets === 'air' ? 'Air only' : 'Ground only']);
  }
  if (kind === 'skeletontrap') {
    const skeleton = skeletonStats('ground', skeletonSpawnLevel(level));
    rows.length = 0;
    rows.push(
      ['Users', 'Skeletons', String(skeletonCount(level))],
      ['Heart', 'Skeleton hitpoints', String(skeleton.hp)],
      ['Swords', 'Damage per second', String(skeleton.dps)],
      ['Swords', 'Damage per hit', String(skeleton.damage)],
      ['Gauge', 'Attack speed', `${skeleton.rate}s`],
      ['Radar', 'Trigger radius', `${SKELETON_TRAP.trigger} tiles`],
      ['Clock3', 'First spawn', `${SKELETON_TRAP.firstSpawn}s`],
      ['Clock3', 'Between spawns', `${SKELETON_TRAP.spawnInterval}s`],
      ['Radar', 'Targets', 'Ground or air'],
    );
  }
  if (kind === 'airsweeper')
    rows.push(
      ['Wind', 'Push strength', `${sweeperStats(level).push.toFixed(1)} tiles`],
      ['Target', 'Range', '1–15 tiles'],
      ['Gauge', 'Attack speed', '5s'],
      ['Radar', 'Targets', 'Air only'],
      ['RotateCw', 'Rotation', '8 directions'],
    );
  if (kind === 'inferno') {
    const { weapon } = infernoStats(level);
    rows.push(['Target', 'Mode', infernoMode === 'multi' ? 'Multi-target' : 'Single-target']);
    rows.push([
      'Swords',
      infernoMode === 'multi' ? 'Damage per second per target' : 'Damage per second',
      infernoMode === 'multi' ? n(weapon.dps[0]) : weapon.dps.map(n).join(' → '),
    ]);
    if (infernoMode === 'single')
      rows.push(['Clock3', 'Heat increases after', '1.5s / 5.25s on the same target']);
    rows.push(
      [
        'Users',
        'Simultaneous targets',
        String(infernoMode === 'multi' ? weapon.alternateTargets : 1),
      ],
      ['Target', 'Range', `${infernoMode === 'multi' ? 10 : 9} tiles`],
      ['Radar', 'Targets', 'Ground & air'],
    );
  }
  if (d.damage && kind !== 'inferno') {
    rows.push(['Swords', 'Damage per second', damageNumber(defenseDps(kind, level))]);
    rows.push(['Swords', 'Damage per hit', damageNumber(defenseDamage(kind, level))]);
    rows.push([
      'Target',
      'Range',
      `${d.minRange ? `${d.minRange}–` : ''}${kind === 'xbow' ? xbowRange(xbowMode) : d.range} tiles`,
    ]);
    rows.push(['Gauge', 'Attack speed', `${d.rate}s`]);
    if (d.splash)
      rows.push(['Sparkles', 'Splash radius', `${d.splash} tile${d.splash === 1 ? '' : 's'}`]);
    rows.push([
      'Radar',
      'Targets',
      kind === 'xbow'
        ? xbowMode === 'both'
          ? 'Ground & air'
          : 'Ground only'
        : d.targets === 'air'
          ? 'Air only'
          : d.targets === 'ground'
            ? 'Ground only'
            : 'Ground & air',
    ]);
  }
  if (kind === 'xbow') rows.push(['Layers', 'Ammunition', `${n(XBOW.ammunition)} bolts`]);
  if (kind === 'wizardtower')
    rows.push([
      'Gauge',
      'Flight speed',
      `${WIZARD_TOWER_PROJECTILES[wizardTowerProjectileTier(level) - 1].speed} tiles/s`,
    ]);
  if (kind === 'bombtower')
    rows.push(
      ['Swords', 'Death damage', n(bombTowerDeathDamage(level))],
      ['Target', 'Death blast radius', `${BOMB_TOWER.deathRadius} tiles`],
      ['Clock3', 'Death fuse', `${BOMB_TOWER.deathDelay}s`],
    );
  if (kind === 'tesla')
    rows.push(
      ['Radar', 'Reveal radius', '6 tiles'],
      ['Eye', 'Automatic reveal', '51% destruction'],
      ['Target', 'Damage type', 'Single target'],
    );
  if (kind === 'goldmine' || kind === 'collector')
    rows.push(
      ['Timer', 'Production', `${3 * level} / second`],
      ['Layers', 'Holds', n(darkStorageCapacity(level))],
    );
  if (kind === 'goldstorage' || kind === 'elixirstorage')
    rows.push(['Layers', 'Adds capacity', `+${n(storageCapacity(level))}`]);
  if (kind === 'darkdrill')
    rows.push(
      ['Timer', 'Production', `${n(darkDrillProduction(level).perHour)} / hour`],
      ['Layers', 'Holds', n(darkDrillProduction(level).capacity)],
    );
  if (kind === 'darkstorage')
    rows.push(['Layers', 'Dark elixir capacity', n(darkStorageCapacity(level))]);
  if (kind === 'herohall')
    rows.push(['ShieldCheck', 'King level cap at TH7+', level === 1 ? '10' : '20']);
  if (kind === 'blacksmith') {
    // Each forge level opens its own band of equipment levels and stores more ore.
    const reach = EQUIPMENT_LEVELS.filter((row) => row.blacksmith <= level).length;
    const capacity = oreCapacity(level);
    rows.push(['Anvil', 'Equipment level cap', String(reach)]);
    for (const k of ORE_KEYS) rows.push(['Gem', `${ORES[k].name} capacity`, n(capacity[k])]);
  }
  if (kind === 'camp') rows.push(['UsersRound', 'Troop capacity', `${campCapacity(level)}`]);
  if (kind === 'spellfactory')
    rows.push(['Sparkles', 'Spell housing', String(spellFactoryCapacity(level))]);
  if (kind === 'laboratory') {
    rows.push([
      'FlaskConical',
      'Researches up to',
      `Up to level ${Math.max(...TROOP_KEYS.map((k) => researchLevelForLab(k, level)))} · varies by troop`,
    ]);
    rows.push([
      'Sparkles',
      'Spell research',
      `Up to level ${Math.max(...SPELL_ORDER.map((k) => SPELL_LEVELS[k].filter((s) => s.laboratory <= level).length))} · varies by spell`,
    ]);
  }
  if (kind === 'builder') rows.push(['Hammer', 'Builders', '+1 construction slot']);
  if (kind === 'barracks') rows.push(['Swords', 'Preparation', 'Free and instant']);
  if (kind === 'townhall') rows.push(['LayoutGrid', 'Caps buildings at', `Level ${level + 1}`]);
  return rows;
}
/**
 * First-run coaching. Each step is satisfied by a counter that already exists in
 * the save, so a village part-way through the game opens with the tutorial already
 * finished rather than being told to do things it has done.
 */
const TUTORIAL: {
  title: string;
  body: string;
  target: string;
  done: (m: GameModel) => boolean;
}[] = [
  {
    title: 'Collect what your village made',
    body: 'Tap Collect, or any bubble floating over a mine.',
    target: '.collect-btn',
    done: (m) => m.state.stats.collected > 0,
  },
  {
    title: 'Put up a new building',
    body: 'Open the Shop and drag a building onto clear ground.',
    target: '.shop-btn',
    done: (m) => (m.state.stats.built ?? 0) > 0,
  },
  {
    title: 'Train a troop',
    body: 'Open Army and add a troop. Preparation is free and instant.',
    target: '.train-add',
    done: (m) => (m.state.stats.trained ?? 0) > 0,
  },
  {
    title: 'Raid the valley',
    body: 'Tap Attack! and take the Goblin Outpost.',
    target: '.attack-btn',
    done: (m) => m.state.stats.raids > 0,
  },
];
export class HUD {
  private root: HTMLElement;
  private panel: Panel = null;
  private drawerPanel: Drawer = null;
  private tab = 'All';
  private inspectedTroop: TroopKind = 'swordsman';
  private inspectedSpell: SpellKind = 'lightning';
  private inspectedEquipment: EquipmentKind = 'puppet';
  private orePurchase: { kind: EquipmentKind; level: number; gems: number } | null = null;
  private presetNames = new Map<number, string>();
  private toastTimer?: ReturnType<typeof setTimeout>;
  private resultShown = false;
  private raf = false;
  private pressedActions = new Set<number>();
  private renderPending = false;
  private drawerMarkup = '';
  private modalMarkup = '';
  private lastPanel: Panel = null;
  private lastDrawer: Drawer = null;
  private focusBefore: HTMLElement | null = null;
  private drawerBefore: { panel: Drawer; left: number; top: number } | null = null;
  private actionSource: HTMLElement | null = null;
  private dragging = false;
  private anchorFrame = 0;
  private replayScrubbing = false;
  constructor(
    private model: GameModel,
    private scene: VillageScene,
    private audio: AudioManager,
  ) {
    this.root = document.querySelector('#ui')!;
    this.root.innerHTML =
      '<div id="hud"></div><div id="context"></div><div id="drawer"></div><div id="modal-root"></div><div id="toast" role="status" aria-live="polite"></div><div id="save-state" aria-live="polite"></div><input id="import-file" type="file" accept="application/json,.json" hidden><input id="import-replay-file" type="file" accept="application/json,.json" hidden>';
    this.root.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (target && !(target as HTMLButtonElement).disabled) {
        this.audio.play('click');
        this.actionSource = target;
        try {
          this.action(target.dataset.action!);
        } finally {
          this.actionSource = null;
        }
      }
    });
    this.root.addEventListener('pointerdown', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-action]')) this.pressedActions.add(e.pointerId);
      if (target.id === 'replay-progress' && this.model.replay) {
        this.replayScrubbing = true;
        this.model.replay.paused = true;
      }
      const card = target.closest<HTMLElement>('[data-drag]');
      // The price button is a tap target; everything else on the tile is a drag handle.
      if (card && !target.closest('button') && e.isPrimary)
        this.beginDrawerDrag(card.dataset.drag as BuildingKind, e);
    });
    const finishScrub = () => {
      if (!this.replayScrubbing) return;
      this.replayScrubbing = false;
      this.scheduleRender();
    };
    document.addEventListener('pointerup', finishScrub);
    document.addEventListener('pointercancel', finishScrub);
    const releaseAction = (e: PointerEvent) => {
      this.pressedActions.delete(e.pointerId);
      // The browser dispatches click after pointerup; render on the next frame.
      if (!this.pressedActions.size && this.renderPending) this.scheduleRender();
    };
    document.addEventListener('pointerup', releaseAction);
    document.addEventListener('pointercancel', releaseAction);
    window.addEventListener('blur', () => {
      this.pressedActions.clear();
      if (this.renderPending) this.scheduleRender();
    });
    this.root.addEventListener('change', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.id === 'import-file' && t.files?.[0]) void this.import(t.files[0]);
      if (t.id === 'import-replay-file' && t.files?.[0]) void this.importReplay(t.files[0]);
      if (t.id === 'replay-progress') this.model.seekReplay(Number(t.value));
    });
    this.root.addEventListener('input', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.id === 'replay-progress' && this.model.replay) {
        // Keep the slider mounted while the pointer or keyboard changes its value.
        this.model.replay.paused = true;
        const time = document.querySelector('#replay-time');
        if (time)
          time.textContent = `${clock(Number(t.value))} / ${clock(this.model.replay.duration)}`;
        t.setAttribute('aria-valuetext', clock(Number(t.value)));
        const status = document.querySelector('.replay-status strong');
        if (status) status.textContent = 'Replay paused';
      }
      if (t.id.startsWith('preset-name-'))
        this.presetNames.set(Number(t.id.slice('preset-name-'.length)), t.value);
    });
    document.addEventListener('keydown', (e) => this.keydown(e));
    model.onChange = (passive) => (passive ? this.updateLive() : this.scheduleRender());
    model.onToast = (m) => this.toast(m);
    scene.onSelect = () => {
      this.panel = null;
      this.drawerPanel = null;
      this.render();
    };
    this.render();
    setInterval(() => this.updateLive(), 250);
    this.trackAnchor();
  }
  private scheduleRender() {
    if (this.raf) return;
    this.raf = true;
    requestAnimationFrame(() => {
      this.raf = false;
      this.render();
    });
  }
  /** Keeps the building card pinned to its building while the camera moves. */
  private trackAnchor() {
    const step = () => {
      this.positionContext();
      this.anchorFrame = requestAnimationFrame(step);
    };
    this.anchorFrame = requestAnimationFrame(step);
  }
  private positionContext() {
    const card = document.querySelector<HTMLElement>('.building-context[data-anchor]');
    if (!card) return;
    const b = this.model.state.buildings.find((v) => v.id === Number(card.dataset.anchor));
    const o = this.model.selectedObstacle;
    if (!b && !o) return;
    const target = b ?? o!;
    const size = b ? BUILDINGS[b.kind].size : OBSTACLES[o!.kind].size;
    const p = this.scene.screenFor(target.x + size / 2, target.y + size / 2);
    const width = card.offsetWidth || 470,
      height = card.offsetHeight || 120;
    const left = Math.min(Math.max(width / 2 + 12, p.x), window.innerWidth - width / 2 - 12);
    const hudFloor = card.classList.contains('wall-context')
      ? Math.max(
          150,
          (document.querySelector('.resources')?.getBoundingClientRect().bottom ?? 0) + 8,
        )
      : 150;
    const minTop = Math.min(hudFloor, Math.max(8, window.innerHeight - height - 12));
    const maxTop = Math.max(
      minTop,
      window.innerHeight - height - (window.innerHeight >= 650 ? 150 : 12),
    );
    const top = Math.min(Math.max(minTop, p.y - height - 62), maxTop);
    card.style.left = `${Math.round(left)}px`;
    card.style.top = `${Math.round(top)}px`;
  }
  toast(message: string) {
    const el = document.querySelector<HTMLElement>('#toast')!;
    el.textContent = message;
    el.classList.toggle('show', !!message);
    clearTimeout(this.toastTimer);
    if (message) this.toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
  }
  setSaveState(ok: boolean) {
    document.querySelector('#save-state')!.textContent = ok
      ? ''
      : 'Saving is unavailable. Export your village in Settings.';
  }
  private show(panel: Panel) {
    // The info sheet describes the selected building, so it is the one panel that
    // must survive the cancel that clears placement state.
    const selected = this.model.selected;
    // Mouse/touch activation does not necessarily focus a button (notably in
    // WebKit). Remember the actual launcher before cancellation can redraw it.
    if (panel && !this.panel) {
      this.focusBefore = this.actionSource ?? (document.activeElement as HTMLElement);
      const body = document.querySelector('.drawer-body');
      this.drawerBefore = this.drawerPanel
        ? { panel: this.drawerPanel, left: body?.scrollLeft ?? 0, top: body?.scrollTop ?? 0 }
        : null;
    }
    this.panel = panel;
    if (panel) {
      this.drawerPanel = null;
      this.model.cancel();
      if (panel === 'info') this.model.selected = selected;
    }
    this.render();
  }
  private closePanel() {
    this.panel = null;
    const previous = this.drawerBefore;
    this.drawerBefore = null;
    if (previous && !this.model.battle) this.drawerPanel = previous.panel;
    this.render();
    const body = document.querySelector('.drawer-body');
    if (body && previous) {
      body.scrollLeft = previous.left;
      body.scrollTop = previous.top;
    }
    this.restoreFocus();
  }
  private showDrawer(drawer: Drawer) {
    this.drawerPanel = this.drawerPanel === drawer ? null : drawer;
    this.panel = null;
    this.drawerBefore = null;
    if (this.drawerPanel) this.model.cancel();
    this.render();
  }
  private restoreFocus() {
    const action = this.focusBefore?.dataset.action;
    if (action)
      Array.from(document.querySelectorAll<HTMLElement>('[data-action]'))
        .find((el) => el.dataset.action === action)
        ?.focus({ preventScroll: true });
  }
  /**
   * Picks a building up out of the shop drawer and follows the pointer onto the
   * map, dropping it where the pointer is released. Releasing over the drawer
   * keeps the building armed for a plain tap instead.
   */
  private beginDrawerDrag(kind: BuildingKind, event: PointerEvent) {
    this.model.beginBuild(kind);
    if (!this.model.placement) return;
    this.dragging = true;
    document.querySelector('#drawer')?.classList.add('dragging');
    this.scene.trackGhost(event.clientX, event.clientY);
    const move = (e: PointerEvent) => this.scene.trackGhost(e.clientX, e.clientY);
    const up = (e: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      this.dragging = false;
      this.scene.releaseGhost();
      if (e.type === 'pointercancel') {
        this.model.cancel();
        this.drawerPanel = null;
        this.render();
        return;
      }
      const overDrawer = document
        .elementFromPoint(e.clientX, e.clientY)
        ?.closest('#drawer, #hud, .modal-backdrop');
      if (overDrawer) {
        // Treated as a plain pick-up: close the sheet and let them tap the map.
        this.drawerPanel = null;
      } else {
        const g = this.scene.gridAtScreen(e.clientX, e.clientY);
        if (!this.scene.placeBuilding(Math.floor(g.x), Math.floor(g.y))) this.drawerPanel = null;
      }
      this.render();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    this.render();
  }
  private action(a: string) {
    const [verb, arg] = a.split(':');
    const m = this.model;
    switch (verb) {
      case 'blacksmith':
        this.show('blacksmith');
        break;
      case 'equipment-view':
        if (!validEquipmentKind(arg)) break;
        this.inspectedEquipment = arg;
        this.show('blacksmith');
        break;
      case 'equipment-equip': {
        const [kind, slot] = arg.split(',');
        if (validEquipmentKind(kind)) m.equipKing(kind, Number(slot));
        break;
      }
      case 'equipment-upgrade': {
        const [kind, rawLevel] = arg.split(','),
          level = Number(rawLevel);
        if (!validEquipmentKind(kind) || !m.blacksmith || m.kingEquipment.levels[kind] !== level)
          break;
        const quote = equipmentQuote(level + 1, m.ores);
        if (!quote) break;
        if (quote.gems) {
          this.orePurchase = { kind, level, gems: quote.gems };
          this.show('ore-confirm');
        } else if (m.upgradeEquipment(kind, level)) this.audio.play('build');
        break;
      }
      case 'ore-buy': {
        const purchase = this.orePurchase;
        this.orePurchase = null;
        if (purchase && m.upgradeEquipment(purchase.kind, purchase.level, purchase.gems))
          this.audio.play('build');
        this.show('blacksmith');
        break;
      }
      case 'close':
        this.closePanel();
        break;
      case 'wall-move':
        m.beginWallMove();
        break;
      case 'sweeper-rotate':
        m.rotateSweeper();
        break;
      case 'skeleton-mode':
        m.toggleSkeletonMode();
        break;
      case 'inferno-mode':
        this.model.toggleInfernoMode();
        break;
      case 'spell-tower-weapon':
        this.model.cycleSpellTowerWeapon();
        break;
      case 'xbow-mode':
        this.model.toggleXbowMode();
        break;
      case 'wall-rotate':
        m.rotateWallMove();
        break;
      case 'wall-place':
        if (m.confirmWallMove()) this.audio.play('build');
        break;
      case 'wall-row':
        m.selectWallRow();
        break;
      case 'wall-single':
        m.selectSingleWall();
        break;
      case 'wall-count':
        m.adjustWallSelection(Number(arg));
        break;
      case 'wall-info-upgrade':
        m.upgradeWalls([Number(arg)], 'gold');
        break;
      case 'wall-upgrade':
        m.upgradeWalls(
          m.selectedWalls.map((b) => b.id),
          arg as 'gold' | 'elixir',
        );
        break;
      case 'obstacle-remove':
        m.removeObstacle(Number(arg));
        break;
      case 'obstacle-cancel':
        m.cancelObstacleRemoval(Number(arg));
        break;
      case 'obstacle-finish':
        m.finishObstacleRemoval(Number(arg));
        break;
      case 'close-drawer':
        this.drawerPanel = null;
        this.render();
        break;
      case 'heroes':
        this.show('heroes');
        break;
      case 'progression':
        this.show('progression');
        break;
      case 'hero-upgrade':
        m.upgradeHero();
        break;
      case 'hero-finish':
        m.finishHero();
        break;
      case 'hero-select':
        if (!m.battle?.hero) break;
        if (m.battle.hero.unitId === null) {
          m.activeHero = true;
          m.activeSpell = null;
          m.changed();
        } else m.activateHeroAbility();
        break;
      case 'shop':
        this.tab = 'All';
        this.showDrawer('shop');
        break;
      case 'army':
        this.showDrawer('army');
        break;
      case 'army-jump': {
        if (arg !== 'troops' && arg !== 'spells') break;
        const body = document.querySelector<HTMLElement>('.army-strip');
        const tile = body?.querySelector<HTMLElement>(`[data-army-category="${arg}"]`);
        if (body && tile) {
          const left =
            body.scrollLeft +
            tile.getBoundingClientRect().left -
            body.getBoundingClientRect().left -
            parseFloat(getComputedStyle(body).paddingLeft);
          body.scrollTo({
            left,
            behavior: m.state.settings.reducedMotion ? 'instant' : 'smooth',
          });
        }
        break;
      }
      case 'troop-info':
        this.inspectedTroop = arg as TroopKind;
        this.show('troop-info');
        break;
      case 'spell-info':
        this.inspectedSpell = arg as SpellKind;
        this.show('spell-info');
        break;
      case 'research-view':
        this.show('research');
        document
          .querySelector(`[data-research-kind="${arg}"]`)
          ?.scrollIntoView({ block: 'nearest' });
        break;
      case 'research':
        this.show('research');
        break;
      case 'research-start':
        m.research(arg as ResearchKind);
        break;
      case 'research-finish':
        m.finishResearch();
        break;
      case 'train-five':
        m.train(arg as TroopKind, 5);
        break;
      case 'brew':
        m.brew(arg as SpellKind);
        this.render();
        break;
      case 'brew-five':
        m.brew(arg as SpellKind, 5);
        break;
      case 'army-presets':
        this.show('army-presets');
        break;
      case 'battle-log':
        this.show('battle-log');
        break;
      case 'preset-save': {
        const slot = Number(arg);
        m.saveArmyPreset(
          slot,
          document.querySelector<HTMLInputElement>(`#preset-name-${arg}`)?.value,
        );
        const saved = m.state.armyPresets?.[slot];
        if (saved) this.presetNames.set(slot, saved.name);
        break;
      }
      case 'preset-load':
        m.loadArmyPreset(Number(arg));
        break;
      case 'remove-troop':
        m.removeTroop(arg as TroopKind);
        break;
      case 'remove-spell':
        m.removeSpell(arg as SpellKind);
        break;
      case 'clear-army':
        m.clearArmy();
        break;
      case 'replay':
        if (m.startReplay(Number(arg))) {
          clearTimeout(this.toastTimer);
          document.querySelector('#toast')?.classList.remove('show');
          this.panel = null;
          this.drawerPanel = null;
          this.resultShown = false;
          this.render();
        }
        break;
      case 'replay-pause':
        m.toggleReplay();
        break;
      case 'replay-speed':
        m.setReplaySpeed(Number(arg));
        break;
      case 'replay-restart':
        m.restartReplay();
        break;
      case 'replay-jump':
        if (m.replay) m.seekReplay(m.replay.time + Number(arg));
        break;
      case 'replay-skip':
        m.skipReplayScouting();
        break;
      case 'replay-export': {
        try {
          const data = m.replayRecording(arg ? Number(arg) : undefined);
          if (data) exportReplayFile(data);
          else this.toast('This recording is no longer available.');
        } catch (error) {
          this.toast(error instanceof Error ? error.message : 'Could not export this replay.');
        }
        break;
      }
      case 'replay-import':
        document.querySelector<HTMLInputElement>('#import-replay-file')!.click();
        break;
      case 'replay-exit':
        m.returnHome();
        this.resultShown = false;
        this.show('battle-log');
        break;
      case 'practice':
        m.startBattle(0, true);
        if (m.battle) {
          this.panel = null;
          this.drawerPanel = null;
          this.resultShown = false;
        }
        this.render();
        break;
      case 'raid-again': {
        const battle = m.battle;
        if (!battle?.finished) break;
        m.returnHome();
        if (!battle.practice && !m.retrain()) {
          this.resultShown = false;
          this.showDrawer('army');
          break;
        }
        m.startBattle(battle.index, battle.practice, battle.catalog);
        this.resultShown = false;
        this.panel = null;
        this.render();
        break;
      }
      case 'retrain':
        m.retrain();
        break;
      case 'campaign':
        this.show('campaign');
        break;
      case 'settings':
        this.show('settings');
        break;
      case 'star-bonus':
        this.model.collectStarBonus();
        return;
      case 'achievements':
        this.show('achievements');
        break;
      case 'help':
        this.show('help');
        break;
      case 'info':
        this.show('info');
        break;
      case 'layouts':
        this.show('layouts');
        break;
      case 'layout-save':
        m.saveLayout(Number(arg));
        break;
      case 'layout-load':
        m.loadLayout(Number(arg));
        break;
      case 'edit':
        m.beginEdit();
        this.drawerPanel = null;
        this.panel = null;
        this.render();
        break;
      case 'edit-done':
        m.endEdit();
        this.panel = null;
        this.render();
        break;
      case 'undo':
        m.undo();
        break;
      case 'redo':
        m.redo();
        break;
      case 'tab':
        this.tab = arg;
        this.render();
        break;
      case 'collect':
        m.collect();
        this.audio.play('collect');
        break;
      case 'build':
        m.beginBuild(arg as BuildingKind);
        if (m.placement) this.drawerPanel = null;
        this.render();
        break;
      case 'cancel':
        m.cancel();
        break;
      case 'upgrade':
        m.upgrade(Number(arg));
        this.audio.play('build');
        break;
      case 'finish':
        m.finish(Number(arg));
        break;
      case 'move':
        m.move(Number(arg));
        break;
      case 'train':
        m.train(arg as TroopKind);
        this.render();
        break;
      case 'attack':
        m.startCampaign(Number(arg));
        if (m.battle) {
          this.panel = null;
          this.drawerPanel = null;
          this.resultShown = false;
          this.audio.play('deploy');
        }
        this.render();
        break;
      case 'troop':
        if (!m.battle || !m.battle.remaining[arg as TroopKind]) break;
        m.activeHero = false;
        m.activeTroop = arg as TroopKind;
        m.activeSpell = null;
        this.render();
        document
          .querySelector(`[data-action="troop:${arg}"]`)
          ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        break;
      case 'spell':
        if (!m.battle || !m.battle.spells[arg as SpellKind]) break;
        m.activeHero = false;
        m.activeSpell = m.activeSpell === arg ? null : (arg as SpellKind);
        this.render();
        document
          .querySelector(`[data-action="spell:${arg}"]`)
          ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        break;
      case 'surrender':
        this.show('surrender');
        break;
      case 'end':
        this.panel = null;
        m.finishBattle();
        break;
      case 'home':
        m.returnHome();
        this.panel = null;
        this.resultShown = false;
        this.render();
        break;
      case 'zoom-in':
        this.scene.zoomBy(1.15);
        break;
      case 'zoom-out':
        this.scene.zoomBy(1 / 1.15);
        break;
      case 'recenter':
        this.scene.resetCamera();
        break;
      case 'sound':
        m.state.settings.sound = !m.state.settings.sound;
        this.audio.enabled = m.state.settings.sound;
        m.changed();
        break;
      case 'music':
        m.state.settings.music = !m.state.settings.music;
        this.audio.music(m.state.settings.music);
        m.changed();
        break;
      case 'motion':
        m.state.settings.reducedMotion = !m.state.settings.reducedMotion;
        document.documentElement.classList.toggle('reduce-motion', m.state.settings.reducedMotion);
        m.changed();
        break;
      case 'claim':
        if (m.claimQuest(arg)) this.audio.play('collect');
        break;
      case 'export':
        exportSave(m.state);
        this.toast('Your village backup has been exported.');
        break;
      case 'import':
        document.querySelector<HTMLInputElement>('#import-file')!.click();
        break;
      case 'tutorial':
        this.panel = null;
        this.render();
        break;
      case 'skip-tutorial':
        m.state.tutorial = true;
        m.changed();
        break;
    }
  }
  private async importReplay(file: File) {
    try {
      if (file.size > MAX_REPLAY_FILE_BYTES)
        throw Error('Replay files must be smaller than 512 KB.');
      const replay = parseReplayFile(await file.text());
      if (!this.model.openReplay(replay))
        throw Error('Finish your current attack before opening a replay.');
      this.panel = null;
      this.drawerPanel = null;
      this.resultShown = false;
      this.render();
      this.toast('Shared replay opened. Your village is unchanged.');
    } catch (error) {
      this.toast(error instanceof Error ? error.message : 'Could not open this replay.');
    } finally {
      document.querySelector<HTMLInputElement>('#import-replay-file')!.value = '';
    }
  }
  private async import(file: File) {
    try {
      if (file.size > 1000000) throw Error();
      const data = migrateSave(JSON.parse(await file.text()));
      if (!validateSave(data)) throw Error();
      this.model.state = data;
      this.presetNames.clear();
      this.model.returnHome();
      this.model.endEdit();
      this.model.tick(Date.now());
      document.documentElement.classList.toggle('reduce-motion', data.settings.reducedMotion);
      this.audio.enabled = data.settings.sound;
      this.audio.music(data.settings.music);
      if (!this.showMapUpgrade()) this.toast('Village restored successfully.');
      await saveGame(data);
      this.panel = null;
      this.render();
    } catch {
      this.toast('That backup is not a valid Crown & Clan village.');
    } finally {
      document.querySelector<HTMLInputElement>('#import-file')!.value = '';
    }
  }
  showMapUpgrade() {
    const moved = this.model.state.mapUpgrade?.moved;
    if (!moved) return false;
    delete this.model.state.mapUpgrade;
    this.model.changed(true);
    this.toast(
      `Village updated · ${moved} building${moved === 1 ? '' : 's'} moved to clear ground. Your progress is preserved.`,
    );
    return true;
  }
  private keydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (this.panel) {
        this.closePanel();
      } else if (this.drawerPanel) {
        this.drawerPanel = null;
        this.render();
      } else if (this.model.wallMove) this.model.cancel();
      else if (this.model.editing) this.action('edit-done');
      else this.model.cancel();
    }
    if ((this.panel || this.model.battle?.finished) && e.key === 'Tab') {
      const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
      const items = Array.from(
        dialog?.querySelectorAll<HTMLElement>('button:not(:disabled),input,a[href]') ?? [],
      );
      const first = items[0],
        last = items.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
    if (this.panel || e.target instanceof HTMLInputElement) return;
    if (this.model.wallMove) {
      if (e.key.toLowerCase() === 'r') {
        e.preventDefault();
        this.model.rotateWallMove();
      }
      if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        this.action('wall-place');
      }
      return;
    }
    if (!this.model.battle && e.key.toLowerCase() === 'r' && this.model.rotateSweeper()) {
      e.preventDefault();
      return;
    }
    if (this.model.replay && e.code === 'Space') {
      e.preventDefault();
      this.model.toggleReplay();
      return;
    }
    if (this.model.battle && !this.model.replay) {
      if (e.key.toLowerCase() === 'h') {
        this.action('hero-select');
        return;
      }
      const troopIndex = TROOP_HOTKEYS.indexOf(e.key.toLowerCase());
      if (troopIndex >= 0) this.action(`troop:${TROOP_ORDER[troopIndex]}`);
      const spellIndex = SPELL_HOTKEYS.indexOf(e.key);
      if (spellIndex >= 0) this.action(`spell:${SPELL_ORDER[spellIndex]}`);
    }
    if (this.model.editing && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      this.action(e.shiftKey ? 'redo' : 'undo');
    }
    if (e.key === '+' || e.key === '=') this.scene.zoomBy(1.15);
    if (e.key === '-') this.scene.zoomBy(1 / 1.15);
  }
  render() {
    // A structural update must not remove a control between press and release.
    if (this.pressedActions.size) {
      this.renderPending = true;
      this.updateLive();
      return;
    }
    this.renderPending = false;
    const m = this.model,
      b = m.battle;
    if (this.replayScrubbing && m.replay) {
      this.updateLive();
      return;
    }
    const modalScroll = document.querySelector('.modal-body')?.scrollTop ?? 0;
    const drawerScroll = document.querySelector('.drawer-body')?.scrollLeft ?? 0;
    const drawerScrollY = document.querySelector('.drawer-body')?.scrollTop ?? 0;
    const categoryScroll = document.querySelector('.shop-tabs')?.scrollLeft ?? 0;
    const armyScroll = document.querySelector('.army-tray')?.scrollLeft ?? 0;
    const focused = (document.activeElement as HTMLElement)?.dataset?.action;
    document.querySelector('#hud')!.innerHTML = b ? this.battleHUD() : this.homeHUD();
    document.querySelector('#context')!.innerHTML = this.context();
    const drawerMarkup = this.drawer();
    const drawerChanged = drawerMarkup !== this.drawerMarkup;
    if (drawerChanged) {
      document.querySelector('#drawer')!.innerHTML = drawerMarkup;
      this.drawerMarkup = drawerMarkup;
    }
    document.querySelector('#drawer')!.classList.toggle('dragging', this.dragging);
    // An open sheet owns the bottom of the screen, so the bars beneath it step aside.
    this.root.classList.toggle('drawer-open', !!this.drawerPanel && !b);
    const result = b?.finished && !m.replay;
    // Drawers deliberately leave the map live; only real dialogs block it.
    this.scene.uiBlocked = !!this.panel || !!result;
    (document.querySelector('#hud') as HTMLElement).inert = this.scene.uiBlocked;
    (document.querySelector('#context') as HTMLElement).inert = this.scene.uiBlocked;
    (document.querySelector('#drawer') as HTMLElement).inert = this.scene.uiBlocked;
    const modalMarkup = result ? this.result() : this.panel ? this.modal() : '';
    if (modalMarkup !== this.modalMarkup) {
      const root = document.querySelector('#modal-root')!;
      const updatingOpenDialog =
        !!this.modalMarkup &&
        (result ? this.resultShown : this.panel !== null && this.panel === this.lastPanel);
      root.innerHTML = modalMarkup;
      // Updating research, settings or results must not fade/shrink an already open dialog.
      if (updatingOpenDialog)
        root.querySelectorAll<HTMLElement>('.modal, .modal-backdrop').forEach((el) => {
          el.style.animation = 'none';
        });
      this.modalMarkup = modalMarkup;
      document.querySelector('.modal-body')?.scrollTo(0, modalScroll);
    }
    const armyTray = document.querySelector('.army-tray');
    if (armyTray) armyTray.scrollLeft = armyScroll;
    const body = document.querySelector('.drawer-body');
    if (body && drawerChanged) {
      body.scrollLeft = drawerScroll;
      body.scrollTop = drawerScrollY;
    }
    const categories = document.querySelector<HTMLElement>('.shop-tabs');
    const activeCategory = categories?.querySelector<HTMLElement>('.active');
    if (categories && activeCategory) {
      categories.scrollLeft = categoryScroll;
      const bounds = categories.getBoundingClientRect();
      const tab = activeCategory.getBoundingClientRect();
      if (tab.right > bounds.right) categories.scrollLeft += tab.right - bounds.right;
      if (tab.left < bounds.left) categories.scrollLeft -= bounds.left - tab.left;
    }
    this.positionContext();
    this.markCoachTarget();
    // Every step satisfied: retire the coaching for good.
    if (!m.state.tutorial && !b && TUTORIAL.every((step) => step.done(m))) {
      m.state.tutorial = true;
      this.toast('That is the whole loop, Chief. The valley is yours from here.');
    }
    if (this.panel !== this.lastPanel) {
      document.querySelector<HTMLElement>('.modal [data-action="close"]')?.focus();
      this.lastPanel = this.panel;
    } else if (this.drawerPanel !== this.lastDrawer) {
      this.lastDrawer = this.drawerPanel;
    } else if (focused && (this.panel || !this.scene.uiBlocked)) {
      Array.from(document.querySelectorAll<HTMLElement>('[data-action]'))
        .find((e) => e.dataset.action === focused)
        ?.focus({ preventScroll: true });
    }
    if (result && !this.resultShown) {
      this.resultShown = true;
      this.countUp();
      this.audio.play('victory');
      document.querySelector<HTMLElement>('[data-action="home"]')?.focus();
    }
    this.updateLive();
  }
  /** The first unfinished coaching step, or -1 once there is nothing left to teach. */
  private get coachStep() {
    if (this.model.state.tutorial || this.model.battle || this.model.editing) return -1;
    return TUTORIAL.findIndex((step) => !step.done(this.model));
  }
  private coach() {
    const index = this.coachStep;
    if (index < 0) return '';
    const step = TUTORIAL[index];
    return `<div class="coach-banner" data-coach="${step.target}"><span class="coach-step">${index + 1}<i>/${TUTORIAL.length}</i></span><div><b>${step.title}</b><small>${step.body}</small></div>${button('skip-tutorial', 'Skip', 'coach-skip')}</div>`;
  }
  /** Rings the control the current step is about, without touching its layout. */
  private markCoachTarget() {
    for (const el of Array.from(document.querySelectorAll('.coach-target')))
      el.classList.remove('coach-target');
    const banner = document.querySelector<HTMLElement>('[data-coach]');
    if (banner) document.querySelector(banner.dataset.coach!)?.classList.add('coach-target');
  }
  private homeHUD() {
    const m = this.model,
      s = m.state;
    if (m.editing) return this.editHUD();
    const free = m.builders - m.busy;
    return `
 <header class="player-hud"><button class="level-shield" data-action="achievements" aria-label="Chief level ${m.chiefLevel}">${m.chiefLevel}</button><div class="player-info"><div class="eyebrow">CHIEF'S VILLAGE</div><div class="player-name">Oakheart <span class="online-dot"></span></div><button class="trophy-pill" data-action="achievements">${icon('Trophy', 17)} <b>${n(s.trophies)}</b> <span>${m.league.name}</span></button></div></header>
 <div class="village-status"><div class="brand">CROWN <span>&</span> CLAN</div><div class="status-chips"><button data-action="${m.busy ? 'achievements' : 'shop'}">${icon('Hammer', 20)} <b>${free}/${m.builders}</b> <span>Builders</span></button><button data-action="help">${icon('ShieldCheck', 20)} <b>Village safe</b></button></div></div>
 <div class="resources">${(['gold', 'elixir', ...(m.townhallLevel >= 7 || s.dark > 0 ? ['dark' as const] : []), 'gems'] as const).map((k, i) => `<div class="resource-bar ${k} ${k !== 'gems' && m.resourceCap(k) > 0 && s[k] >= m.resourceCap(k) ? 'full' : ''}"><div class="resource-fill" style="width:${k === 'gems' ? pct((s.gems / 500) * 100) : pct((s[k] / m.resourceCap(k)) * 100)}"></div><div class="resource-topline">${k === 'gems' ? 'Gems' : `Max: ${n(m.resourceCap(k))}`}</div><span class="resource-amount" data-resource="${k}">${n(s[k])}</span>${resource(k)}<button class="resource-plus" data-action="${k !== 'gems' ? 'collect' : 'achievements'}" aria-label="${k !== 'gems' ? 'Collect resources' : 'View achievements'}">+</button></div>`).join('')}</div>
 <nav class="left-tools" aria-label="Village activities"><button class="square-btn" data-action="campaign" aria-label="Campaign map">${icon('Map', 29)}${NATIVE_CAMPAIGN.some((_, i) => !s.nativeCampaign?.stars[i] && nativeUnlocked(i, s.nativeCampaign?.stars ?? []) && !nativeCampaignIssues(i).length) ? '<span class="notification">!</span>' : ''}</button><button class="square-btn" data-action="achievements" aria-label="Achievements">${icon('ScrollText', 27)}<span class="tool-label">Quests</span></button><button class="square-btn" data-action="edit" aria-label="Edit village layout">${icon('Pencil', 25)}<span class="tool-label">Edit</span></button><button class="square-btn" data-action="battle-log" aria-label="Battle log">${icon('ScrollText', 27)}<span class="tool-label">Log</span></button></nav>
 <div class="right-tools"><button class="square-btn small" data-action="settings" aria-label="Settings">${icon('Settings', 24)}</button><div class="camera-tools"><button data-action="zoom-in" aria-label="Zoom in">${icon('Plus', 20)}</button><button data-action="recenter" aria-label="Center village">${icon('LocateFixed', 18)}</button><button data-action="zoom-out" aria-label="Zoom out">${icon('Minus', 20)}</button></div></div>
 <div class="village-caption"><span class="caption-line"></span> HOME VILLAGE <span class="caption-line"></span><small>Town Hall Level ${m.townhallLevel}</small></div>
 <div class="bottom-left"><button class="attack-btn" data-action="campaign">${icon('Swords', 44)}<span>Attack!</span><small>SINGLE PLAYER</small></button></div>
 <div class="bottom-center">${
   !m.selected && !m.placement && !this.drawerPanel
     ? `<div class="army-label"><span>${icon('UsersRound', 16)} YOUR ARMY</span><button data-action="army">${m.armySize}/${m.capacity} ${icon('ChevronRight', 14)}</button></div><div class="army-tray">${this.heroCard()}${TROOP_ORDER.filter(
         (k) => s.army[k] > 0,
       )
         .map((k) => this.troopCard(k, s.army[k], 'army'))
         .join('')}${
         SPELL_ORDER.some((k) => s.spells[k])
           ? SPELL_ORDER.filter((k) => s.spells[k])
               .map((k) => this.spellCard(k, s.spells[k], 'army'))
               .join('')
           : ''
       }<button class="train-add" data-action="army" aria-label="Train troops">${icon('Plus', 24)}<small>Train</small></button></div>`
     : ''
 }</div>
 <div class="bottom-right"><button class="collect-btn" data-action="collect">${coin}<span>Collect</span></button><button class="shop-btn ${this.drawerPanel === 'shop' ? 'open' : ''}" data-action="shop">${icon('ShoppingBasket', 38)}<span>Shop</span></button></div>
 ${this.coach()}
 <div class="control-hint">Drag to explore <span>·</span> Scroll to zoom <span>·</span> Click a building</div>`;
  }
  private editHUD() {
    const m = this.model;
    if (m.wallMove) return '';
    return `
 <div class="village-caption edit-caption"><span class="caption-line"></span> EDIT MODE <span class="caption-line"></span><small>Drag any building to a clear tile · Ctrl/⌘+Z to undo · Esc to finish</small></div>
 <div class="right-tools"><div class="camera-tools"><button data-action="zoom-in" aria-label="Zoom in">${icon('Plus', 20)}</button><button data-action="recenter" aria-label="Center village">${icon('LocateFixed', 18)}</button><button data-action="zoom-out" aria-label="Zoom out">${icon('Minus', 20)}</button></div></div>
 <div class="edit-toolbar">
   ${button('undo', `${icon('Undo2', 20)}<span>Undo</span>`, 'game-btn stone edit-tool', m.canUndo ? '' : 'disabled')}
   ${button('redo', `${icon('Redo2', 20)}<span>Redo</span>`, 'game-btn stone edit-tool', m.canRedo ? '' : 'disabled')}
   ${button('layouts', `${icon('LayoutGrid', 20)}<span>Layouts</span>`, 'game-btn blue edit-tool')}
   ${button('edit-done', `${icon('Check', 20)}<span>Done</span>`, 'game-btn green edit-tool')}
 </div>`;
  }
  private troopCard(k: TroopKind, count: number, action: string, selected = false) {
    const flying = TROOPS[k].flying ? '<span class="air-tag">AIR</span>' : '';
    return `<button class="troop-card ${selected ? 'selected' : ''} ${count === 0 ? 'empty' : ''}" data-action="${action}" aria-label="${TROOPS[k].name}, ${count} available" ${action.startsWith('troop') && count === 0 ? 'disabled' : ''}><span class="troop-count">x${count}</span>${action.startsWith('troop:') ? `<kbd class="troop-key">${TROOP_HOTKEYS[TROOP_ORDER.indexOf(k)].toUpperCase()}</kbd>` : ''}<img src="${hudAsset(k)}" alt="" draggable="false">${flying}<span class="troop-level">★ ${this.model.troopLevel(k)}</span><span class="troop-name">${TROOPS[k].name}</span></button>`;
  }
  private spellCard(k: SpellKind, count: number, action: string, selected = false) {
    return `<button class="troop-card spell-card ${selected ? 'selected' : ''} ${count === 0 ? 'empty' : ''}" data-action="${action}" aria-label="${SPELLS[k].name}, ${count} available" ${action.startsWith('spell') && count === 0 ? 'disabled' : ''}><span class="troop-count">x${count}</span>${action.startsWith('spell:') ? `<kbd class="troop-key">${SPELL_HOTKEYS[SPELL_ORDER.indexOf(k)]}</kbd>` : ''}<img src="${hudAsset(k)}" alt="" draggable="false"><span class="troop-level">★ ${this.model.spellLevel(k)}</span><span class="troop-name">${SPELLS[k].name.replace(' Spell', '')}</span></button>`;
  }

  // ------------------------------------------------------- anchored context
  private context() {
    const m = this.model;
    if (m.battle) return '';
    if (m.wallMove) return this.wallMoveContext();
    if (m.placement) {
      return `<div class="placement-banner">${icon('Move', 23)}<div><b>${m.moving ? 'Move' : 'Place'} ${BUILDINGS[m.placement].name}</b><small>Drop it on a clear green tile</small></div>${button('cancel', icon('X', 20), 'square-btn small', 'aria-label="Cancel placement"')}</div>`;
    }
    const b = m.state.buildings.find((v) => v.id === m.selected);
    if (!b) {
      const o = m.selectedObstacle;
      if (!o) return '';
      const d = OBSTACLES[o.kind];
      return `<div class="building-context obstacle-context" data-anchor="${-o.id}"><img class="context-art" src="${hudAsset(o.kind)}" alt=""><div class="context-info"><small>OBSTACLE</small><h2>${d.name}</h2><span>${d.size}×${d.size} tiles · No builder needed</span></div><div class="context-actions">${o.removeEnd ? button(`obstacle-finish:${o.id}`, `<small data-obstacle-time="${o.id}">${time((o.removeEnd - m.clock) / 1000)}</small><span>Finish ${gem} ${m.finishCost({ upgradeEnd: o.removeEnd } as Building)}</span>`) + button(`obstacle-cancel:${o.id}`, `${icon('X', 18)} Cancel`, 'game-btn stone') : button(`obstacle-remove:${o.id}`, `<span>${icon('Axe', 18)} Remove</span><small>${resource(d.resource)} ${n(d.cost)} · ${d.seconds}s</small>`, 'game-btn green', m.state[d.resource] < d.cost ? 'disabled' : '')}</div><button class="context-close" data-action="cancel" aria-label="Close obstacle">${icon('X', 18)}</button></div>`;
    }
    const rotate =
      b.kind === 'inferno' && !b.constructing
        ? button(
            'inferno-mode',
            `${icon('Target', 21)}<span>${b.infernoMode === 'multi' ? 'Multi-target' : 'Single-target'}</span>`,
            'game-btn blue',
            `aria-label="Switch Inferno Tower to ${b.infernoMode === 'multi' ? 'single' : 'multi'}-target mode"`,
          )
        : b.kind === 'airsweeper' && !b.constructing
          ? button(
              'sweeper-rotate',
              `${icon('RotateCw', 21)}<span>Rotate</span>`,
              'game-btn blue',
              'aria-label="Rotate Air Sweeper 45 degrees" title="Rotate clockwise · R"',
            )
          : b.kind === 'skeletontrap'
            ? button(
                'skeleton-mode',
                `${icon(b.skeletonMode === 'air' ? 'Wind' : 'Swords', 21)}<span>${b.skeletonMode === 'air' ? 'Air' : 'Ground'}</span>`,
                'game-btn blue',
                `aria-label="Switch Skeleton Trap to ${b.skeletonMode === 'air' ? 'ground' : 'air'} mode"`,
              )
            : b.kind === 'xbow' && !b.constructing
              ? button(
                  'xbow-mode',
                  `${icon(b.xbowMode === 'both' ? 'Wind' : 'Swords', 21)}<span>${b.xbowMode === 'both' ? 'Ground & air' : 'Ground'}</span>`,
                  'game-btn blue',
                  `aria-label="Switch X-Bow to ${b.xbowMode === 'both' ? 'ground' : 'ground and air'} mode"`,
                )
              : b.kind === 'spelltower' && !b.constructing
                ? button(
                    'spell-tower-weapon',
                    `${icon('Sparkles', 21)}<span>${spellTowerLabel(b.spellTowerWeapon)}</span>`,
                    'game-btn blue',
                    `aria-label="Switch Spell Tower to its next spell"`,
                  )
                : '';
    if (m.editing && b.kind !== 'wall')
      return `<div class="building-context compact" data-anchor="${b.id}"><div class="context-info"><h2>${BUILDINGS[b.kind].name}</h2><span>Level ${b.level} <i>·</i> drag to reposition</span></div>${rotate}</div>`;
    if (b.kind === 'wall' && !b.upgradeEnd) return this.wallContext(b);
    const d = BUILDINGS[b.kind];
    const capped = b.level >= d.maxLevel;
    const gated = !capped && b.level >= m.maxLevel(b.kind);
    return `<div class="building-context" data-anchor="${b.id}"><img class="context-art" src="${hudAsset(b.kind, b.level, b.skeletonMode, b.xbowMode, b.infernoMode)}" alt=""><div class="context-info"><small>${d.category.toUpperCase()}</small><h2>${d.name}</h2><span>Level ${b.level} <i>·</i> ${d.trap ? `${icon('ShieldCheck', 13)} ${b.upgradeEnd ? 'Inactive' : 'Armed'}` : `${icon('Heart', 13)} ${n(b.maxHp)} HP`}</span></div><div class="context-actions">${button('info', `${icon('Info', 21)}<span>Info</span>`, 'game-btn stone')}${button(`move:${b.id}`, `${icon('Move', 21)}<span>Move</span>`, 'game-btn stone')}${rotate}${
      b.upgradeEnd
        ? button(
            `finish:${b.id}`,
            `<small data-upgrade="${b.id}">${time((b.upgradeEnd - m.clock) / 1000)}</small><span>Finish ${gem} <i data-finish="${b.id}">${m.finishCost(b)}</i></span>`,
          )
        : capped
          ? '<span class="max-level">★ Max level</span>'
          : gated
            ? `<span class="max-level locked">${icon('LockKeyhole', 14)} ${requiredTownHall(b.kind, b.level + 1) ? `Town Hall ${requiredTownHall(b.kind, b.level + 1)}` : 'Village tier maximum'}</span>`
            : button(
                `upgrade:${b.id}`,
                `<span>${icon('ArrowBigUp', 19)} Upgrade</span><small>${resource(d.resource)} ${n(m.upgradeCost(b))}</small>`,
              )
    }${b.kind === 'blacksmith' ? button('blacksmith', `${icon('Anvil', 20)} Equipment`, 'game-btn blue') : ''}${b.kind === 'herohall' ? button('heroes', `${icon('ShieldCheck', 20)} Heroes`, 'game-btn blue') : ''}${b.kind === 'townhall' ? button('progression', `${icon('Layers', 20)} Progression`, 'game-btn blue') : ''}${b.kind === 'laboratory' ? button('research', `${icon('FlaskConical', 20)} Research`, 'game-btn blue') : ''}${b.kind === 'barracks' || b.kind === 'camp' || b.kind === 'spellfactory' ? button('army', `${icon('Swords', 20)} Train`, 'game-btn blue') : ''}${b.kind === 'goldmine' || b.kind === 'collector' || b.kind === 'darkdrill' ? button('collect', `${coin} Collect`, 'game-btn gold') : ''}</div><button class="context-close" data-action="cancel" aria-label="Close building">${icon('X', 18)}</button></div>`;
  }

  private wallMoveContext() {
    const m = this.model,
      move = m.wallMove!;
    const issue = m.wallPlacementIssue;
    return `<section class="wall-move-toolbar" aria-label="Move wall row">
      <div class="wall-move-heading"><b>Move ${move.source.length} walls</b><span>Tap ground or drag the row · R to rotate</span></div>
      <p class="wall-move-status ${issue ? 'blocked' : ''}" role="status">${issue ?? 'Clear ground · Ready to place'}</p>
      <div class="wall-move-actions">${button('cancel', `${icon('X', 18)} Cancel`, 'game-btn stone')}${button('wall-rotate', `${icon('RotateCw', 18)} Rotate`, 'game-btn blue', 'aria-label="Rotate wall row 90 degrees"')}${button('wall-place', `${icon('Check', 18)} Place`, 'game-btn green', issue ? 'disabled' : '')}</div>
    </section>`;
  }
  private wallContext(anchor: Building) {
    const m = this.model;
    const walls = m.selectedWalls,
      ids = walls.map((b) => b.id);
    const gold = m.wallUpgradeQuote(ids, 'gold'),
      pink = m.wallUpgradeQuote(ids, 'elixir');
    const low = Math.min(...walls.map((b) => b.level)),
      high = Math.max(...walls.map((b) => b.level));
    const rowAvailable = m.wallAxis
      ? m.selectedWallRow(m.wallAxis === 'x' ? 'y' : 'x').length > 1
      : Math.max(m.selectedWallRow('x').length, m.selectedWallRow('y').length) > 1;
    const adjust = (delta: number) =>
      button(
        `wall-count:${delta}`,
        `${delta > 0 ? '+' : '−'}${Math.abs(delta)}`,
        'game-btn stone',
        `${m.canAdjustWallSelection(delta) ? '' : 'disabled'} aria-label="${delta > 0 ? 'Add' : 'Remove'} ${Math.abs(delta)} ${Math.abs(delta) === 1 ? 'wall' : 'walls'}"`,
      );
    const purchase = (kind: 'gold' | 'elixir', quote: typeof gold) =>
      button(
        `wall-upgrade:${kind}`,
        `<span>${icon('ArrowBigUp', 18)} Upgrade ${quote.walls.length > 1 ? quote.walls.length : ''}</span><small>${resource(kind)} ${n(quote.cost)}</small>`,
        'game-btn green',
        `${quote.issue ? 'disabled' : ''} aria-label="Upgrade ${quote.walls.length} ${quote.walls.length === 1 ? 'wall' : 'walls'} with ${kind}"`,
      );
    const levelText = low === high ? `Level ${low}` : `Levels ${low}–${high}`;
    const note = !gold.walls.length
      ? requiredTownHall('wall', low + 1)
        ? `Requires Town Hall ${requiredTownHall('wall', low + 1)} for the next level.`
        : 'Maximum wall level reached.'
      : m.busy >= m.builders
        ? 'A free builder is needed. Walls finish instantly.'
        : gold.skipped
          ? `${gold.walls.length} of ${walls.length} walls can upgrade; capped or unfinished walls stay as they are.`
          : 'Instant upgrade · Requires one free builder';
    return `<div class="building-context wall-context" data-anchor="${anchor.id}">
      <img class="context-art" src="${hudAsset('wall', anchor.level)}" alt="">
      <div class="context-info"><small>${m.wallAxis ? `WALL ROW ${m.wallAxis === 'x' ? '↘' : '↙'}` : 'WALLS'}</small><h2>${walls.length === 1 ? 'Wall' : `${walls.length} Walls`}</h2><span>${levelText} · ${walls.length} selected</span></div>
      <div class="wall-tools">${button('info', `${icon('Info', 17)} Info`, 'game-btn stone')}${walls.length === 1 ? button(`move:${anchor.id}`, `${icon('Move', 17)} Move`, 'game-btn stone') : button('wall-single', 'Single wall', 'game-btn stone')}${button('wall-row', `${icon('LayoutGrid', 17)} ${m.wallAxis ? 'Other row' : 'Select row'}`, 'game-btn stone', rowAvailable ? '' : 'disabled')}</div>
      ${m.wallAxis ? `<div class="wall-tools wall-row-move">${button('wall-move', `${icon('Move', 18)} Move row`, 'game-btn blue')}</div>` : ''}
      ${m.editing ? '' : m.wallAxis ? `<div class="wall-row-note"><span>Connected row · Each eligible wall gains one level</span>${button('wall-single', 'Select by level', 'game-btn stone')}</div>` : `<div class="wall-quantity" aria-label="Select walls of the same level">${adjust(-10)}${adjust(-1)}<span><b>${walls.length}</b><small>selected</small></span>${adjust(1)}${adjust(10)}</div>`}
      <div class="wall-upgrade-actions">${!m.editing && gold.walls.length ? purchase('gold', gold) + (low >= 4 ? purchase('elixir', pink) : '') : ''}</div>
      <p class="wall-note">${m.editing ? 'Select a row to move or rotate it together.' : note}</p><button class="context-close" data-action="cancel" aria-label="Close wall selection">${icon('X', 18)}</button></div>`;
  }

  // ----------------------------------------------------------------- battle
  private battleHUD() {
    const m = this.model,
      b = m.battle!,
      v = b.practice
        ? {
            name: m.replay?.recordId === null ? 'Shared village' : 'Your village',
            gold: 0,
            elixir: 0,
          }
        : { ...campaignStage(b.index, b.catalog), ...b.availableLoot };
    const lootKeys = campaignResourceKeys(v);
    const lootLeft = (k: CampaignResource) =>
      Math.max(0, campaignAmount(v, k) - (b.lootTaken?.[k] ?? 0));
    const limitedStorage =
      !b.practice &&
      !m.replay &&
      lootKeys.some((k) => (b.lootRoom?.[k] ?? campaignAmount(v, k)) < campaignAmount(v, k));
    const lootBar = (k: CampaignResource) =>
      `<div class="loot-row ${k}" aria-label="${k === 'dark' ? 'Dark Elixir' : k} remaining">${resource(k)}<div class="loot-track"><i data-lootbar="${k}" style="width:${pct((lootLeft(k) / Math.max(1, campaignAmount(v, k))) * 100)}"></i></div><b data-loot="${k}">${n(lootLeft(k))}</b></div>`;
    return `<div class="battle-enemy"><span class="eyebrow">${m.replay ? (m.replay.recordId === null ? 'SHARED REPLAY' : 'ATTACK REPLAY') : b.practice ? 'PRACTICE ATTACK' : 'ENEMY VILLAGE'}</span><h2>${v.name}</h2>${m.replay ? '<small class="practice-note">Recorded attack · Watch &amp; learn</small>' : b.practice ? '<small class="practice-note">Your village and army are safe.<br>No loot or trophies at stake.</small>' : `<small>AVAILABLE LOOT</small><div class="loot-bars">${lootKeys.map(lootBar).join('')}</div>${limitedStorage ? '<small class="loot-capacity-note">Loot beyond your storage capacity will be lost.</small>' : ''}`}</div>
 <div class="battle-clock ${b.started ? '' : 'prep'}"><span>${!b.practice ? 'NO TIME LIMIT' : b.started ? 'BATTLE ENDS IN' : 'SCOUTING — BATTLE BEGINS IN'}</span><b id="battle-timer">${b.practice ? clock(b.started ? BATTLE_SECONDS - b.elapsed : b.prep) : '∞'}</b></div>
 <div class="destruction"><span>Total destruction</span><div id="battle-stars" class="battle-stars">${'★'.repeat(b.stars)}<span>${'★'.repeat(3 - b.stars)}</span></div><b id="destruction-value">${b.destruction}%</b><div class="destruction-bar"><i id="destruction-fill" style="width:${pct(b.destruction)}"></i><span class="notch half" style="left:50%"></span><span class="notch full" style="left:100%"></span></div><small>★ 50% <i>·</i> ★ Town Hall <i>·</i> ★ 100%</small></div>
 ${!b.started && !m.replay ? `<div class="prep-banner">${icon('Timer', 20)}<div><b>Scout the base</b><small>Tap a defense to see its range · Deploy to start</small></div></div>` : ''}
 ${
   m.replay
     ? this.replayControls()
     : `<div class="battle-bottom"><button class="game-btn red end-battle" data-action="${b.started ? 'surrender' : 'home'}">${icon('Flag', 23)} ${b.started ? 'Surrender' : 'Return home'}</button><div class="deploy-tray"><div class="deploy-label">${m.activeHero ? this.kingDeploymentHint() : m.activeSpell ? `Tap anywhere to cast ${SPELLS[m.activeSpell].name}` : `${TROOPS[m.activeTroop].name} · ${TROOPS[m.activeTroop].prefersResources ? 'Resources ×2' : TROOPS[m.activeTroop].wallBreaker ? 'Walls ×40' : TROOPS[m.activeTroop].prefersDefenses ? 'Targets defenses' : TROOPS[m.activeTroop].role.toLowerCase()} · Tap or hold & drag to deploy`}</div><div class="army-tray">${this.heroCard()}${TROOP_ORDER.filter(
         (k) => b.carriedArmy[k] > 0,
       )
         .map((k) =>
           this.troopCard(
             k,
             b.remaining[k],
             `troop:${k}`,
             !m.activeHero && !m.activeSpell && m.activeTroop === k,
           ),
         )
         .join('')}${
         SPELL_ORDER.some((k) => b.carried[k])
           ? `<span class="tray-divider"></span>${SPELL_ORDER.filter((k) => b.carried[k])
               .map((k) => this.spellCard(k, b.spells[k], `spell:${k}`, m.activeSpell === k))
               .join('')}`
           : ''
       }</div></div><div class="battle-tip">${icon('MousePointer2', 19)}<span>Troops <b>1–7, Q, W, E</b> · Spells <b>8, 9, 0</b><br>Drag the base to move the camera</span></div></div>`
 }`;
  }

  // ----------------------------------------------------------------- drawer
  private replayControls() {
    const r = this.model.replay!;
    return `<section class="replay-controls" aria-label="Replay playback">
      <div class="replay-status"><strong>${r.seeking ? 'Seeking…' : r.complete ? 'Replay complete' : r.paused ? 'Replay paused' : 'Watching replay'}</strong><span id="replay-time">${clock(r.time)} / ${clock(r.duration)}</span></div>
      <input id="replay-progress" data-action="replay-position" type="range" aria-label="Replay position" aria-valuetext="${clock(r.time)}" min="0" max="${r.duration || 1}" step="any" value="${r.seeking ? r.seekTarget : r.time}" ${r.seeking || !r.duration ? 'disabled' : ''}><div class="replay-shortcuts">${button('replay-jump:-10', '−10s', 'replay-link', r.seeking ? 'disabled' : '')}${button('replay-jump:10', '+10s', 'replay-link', r.seeking ? 'disabled' : '')}${button('replay-skip', 'First deployment', 'replay-link', r.seeking ? 'disabled' : '')}${button('replay-export', `${icon('Download', 14)} Export replay`, 'replay-link')}</div>
      <div class="replay-buttons">${button('replay-pause', r.paused ? 'Play' : 'Pause', 'game-btn blue', r.complete || r.seeking ? 'disabled' : '')}${button('replay-restart', `${icon('RotateCcw', 17)} Restart`, 'game-btn stone')}<div class="replay-speeds" role="group" aria-label="Playback speed">${[1, 2, 4].map((speed) => button(`replay-speed:${speed}`, `${speed}×`, `game-btn ${r.speed === speed ? 'green' : 'stone'}`, `aria-pressed="${r.speed === speed}"`)).join('')}</div>${button('replay-exit', 'Back to log', 'game-btn stone')}</div>
    </section>`;
  }
  private kingDeploymentHint() {
    const battle = this.model.battle,
      hero = battle?.hero,
      unit = battle?.units.find((u) => u.id === hero?.unitId);
    const status =
      !hero || hero.unitId === null
        ? 'Tap outside the red boundary to deploy'
        : unit && unit.hp <= 0
          ? 'Defeated · Returns next attack'
          : hero.abilityUsed
            ? 'Ability used · Fighting'
            : 'Tap his card or press H to activate';
    return `Barbarian King · ${status}`;
  }
  private heroCard() {
    const m = this.model,
      h = m.battle?.hero;
    if (!h) return '';
    const u = m.battle!.units.find((u) => u.id === h.unitId);
    const defeated = !!u && u.hp <= 0;
    const ready = h.unitId === null;
    const disabled = defeated || (!ready && h.abilityUsed);
    const label = ready
      ? 'Deploy King'
      : defeated
        ? 'Defeated'
        : h.abilityUsed
          ? 'Ability used'
          : 'Activate ability';
    return `<button class="troop-card hero-card ${m.activeHero ? 'selected' : ''}" data-hero-state="${ready}:${defeated}:${h.abilityUsed}:${m.activeHero}" data-action="hero-select" aria-label="Barbarian King, ${label}" ${disabled ? 'disabled' : ''}><kbd class="troop-key">H</kbd><img src="${hudAsset('king')}" alt=""><span class="troop-level">★ ${h.level}</span><span class="hero-health"><i style="width:${u ? pct((u.hp / u.maxHp) * 100) : '100%'}"></i></span><span class="troop-name">${label}</span></button>`;
  }
  private heroes() {
    const m = this.model,
      king = m.state.king,
      hall = m.heroHall;
    if (!king || !hall)
      return `<div class="modal-body hero-body"><div class="hero-portrait"><img src="${hudAsset('king')}" alt="Barbarian King"></div><h2>Meet the Barbarian King</h2><p>Build a Hero Hall at Town Hall 4 to unlock your first hero. He fights without army housing and returns at full health for every attack.</p>${button('shop', 'Open the shop', 'game-btn green')}</div>`;
    const stats = heroStats(king.level, m.townhallLevel, m.kingEquipment),
      next = heroStats(king.level + 1, m.townhallLevel, m.kingEquipment);
    const capped = king.level >= m.heroMaxLevel;
    const required = heroNextRequirement(king.level);
    const missing = !required
      ? []
      : [
          ...(required.townhall > m.townhallLevel ? [`Town Hall ${required.townhall}`] : []),
          ...(required.hall > hall.level ? [`Hero Hall ${required.hall}`] : []),
        ];
    const scale = heroTownHallScale(m.townhallLevel);
    const stat = (label: string, value: number, destination?: number, suffix = '') =>
      `<div>${label}<b>${damageNumber(value)}${suffix}${destination === undefined || capped ? '' : ` → ${damageNumber(destination)}${suffix}`}</b></div>`;
    return `<div class="modal-body hero-body">
      <div class="hero-overview"><div class="hero-portrait"><img src="${hudAsset('king')}" alt="Barbarian King"></div><div><span class="eyebrow">HERO HALL ${hall.level}</span><h2>Barbarian King</h2><p>Level ${king.level} / ${m.heroMaxLevel} · ${king.upgradeEnd ? 'Upgrading' : 'Ready for battle'}</p><p>Your hero uses no army space and is never lost in battle.</p></div></div>
      ${scale < 1 ? `<p class="hero-scaling">Town Hall ${m.townhallLevel} strength: ${scale * 100}% health, damage and recovery. Full strength at Town Hall 6.</p>` : ''}
      <div class="hero-stat-grid">${stat('Hitpoints', stats.hp, next.hp)}${stat('Damage per second', stats.dps, next.dps)}${stat('Damage per hit', stats.damage, next.damage)}${stat('Attack interval', stats.rate, undefined, 's')}${stat('Attack range', stats.range, undefined, ' tile')}${stat('Movement', stats.speed, undefined, ' tiles/s')}</div>
      <p class="hero-stats-note">Stats include the equipped items below.</p>
      <div class="hero-equipment">${m.kingEquipment.loadout.map((kind) => `<article class="hero-ability">${gearImage(kind, 'hero-gear-icon')}<span class="eyebrow">EQUIPPED · LEVEL ${m.kingEquipment.levels[kind]}</span><h3>${EQUIPMENT[kind].name}</h3><p>${this.equipmentDescription(kind, m.kingEquipment.levels[kind])}</p>${button(`equipment-view:${kind}`, 'View equipment', 'replay-link')}</article>`).join('')}</div>
      <p class="hero-activation"><b>Recover ${damageNumber(heroRecovery(king.level, m.townhallLevel, m.kingEquipment))} hitpoints on activation.</b> Tap the deployed King card or press H to use both items once per attack. Automatically activates on a lethal hit.</p>
      <div class="hero-upgrade"><p>${resource('dark')} <b data-resource="dark">${n(m.state.dark)}</b> dark elixir</p>${king.upgradeEnd ? `<p>Upgrade completes in <b data-hero-timer>${time((king.upgradeEnd - m.clock) / 1000)}</b></p>${button('hero-finish', `Finish ${gem} <span data-hero-gems>${m.finishCost({ upgradeEnd: king.upgradeEnd } as Building)}</span>`, 'game-btn green')}` : capped ? `<p class="max-level">${m.townhallLevel < 7 ? 'Hero upgrades unlock at Town Hall 7' : missing.length ? `Upgrade to ${missing.join(' and ')}` : 'Maximum hero level'}</p>` : `${button('hero-upgrade', `${resource('dark')} ${n(heroUpgradeCost(king.level))} · Upgrade to ${king.level + 1}`, 'game-btn green', m.busy >= m.builders || m.state.dark < heroUpgradeCost(king.level) ? 'disabled' : '')}<p>${time(heroUpgradeSeconds(king.level))} · Requires one free builder</p>`}</div>
      ${button('practice', 'Practice with this army', 'game-btn blue', m.armySize || m.heroReady ? '' : 'disabled')}
    </div>`;
  }
  private equipmentDescription(kind: EquipmentKind, level: number) {
    const s = equipmentStats(kind, level);
    if (kind === 'puppet')
      return `Summons ${s.summons} Barbarians in waves of up to five. For 20 seconds they gain +${damageNumber((s.summonDamage - 1) * 100)}% damage and +${s.summonSpeedBoost} tiles/s movement.`;
    if (kind === 'vial')
      return `For 10 seconds: +${damageNumber((s.damage - 1) * 100)}% damage and +${s.speedBoost} tiles/s movement. Does not increase attack speed.`;
    return `Shakes an 8-tile area, destroying walls and dealing ${damageNumber(s.quakeBuilding * 500)}% of building hitpoints across five pulses. Damages ground defenders too.`;
  }
  private equipmentRows(kind: EquipmentKind, level: number): [string, string][] {
    const s = equipmentStats(kind, level);
    const rows: [string, string][] = [];
    if (s.hp) rows.push(['Hitpoint increase', `+${n(s.hp)}`]);
    if (s.dps) rows.push(['Damage per second', `+${n(s.dps)}`]);
    if (s.recovery) rows.push(['Hitpoint recovery', n(s.recovery)]);
    if (kind === 'puppet')
      rows.push(
        ['Summoned Barbarians', `${s.summons}`],
        ['Summon damage boost', `+${damageNumber((s.summonDamage - 1) * 100)}%`],
        ['Summon movement', `+${s.summonSpeedBoost} tiles/s`],
        ['Boost duration', '20s'],
      );
    if (kind === 'vial')
      rows.push(
        ['Damage boost', `+${damageNumber((s.damage - 1) * 100)}%`],
        ['Movement increase', `+${s.speedBoost} tiles/s`],
        ['Ability duration', '10s'],
      );
    if (kind === 'boots')
      rows.push(
        ['Building damage', `${damageNumber(s.quakeBuilding * 500)}%`],
        ['Ground troop damage', `${damageNumber(s.quakeTroop * 500)}%`],
        ['Radius', `${EARTHQUAKE_BOOTS.radius} tiles`],
        ['Walls', 'Destroyed'],
      );
    return rows;
  }
  private blacksmith() {
    const m = this.model,
      gear = m.kingEquipment,
      kind = this.inspectedEquipment,
      level = gear.levels[kind],
      cap = level >= m.equipmentCeiling,
      quote = equipmentQuote(level + 1, m.ores),
      unlocked = !!m.blacksmith;
    const rows = this.equipmentRows(kind, level),
      next = cap ? [] : this.equipmentRows(kind, level + 1);
    const pending = m.state.buildings.find((b) => b.kind === 'blacksmith' && b.constructing);
    return `<div class="modal-body blacksmith-body">
      <div class="ore-wallet" aria-label="Ore storage">${ORE_KEYS.map((k) => `<div class="ore-balance ${k}">${gearImage(k)}<span>${ORES[k].name}<b>${n(m.ores[k])}<small> / ${n(m.oreCapacity[k])}</small></b></span></div>`).join('')}</div>
      ${unlocked ? '' : `<div class="equipment-locked">${icon('LockKeyhole', 20)}<span>${pending ? 'Finish building your Blacksmith to equip and upgrade items.' : 'Build a Blacksmith at Town Hall 8 to equip and upgrade items.'} Your default equipment is ready for battle.</span>${pending ? '' : button('shop', 'Shop', 'game-btn green')}</div>`}
      <div class="king-loadout"><img class="loadout-portrait" src="${hudAsset('king')}" alt="Barbarian King"><div class="loadout-label"><span class="eyebrow">BARBARIAN KING</span><h2>Equipped abilities</h2><p>Both activate together, once per attack.</p></div><div class="equipment-slots">${gear.loadout.map((k, slot) => button(`equipment-view:${k}`, `${gearImage(k)}<span>Slot ${slot + 1}<b>${EQUIPMENT[k].name}</b></span><em>${gear.levels[k]}</em>`, 'equipment-slot', `aria-label="Slot ${slot + 1}: ${EQUIPMENT[k].name}, level ${gear.levels[k]}"`)).join('')}</div></div>
      <div class="equipment-catalog" role="group" aria-label="King equipment">${EQUIPMENT_KEYS.map((k) => button(`equipment-view:${k}`, `<span class="equipment-badge">${gear.loadout.includes(k) ? 'Equipped' : unlocked ? 'Available' : 'Blacksmith 1'}</span>${gearImage(k)}<strong>${EQUIPMENT[k].name}</strong><span class="equipment-level">Level ${gear.levels[k]} / 9</span>`, `equipment-card ${kind === k ? 'selected' : ''}`, `aria-pressed="${kind === k}"`)).join('')}</div>
      <section class="equipment-detail" aria-label="${EQUIPMENT[kind].name} details"><div class="equipment-detail-heading">${gearImage(kind)}<div><span class="eyebrow">COMMON · ACTIVE ABILITY</span><h2>${EQUIPMENT[kind].name}</h2><p>Level ${level} / 9</p></div></div><p class="equipment-description">${this.equipmentDescription(kind, level)}</p>
      <table class="equipment-stats"><thead><tr><th>Attribute</th><th>Level ${level}</th><th>${cap ? 'TH8 max' : `Level ${level + 1}`}</th></tr></thead><tbody>${rows.map(([label, value], i) => `<tr><td>${label}</td><td>${value}</td><td class="${next[i]?.[1] !== value ? 'better' : ''}">${next[i]?.[1] ?? '—'}</td></tr>`).join('')}</tbody></table>
      <div class="equipment-equip">${gear.loadout.includes(kind) ? `<span class="equipped-label">${icon('Check', 18)} Equipped in slot ${gear.loadout.indexOf(kind) + 1}</span>` : gear.loadout.map((k, slot) => button(`equipment-equip:${kind},${slot}`, `Replace ${EQUIPMENT[k].name}`, 'game-btn blue', unlocked && m.state.king ? '' : 'disabled')).join('')}</div>
      <div class="equipment-upgrade">${
        cap
          ? '<p class="max-level">Maximum for Blacksmith 1 · Level 10 requires Blacksmith 3 at Town Hall 10.</p>'
          : `<div><b>Upgrade to level ${level + 1}</b><p>Instant · No builder needed</p><div class="equipment-cost">${ORE_KEYS.filter(
              (k) => quote!.cost[k],
            )
              .map(
                (k) =>
                  `<span class="${quote!.missing[k] ? 'short' : ''}">${gearImage(k)}${n(quote!.cost[k])}<small>${ORES[k].name}</small></span>`,
              )
              .join(
                '',
              )}</div></div>${button(`equipment-upgrade:${kind},${level}`, `${icon('ArrowBigUp', 20)} Upgrade`, 'game-btn green', unlocked ? '' : 'disabled')}</div>`
      }
      </section><p class="ore-source-note">Missing ore can be purchased with gems during an upgrade. Star Bonus, Clan War and Hero Journey rewards are not yet available in this village.</p>
    </div>`;
  }
  private oreConfirm() {
    const m = this.model,
      purchase = this.orePurchase;
    if (!purchase)
      return `<div class="modal-body">${button('blacksmith', 'Back to equipment')}</div>`;
    const quote = equipmentQuote(purchase.level + 1, m.ores)!;
    const stale =
      m.kingEquipment.levels[purchase.kind] !== purchase.level || quote.gems > purchase.gems;
    return `<div class="modal-body ore-confirm-body"><div class="equipment-detail-heading">${gearImage(purchase.kind)}<div><h2>${EQUIPMENT[purchase.kind].name}</h2><p>Upgrade to level ${purchase.level + 1}</p></div></div><p>Use your stored ore and buy the missing amount below.</p><div class="missing-ores">${ORE_KEYS.filter(
      (k) => quote.missing[k],
    )
      .map(
        (k) =>
          `<div>${gearImage(k)}<span><b>${n(quote.missing[k])}</b> ${ORES[k].name}</span><strong>${gem}${n(quote.missing[k] * ORES[k].gems)}</strong></div>`,
      )
      .join(
        '',
      )}</div><p class="gem-balance">You have ${gem} <b>${n(m.state.gems)}</b> gems</p>${stale ? '<p>This upgrade has changed. Return to equipment for a new price.</p>' : quote.gems > m.state.gems ? '<p class="ore-insufficient">Not enough gems. Earn more by clearing obstacles and completing achievements.</p>' : ''}<div class="confirm-actions">${button('blacksmith', 'Cancel', 'game-btn stone')}${button('ore-buy', `Buy & upgrade ${gem} ${n(quote.gems)}`, 'game-btn green', stale || quote.gems > m.state.gems || !m.blacksmith ? 'disabled' : '')}</div></div>`;
  }
  private progression() {
    const m = this.model;
    return `<div class="modal-body progression-body"><p>Current Town Hall: <b>${m.townhallLevel}</b>. Upgrade your Town Hall to unlock buildings and raise their level limits.</p>${Array.from(
      { length: MAX_TOWNHALL },
      (_, i) => {
        const th = i + 1;
        const changed = (Object.keys(BUILDINGS) as BuildingKind[]).filter(
          (k) => k !== 'townhall' && BUILDING_LEVELS[k][i] > (BUILDING_LEVELS[k][i - 1] ?? 0),
        );
        const armyUnlocks = [
          ...TROOP_ORDER.filter((k) => requiredTownHall('barracks', TROOP_UNLOCK[k]) === th).map(
            (k) =>
              `<span class="progression-unlock"><img src="${hudAsset(k)}" alt=""><span>${TROOPS[k].name}<small>Barracks ${TROOP_UNLOCK[k]}</small></span></span>`,
          ),
          ...SPELL_ORDER.filter(
            (k) => requiredTownHall('spellfactory', SPELL_UNLOCK[k]) === th,
          ).map(
            (k) =>
              `<span class="progression-unlock"><img src="${hudAsset(k)}" alt=""><span>${SPELLS[k].name}<small>Spell Factory ${SPELL_UNLOCK[k]}</small></span></span>`,
          ),
        ].join('');
        return `<article class="progression-tier ${th === m.townhallLevel ? 'current' : ''}"><h2>Town Hall ${th}${th === m.townhallLevel ? ' · Current' : ''}</h2><div>${changed.map((k) => `<span class="progression-unlock"><img src="${hudAsset(k, BUILDING_LEVELS[k][i])}" alt=""><span>${BUILDINGS[k].name}<small>${(BUILDING_LEVELS[k][i - 1] ?? 0) === 0 ? 'Unlock · ' : ''}Level ${BUILDING_LEVELS[k][i]}</small></span></span>`).join('')}${armyUnlocks}</div></article>`;
      },
    ).join('')}</div>`;
  }
  private drawer() {
    if (!this.drawerPanel || this.model.battle) return '';
    const titles = { shop: 'Shop', army: 'Army' };
    const body = this.drawerPanel === 'shop' ? this.shop() : this.army();
    return `<section class="drawer-sheet" aria-label="${titles[this.drawerPanel]}"><header class="drawer-head"><h2>${titles[this.drawerPanel]}</h2>${this.drawerPanel === 'shop' ? `<div class="shop-tabs" role="tablist" aria-label="Building category">${['All', 'Resources', 'Army', 'Defenses', 'Traps'].map((t) => button(`tab:${t}`, t, `tab ${this.tab === t ? 'active' : ''}`, `role="tab" aria-selected="${this.tab === t}"`)).join('')}</div>` : `<nav class="army-categories" aria-label="Army catalog">${button('army-jump:troops', `${icon('Tent', 17)}<span>Troops<b>${this.model.armySize + this.model.queuedSize}/${this.model.capacity}</b></span>`, 'army-category', `aria-label="Show troops, ${this.model.armySize + this.model.queuedSize} of ${this.model.capacity} housing spaces"`)}${button('army-jump:spells', `${icon('Sparkles', 17)}<span>Spells<b>${this.model.spellHousing}/${this.model.spellCapacity}</b></span>`, 'army-category', `aria-label="Show spells, ${this.model.spellHousing} of ${this.model.spellCapacity} housing spaces"`)}</nav>`}<button class="square-btn small close-btn" data-action="close-drawer" aria-label="Close">${icon('X', 22)}</button></header>${body}</section>`;
  }
  private shop() {
    const m = this.model;
    const cards = (Object.entries(BUILDINGS) as [BuildingKind, (typeof BUILDINGS)[BuildingKind]][])
      .filter(([k, d]) => k !== 'townhall' && (this.tab === 'All' || d.category === this.tab))
      // Buildable tiles first in catalog order, then locked ones by their Town Hall requirement.
      .sort(
        ([a], [b]) =>
          Number(m.maxCount(a) === 0) - Number(m.maxCount(b) === 0) ||
          (m.maxCount(a) === 0 ? unlockTownHall(a) - unlockTownHall(b) : 0),
      )
      .map(([k, d]) => {
        const count = m.countOf(k),
          limit = m.maxCount(k);
        const locked = limit === 0;
        const full = !locked && count >= limit;
        // A Builder's Hut is priced per hut in gems, so the tile quotes the next one.
        const price = buildPrice(k, count);
        const afford = m.state[price.resource] >= price.cost;
        return `<article class="shop-tile ${full || locked ? 'unavailable' : ''}" ${full || locked ? '' : `data-drag="${k}"`}><div class="shop-tile-art"><img src="${hudAsset(k)}" alt="" draggable="false"></div><h3>${d.name}</h3><small class="shop-count">${locked ? `Town Hall ${unlockTownHall(k)}` : `${count}/${limit}`}</small>${button(`build:${k}`, locked ? `${icon('LockKeyhole', 13)} Locked` : full ? 'At limit' : price.cost === 0 ? 'Free' : `${resource(price.resource)} ${n(price.cost)}`, `game-btn ${locked || full || !afford ? 'stone' : 'green'} shop-buy`, locked || full ? 'disabled' : '')}</article>`;
      })
      .join('');
    return `<div class="drawer-body shop-strip">${cards}</div><footer class="drawer-foot">${icon('Hammer', 16)} ${m.builders - m.busy} of ${m.builders} builders free <span>Drag a building onto the village, or tap to pick it up</span></footer>`;
  }
  private army() {
    const m = this.model;
    const upgradingFacilities = (['barracks', 'spellfactory'] as const)
      .filter((kind) =>
        m.state.buildings.some((b) => b.kind === kind && !b.constructing && !!b.upgradeEnd),
      )
      .map((kind) => BUILDINGS[kind].name);
    const preparationLabel = upgradingFacilities.length
      ? 'Free &amp; instant during upgrades'
      : 'Free &amp; instant preparation';
    const overTroops = m.armySize + m.queuedSize > m.capacity;
    const overSpells = m.spellHousing + m.queuedSpellHousing > m.spellCapacity;
    const overCapacity = overTroops || overSpells;
    const preparationNote = overCapacity
      ? overTroops && overSpells
        ? 'Your army is kept. Deploy or remove troops and spells to make room.'
        : overSpells
          ? 'Your army is kept. Deploy or remove spells to make room.'
          : 'Your troops are kept. Deploy or remove troops to make room.'
      : upgradingFacilities.length
        ? `${upgradingFacilities.join(' and ')} upgrading`
        : 'Rage and Healing use 2 spell spaces · Lightning uses 1';
    const troopTile = (k: TroopKind) => {
      const d = m.troopStats(k);
      const unlocked = m.troopUnlocked(k);
      const blocked = !unlocked || m.armySize + m.queuedSize + d.space > m.capacity;
      return `<article class="shop-tile army-tile ${unlocked ? '' : 'army-locked'}" data-army-category="troops"><div class="shop-tile-art"><img src="${hudAsset(k)}" alt="" draggable="false">${d.flying ? '<span class="air-tag">AIR</span>' : ''}</div><h3>${d.name} <small>★${m.troopLevel(k)}</small></h3>${button(`troop-info:${k}`, `${icon('Info', 13)} ${d.role}`, 'troop-info-button', `aria-label="About ${d.name}"`)}<small class="shop-count">${icon('Heart', 11)} ${d.hp} ${icon('Swords', 11)} ${d.damage} ${icon('Users', 11)} ${d.space}</small>${button(`train:${k}`, unlocked ? `+ Add` : `${icon('LockKeyhole', 13)} Barracks ${TROOP_UNLOCK[k]}`, `game-btn ${blocked ? 'stone' : 'green'} shop-buy`, blocked ? 'disabled' : '')}${button(`train-five:${k}`, `×5`, 'game-btn stone shop-buy tiny', blocked || m.armySize + m.queuedSize + d.space * 5 > m.capacity ? 'disabled' : '')}${button(`remove-troop:${k}`, `${icon('Minus', 12)} Remove`, 'army-remove', `aria-label="Remove one ${d.name}" ${m.state.army[k] ? '' : 'disabled'}`)}<small class="shop-note">${m.state.army[k]} ready · ${d.space} space${d.space === 1 ? '' : 's'}</small></article>`;
    };
    const spellTile = (k: SpellKind) => {
      const d = m.spellStats(k);
      const unlocked = m.spellUnlocked(k);
      const blocked = !unlocked || m.spellHousing + d.space > m.spellCapacity;
      return `<article class="shop-tile army-tile ${unlocked ? '' : 'army-locked'}" data-army-category="spells"><div class="shop-tile-art"><img src="${hudAsset(k)}" alt="" draggable="false"></div><h3>${d.name.replace(' Spell', '')} <small>★${m.spellLevel(k)}</small></h3>${button(`spell-info:${k}`, `${icon('Info', 13)} ${d.role}`, 'troop-info-button', `aria-label="About ${d.name}"`)}<small class="shop-count">${d.effect}</small>${button(`brew:${k}`, unlocked ? '+ Add' : `${icon('LockKeyhole', 13)} Factory ${SPELL_UNLOCK[k]}`, `game-btn ${blocked || !m.spellCapacity ? 'stone' : 'green'} shop-buy`, blocked || !m.spellCapacity ? 'disabled' : '')}${button(`remove-spell:${k}`, `${icon('Minus', 12)} Remove`, 'army-remove', `aria-label="Remove one ${d.name}" ${m.state.spells[k] ? '' : 'disabled'}`)}<small class="shop-note">${m.state.spells[k]} ready · ${d.space} spell space${d.space === 1 ? '' : 's'}</small></article>`;
    };
    return `<div class="drawer-body army-strip"><div class="army-actions modern-army-actions"><span class="army-ready-label">READY WHEN YOU ARE</span>${button('heroes', `${icon('ShieldCheck', 17)} Heroes`, 'game-btn blue')}${button('progression', `${icon('Layers', 17)} Progression`, 'game-btn stone')}${button('army-presets', `${icon('Save', 17)} Quick armies`, 'game-btn green')}${button('retrain', `${icon('RotateCcw', 17)} Last army`, 'game-btn stone', m.state.lastArmy ? '' : 'disabled')}${button('research', `${icon('FlaskConical', 17)} Research`, 'game-btn blue')}${button('practice', `${icon('ShieldCheck', 17)} Practice`, 'game-btn blue', m.armySize || m.heroReady ? '' : 'disabled')}${button('clear-army', `${icon('X', 17)} Clear army`, 'game-btn stone', m.armySize || m.spellCount ? '' : 'disabled')}</div>${TROOP_ORDER.map(troopTile).join('')}<span class="tray-divider tall"></span>${SPELL_ORDER.map(spellTile).join('')}</div><footer class="drawer-foot ${overCapacity ? 'army-over-capacity' : ''}">${icon(overCapacity ? 'UsersRound' : 'Check', 17)} ${overCapacity ? 'Over capacity' : preparationLabel} <span>${preparationNote}</span></footer>`;
  }

  // ----------------------------------------------------------------- modals
  private modal() {
    const titles: Record<string, string> = {
      'troop-info': TROOPS[this.inspectedTroop].name,
      'spell-info': SPELLS[this.inspectedSpell].name,
      'army-presets': 'Quick armies',
      'battle-log': 'Battle log',
      blacksmith: 'Hero Equipment',
      'ore-confirm': 'Missing ore',
      heroes: 'Hero Hall',
      progression: 'Town Hall progression',
      research: 'The laboratory',
      campaign: 'The Goblin Valley',
      settings: 'Settings',
      achievements: 'Your legacy',
      help: 'Welcome, Chief',
      info: 'Building details',
      layouts: 'Saved layouts',
      surrender: 'End this battle?',
    };
    const subtitles: Record<string, string> = {
      'troop-info': 'Know your troops. Plan your attack.',
      'spell-info': 'Place each spell where it makes the difference.',
      'army-presets': 'Save a composition. Be ready in one tap.',
      'battle-log': 'Your last twenty attacks, kept with your village.',
      blacksmith: 'Forge your King’s abilities.',
      'ore-confirm': 'Complete this upgrade with gems.',
      heroes: 'A champion for every attack.',
      progression: 'See what each Town Hall unlocks.',
      research: 'A little elixir. A stronger army.',
      campaign: 'Beyond the forest, a whole valley is waiting.',
      settings: 'Make yourself at home.',
      achievements: 'Small victories. A growing legend.',
      help: 'Your village. Your army. Your adventure.',
      info: 'What this level gives you, and what the next one adds.',
      layouts: 'Three slots. Rearrange freely, restore instantly.',
      surrender: this.model.battle?.practice
        ? 'Your village and army are safe.'
        : 'Your loot so far is kept.',
    };
    const content =
      this.panel === 'blacksmith'
        ? this.blacksmith()
        : this.panel === 'ore-confirm'
          ? this.oreConfirm()
          : this.panel === 'heroes'
            ? this.heroes()
            : this.panel === 'progression'
              ? this.progression()
              : this.panel === 'army-presets'
                ? this.armyPresets()
                : this.panel === 'battle-log'
                  ? this.battleLog()
                  : this.panel === 'spell-info'
                    ? this.spellInfo()
                    : this.panel === 'troop-info'
                      ? this.troopInfo()
                      : this.panel === 'campaign'
                        ? this.campaign()
                        : this.panel === 'settings'
                          ? this.settings()
                          : this.panel === 'achievements'
                            ? this.achievements()
                            : this.panel === 'research'
                              ? this.research()
                              : this.panel === 'info'
                                ? this.info()
                                : this.panel === 'layouts'
                                  ? this.layoutPanel()
                                  : this.panel === 'surrender'
                                    ? this.surrender()
                                    : this.help();
    return `<div class="modal-backdrop"><section class="modal ${this.panel === 'campaign' ? 'campaign-modal' : ''} ${this.panel === 'surrender' || this.panel === 'ore-confirm' ? 'small-modal' : this.panel === 'blacksmith' ? 'blacksmith-modal' : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header class="modal-header"><div><small>CROWN & CLAN</small><h1 id="modal-title">${titles[this.panel!]}</h1><p>${subtitles[this.panel!]}</p></div><button class="square-btn small close-btn" data-action="close" aria-label="Close dialog">${icon('X', 25)}</button></header>${content}</section></div>`;
  }
  private composition(
    army: import('../game/model').Army,
    spells: import('../game/model').SpellBook,
  ) {
    return `<div class="composition">${TROOP_ORDER.filter((k) => army[k])
      .map(
        (k) =>
          `<span title="${TROOPS[k].name}" aria-label="${army[k]} ${TROOPS[k].name}"><img src="${hudAsset(k)}" alt=""><b>×${army[k]}</b></span>`,
      )
      .join('')}${SPELL_ORDER.filter((k) => spells[k])
      .map(
        (k) =>
          `<span title="${SPELLS[k].name}" aria-label="${spells[k]} ${SPELLS[k].name}"><img src="${hudAsset(k)}" alt=""><b>×${spells[k]}</b></span>`,
      )
      .join('')}</div>`;
  }
  private armyPresets() {
    const m = this.model;
    return `<div class="modal-body preset-body"><p class="preset-current">Current army: <b>${m.armySize}/${m.capacity}</b> troop spaces · <b>${m.spellHousing}/${m.spellCapacity}</b> spell spaces</p>${[
      0, 1, 2,
    ]
      .map((slot) => {
        const p = m.state.armyPresets?.[slot];
        const fits =
          p && armySpace(p.army) <= m.capacity && spellSpace(p.spells) <= m.spellCapacity;
        const issue = p ? m.armyPreparationIssue(p.army, p.spells) : null;
        return `<article class="preset-card"><div class="preset-title"><span class="preset-number">${slot + 1}</span><label for="preset-name-${slot}">Army name<input id="preset-name-${slot}" maxlength="32" value="${html(this.presetNames.get(slot) ?? p?.name ?? `Army ${slot + 1}`)}"></label><small>${p ? `${armySpace(p.army)} troop · ${spellSpace(p.spells)} spell spaces` : 'Empty slot'}</small></div>${p ? this.composition(p.army, p.spells) : '<p class="preset-empty">Build an army in the Army drawer, then save it here.</p>'}<div class="preset-actions">${button(`preset-save:${slot}`, `${icon('Save', 16)} ${p ? 'Save current army' : 'Save army'}`, 'game-btn stone', m.armySize ? '' : 'disabled')}${button(`preset-load:${slot}`, `${icon('Check', 16)} ${p && !fits ? 'Needs more housing' : issue ? 'Locked composition' : 'Use army'}`, 'game-btn green', fits && !issue ? '' : 'disabled')}</div>${issue ? `<p class="preset-empty">${issue}</p>` : ''}</article>`;
      })
      .join(
        '',
      )}${button('army', `${icon('Swords', 17)} Edit current army`, 'game-btn blue')}</div>`;
  }
  private battleLog() {
    const log = this.model.state.raidLog ?? [];
    return `<div class="modal-body battle-log-body"><div class="replay-import-bar">${button('replay-import', `${icon('Upload', 17)} Open shared replay`, 'game-btn blue')}<small>Watch a replay file without replacing your village.</small></div>${log.length ? log.map((r) => `<article class="raid-record"><div class="raid-record-head"><div><small>${r.practice ? 'PRACTICE' : 'CAMPAIGN'} · ${new Date(r.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${new Date(r.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</small><h3>${r.practice ? 'Your village' : campaignStage(r.index, r.catalog).name}</h3></div><div class="raid-score"><b>${r.result.destruction}%</b><span aria-label="${r.result.stars} stars">${'★'.repeat(r.result.stars)}<i>${'★'.repeat(3 - r.result.stars)}</i></span></div></div><p class="raid-loot">${r.practice ? 'Practice · no army losses or rewards' : `${coin} ${n(r.result.gold)} ${elixir} ${n(r.result.elixir)}${r.result.dark !== undefined ? ` ${resource('dark')} ${n(r.result.dark)}` : ''} ${r.result.trophies ? `${icon('Trophy', 16)} ${r.result.trophies > 0 ? '+' : ''}${r.result.trophies}` : ''}`}<span>${time(r.duration)}</span></p><small class="deployed-label">TROOPS &amp; SPELLS DEPLOYED</small>${this.composition(r.deployed, r.spells)}${compatibleReplayVersion(r.replay?.version) ? button(`replay:${r.id}`, `${icon('Play', 16)} Watch replay`, 'game-btn blue replay-watch') + button(`replay-export:${r.id}`, `${icon('Download', 16)} Export replay`, 'game-btn stone') : `<p class="replay-unavailable">${r.replay ? 'Replay unavailable · Recorded before a combat update.' : r.replayUnavailable === 'limit' ? 'Replay unavailable · This attack exceeded the recording limit.' : 'Replay unavailable · Recordings kept for the latest five attacks.'}</p>`}${r.hero ? `<p class="hero-log">Barbarian King · Level ${r.hero.level} · ${r.hero.abilityUsed ? 'Ability used' : 'Ability unused'}</p>` : ''}${r.practice || r.catalog === 'goblin-v1' ? button(r.practice ? 'practice' : `attack:${r.index}`, `${icon('Swords', 15)} ${r.practice ? 'Practice again' : 'Attack village'}`, 'game-btn stone', this.model.armySize || this.model.heroReady ? '' : 'disabled') : ''}</article>`).join('') : `<div class="empty-log">${icon('ScrollText', 48)}<h2>Your story starts here</h2><p>Complete a campaign or practice attack to record its result and the army you deployed.</p>${button('practice', 'Practice your defense', 'game-btn blue', this.model.armySize || this.model.heroReady ? '' : 'disabled')}</div>`}</div>`;
  }
  private troopInfo() {
    const kind = this.inspectedTroop,
      d = this.model.troopStats(kind);
    const target = d.healer
      ? 'Friendly ground troops'
      : d.wallBreaker
        ? 'Walls (40× damage)'
        : d.prefersResources
          ? 'Resources (2× damage)'
          : d.prefersDefenses
            ? 'Defenses'
            : 'Any building';
    const tactic = d.healer
      ? 'Deploy behind a ground army. Healing pulses land where the ally was when cast, restoring nearby ground troops. Heroes receive 55% healing. Additional Healers have diminishing effectiveness; eight or more add no further healing to the same group.'
      : kind === 'dragon'
        ? 'Fly over walls and burn clustered buildings. Dragons have no favorite target, so clear outer buildings to guide them toward Air Defenses.'
        : kind === 'pekka'
          ? 'Open the walls and funnel this heavy attacker into the base. Support with Healers or spells; P.E.K.K.A has no preferred target or bonus against walls.'
          : d.wallBreaker
            ? 'Let Giants draw defensive fire first. Reaching a wall deals both attack and death damage; being defeated on the way deals only death damage. Both deal 40× damage to walls.'
            : d.prefersResources
              ? 'Clear a route through the walls, then send Goblins toward storages. Loot is released with each hit, so a quick raid can pay even without a star.'
              : d.flying
                ? 'Bombs damage nearby buildings when they land. Remove Air Defenses before sending Balloons over the walls.'
                : d.prefersDefenses
                  ? 'Deploy first to draw defensive fire, then send your more fragile troops behind.'
                  : 'Spread your deployment to avoid mortar splash. Support your frontline with ranged damage and spells.';
    const rows: [string, string][] = [
      ['Unlock requirement', `Barracks ${TROOP_UNLOCK[kind]}`],
      ['Favorite target', target],
      [
        d.healer ? 'Healing per second' : 'Damage per second',
        damageNumber((d.heal ?? d.damage) / d.rate),
      ],
      [d.healer ? 'Healing per pulse' : 'Damage per hit', damageNumber(d.heal ?? d.damage)],
      ['Hitpoints', n(d.hp)],
      ['Housing space', `${d.space}`],
      ['Movement', d.flying ? 'Air · ignores walls' : 'Ground'],
      ['Movement speed', `${d.speed} tiles/s`],
      [d.healer ? 'Healing range' : 'Attack range', `${d.range} tile${d.range === 1 ? '' : 's'}`],
      [d.healer ? 'Healing interval' : 'Attack interval', `${d.rate}s`],
    ];
    if (d.splash) rows.push([d.healer ? 'Healing radius' : 'Attack splash', `${d.splash} tiles`]);
    if (d.healer) rows.push(['Hero healing per second', damageNumber((d.heal! / d.rate) * 0.55)]);
    if (d.deathDamage) {
      rows.push(['Damage on destruction', damageNumber(d.deathDamage)]);
      rows.push(['Death blast radius', `${d.deathRadius} tiles`]);
    }
    if (d.wallBreaker)
      rows.push(['Contact damage vs walls', damageNumber((d.damage + (d.deathDamage ?? 0)) * 40)]);
    return `<div class="modal-body troop-info-body"><div class="troop-info-hero"><img src="${hudAsset(kind)}" alt="${d.name}"><div><span class="eyebrow">${d.role} · LEVEL ${this.model.troopLevel(kind)}</span><h2>${d.name}</h2><p>${d.description}</p></div></div><dl class="troop-stats">${rows.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl><p class="troop-tactic">${icon('Info', 20)}<span>${tactic}</span></p>${button('army', `${icon('Swords', 18)} Train troops`, 'game-btn green')}</div>`;
  }
  private spellInfo() {
    const kind = this.inspectedSpell,
      d = this.model.spellStats(kind);
    const rows: [string, string][] = [
      ['Unlock requirement', `Spell Factory ${SPELL_UNLOCK[kind]}`],
      ['Housing space', `${d.space}`],
      ['Effect radius', `${d.radius} tiles`],
      [
        'Targets',
        kind === 'lightning'
          ? 'Enemy buildings'
          : kind === 'freeze'
            ? 'Defences and defending troops'
            : 'Ground and air troops',
      ],
    ];
    if (kind === 'lightning') rows.push(['Damage', n(d.damage)], ['Stun duration', '0.1s']);
    else if (kind === 'freeze')
      rows.push(
        ['Damage', 'None'],
        ['Freeze duration', `${freezeSeconds(this.model.spellLevel(kind))}s`],
      );
    else if (kind === 'heal')
      rows.push(
        ['Total troop healing', n(d.heal * HEAL_PULSES)],
        ['Total hero healing', damageNumber(d.heal * HEAL_PULSES * HEAL_HERO_MULTIPLIER)],
        ['Healing per pulse', `${d.heal}`],
        ['Pulses', `${HEAL_PULSES} · every ${SPELL_PULSE_INTERVAL}s`],
        ['Spell duration', `${damageNumber(d.duration)}s`],
      );
    else
      rows.push(
        ['Damage increase', `+${d.damageBoost}%`],
        ['Movement increase', `+${d.speedBoost / 8} tiles/s`],
        ['Spell duration', `${d.duration}s`],
        ['Effect lingers', `${RAGE_LINGER}s after the last pulse`],
        ['Hero effectiveness', '50% of each boost'],
      );
    const tactic =
      kind === 'freeze'
        ? 'Cast it over the defences that are firing, not the ones ahead. Frozen defences stop mid-reload and pick a target again when they thaw, and frozen defenders stop where they stand. It deals no damage, so it buys time rather than destruction.'
        : kind === 'lightning'
          ? 'Aim at clustered defenses. The bolt hits any building footprint within its radius, but Town Halls, resource storages and traps are immune. Surviving defenses briefly stop and choose a target again.'
          : kind === 'heal'
            ? 'Place Healing where damaged troops will stay. Each spell heals independently, so overlapping rings stack. Heroes receive 55% of the healing; defeated troops cannot be revived.'
            : 'Lead your troops with the ring. Damage and movement increase without changing attack speed. Overlapping Rage spells do not add their boosts, and the stronger spell or hero ability boost takes effect.';
    return `<div class="modal-body troop-info-body spell-info-body"><div class="troop-info-hero"><img src="${hudAsset(kind)}" alt="${d.name}"><div><span class="eyebrow">${d.role} · LEVEL ${this.model.spellLevel(kind)}</span><h2>${d.name}</h2><p>${d.description}</p></div></div><dl class="troop-stats">${rows.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl><p class="troop-tactic">${icon('Info', 20)}<span>${tactic}</span></p>${button(`research-view:${kind}`, `${icon('FlaskConical', 18)} Research spell`, 'game-btn green')}</div>`;
  }
  private surrender() {
    const b = this.model.battle!;
    return `<div class="modal-body confirm-body"><p class="confirm-line">${icon('TriangleAlert', 34)} You are at <b>${b.destruction}% destruction</b> with <b>${b.stars} ${b.stars === 1 ? 'star' : 'stars'}</b>. ${b.practice ? 'Ending now records this practice result without spending your army.' : 'Ending now keeps that result and any loot already taken.'}</p><div class="confirm-actions">${button('close', 'Keep fighting', 'game-btn stone')}${button('end', `${icon('Flag', 18)} End battle`, 'game-btn red')}</div></div>`;
  }
  private info() {
    const m = this.model;
    const b = m.state.buildings.find((v) => v.id === m.selected);
    if (!b) return '<div class="modal-body"><p>Select a building first.</p></div>';
    const d = BUILDINGS[b.kind];
    const capped = b.level >= d.maxLevel;
    const gated = !capped && b.level >= m.maxLevel(b.kind);
    const now = statRows(b.kind, b.level, b.xbowMode, b.infernoMode);
    const next = capped ? [] : statRows(b.kind, b.level + 1, b.xbowMode, b.infernoMode);
    const nextUnlocks =
      b.kind === 'barracks'
        ? TROOP_ORDER.filter((k) => TROOP_UNLOCK[k] === b.level + 1).map((k) => TROOPS[k].name)
        : b.kind === 'spellfactory'
          ? SPELL_ORDER.filter((k) => SPELL_UNLOCK[k] === b.level + 1).map((k) => SPELLS[k].name)
          : [];
    return `<div class="modal-body info-body"><div class="info-hero"><img src="${hudAsset(b.kind, b.level, b.skeletonMode, b.xbowMode, b.infernoMode)}" alt=""><div><span class="eyebrow">${d.category.toUpperCase()} · LEVEL ${b.level} OF ${d.maxLevel}</span><h2>${d.name}</h2><p>${d.description}</p>${b.kind === 'skeletontrap' ? `<p class="trap-note"><b>${b.skeletonMode === 'air' ? 'Air mode' : 'Ground mode'}</b> · Skeletons pursue ${b.skeletonMode === 'air' ? 'flying' : 'ground'} troops.</p>` : ''}${d.trap ? '<p class="trap-note">Hidden from attackers until triggered. One use per attack; automatically armed for the next practice. Traps do not count toward destruction.</p>' : ''}<div class="info-levels">${Array.from({ length: d.maxLevel }, (_, i) => `<i class="${i < b.level ? 'on' : ''}"></i>`).join('')}</div></div></div>
 <table class="info-table"><thead><tr><th>Stat</th><th>Level ${b.level}</th><th>${capped ? 'Max' : `Level ${b.level + 1}`}</th></tr></thead><tbody>${now
   .map(([ic, label, value], i) => {
     const after = next[i]?.[2];
     const changed = after !== undefined && after !== value;
     return `<tr><td>${icon(ic, 15)} ${label}</td><td>${value}</td><td class="${changed ? 'better' : 'same'}">${capped ? '—' : changed ? `${after} ${icon('ArrowBigUp', 13)}` : after}</td></tr>`;
   })
   .join('')}</tbody></table>
 ${nextUnlocks.length ? `<p class="upgrade-unlocks">Unlocks at level ${b.level + 1}: <b>${nextUnlocks.join(', ')}</b></p>` : ''}
 <div class="info-upgrade">${
   capped
     ? `<span class="max-level">★ Fully upgraded</span>`
     : gated
       ? `<span class="max-level locked">${icon('LockKeyhole', 15)} ${requiredTownHall(b.kind, b.level + 1) ? `Requires Town Hall ${requiredTownHall(b.kind, b.level + 1)}` : 'Maximum level for the available Town Hall tiers'}</span>`
       : `<div class="info-cost"><span>${resource(d.resource)} <b>${n(costFor(b.kind, b.level))}</b></span><span>${icon('Clock3', 15)} <b>${b.kind === 'wall' ? 'Instant' : time(upgradeSeconds(b.kind, b.level))}</b></span><span>${icon('Hammer', 15)} <b>${m.builders - m.busy} free</b></span></div>${button(b.kind === 'wall' ? `wall-info-upgrade:${b.id}` : `upgrade:${b.id}`, `${icon('ArrowBigUp', 19)} Upgrade to level ${b.level + 1}`, 'game-btn green', b.upgradeEnd || m.busy >= m.builders ? 'disabled' : '')}`
 }</div></div>`;
  }
  private layoutPanel() {
    const m = this.model;
    return `<div class="modal-body layouts-body"><p class="layouts-note">Save the arrangement you are happy with, then experiment freely. Restoring a layout can be undone.</p>${[
      0, 1, 2,
    ]
      .map((i) => {
        const layout = m.layouts[i];
        const filled = !!layout?.slots.length;
        return `<article class="layout-row"><div class="layout-icon">${icon('LayoutGrid', 24)}</div><div><h3>${html(layout?.name ?? `Layout ${i + 1}`)}</h3><p>${filled ? `${layout!.slots.length} buildings stored` : 'Empty slot'}</p></div><div class="layout-actions">${button(`layout-save:${i}`, `${icon('Save', 16)} Save`, 'game-btn stone')}${button(`layout-load:${i}`, `${icon('RotateCcw', 16)} Restore`, 'game-btn green', filled ? '' : 'disabled')}</div></article>`;
      })
      .join('')}</div>`;
  }
  private researchCard(kind: ResearchKind) {
    const m = this.model,
      spell = isSpellKind(kind);
    const name = spell ? SPELLS[kind].name : TROOPS[kind].name;
    const level = m.researchLevel(kind),
      maximum = isSpellKind(kind) ? maxSpellLevelFor(kind) : maxTroopLevel(kind);
    const max = level >= maximum,
      nextLevel = Math.min(level + 1, maximum);
    const unlocked = spell ? m.spellUnlocked(kind) : m.troopUnlocked(kind);
    const requiredLab = m.researchLaboratory(kind);
    const gated = !unlocked || !m.laboratory || m.laboratory.level < requiredLab;
    const label = max
      ? '★ Fully researched'
      : !unlocked
        ? `Requires ${spell ? `Spell Factory ${SPELL_UNLOCK[kind]}` : `Barracks ${TROOP_UNLOCK[kind]}`}`
        : gated
          ? `Requires laboratory ${requiredLab}`
          : `Research ${elixir} ${n(m.researchCost(kind))}`;
    let rows: [string, string, string, string][];
    if (isSpellKind(kind)) {
      const d = m.spellStats(kind),
        next = m.spellStats(kind, nextLevel);
      rows =
        kind === 'lightning'
          ? [
              ['Zap', 'Damage', `${d.damage}`, `${next.damage}`],
              ['Scan', 'Radius', `${d.radius}`, `${next.radius}`],
            ]
          : kind === 'heal'
            ? [
                ['Heart', 'Healing', n(d.heal * HEAL_PULSES), n(next.heal * HEAL_PULSES)],
                ['Scan', 'Radius', `${d.radius}`, `${next.radius}`],
              ]
            : [
                ['Swords', 'Damage', `+${d.damageBoost}%`, `+${next.damageBoost}%`],
                ['Wind', 'Speed', `+${d.speedBoost / 8}`, `+${next.speedBoost / 8}`],
              ];
    } else {
      const d = m.troopStats(kind),
        next = m.troopStats(kind, nextLevel);
      rows = [
        ['Heart', 'Health', `${d.hp}`, `${next.hp}`],
        d.healer
          ? [
              'HeartPulse',
              'Healing/s',
              damageNumber(d.heal! / d.rate),
              damageNumber(next.heal! / next.rate),
            ]
          : ['Swords', 'Damage', `${d.damage}`, `${next.damage}`],
      ];
    }
    return `<article class="training-card" data-research-kind="${kind}"><span class="role-tag">LEVEL ${level} OF ${maximum}${max ? ' · MAX' : ` → ${level + 1}`}</span><div class="training-art"><img src="${hudAsset(kind)}" alt=""></div><h3>${name.replace(' Spell', '')}</h3><div class="research-stats">${rows.map(([glyph, label, value, next]) => `<span>${icon(glyph, 16)} ${label} <b>${value}${max || value === next ? '' : ` <em>→ ${next}</em>`}</b></span>`).join('')}</div>${button(`research-start:${kind}`, label, 'game-btn ' + (max || gated ? 'stone' : 'green'), max || gated || !!m.state.research || m.state.elixir < m.researchCost(kind) ? 'disabled' : '')}<small>${max ? 'Ready for the toughest battles' : `${time(m.researchSeconds(kind))} research · permanent upgrade`}</small></article>`;
  }
  private research() {
    const m = this.model,
      lab = m.laboratory,
      r = m.state.research;
    const name = r
      ? isSpellKind(r.kind)
        ? SPELLS[r.kind].name.replace(' Spell', '')
        : TROOPS[r.kind].name
      : '';
    return `<div class="modal-body research-body"><div class="research-banner"><img src="${hudAsset('laboratory', lab?.level ?? 1)}" alt=""><div><span class="eyebrow">LABORATORY LEVEL ${lab?.level ?? 0}</span><h2>${r ? `${name} research` : 'Strengthen your army'}</h2><p>${r ? 'Your next upgrade is on its way.' : 'Research permanently improves troops and spells. Upgrade the laboratory to unlock higher levels.'}</p>${lab?.upgradeEnd ? `<p class="facility-research-note">Upgrading to level ${lab.level + 1}. Research remains available at level ${lab.level}.</p>` : ''}${r ? `<div class="research-status"><strong data-research>${time((r.end - m.clock) / 1000)}</strong>${button('research-finish', `Finish ${gem} <span data-research-cost>${m.finishCost({ upgradeEnd: r.end } as Building)}</span>`, 'game-btn green')}</div>` : ''}</div></div><div class="training-grid research-grid">${[...TROOP_ORDER, ...SPELL_ORDER].map((kind) => this.researchCard(kind)).join('')}</div></div><footer class="modal-footer">${elixir} ${n(m.state.elixir)} elixir available <span>One research project at a time</span></footer>`;
  }
  private campaignMap(index: number) {
    const v = NATIVE_CAMPAIGN[index];
    return `<svg class="campaign-map" viewBox="0 0 48 48" role="img" aria-label="${v.name} base layout"><rect width="48" height="48" rx="3" fill="#637d43"/>${v.buildings
      .filter(([id]) => id !== 1000019)
      .map(
        ([id, x, y]) =>
          `<rect x="${x + 2}" y="${y + 2}" width="${NATIVE_COMBAT[id].size - 0.18}" height="${NATIVE_COMBAT[id].size - 0.18}" rx=".25" fill="${id === 1000010 ? '#b9ada0' : id === 1000001 || id === 1000017 || id === 1000069 ? '#f3c346' : '#e0cf97'}"/>`,
      )
      .join('')}</svg>`;
  }
  private campaign() {
    const stars = this.model.state.nativeCampaign?.stars ?? [];
    return `<div class="campaign-summary">${button('practice', `${icon('ShieldCheck', 17)} Practice your defense`, 'game-btn blue', this.model.armySize || this.model.heroReady ? '' : 'disabled')}${icon('Map', 23)} <span>90 Goblin villages</span><b>${stars.reduce((a, b) => a + b, 0)} / 270 ${icon('Star', 17)}</b></div><p class="campaign-rules">No time limit · No trophy changes · Loot does not replenish</p><div class="modal-body campaign-list">${NATIVE_CAMPAIGN.map(
      (v, i) => {
        const loot = this.model.campaignLoot(i, 'goblin-v1');
        const pending = nativeCampaignIssues(i).length > 0;
        const locked = !nativeUnlocked(i, stars),
          score = stars[i] ?? 0;
        return `<article class="campaign-card ${locked || pending ? 'locked' : ''}" data-stage="${v.stage}"><div class="campaign-number">${locked ? icon('LockKeyhole', 22) : v.stage}</div>${this.campaignMap(i)}<div class="campaign-info"><span>SINGLE PLAYER</span><h3>${v.name}</h3><p>${pending ? 'This village is coming soon.' : v.dependencies.length ? 'Win a star to open the next path.' : 'Your campaign begins here.'}</p>${v.recommendedTownHall ? `<small class="campaign-recommendation">Suggested Town Hall: ${v.recommendedTownHall}</small>` : ''}<div class="campaign-loot" aria-label="Remaining loot">${coin} ${n(loot.gold)} ${elixir} ${n(loot.elixir)}${loot.dark !== undefined ? ` ${resource('dark')} ${n(loot.dark)}` : ''}</div>${loot.gold || loot.elixir || loot.dark ? '' : `<small class="campaign-depleted">Loot depleted${score < 3 ? ' · Replay for stars' : ' · Village cleared'}</small>`}</div><div class="campaign-action"><div class="campaign-stars">${'★'.repeat(score)}<span>${'★'.repeat(3 - score)}</span></div>${button(`attack:${i}`, pending ? 'Coming soon' : locked ? 'Locked' : `Attack ${icon('ArrowRight', 17)}`, 'game-btn ' + (locked || pending ? 'stone' : 'orange'), locked || pending ? 'disabled' : '')}</div></article>`;
      },
    ).join('')}</div>`;
  }

  private settings() {
    const s = this.model.state.settings;
    return `<div class="modal-body settings-body">${(
      [
        ['sound', 'Sound effects', 'Little sounds for big moments.', s.sound],
        ['music', 'Ambient tones', 'A quiet background harmony.', s.music],
        ['motion', 'Reduced motion', 'Less camera shake and decorative movement.', s.reducedMotion],
      ] as const
    )
      .map(
        ([k, title, desc, on]) =>
          `<div class="setting-row"><div><h3>${title}</h3><p>${desc}</p></div><button class="toggle ${on ? 'on' : ''}" data-action="${k}" role="switch" aria-checked="${on}" aria-label="${title}"><span></span></button></div>`,
      )
      .join(
        '',
      )}<div class="save-section"><h3>${icon('Save', 20)} Your village, saved</h3><p>Progress is saved automatically in this browser. Export a backup to keep it safe or move to another device. Importing replaces this village.</p><div>${button('export', `${icon('Download', 18)} Export village`, 'game-btn blue')}${button('import', `${icon('Upload', 18)} Import backup`, 'game-btn stone')}</div></div><div class="settings-note">Frontend-only · Playable offline after your first visit<br>Version 0.2 · Original artwork created for Crown & Clan</div></div>`;
  }
  /** The league's own daily bonus, which is where ore comes from. */
  private starBonusCard() {
    const m = this.model,
      bonus = m.starBonus,
      reward = starBonusReward(m.state.trophies),
      waiting = Math.max(0, bonus.readyAt - m.clock);
    const parts = (['gold', 'elixir', 'dark'] as const)
      .filter((k) => reward[k] > 0)
      .map((k) => `<span>${resource(k)} ${n(reward[k])}</span>`)
      .concat(
        ORE_KEYS.filter((k) => reward[k] > 0).map(
          (k) => `<span>${gearImage(k)} ${n(reward[k])}</span>`,
        ),
      )
      .join('');
    const short = Math.max(0, STAR_BONUS_STARS - bonus.stars);
    const status = short
      ? `${short} more ${short === 1 ? 'star' : 'stars'}`
      : waiting
        ? `Ready in ${time(waiting / 1000)}`
        : 'Ready to collect';
    return `<div class="star-bonus"><div class="star-bonus-head">${icon('Star', 20)}<b>Star Bonus</b><small>${Math.min(bonus.stars, STAR_BONUS_STARS)}/${STAR_BONUS_STARS} stars · ${status}</small></div><div class="star-bonus-reward">${parts}</div>${button('star-bonus', 'Collect', 'game-btn green', m.starBonusReady ? '' : 'disabled')}</div>`;
  }
  private achievements() {
    const s = this.model.state;
    return `<div class="modal-body"><div class="league-banner">${icon('Trophy', 49)}<div><h2>${this.model.league.name}</h2><p>${n(s.trophies)} trophies · Chief level ${this.model.chiefLevel}</p></div></div>${this.starBonusCard()}<div class="profile-stats">${(
      [
        ['Swords', 'Raids won', n(s.stats.raids)],
        ['Castle', 'Buildings destroyed', n(s.stats.destroyed)],
        ['Coins', 'Resources collected', n(s.stats.collected)],
        [
          'Star',
          'Campaign stars',
          `${(s.nativeCampaign?.stars ?? []).reduce((a, b) => a + b, 0)} / 270`,
        ],
        ['LayoutGrid', 'Town Hall', `Level ${this.model.townhallLevel}`],
        ['Hammer', 'Builders', String(this.model.builders)],
      ] as const
    )
      .map(
        ([ic, label, value]) =>
          `<div class="profile-stat">${icon(ic, 18)}<b>${value}</b><small>${label}</small></div>`,
      )
      .join(
        '',
      )}</div><div class="quest-list">${this.model.quests.map((q) => `<article class="quest"><div class="quest-icon">${icon(q.icon, 28)}</div><div><h3>${q.title} ${q.claimed ? '<span class="completed">Claimed</span>' : ''}</h3><p>${q.description}</p><div class="quest-progress"><i style="width:${pct((q.progress / q.target) * 100)}"></i></div><small class="quest-count">${n(Math.min(q.progress, q.target))} / ${n(q.target)}</small></div>${q.claimed ? `<b class="claimed-check">${icon('ShieldCheck', 23)}</b>` : button(`claim:${q.id}`, `${gem} ${q.reward}`, 'game-btn green quest-claim', q.progress < q.target ? 'disabled' : '')}</article>`).join('')}</div></div>`;
  }
  private help() {
    return `<div class="modal-body help-body"><div class="guide-hero"><img src="${hudAsset('swordsman')}" alt="Your Barbarian guide"><div><h2>Good to see you, Chief!</h2><p>The builders are ready, the gold is flowing, and your troops are itching for an adventure. Let's make this village a kingdom.</p></div></div><div class="help-steps"><article><b>1</b><div><h3>Build and rearrange</h3><p>Open the Shop and drag a building straight onto the village. Use Edit mode to drag anything already built — with undo, redo and three saved layouts.</p></div></article><article><b>2</b><div><h3>Grow past the Town Hall</h3><p>Buildings have distinct Town Hall requirements. Open Progression from the Army drawer to see the level caps and unlocks for each tier. Collectors keep working while you're away, up to 8 hours.</p></div></article><article><b>3</b><div><h3>Raise an army. Raid the valley.</h3><p>Prepare troops and spells instantly for free, save Quick armies, then attack. Practice against your own village from Army or the campaign map, and review your attacks in the Battle log. Single-player attacks have no time limit or trophy changes. Each village has a finite supply of loot; any loot beyond your storage capacity is lost. Practice gives you 30 seconds to scout and three minutes to attack. Balloons fly over walls; Archer Towers and Air Defenses can hit them. Send Giants first, Wall Breakers to open a breach, then Goblins to steal resources. Mortars cannot fire within 4 tiles; moving troops can dodge their shells. Wizard Towers splash one troop layer at a time. Buy hidden traps from the Shop, place them in likely approaches, and test them in Practice. Traps are armed again for each new attack.</p></div></article></div><div class="help-controls"><span>Drag <b>Move camera</b></span><span>Hold &amp; drag <b>Spread troops</b></span><span>Double-tap <b>Deploy five</b></span><span>Esc <b>Close / cancel</b></span></div>${button('tutorial', `Let's build ${icon('ArrowRight', 19)}`, 'game-btn green start-btn')}</div>`;
  }
  private result() {
    const b = this.model.battle!,
      r = b.result!;
    return `<div class="modal-backdrop result-backdrop"><section class="result-modal" role="dialog" aria-modal="true" aria-labelledby="result-title"><div class="result-rays"></div><span class="result-eyebrow">BATTLE COMPLETE</span><h1 id="result-title">${b.practice ? 'Practice complete' : r.stars ? 'Victory!' : 'A brave attempt'}</h1><div class="result-stars">${[0, 1, 2].map((i) => `<span class="${i < r.stars ? 'earned' : ''}">★</span>`).join('')}</div><p>${r.destruction}% destruction <span>·</span> ${b.practice ? 'Your village' : campaignStage(b.index, b.catalog).name}</p>${
      b.practice
        ? '<p class="practice-result-note">Your village, troops and spells are unchanged.<br>Rearrange your defenses and try a different approach.</p>'
        : `<div class="result-loot"><div>${coin}<b data-count="${r.gold}">0</b><small>Gold received</small></div><div>${elixir}<b data-count="${r.elixir}">0</b><small>Elixir received</small></div>${r.dark !== undefined ? `<div>${resource('dark')}<b data-count="${r.dark}">0</b><small>Dark Elixir received</small></div>` : ''}</div>${
            r.lostLoot
              ? `<p class="loot-overflow-note">Storages full: ${campaignResourceKeys(r.lostLoot)
                  .filter((k) => campaignAmount(r.lostLoot!, k) > 0)
                  .map(
                    (k) =>
                      `${n(campaignAmount(r.lostLoot!, k))} ${k === 'dark' ? 'Dark Elixir' : k}`,
                  )
                  .join(', ')} could not be stored.</p>`
              : ''
          }`
    }<div class="result-actions">${this.model.state.raidLog?.[0]?.replay ? button(`replay:${this.model.state.raidLog[0].id}`, `${icon('Play', 18)} Watch replay`, 'game-btn stone') : ''}${button('raid-again', `${icon('RotateCcw', 18)} ${b.practice ? 'Practice again' : 'Prepare & attack again'}`, 'game-btn blue')}${button('home', `${icon('House', 22)} Return to village`, 'game-btn green')}</div><small class="result-note">${b.practice ? 'Practice never consumes your army.' : 'Undeployed troops return home. Loot does not replenish.'}</small></section></div>`;
  }
  /** Runs the result screen's loot numbers up from zero, once. */
  private countUp() {
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('[data-count]'))) {
      const target = Number(el.dataset.count);
      if (!Number.isFinite(target) || this.model.state.settings.reducedMotion) {
        el.textContent = n(target || 0);
        continue;
      }
      const started = performance.now();
      const step = () => {
        const t = Math.min(1, (performance.now() - started) / 780);
        el.textContent = n(target * (1 - Math.pow(1 - t, 3)));
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
  }
  private updateLive() {
    const m = this.model;
    const heroTimer = document.querySelector('[data-hero-timer]');
    if (heroTimer && m.state.king?.upgradeEnd)
      heroTimer.textContent = time((m.state.king.upgradeEnd - m.clock) / 1000);
    const heroGems = document.querySelector('[data-hero-gems]');
    if (heroGems && m.state.king?.upgradeEnd)
      heroGems.textContent = String(
        m.finishCost({ upgradeEnd: m.state.king.upgradeEnd } as Building),
      );
    const heroCard = document.querySelector<HTMLElement>('.hero-card');
    if (heroCard && m.battle?.hero) {
      const h = m.battle.hero;
      const u = m.battle.units.find((u) => u.id === h.unitId);
      const state = `${h.unitId === null}:${!!u && u.hp <= 0}:${h.abilityUsed}:${m.activeHero}`;
      if (heroCard.dataset.heroState !== state) {
        const focused = document.activeElement === heroCard;
        heroCard.outerHTML = this.heroCard();
        if (m.activeHero) {
          const hint = document.querySelector('.deploy-label');
          if (hint) hint.textContent = this.kingDeploymentHint();
        }
        if (focused)
          document.querySelector<HTMLElement>('.hero-card')?.focus({ preventScroll: true });
      } else {
        const health = heroCard.querySelector<HTMLElement>('.hero-health i');
        if (health && u) health.style.width = pct((u.hp / u.maxHp) * 100);
      }
    }
    document
      .querySelectorAll<HTMLElement>('[data-resource]')
      .forEach(
        (el) =>
          (el.textContent = n(m.state[el.dataset.resource as 'gold' | 'elixir' | 'dark' | 'gems'])),
      );
    document.querySelectorAll<HTMLElement>('[data-obstacle-time]').forEach((el) => {
      const o = m.obstacles.find((o) => o.id === Number(el.dataset.obstacleTime));
      if (o?.removeEnd) el.textContent = time((o.removeEnd - m.clock) / 1000);
    });
    document.querySelectorAll<HTMLElement>('[data-upgrade]').forEach((el) => {
      const b = m.state.buildings.find((v) => v.id === Number(el.dataset.upgrade));
      if (b?.upgradeEnd) el.textContent = time((b.upgradeEnd - m.clock) / 1000);
    });
    document.querySelectorAll<HTMLElement>('[data-finish]').forEach((el) => {
      const b = m.state.buildings.find((v) => v.id === Number(el.dataset.finish));
      if (b?.upgradeEnd) el.textContent = String(m.finishCost(b));
    });
    const research = document.querySelector('[data-research]');
    if (research && m.state.research)
      research.textContent = time((m.state.research.end - m.clock) / 1000);
    const researchCost = document.querySelector('[data-research-cost]');
    if (researchCost && m.state.research)
      researchCost.textContent = String(
        m.finishCost({ upgradeEnd: m.state.research.end } as Building),
      );
    const queue = document.querySelector('[data-queue]');
    const nextQueued = [...m.state.queue, ...m.state.spellQueue].sort((a, b) => a.end - b.end)[0];
    if (queue && nextQueued) queue.textContent = time((nextQueued.end - m.clock) / 1000);
    const replay = m.replay;
    if (replay) {
      const time = document.querySelector('#replay-time');
      const progress = document.querySelector<HTMLInputElement>('#replay-progress');
      // Pointer scrubbing can continue without keyboard focus (notably Safari).
      if (!this.replayScrubbing && document.activeElement !== progress) {
        const value = replay.seeking ? replay.seekTarget : replay.time;
        if (time) time.textContent = `${clock(value)} / ${clock(replay.duration)}`;
        if (progress) {
          progress.value = String(value);
          progress.setAttribute('aria-valuetext', clock(value));
        }
      }
    }
    const b = m.battle;
    if (b) {
      const timer = document.querySelector('#battle-timer');
      if (timer)
        timer.textContent = b.practice
          ? clock(b.started ? BATTLE_SECONDS - b.elapsed : b.prep)
          : '∞';
      const val = document.querySelector('#destruction-value');
      if (val) val.textContent = `${b.destruction}%`;
      const fill = document.querySelector<HTMLElement>('#destruction-fill');
      if (fill) fill.style.width = pct(b.destruction);
      const stars = document.querySelector('#battle-stars');
      if (stars) stars.innerHTML = `${'★'.repeat(b.stars)}<span>${'★'.repeat(3 - b.stars)}</span>`;
      for (const k of campaignResourceKeys(b.availableLoot ?? { gold: 0, elixir: 0 })) {
        const el = document.querySelector(`[data-loot="${k}"]`);
        const available = b.availableLoot?.[k] ?? 0;
        const left = Math.max(0, available - (b.lootTaken?.[k] ?? 0));
        if (el) el.textContent = n(left);
        const bar = document.querySelector<HTMLElement>(`[data-lootbar="${k}"]`);
        if (bar) bar.style.width = pct((left / Math.max(1, available)) * 100);
      }
    }
  }
}

/** UI framing is independent of world registration; Cannon crops retain original pixels. */
function hudAsset(...args: Parameters<typeof asset>) {
  if (args[0] === 'archertower') return archerTowerPortrait(args[1] ?? 1);
  return args[0] === 'cannon' ? cannonIconAsset(args[1] ?? 1) : asset(...args);
}
