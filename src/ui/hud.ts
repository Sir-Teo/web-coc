import { CAMPAIGN_LAYOUTS, campaignBlueprint } from '../game/campaign';
import {
  BUILDINGS,
  TROOPS,
  SPELLS,
  TROOP_KEYS,
  SPELL_KEYS,
  CAMPAIGN,
  asset,
  defenseDamage,
  upgradeSeconds,
  upgradeCost as costFor,
  type BuildingKind,
  type TroopKind,
  type SpellKind,
} from '../game/data';
import { GameModel, formatTime, BATTLE_SECONDS, type Building } from '../game/model';
import { VillageScene } from '../game/scene';
import { AudioManager } from '../game/audio';
import { exportSave, validateSave, saveGame } from '../game/save';
import { icon, resource, coin, elixir, gem } from './icons';
type Panel =
  | 'research'
  | 'campaign'
  | 'settings'
  | 'achievements'
  | 'help'
  | 'info'
  | 'layouts'
  | 'surrender'
  | null;
/** Shop and army live in a bottom sheet so the village stays visible and clickable. */
type Drawer = 'shop' | 'army' | null;
const n = (v: number) => Math.floor(v).toLocaleString('en-US');
const time = (seconds: number) => formatTime(seconds);
const clock = (seconds: number) => {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const button = (action: string, label: string, cls = 'game-btn green', extra = '') =>
  `<button class="${cls}" data-action="${action}" ${extra}>${label}</button>`;
const pct = (v: number) => `${Math.max(0, Math.min(100, v))}%`;
/** The one place that says what a building level actually buys you. */
function statRows(kind: BuildingKind, level: number): [string, string, string][] {
  const d = BUILDINGS[kind];
  const rows: [string, string, string][] = [
    ['Heart', 'Hitpoints', n(d.hp * (1 + (level - 1) * 0.25))],
  ];
  if (d.damage) {
    rows.push(['Swords', 'Damage per hit', n(defenseDamage(kind, level))]);
    rows.push(['Target', 'Range', `${d.range} tiles`]);
    rows.push(['Gauge', 'Attack speed', `${d.rate}s`]);
    rows.push([
      'Radar',
      'Targets',
      d.targets === 'air' ? 'Air only' : d.targets === 'ground' ? 'Ground only' : 'Ground & air',
    ]);
  }
  if (kind === 'goldmine' || kind === 'collector')
    rows.push(
      ['Timer', 'Production', `${3 * level} / second`],
      ['Layers', 'Holds', n(10000 * level)],
    );
  if (kind === 'goldstorage' || kind === 'elixirstorage')
    rows.push(['Layers', 'Adds capacity', `+${n(60000 * level)}`]);
  if (kind === 'camp') rows.push(['UsersRound', 'Troop spaces', `+${20 * level}`]);
  if (kind === 'spellfactory') rows.push(['Sparkles', 'Spell slots', String(level)]);
  if (kind === 'laboratory')
    rows.push(['FlaskConical', 'Researches up to', `Troop level ${Math.min(3, level)}`]);
  if (kind === 'builder') rows.push(['Hammer', 'Builders', '+1 construction slot']);
  if (kind === 'barracks') rows.push(['Swords', 'Training', 'Divides training time']);
  if (kind === 'townhall') rows.push(['LayoutGrid', 'Caps buildings at', `Level ${level + 1}`]);
  return rows;
}
export class HUD {
  private root: HTMLElement;
  private panel: Panel = null;
  private drawerPanel: Drawer = null;
  private tab = 'All';
  private toastTimer?: ReturnType<typeof setTimeout>;
  private resultShown = false;
  private raf = false;
  private lastPanel: Panel = null;
  private lastDrawer: Drawer = null;
  private focusBefore: HTMLElement | null = null;
  private dragging = false;
  private anchorFrame = 0;
  constructor(
    private model: GameModel,
    private scene: VillageScene,
    private audio: AudioManager,
  ) {
    this.root = document.querySelector('#ui')!;
    this.root.innerHTML =
      '<div id="hud"></div><div id="context"></div><div id="drawer"></div><div id="modal-root"></div><div id="toast" role="status" aria-live="polite"></div><div id="save-state" aria-live="polite"></div><input id="import-file" type="file" accept="application/json,.json" hidden>';
    this.root.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (target && !(target as HTMLButtonElement).disabled) {
        this.audio.play('click');
        this.action(target.dataset.action!);
      }
    });
    this.root.addEventListener('pointerdown', (e) => {
      const target = e.target as HTMLElement;
      const card = target.closest<HTMLElement>('[data-drag]');
      // The price button is a tap target; everything else on the tile is a drag handle.
      if (card && !target.closest('button') && e.isPrimary)
        this.beginDrawerDrag(card.dataset.drag as BuildingKind, e);
    });
    this.root.addEventListener('change', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.id === 'import-file' && t.files?.[0]) void this.import(t.files[0]);
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
    if (!b) return;
    const d = BUILDINGS[b.kind];
    const p = this.scene.screenFor(b.x + d.size / 2, b.y + d.size / 2);
    const width = card.offsetWidth || 470,
      height = card.offsetHeight || 120;
    const left = Math.min(Math.max(width / 2 + 12, p.x), window.innerWidth - width / 2 - 12);
    const top = Math.min(Math.max(150, p.y - height - 62), window.innerHeight - height - 150);
    card.style.left = `${Math.round(left)}px`;
    card.style.top = `${Math.round(top)}px`;
  }
  toast(message: string) {
    const el = document.querySelector<HTMLElement>('#toast')!;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
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
    this.panel = panel;
    if (panel) {
      this.drawerPanel = null;
      this.model.cancel();
      if (panel === 'info') this.model.selected = selected;
      this.focusBefore = document.activeElement as HTMLElement;
    }
    this.render();
  }
  private showDrawer(drawer: Drawer) {
    this.drawerPanel = this.drawerPanel === drawer ? null : drawer;
    this.panel = null;
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
      const overDrawer = document
        .elementFromPoint(e.clientX, e.clientY)
        ?.closest('#drawer, #hud, .modal-backdrop');
      if (overDrawer) {
        // Treated as a plain pick-up: close the sheet and let them tap the map.
        this.drawerPanel = null;
      } else {
        const g = this.scene.gridAtScreen(e.clientX, e.clientY);
        if (this.model.place(Math.floor(g.x), Math.floor(g.y))) this.audio.play('build');
        else this.drawerPanel = null;
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
      case 'close':
        this.panel = null;
        this.render();
        this.restoreFocus();
        break;
      case 'close-drawer':
        this.drawerPanel = null;
        this.render();
        break;
      case 'shop':
        this.tab = 'All';
        this.showDrawer('shop');
        break;
      case 'army':
        this.showDrawer('army');
        break;
      case 'research':
        this.show('research');
        break;
      case 'research-start':
        m.researchTroop(arg as TroopKind);
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
      case 'retrain':
        m.retrain();
        break;
      case 'campaign':
        this.show('campaign');
        break;
      case 'settings':
        this.show('settings');
        break;
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
        m.startBattle(Number(arg));
        if (m.battle) {
          this.panel = null;
          this.drawerPanel = null;
          this.resultShown = false;
          this.audio.play('deploy');
        }
        this.render();
        break;
      case 'troop':
        m.activeTroop = arg as TroopKind;
        m.activeSpell = null;
        this.render();
        break;
      case 'spell':
        m.activeSpell = m.activeSpell === arg ? null : (arg as SpellKind);
        this.render();
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
        m.state.tutorial = true;
        this.panel = null;
        this.render();
        break;
    }
  }
  private async import(file: File) {
    try {
      if (file.size > 1000000) throw Error();
      const data = JSON.parse(await file.text());
      if (!validateSave(data)) throw Error();
      this.model.state = data;
      this.model.returnHome();
      this.model.endEdit();
      this.model.tick(Date.now());
      document.documentElement.classList.toggle('reduce-motion', data.settings.reducedMotion);
      this.audio.enabled = data.settings.sound;
      this.audio.music(data.settings.music);
      await saveGame(data);
      this.toast('Village restored successfully.');
      this.panel = null;
      this.render();
    } catch {
      this.toast('That backup is not a valid Crown & Clan village.');
    } finally {
      document.querySelector<HTMLInputElement>('#import-file')!.value = '';
    }
  }
  private keydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (this.panel) {
        this.panel = null;
        this.render();
        this.restoreFocus();
      } else if (this.drawerPanel) {
        this.drawerPanel = null;
        this.render();
      } else if (this.model.editing) this.action('edit-done');
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
    if (this.model.battle) {
      const troopIndex = ['1', '2', '3', '4', '5'].indexOf(e.key);
      if (troopIndex >= 0) {
        this.model.activeTroop = TROOP_KEYS[troopIndex];
        this.model.activeSpell = null;
        this.render();
      }
      const spellIndex = ['6', '7', '8'].indexOf(e.key);
      if (spellIndex >= 0) this.action(`spell:${SPELL_KEYS[spellIndex]}`);
    }
    if (this.model.editing && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      this.action(e.shiftKey ? 'redo' : 'undo');
    }
    if (e.key === '+' || e.key === '=') this.scene.zoomBy(1.15);
    if (e.key === '-') this.scene.zoomBy(1 / 1.15);
  }
  render() {
    const m = this.model,
      b = m.battle;
    const modalScroll = document.querySelector('.modal-body')?.scrollTop ?? 0;
    const drawerScroll = document.querySelector('.drawer-body')?.scrollLeft ?? 0;
    const drawerScrollY = document.querySelector('.drawer-body')?.scrollTop ?? 0;
    const focused = (document.activeElement as HTMLElement)?.dataset?.action;
    document.querySelector('#hud')!.innerHTML = b ? this.battleHUD() : this.homeHUD();
    document.querySelector('#context')!.innerHTML = this.context();
    document.querySelector('#drawer')!.innerHTML = this.drawer();
    document.querySelector('#drawer')!.classList.toggle('dragging', this.dragging);
    // An open sheet owns the bottom of the screen, so the bars beneath it step aside.
    this.root.classList.toggle('drawer-open', !!this.drawerPanel && !b);
    const result = b?.finished;
    // Drawers deliberately leave the map live; only real dialogs block it.
    this.scene.uiBlocked = !!this.panel || !!result;
    (document.querySelector('#hud') as HTMLElement).inert = this.scene.uiBlocked;
    (document.querySelector('#context') as HTMLElement).inert = this.scene.uiBlocked;
    (document.querySelector('#drawer') as HTMLElement).inert = this.scene.uiBlocked;
    document.querySelector('#modal-root')!.innerHTML = result
      ? this.result()
      : this.panel
        ? this.modal()
        : '';
    document.querySelector('.modal-body')?.scrollTo(0, modalScroll);
    const body = document.querySelector('.drawer-body');
    if (body) {
      body.scrollLeft = drawerScroll;
      body.scrollTop = drawerScrollY;
    }
    this.positionContext();
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
      this.audio.play('victory');
      document.querySelector<HTMLElement>('[data-action="home"]')?.focus();
    }
    this.updateLive();
  }
  private homeHUD() {
    const m = this.model,
      s = m.state;
    if (m.editing) return this.editHUD();
    const free = m.builders - m.busy;
    return `
 <header class="player-hud"><button class="level-shield" data-action="achievements" aria-label="Chief level ${m.chiefLevel}">${m.chiefLevel}</button><div class="player-info"><div class="eyebrow">CHIEF'S VILLAGE</div><div class="player-name">Oakheart <span class="online-dot"></span></div><button class="trophy-pill" data-action="achievements">${icon('Trophy', 17)} <b>${n(s.trophies)}</b> <span>${m.league}</span></button></div></header>
 <div class="village-status"><div class="brand">CROWN <span>&</span> CLAN</div><div class="status-chips"><button data-action="${m.busy ? 'achievements' : 'shop'}">${icon('Hammer', 20)} <b>${free}/${m.builders}</b> <span>Builders</span></button><button data-action="help">${icon('ShieldCheck', 20)} <b>Village safe</b></button></div></div>
 <div class="resources">${(['gold', 'elixir', 'gems'] as const).map((k, i) => `<div class="resource-bar ${k}"><div class="resource-fill" style="width:${k === 'gems' ? pct((s.gems / 500) * 100) : pct((s[k] / m.resourceCap(k)) * 100)}"></div><div class="resource-topline">${k === 'gems' ? 'Gems' : `Max: ${n(m.resourceCap(k))}`}</div><span class="resource-amount" data-resource="${k}">${n(s[k])}</span>${resource(k)}<button class="resource-plus" data-action="${i < 2 ? 'collect' : 'achievements'}" aria-label="${i < 2 ? 'Collect resources' : 'View achievements'}">+</button></div>`).join('')}</div>
 <nav class="left-tools" aria-label="Village activities"><button class="square-btn" data-action="campaign" aria-label="Campaign map">${icon('Map', 29)}${s.stars.some((v, i) => !v && (i === 0 || s.stars[i - 1])) ? '<span class="notification">!</span>' : ''}</button><button class="square-btn" data-action="achievements" aria-label="Achievements">${icon('ScrollText', 27)}<span class="tool-label">Quests</span></button><button class="square-btn" data-action="edit" aria-label="Edit village layout">${icon('Pencil', 25)}<span class="tool-label">Edit</span></button><button class="square-btn" data-action="help" aria-label="How to play">${icon('BookOpen', 27)}</button></nav>
 <div class="right-tools"><button class="square-btn small" data-action="settings" aria-label="Settings">${icon('Settings', 24)}</button><div class="camera-tools"><button data-action="zoom-in" aria-label="Zoom in">${icon('Plus', 20)}</button><button data-action="recenter" aria-label="Center village">${icon('LocateFixed', 18)}</button><button data-action="zoom-out" aria-label="Zoom out">${icon('Minus', 20)}</button></div></div>
 <div class="village-caption"><span class="caption-line"></span> HOME VILLAGE <span class="caption-line"></span><small>Town Hall Level ${m.townhallLevel}</small></div>
 <div class="bottom-left"><button class="attack-btn" data-action="campaign">${icon('Swords', 44)}<span>Attack!</span><small>SINGLE PLAYER</small></button></div>
 <div class="bottom-center">${
   !m.selected && !m.placement && !this.drawerPanel
     ? `<div class="army-label"><span>${icon('UsersRound', 16)} YOUR ARMY</span><button data-action="army">${m.armySize}/${m.capacity} ${icon('ChevronRight', 14)}</button></div><div class="army-tray">${TROOP_KEYS.map((k) => this.troopCard(k, s.army[k], 'army')).join('')}${
         m.spellCapacity
           ? SPELL_KEYS.filter((k) => s.spells[k])
               .map((k) => this.spellCard(k, s.spells[k], 'army'))
               .join('')
           : ''
       }<button class="train-add" data-action="army" aria-label="Train troops">${icon('Plus', 24)}<small>Train</small></button></div>`
     : ''
 }</div>
 <div class="bottom-right"><button class="collect-btn" data-action="collect">${coin}<span>Collect</span></button><button class="shop-btn ${this.drawerPanel === 'shop' ? 'open' : ''}" data-action="shop">${icon('ShoppingBasket', 38)}<span>Shop</span></button></div>
 <div class="control-hint">Drag to explore <span>·</span> Scroll to zoom <span>·</span> Click a building</div>`;
  }
  private editHUD() {
    const m = this.model;
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
    return `<button class="troop-card ${selected ? 'selected' : ''} ${count === 0 ? 'empty' : ''}" data-action="${action}" aria-label="${TROOPS[k].name}, ${count} available" ${action.startsWith('troop') && count === 0 ? 'disabled' : ''}><span class="troop-count">x${count}</span><img src="${asset(k)}" alt="" draggable="false">${flying}<span class="troop-level">★ ${this.model.troopLevel(k)}</span><span class="troop-name">${TROOPS[k].name}</span></button>`;
  }
  private spellCard(k: SpellKind, count: number, action: string, selected = false) {
    return `<button class="troop-card spell-card ${selected ? 'selected' : ''} ${count === 0 ? 'empty' : ''}" data-action="${action}" aria-label="${SPELLS[k].name}, ${count} available" ${action.startsWith('spell') && count === 0 ? 'disabled' : ''}><span class="troop-count">x${count}</span><img src="${asset(k)}" alt="" draggable="false"><span class="troop-name">${SPELLS[k].name.replace(' Spell', '')}</span></button>`;
  }

  // ------------------------------------------------------- anchored context
  private context() {
    const m = this.model;
    if (m.battle) return '';
    if (m.placement) {
      return `<div class="placement-banner">${icon('Move', 23)}<div><b>${m.moving ? 'Move' : 'Place'} ${BUILDINGS[m.placement].name}</b><small>Drop it on a clear green tile</small></div>${button('cancel', icon('X', 20), 'square-btn small', 'aria-label="Cancel placement"')}</div>`;
    }
    const b = m.state.buildings.find((v) => v.id === m.selected);
    if (!b) return '';
    if (m.editing)
      return `<div class="building-context compact" data-anchor="${b.id}"><div class="context-info"><h2>${BUILDINGS[b.kind].name}</h2><span>Level ${b.level} <i>·</i> drag to reposition</span></div></div>`;
    const d = BUILDINGS[b.kind];
    const capped = b.level >= d.maxLevel;
    const gated = !capped && b.level >= m.maxLevel(b.kind);
    return `<div class="building-context" data-anchor="${b.id}"><img class="context-art" src="${asset(b.kind, b.level)}" alt=""><div class="context-info"><small>${d.category.toUpperCase()}</small><h2>${d.name}</h2><span>Level ${b.level} <i>·</i> ${icon('Heart', 13)} ${n(b.maxHp)} HP</span></div><div class="context-actions">${button('info', `${icon('Info', 21)}<span>Info</span>`, 'game-btn stone')}${button(`move:${b.id}`, `${icon('Move', 21)}<span>Move</span>`, 'game-btn stone')}${
      b.upgradeEnd
        ? button(
            `finish:${b.id}`,
            `<small data-upgrade="${b.id}">${time((b.upgradeEnd - m.clock) / 1000)}</small><span>Finish ${gem} <i data-finish="${b.id}">${m.finishCost(b)}</i></span>`,
          )
        : capped
          ? '<span class="max-level">★ Max level</span>'
          : gated
            ? `<span class="max-level locked">${icon('LockKeyhole', 14)} Town Hall ${b.level}</span>`
            : button(
                `upgrade:${b.id}`,
                `<span>${icon('ArrowBigUp', 19)} Upgrade</span><small>${resource(d.resource)} ${n(m.upgradeCost(b))}</small>`,
              )
    }${b.kind === 'laboratory' ? button('research', `${icon('FlaskConical', 20)} Research`, 'game-btn blue') : ''}${b.kind === 'barracks' || b.kind === 'camp' || b.kind === 'spellfactory' ? button('army', `${icon('Swords', 20)} Train`, 'game-btn blue') : ''}${b.kind === 'goldmine' || b.kind === 'collector' ? button('collect', `${coin} Collect`, 'game-btn gold') : ''}</div><button class="context-close" data-action="cancel" aria-label="Close building">${icon('X', 18)}</button></div>`;
  }

  // ----------------------------------------------------------------- battle
  private battleHUD() {
    const m = this.model,
      b = m.battle!,
      v = CAMPAIGN[b.index];
    const lootBar = (k: 'gold' | 'elixir') =>
      `<div class="loot-row">${k === 'gold' ? coin : elixir}<div class="loot-track"><i data-lootbar="${k}" style="width:${pct((b.loot[k] / v[k]) * 100)}"></i></div><b data-loot="${k}">${n(b.loot[k])}</b><i>/ ${n(v[k])}</i></div>`;
    return `<div class="battle-enemy"><span class="eyebrow">ENEMY VILLAGE</span><h2>${v.name}</h2><small>LOOT TAKEN</small><div class="loot-bars">${lootBar('gold')}${lootBar('elixir')}</div></div>
 <div class="battle-clock ${b.started ? '' : 'prep'}"><span>${b.started ? 'BATTLE ENDS IN' : 'SCOUTING — BATTLE BEGINS IN'}</span><b id="battle-timer">${clock(b.started ? BATTLE_SECONDS - b.elapsed : b.prep)}</b></div>
 <div class="destruction"><span>Total destruction</span><div id="battle-stars" class="battle-stars">${'★'.repeat(b.stars)}<span>${'★'.repeat(3 - b.stars)}</span></div><b id="destruction-value">${b.destruction}%</b><div class="destruction-bar"><i id="destruction-fill" style="width:${pct(b.destruction)}"></i><span class="notch half" style="left:50%"></span><span class="notch full" style="left:100%"></span></div><small>★ 50% <i>·</i> ★ Town Hall <i>·</i> ★ 100%</small></div>
 ${!b.started ? `<div class="prep-banner">${icon('Timer', 20)}<div><b>Scout the base</b><small>Deploy a troop to start the battle early</small></div></div>` : ''}
 <div class="battle-bottom"><button class="game-btn red end-battle" data-action="${b.started ? 'surrender' : 'home'}">${icon('Flag', 23)} ${b.started ? 'Surrender' : 'Return home'}</button><div class="deploy-tray"><div class="deploy-label">${m.activeSpell ? `Tap anywhere to cast ${SPELLS[m.activeSpell].name}` : 'Tap to deploy · hold and drag to spread troops · double-tap for five'}</div><div class="army-tray">${TROOP_KEYS.map((k) => this.troopCard(k, b.remaining[k], `troop:${k}`, !m.activeSpell && m.activeTroop === k)).join('')}${
   SPELL_KEYS.some((k) => b.spells[k])
     ? `<span class="tray-divider"></span>${SPELL_KEYS.filter((k) => b.spells[k])
         .map((k) => this.spellCard(k, b.spells[k], `spell:${k}`, m.activeSpell === k))
         .join('')}`
     : ''
 }</div></div><div class="battle-tip">${icon('MousePointer2', 19)}<span>Troops <b>1–5</b> · Spells <b>6–8</b><br>Drag the base to move the camera</span></div></div>`;
  }

  // ----------------------------------------------------------------- drawer
  private drawer() {
    if (!this.drawerPanel || this.model.battle) return '';
    const titles = { shop: 'Shop', army: 'Army' };
    const body = this.drawerPanel === 'shop' ? this.shop() : this.army();
    return `<section class="drawer-sheet" aria-label="${titles[this.drawerPanel]}"><header class="drawer-head"><h2>${titles[this.drawerPanel]}</h2>${this.drawerPanel === 'shop' ? `<div class="shop-tabs" role="tablist" aria-label="Building category">${['All', 'Resources', 'Army', 'Defenses'].map((t) => button(`tab:${t}`, t, `tab ${this.tab === t ? 'active' : ''}`, `role="tab" aria-selected="${this.tab === t}"`)).join('')}</div>` : `<div class="drawer-meta">${icon('Tent', 17)} ${this.model.armySize + this.model.queuedSize}/${this.model.capacity} spaces ${this.model.spellCapacity ? `<i>·</i> ${icon('Sparkles', 15)} ${this.model.spellCount + this.model.queuedSpellCount}/${this.model.spellCapacity} spells` : ''}</div>`}<button class="square-btn small close-btn" data-action="close-drawer" aria-label="Close">${icon('X', 22)}</button></header>${body}</section>`;
  }
  private shop() {
    const m = this.model;
    const cards = (Object.entries(BUILDINGS) as [BuildingKind, (typeof BUILDINGS)[BuildingKind]][])
      .filter(([k, d]) => k !== 'townhall' && (this.tab === 'All' || d.category === this.tab))
      .map(([k, d]) => {
        const count = m.countOf(k),
          limit = m.maxCount(k);
        const locked = limit === 0;
        const full = !locked && count >= limit;
        const afford = m.state[d.resource] >= d.cost;
        return `<article class="shop-tile ${full || locked ? 'unavailable' : ''}" ${full || locked ? '' : `data-drag="${k}"`}><div class="shop-tile-art"><img src="${asset(k)}" alt="" draggable="false"></div><h3>${d.name}</h3><small class="shop-count">${locked ? 'Town Hall 2' : `${count}/${limit}`}</small>${button(`build:${k}`, locked ? `${icon('LockKeyhole', 13)} Locked` : full ? 'At limit' : `${resource(d.resource)} ${n(d.cost)}`, `game-btn ${locked || full || !afford ? 'stone' : 'green'} shop-buy`, locked || full ? 'disabled' : '')}</article>`;
      })
      .join('');
    return `<div class="drawer-body shop-strip">${cards}</div><footer class="drawer-foot">${icon('Hammer', 16)} ${m.builders - m.busy} of ${m.builders} builders free <span>Drag a building onto the village, or tap to pick it up</span></footer>`;
  }
  private army() {
    const m = this.model;
    const troopTile = (k: TroopKind) => {
      const d = m.troopStats(k);
      const blocked = m.armySize + m.queuedSize + d.space > m.capacity;
      return `<article class="shop-tile"><div class="shop-tile-art"><img src="${asset(k)}" alt="" draggable="false">${d.flying ? '<span class="air-tag">AIR</span>' : ''}</div><h3>${d.name} <small>★${m.troopLevel(k)}</small></h3><small class="shop-count">${icon('Heart', 11)} ${d.hp} ${icon('Swords', 11)} ${d.damage} ${icon('Users', 11)} ${d.space}</small>${button(`train:${k}`, `${elixir} ${n(d.cost)}`, `game-btn ${blocked ? 'stone' : 'green'} shop-buy`, blocked ? 'disabled' : '')}${button(`train-five:${k}`, `×5`, 'game-btn stone shop-buy tiny', blocked || m.armySize + m.queuedSize + d.space * 5 > m.capacity || m.state.elixir < d.cost * 5 ? 'disabled' : '')}<small class="shop-note">${time(m.trainingTime(k))} · ${m.state.army[k]} ready</small></article>`;
    };
    const spellTile = (k: SpellKind) => {
      const d = SPELLS[k];
      const blocked = m.spellCount + m.queuedSpellCount >= m.spellCapacity;
      return `<article class="shop-tile ${m.spellCapacity ? '' : 'unavailable'}"><div class="shop-tile-art"><img src="${asset(k)}" alt="" draggable="false"></div><h3>${d.name.replace(' Spell', '')}</h3><small class="shop-count">${d.effect}</small>${button(`brew:${k}`, m.spellCapacity ? `${elixir} ${n(d.cost)}` : `${icon('LockKeyhole', 13)} Factory`, `game-btn ${blocked || !m.spellCapacity ? 'stone' : 'green'} shop-buy`, blocked || !m.spellCapacity ? 'disabled' : '')}<small class="shop-note">${time(d.time)} · ${m.state.spells[k]} ready</small></article>`;
    };
    const queue = [
      ...m.state.queue.map((q) => ({ kind: q.kind as string, end: q.end })),
      ...m.state.spellQueue.map((q) => ({ kind: q.kind as string, end: q.end })),
    ].sort((a, b) => a.end - b.end);
    return `<div class="drawer-body army-strip"><div class="army-actions">${button('research', `${icon('FlaskConical', 17)} Research`, 'game-btn blue')}${button('retrain', `${icon('RotateCcw', 17)} Last army`, 'game-btn stone', m.state.lastArmy ? '' : 'disabled')}</div>${TROOP_KEYS.map(troopTile).join('')}<span class="tray-divider tall"></span>${SPELL_KEYS.map(spellTile).join('')}</div><footer class="drawer-foot">${elixir} ${n(m.state.elixir)} elixir <span>${
      queue.length
        ? `${icon('Clock3', 15)} ${queue.length} in the queue — next in <b data-queue>${time((queue[0].end - m.clock) / 1000)}</b>`
        : 'Nothing training right now'
    }</span></footer>`;
  }

  // ----------------------------------------------------------------- modals
  private modal() {
    const titles: Record<string, string> = {
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
      research: 'A little elixir. A stronger army.',
      campaign: 'Beyond the forest, a whole valley is waiting.',
      settings: 'Make yourself at home.',
      achievements: 'Small victories. A growing legend.',
      help: 'Your village. Your army. Your adventure.',
      info: 'What this level gives you, and what the next one adds.',
      layouts: 'Three slots. Rearrange freely, restore instantly.',
      surrender: 'Your loot so far is kept.',
    };
    const content =
      this.panel === 'campaign'
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
    return `<div class="modal-backdrop"><section class="modal ${this.panel === 'campaign' ? 'campaign-modal' : ''} ${this.panel === 'surrender' ? 'small-modal' : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header class="modal-header"><div><small>CROWN & CLAN</small><h1 id="modal-title">${titles[this.panel!]}</h1><p>${subtitles[this.panel!]}</p></div><button class="square-btn small close-btn" data-action="close" aria-label="Close dialog">${icon('X', 25)}</button></header>${content}</section></div>`;
  }
  private surrender() {
    const b = this.model.battle!;
    return `<div class="modal-body confirm-body"><p class="confirm-line">${icon('TriangleAlert', 34)} You are at <b>${b.destruction}% destruction</b> with <b>${b.stars} ${b.stars === 1 ? 'star' : 'stars'}</b>. Ending now keeps that result and any loot already taken.</p><div class="confirm-actions">${button('close', 'Keep fighting', 'game-btn stone')}${button('end', `${icon('Flag', 18)} End battle`, 'game-btn red')}</div></div>`;
  }
  private info() {
    const m = this.model;
    const b = m.state.buildings.find((v) => v.id === m.selected);
    if (!b) return '<div class="modal-body"><p>Select a building first.</p></div>';
    const d = BUILDINGS[b.kind];
    const capped = b.level >= d.maxLevel;
    const gated = !capped && b.level >= m.maxLevel(b.kind);
    const now = statRows(b.kind, b.level);
    const next = capped ? [] : statRows(b.kind, b.level + 1);
    return `<div class="modal-body info-body"><div class="info-hero"><img src="${asset(b.kind, b.level)}" alt=""><div><span class="eyebrow">${d.category.toUpperCase()} · LEVEL ${b.level} OF ${d.maxLevel}</span><h2>${d.name}</h2><p>${d.description}</p><div class="info-levels">${Array.from({ length: d.maxLevel }, (_, i) => `<i class="${i < b.level ? 'on' : ''}"></i>`).join('')}</div></div></div>
 <table class="info-table"><thead><tr><th>Stat</th><th>Level ${b.level}</th><th>${capped ? 'Max' : `Level ${b.level + 1}`}</th></tr></thead><tbody>${now
   .map(([ic, label, value], i) => {
     const after = next[i]?.[2];
     const changed = after !== undefined && after !== value;
     return `<tr><td>${icon(ic, 15)} ${label}</td><td>${value}</td><td class="${changed ? 'better' : 'same'}">${capped ? '—' : changed ? `${after} ${icon('ArrowBigUp', 13)}` : after}</td></tr>`;
   })
   .join('')}</tbody></table>
 <div class="info-upgrade">${
   capped
     ? `<span class="max-level">★ Fully upgraded</span>`
     : gated
       ? `<span class="max-level locked">${icon('LockKeyhole', 15)} Upgrade your Town Hall past level ${m.townhallLevel} first</span>`
       : `<div class="info-cost"><span>${resource(d.resource)} <b>${n(costFor(b.kind, b.level))}</b></span><span>${icon('Clock3', 15)} <b>${time(upgradeSeconds(b.kind, b.level))}</b></span><span>${icon('Hammer', 15)} <b>${m.builders - m.busy} free</b></span></div>${button(`upgrade:${b.id}`, `${icon('ArrowBigUp', 19)} Upgrade to level ${b.level + 1}`, 'game-btn green', b.upgradeEnd || m.busy >= m.builders ? 'disabled' : '')}`
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
        return `<article class="layout-row"><div class="layout-icon">${icon('LayoutGrid', 24)}</div><div><h3>${layout?.name ?? `Layout ${i + 1}`}</h3><p>${filled ? `${layout!.slots.length} buildings stored` : 'Empty slot'}</p></div><div class="layout-actions">${button(`layout-save:${i}`, `${icon('Save', 16)} Save`, 'game-btn stone')}${button(`layout-load:${i}`, `${icon('RotateCcw', 16)} Restore`, 'game-btn green', filled ? '' : 'disabled')}</div></article>`;
      })
      .join('')}</div>`;
  }
  private research() {
    const m = this.model,
      lab = m.state.buildings.find((b) => b.kind === 'laboratory' && !b.constructing);
    const r = m.state.research;
    return `<div class="modal-body"><div class="research-banner"><img src="${asset('laboratory', lab?.level ?? 1)}" alt=""><div><span class="eyebrow">LABORATORY LEVEL ${lab?.level ?? 0}</span><h2>${r ? `${TROOPS[r.kind].name} research` : 'Make every troop count'}</h2><p>${r ? 'Your next upgrade is on its way.' : 'Research permanently increases troop health and damage. Upgrade the laboratory to unlock higher levels.'}</p>${r ? `<div class="research-status"><strong data-research>${time((r.end - m.clock) / 1000)}</strong>${button('research-finish', `Finish ${gem} <span data-research-cost>${m.finishCost({ upgradeEnd: r.end } as Building)}</span>`, 'game-btn green')}</div>` : ''}</div></div><div class="training-grid research-grid">${TROOP_KEYS.map(
      (k) => {
        const d = m.troopStats(k),
          level = m.troopLevel(k),
          max = level >= 3;
        const gated = !lab || !!lab.upgradeEnd || lab.level <= level;
        const next = 1 + level * 0.3;
        const label = max
          ? '★ Fully researched'
          : gated
            ? `Requires laboratory ${level + 1}`
            : `Research ${elixir} ${n(m.researchCost(k))}`;
        return `<article class="training-card"><span class="role-tag">LEVEL ${level}${max ? ' · MAX' : ` → ${level + 1}`}</span><div class="training-art"><img src="${asset(k)}" alt=""></div><h3>${d.name}</h3><div class="research-stats"><span>${icon('Heart', 16)} Health <b>${d.hp}${max ? '' : ` <em>→ ${Math.round(TROOPS[k].hp * next)}</em>`}</b></span><span>${icon('Swords', 16)} Damage <b>${d.damage}${max ? '' : ` <em>→ ${Math.round(TROOPS[k].damage * next)}</em>`}</b></span></div>${button(`research-start:${k}`, label, 'game-btn ' + (max || gated ? 'stone' : 'green'), max || gated || !!r || m.state.elixir < m.researchCost(k) ? 'disabled' : '')}<small>${max ? 'Ready for the toughest battles' : `${time(m.researchSeconds(k))} research · permanent upgrade`}</small></article>`;
      },
    ).join(
      '',
    )}</div></div><footer class="modal-footer">${elixir} ${n(m.state.elixir)} elixir available <span>One research project at a time</span></footer>`;
  }
  private campaignMap(index: number) {
    return `<svg class="campaign-map" viewBox="0 0 30 30" role="img" aria-label="${CAMPAIGN[index].name} base layout"><rect width="30" height="30" rx="3" fill="#637d43"/>${campaignBlueprint(
      index,
    )
      .map(
        ([k, x, y]) =>
          `<rect x="${x + 1}" y="${y + 1}" width="${BUILDINGS[k].size - 0.18}" height="${BUILDINGS[k].size - 0.18}" rx=".25" fill="${k === 'wall' ? '#b9ada0' : k === 'townhall' ? '#f3a442' : k === 'airdefense' ? '#5fb6d8' : BUILDINGS[k].damage ? '#655666' : '#e0cf97'}"/>`,
      )
      .join('')}</svg>`;
  }
  private campaign() {
    return `<div class="campaign-summary">${icon('Map', 23)} <span>12 villages to conquer</span><b>${this.model.state.stars.reduce((a, b) => a + b, 0)} / 36 ${icon('Star', 17)}</b></div><div class="modal-body campaign-list">${CAMPAIGN.map(
      (v, i) => {
        const locked = i > 0 && !this.model.state.stars[i - 1],
          stars = this.model.state.stars[i] ?? 0;
        const air = campaignBlueprint(i).some(([k]) => k === 'airdefense');
        return `<article class="campaign-card ${locked ? 'locked' : ''}"><div class="campaign-number">${locked ? icon('LockKeyhole', 22) : i + 1}</div>${this.campaignMap(i)}<div class="campaign-info"><span>${v.difficulty}${air ? ' · AIR DEFENSE' : ''}</span><h3>${v.name}</h3><p>${CAMPAIGN_LAYOUTS[i].hint}</p><small class="campaign-recommendation">Suggested army: ${CAMPAIGN_LAYOUTS[i].recommended} spaces${i > 6 ? ' · researched troops' : ''}</small><div>${coin} ${n(v.gold)} ${elixir} ${n(v.elixir)}</div></div><div class="campaign-action"><div class="campaign-stars">${'★'.repeat(stars)}<span>${'★'.repeat(3 - stars)}</span></div>${button(`attack:${i}`, locked ? 'Locked' : `Attack ${icon('ArrowRight', 17)}`, 'game-btn ' + (locked ? 'stone' : 'orange'), locked ? 'disabled' : '')}</div></article>`;
      },
    ).join(
      '',
    )}</div><footer class="modal-footer">${icon('Swords', 18)} ${this.model.armySize} army spaces ready <span>Earn a star to unlock the next village</span></footer>`;
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
  private achievements() {
    const s = this.model.state;
    return `<div class="modal-body"><div class="league-banner">${icon('Trophy', 49)}<div><h2>${this.model.league}</h2><p>${n(s.trophies)} trophies · Chief level ${this.model.chiefLevel}</p></div></div><div class="quest-list">${this.model.quests.map((q) => `<article class="quest"><div class="quest-icon">${icon(q.icon, 28)}</div><div><h3>${q.title} ${q.claimed ? '<span class="completed">Claimed</span>' : ''}</h3><p>${q.description}</p><div class="quest-progress"><i style="width:${pct((q.progress / q.target) * 100)}"></i></div><small class="quest-count">${n(Math.min(q.progress, q.target))} / ${n(q.target)}</small></div>${q.claimed ? `<b class="claimed-check">${icon('ShieldCheck', 23)}</b>` : button(`claim:${q.id}`, `${gem} ${q.reward}`, 'game-btn green quest-claim', q.progress < q.target ? 'disabled' : '')}</article>`).join('')}</div></div>`;
  }
  private help() {
    return `<div class="modal-body help-body"><div class="guide-hero"><img src="${asset('swordsman')}" alt="Your swordsman guide"><div><h2>Good to see you, Chief!</h2><p>The builders are ready, the gold is flowing, and your troops are itching for an adventure. Let's make this village a kingdom.</p></div></div><div class="help-steps"><article><b>1</b><div><h3>Build and rearrange</h3><p>Open the Shop and drag a building straight onto the village. Use Edit mode to drag anything already built — with undo, redo and three saved layouts.</p></div></article><article><b>2</b><div><h3>Grow past the Town Hall</h3><p>Every building is capped one level above your Town Hall, so upgrading it unlocks the next tier of everything. Collectors keep working while you're away, up to 8 hours.</p></div></article><article><b>3</b><div><h3>Raise an army. Raid the valley.</h3><p>Train troops and brew spells, then attack. You get 30 seconds to scout before the clock starts. Balloons fly over walls; only Air Defenses can touch them.</p></div></article></div><div class="help-controls"><span>Drag <b>Move camera</b></span><span>Hold &amp; drag <b>Spread troops</b></span><span>Double-tap <b>Deploy five</b></span><span>Esc <b>Close / cancel</b></span></div>${button('tutorial', `Let's build ${icon('ArrowRight', 19)}`, 'game-btn green start-btn')}</div>`;
  }
  private result() {
    const r = this.model.battle!.result!;
    return `<div class="modal-backdrop result-backdrop"><section class="result-modal" role="dialog" aria-modal="true" aria-labelledby="result-title"><div class="result-rays"></div><span class="result-eyebrow">BATTLE COMPLETE</span><h1 id="result-title">${r.stars ? 'Victory!' : 'A brave attempt'}</h1><div class="result-stars">${[0, 1, 2].map((i) => `<span class="${i < r.stars ? 'earned' : ''}">★</span>`).join('')}</div><p>${r.destruction}% destruction <span>·</span> ${CAMPAIGN[this.model.battle!.index].name}</p><div class="result-loot"><div>${coin}<b>${n(r.gold)}</b><small>Gold looted</small></div><div>${elixir}<b>${n(r.elixir)}</b><small>Elixir looted</small></div><div>${icon('Trophy', 35)}<b>${r.trophies > 0 ? '+' : ''}${r.trophies}</b><small>Trophies</small></div></div>${button('home', `${icon('House', 22)} Return to village`, 'game-btn green')}<small class="result-note">Your undeployed troops are waiting at home.</small></section></div>`;
  }
  private updateLive() {
    const m = this.model;
    document
      .querySelectorAll<HTMLElement>('[data-resource]')
      .forEach(
        (el) => (el.textContent = n(m.state[el.dataset.resource as 'gold' | 'elixir' | 'gems'])),
      );
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
    const b = m.battle;
    if (b) {
      const timer = document.querySelector('#battle-timer');
      if (timer) timer.textContent = clock(b.started ? BATTLE_SECONDS - b.elapsed : b.prep);
      const val = document.querySelector('#destruction-value');
      if (val) val.textContent = `${b.destruction}%`;
      const fill = document.querySelector<HTMLElement>('#destruction-fill');
      if (fill) fill.style.width = pct(b.destruction);
      const stars = document.querySelector('#battle-stars');
      if (stars) stars.innerHTML = `${'★'.repeat(b.stars)}<span>${'★'.repeat(3 - b.stars)}</span>`;
      for (const k of ['gold', 'elixir'] as const) {
        const el = document.querySelector(`[data-loot="${k}"]`);
        if (el) el.textContent = n(b.loot[k]);
        const bar = document.querySelector<HTMLElement>(`[data-lootbar="${k}"]`);
        if (bar) bar.style.width = pct((b.loot[k] / CAMPAIGN[b.index][k]) * 100);
      }
    }
  }
}
