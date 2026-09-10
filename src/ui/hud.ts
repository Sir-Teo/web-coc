import { CAMPAIGN_LAYOUTS, campaignBlueprint } from '../game/campaign';
import {
  BUILDINGS,
  TROOPS,
  TROOP_KEYS,
  CAMPAIGN,
  asset,
  type BuildingKind,
  type TroopKind,
} from '../game/data';
import { GameModel } from '../game/model';
import { VillageScene } from '../game/scene';
import { AudioManager } from '../game/audio';
import { exportSave, validateSave, saveGame } from '../game/save';
import { icon, resource, coin, elixir, gem } from './icons';
type Panel =
  'research' | 'shop' | 'army' | 'campaign' | 'settings' | 'achievements' | 'help' | null;
const n = (v: number) => Math.floor(v).toLocaleString('en-US');
const time = (seconds: number) => {
  const s = Math.max(0, Math.ceil(seconds));
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
};
const button = (action: string, label: string, cls = 'game-btn green', extra = '') =>
  `<button class="${cls}" data-action="${action}" ${extra}>${label}</button>`;
export class HUD {
  private root: HTMLElement;
  private panel: Panel = null;
  private tab = 'All';
  private toastTimer?: ReturnType<typeof setTimeout>;
  private resultShown = false;
  private raf = false;
  private lastPanel: Panel = null;
  private focusBefore: HTMLElement | null = null;
  constructor(
    private model: GameModel,
    private scene: VillageScene,
    private audio: AudioManager,
  ) {
    this.root = document.querySelector('#ui')!;
    this.root.innerHTML =
      '<div id="hud"></div><div id="context"></div><div id="modal-root"></div><div id="toast" role="status" aria-live="polite"></div><div id="save-state" aria-live="polite"></div><input id="import-file" type="file" accept="application/json,.json" hidden>';
    this.root.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (target && !(target as HTMLButtonElement).disabled) {
        this.audio.play('click');
        this.action(target.dataset.action!);
      }
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
      this.render();
    };
    this.render();
    setInterval(() => this.updateLive(), 250);
  }
  private scheduleRender() {
    if (this.raf) return;
    this.raf = true;
    requestAnimationFrame(() => {
      this.raf = false;
      this.render();
    });
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
    this.panel = panel;
    if (panel) {
      this.model.cancel();
      this.focusBefore = document.activeElement as HTMLElement;
    }
    this.render();
  }
  private restoreFocus() {
    const action = this.focusBefore?.dataset.action;
    if (action)
      Array.from(document.querySelectorAll<HTMLElement>('[data-action]'))
        .find((el) => el.dataset.action === action)
        ?.focus({ preventScroll: true });
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
      case 'shop':
        this.tab = 'All';
        this.show('shop');
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
      case 'retrain':
        m.retrain();
        break;
      case 'army':
        this.show('army');
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
        if (m.placement) this.panel = null;
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
          this.resultShown = false;
          this.audio.play('deploy');
        }
        this.render();
        break;
      case 'troop':
        m.activeTroop = arg as TroopKind;
        this.render();
        break;
      case 'end':
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
      } else this.model.cancel();
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
    if (['1', '2', '3', '4'].includes(e.key) && this.model.battle) {
      this.model.activeTroop = TROOP_KEYS[Number(e.key) - 1];
      this.render();
    }
    if (e.key === '+' || e.key === '=') this.scene.zoomBy(1.15);
    if (e.key === '-') this.scene.zoomBy(1 / 1.15);
  }
  render() {
    const m = this.model,
      b = m.battle;
    const modalScroller = document.querySelector('.modal-body');
    const scroll = modalScroller?.scrollTop ?? 0;
    const focused = (document.activeElement as HTMLElement)?.dataset?.action;
    document.querySelector('#hud')!.innerHTML = b ? this.battleHUD() : this.homeHUD();
    document.querySelector('#context')!.innerHTML = this.context();
    const result = b?.finished;
    this.scene.uiBlocked = !!this.panel || !!result;
    (document.querySelector('#hud') as HTMLElement).inert = this.scene.uiBlocked;
    (document.querySelector('#context') as HTMLElement).inert = this.scene.uiBlocked;
    document.querySelector('#modal-root')!.innerHTML = result
      ? this.result()
      : this.panel
        ? this.modal()
        : '';
    document.querySelector('.modal-body')?.scrollTo(0, scroll);
    if (this.panel !== this.lastPanel) {
      document.querySelector<HTMLElement>('.modal [data-action="close"]')?.focus();
      this.lastPanel = this.panel;
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
    const s = this.model.state;
    const free = this.model.builders - this.model.busy;
    return `
 <header class="player-hud"><button class="level-shield" data-action="achievements" aria-label="Chief level ${this.model.chiefLevel}">${this.model.chiefLevel}</button><div class="player-info"><div class="eyebrow">CHIEF'S VILLAGE</div><div class="player-name">Oakheart <span class="online-dot"></span></div><button class="trophy-pill" data-action="achievements">${icon('Trophy', 17)} <b>${n(s.trophies)}</b> <span>${this.model.league}</span></button></div></header>
 <div class="village-status"><div class="brand">CROWN <span>&</span> CLAN</div><div class="status-chips"><button data-action="${this.model.busy ? 'achievements' : 'shop'}">${icon('Hammer', 20)} <b>${free}/${this.model.builders}</b> <span>Builders</span></button><button data-action="help">${icon('ShieldCheck', 20)} <b>Village safe</b></button></div></div>
 <div class="resources">${(['gold', 'elixir', 'gems'] as const).map((k, i) => `<div class="resource-bar ${k}"><div class="resource-fill" style="width:${k === 'gems' ? 66 : (s[k] / this.model.resourceCap(k)) * 100}%"></div><div class="resource-topline">${k === 'gems' ? 'Gems' : `Max: ${n(this.model.resourceCap(k))}`}</div><span class="resource-amount" data-resource="${k}">${n(s[k])}</span>${resource(k)}<button class="resource-plus" data-action="${i < 2 ? 'collect' : 'achievements'}" aria-label="${i < 2 ? 'Collect resources' : 'View achievements'}">+</button></div>`).join('')}</div>
 <nav class="left-tools" aria-label="Village activities"><button class="square-btn" data-action="campaign" aria-label="Campaign map">${icon('Map', 29)}<span class="notification">!</span></button><button class="square-btn" data-action="achievements" aria-label="Achievements">${icon('ScrollText', 27)}<span class="tool-label">Quests</span></button><button class="square-btn" data-action="help" aria-label="How to play">${icon('BookOpen', 27)}</button></nav>
 <div class="right-tools"><button class="square-btn small" data-action="settings" aria-label="Settings">${icon('Settings', 24)}</button><div class="camera-tools"><button data-action="zoom-in" aria-label="Zoom in">${icon('Plus', 20)}</button><button data-action="recenter" aria-label="Center village">${icon('LocateFixed', 18)}</button><button data-action="zoom-out" aria-label="Zoom out">${icon('Minus', 20)}</button></div></div>
 <div class="village-caption"><span class="caption-line"></span> HOME VILLAGE <span class="caption-line"></span><small>Town Hall Level ${s.buildings.find((v) => v.kind === 'townhall')?.level ?? 1}</small></div>
 <div class="bottom-left"><button class="attack-btn" data-action="campaign">${icon('Swords', 44)}<span>Attack!</span><small>SINGLE PLAYER</small></button></div>
 <div class="bottom-center">${!this.model.selected && !this.model.placement ? `<div class="army-label"><span>${icon('UsersRound', 16)} YOUR ARMY</span><button data-action="army">${this.model.armySize}/${this.model.capacity} ${icon('ChevronRight', 14)}</button></div><div class="army-tray">${TROOP_KEYS.map((k) => this.troopCard(k, s.army[k], 'army')).join('')}<button class="train-add" data-action="army" aria-label="Train troops">${icon('Plus', 24)}<small>Train</small></button></div>` : ''}</div>
 <div class="bottom-right"><button class="collect-btn" data-action="collect">${coin}<span>Collect</span></button><button class="shop-btn" data-action="shop">${icon('ShoppingBasket', 38)}<span>Shop</span><span class="new-badge">NEW</span></button></div>
 <div class="control-hint">Drag to explore <span>·</span> Scroll to zoom <span>·</span> Click a building</div>`;
  }
  private troopCard(k: TroopKind, count: number, action: string, selected = false) {
    return `<button class="troop-card ${selected ? 'selected' : ''} ${count === 0 ? 'empty' : ''}" data-action="${action}" aria-label="${TROOPS[k].name}, ${count} available" ${action.startsWith('troop') && count === 0 ? 'disabled' : ''}><span class="troop-count">x${count}</span><img src="${asset(k)}" alt="" draggable="false"><span class="troop-level">★ ${this.model.troopLevel(k)}</span><span class="troop-name">${TROOPS[k].name}</span></button>`;
  }
  private context() {
    const m = this.model;
    if (m.battle) return '';
    if (m.placement) {
      return `<div class="placement-banner">${icon('Move', 23)}<div><b>${m.moving ? 'Move' : 'Place'} ${BUILDINGS[m.placement].name}</b><small>Tap an empty green space to confirm</small></div>${button('cancel', icon('X', 20), 'square-btn small', 'aria-label="Cancel placement"')}</div>`;
    }
    const b = m.state.buildings.find((v) => v.id === m.selected);
    if (!b) return '';
    const d = BUILDINGS[b.kind];
    return `<div class="building-context"><img class="context-art" src="${asset(b.kind, b.level)}" alt=""><div class="context-info"><small>${d.category.toUpperCase()}</small><h2>${d.name}</h2><span>Level ${b.level} <i>·</i> ${icon('Heart', 13)} ${n(b.maxHp)} HP</span></div><div class="context-actions">${button(`move:${b.id}`, `${icon('Move', 21)}<span>Move</span>`, 'game-btn stone')}${b.upgradeEnd ? button(`finish:${b.id}`, `<small data-upgrade="${b.id}">${time((b.upgradeEnd - m.clock) / 1000)}</small><span>Finish ${gem} ${Math.max(1, Math.ceil((b.upgradeEnd - m.clock) / 10000))}</span>`) : b.level < 3 ? button(`upgrade:${b.id}`, `<span>${icon('ArrowBigUp', 19)} Upgrade</span><small>${resource(d.resource)} ${n(m.upgradeCost(b))}</small>`) : '<span class="max-level">★ Max level</span>'}${b.kind === 'laboratory' ? button('research', `${icon('FlaskConical', 20)} Research`, 'game-btn blue') : ''}${b.kind === 'barracks' || b.kind === 'camp' ? button('army', `${icon('Swords', 20)} Train`, 'game-btn blue') : ''}${b.kind === 'goldmine' || b.kind === 'collector' ? button('collect', `${coin} Collect`, 'game-btn gold') : ''}</div><button class="context-close" data-action="cancel" aria-label="Close building">${icon('X', 18)}</button></div>`;
  }
  private battleHUD() {
    const b = this.model.battle!,
      v = CAMPAIGN[b.index];
    return `<div class="battle-enemy"><span class="eyebrow">ENEMY VILLAGE</span><h2>${v.name}</h2><div class="loot-line">${coin}<b data-loot="gold">${n(v.gold - b.loot.gold)}</b>${elixir}<b data-loot="elixir">${n(v.elixir - b.loot.elixir)}</b></div><small>Available loot</small></div><div class="battle-clock"><span>${b.started ? 'BATTLE ENDS IN' : 'DEPLOY YOUR TROOPS'}</span><b id="battle-timer">${b.started ? time(180 - b.elapsed) : '3m 00s'}</b></div><div class="destruction"><span>Total destruction</span><div id="battle-stars">${'★'.repeat(b.stars)}<span>${'★'.repeat(3 - b.stars)}</span></div><b id="destruction-value">${b.destruction}%</b></div><div class="battle-bottom"><button class="game-btn red end-battle" data-action="${b.started ? 'end' : 'home'}">${icon('Flag', 23)} ${b.started ? 'End battle' : 'Return home'}</button><div class="deploy-tray"><div class="deploy-label">${b.started ? 'Tap outside the base to deploy' : 'Select a troop, then tap outside the red boundary'}</div><div class="army-tray">${TROOP_KEYS.map((k) => this.troopCard(k, b.remaining[k], `troop:${k}`, this.model.activeTroop === k)).join('')}</div></div><div class="battle-tip">${icon('MousePointer2', 19)}<span>Choose troops with <b>1–4</b><br>Drag to move the camera</span></div></div>`;
  }
  private modal() {
    const titles = {
      research: 'The laboratory',
      shop: 'Build your village',
      army: 'Raise your army',
      campaign: 'The Goblin Valley',
      settings: 'Settings',
      achievements: 'Your legacy',
      help: 'Welcome, Chief',
    };
    const subtitles = {
      research: 'A little elixir. A stronger army.',
      shop: 'Every great kingdom starts with a few good buildings.',
      army: 'A strong army is the beginning of every great adventure.',
      campaign: 'Beyond the forest, a whole valley is waiting.',
      settings: 'Make yourself at home.',
      achievements: 'Small victories. A growing legend.',
      help: 'Your village. Your army. Your adventure.',
    };
    const content =
      this.panel === 'shop'
        ? this.shop()
        : this.panel === 'army'
          ? this.army()
          : this.panel === 'campaign'
            ? this.campaign()
            : this.panel === 'settings'
              ? this.settings()
              : this.panel === 'achievements'
                ? this.achievements()
                : this.panel === 'research'
                  ? this.research()
                  : this.help();
    return `<div class="modal-backdrop"><section class="modal ${this.panel === 'campaign' ? 'campaign-modal' : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header class="modal-header"><div><small>CROWN & CLAN</small><h1 id="modal-title">${titles[this.panel!]}</h1><p>${subtitles[this.panel!]}</p></div><button class="square-btn small close-btn" data-action="close" aria-label="Close dialog">${icon('X', 25)}</button></header>${content}</section></div>`;
  }
  private shop() {
    return `<div class="shop-tabs" role="tablist" aria-label="Building category">${['All', 'Resources', 'Army', 'Defenses'].map((t) => button(`tab:${t}`, t, `tab ${this.tab === t ? 'active' : ''}`, `role="tab" aria-selected="${this.tab === t}"`)).join('')}</div><div class="modal-body shop-grid">${(
      Object.entries(BUILDINGS) as [BuildingKind, (typeof BUILDINGS)[BuildingKind]][]
    )
      .filter(([k, d]) => k !== 'townhall' && (this.tab === 'All' || d.category === this.tab))
      .map(([k, d]) => {
        const count = this.model.state.buildings.filter((b) => b.kind === k).length;
        return `<article class="shop-card"><div class="shop-card-top"><span>${d.category}</span><b>${count}/${d.max}</b></div><div class="shop-art"><img src="${asset(k)}" alt="${d.name}"></div><h3>${d.name}</h3><p>${d.description}</p>${button(`build:${k}`, count >= d.max ? 'Built to limit' : `${resource(d.resource)} ${n(d.cost)}`, 'game-btn green', count >= d.max ? 'disabled' : '')}</article>`;
      })
      .join(
        '',
      )}</div><footer class="modal-footer">${icon('Hammer', 17)} ${this.model.builders - this.model.busy} builders available <span>Place buildings on empty village ground</span></footer>`;
  }
  private army() {
    const m = this.model;
    return `<div class="army-capacity"><span>${icon('Tent', 22)} Army camp capacity</span><b>${m.armySize + m.queuedSize} / ${m.capacity}</b><div><i style="width:${Math.min(100, ((m.armySize + m.queuedSize) / m.capacity) * 100)}%"></i></div></div><div class="modal-body"><div class="army-tools">${button('research', `${icon('FlaskConical', 18)} Research`, 'game-btn blue')}${button('retrain', `${icon('RotateCcw', 18)} Train previous army`, 'game-btn stone', m.state.lastArmy ? '' : 'disabled')}</div><div class="training-grid">${TROOP_KEYS.map(
      (k) => {
        const d = m.troopStats(k);
        return `<article class="training-card"><span class="role-tag">${d.role}</span><div class="training-art"><img src="${asset(k)}" alt="${d.name}"></div><h3>${d.name} <small>★ ${m.troopLevel(k)}</small></h3><p>${d.description}</p><div class="unit-stats"><span>${icon('Heart', 14)} ${d.hp}</span><span>${icon('Swords', 14)} ${d.damage}</span><span>${icon('Users', 14)} ${d.space}</span></div>${button(`train:${k}`, `Train ${elixir} ${d.cost}`, 'game-btn green', m.armySize + m.queuedSize + d.space > m.capacity ? 'disabled' : '')}${button(`train-five:${k}`, `Train 5 ${elixir} ${n(d.cost * 5)}`, 'game-btn stone batch-train', m.armySize + m.queuedSize + d.space * 5 > m.capacity || m.state.elixir < d.cost * 5 ? 'disabled' : '')}<small>${time(m.trainingTime(k))} training · ${m.state.army[k]} ready</small></article>`;
      },
    ).join(
      '',
    )}</div><div class="training-queue"><h3>${icon('Clock3', 20)} Training queue <span>${m.state.queue.length}</span></h3>${
      m.state.queue.length
        ? `<div class="queue-items">${m.state.queue
            .slice(0, 12)
            .map(
              (q, i) =>
                `<div><img src="${asset(q.kind)}" alt="${TROOPS[q.kind].name}"><small>${i === 0 ? `<span data-queue>${time((q.end - m.clock) / 1000)}</span>` : 'Queued'}</small></div>`,
            )
            .join('')}</div>`
        : '<p>Your barracks are ready. Choose a troop to start training.</p>'
    }</div></div><footer class="modal-footer">${elixir} ${n(m.state.elixir)} elixir available <span>Deployed troops are spent after a raid</span></footer>`;
  }
  private research() {
    const m = this.model,
      lab = m.state.buildings.find((b) => b.kind === 'laboratory' && !b.constructing);
    const r = m.state.research;
    return `<div class="modal-body"><div class="research-banner"><img src="${asset('laboratory', lab?.level ?? 1)}" alt=""><div><span class="eyebrow">LABORATORY LEVEL ${lab?.level ?? 0}</span><h2>${r ? `${TROOPS[r.kind].name} research` : 'Make every troop count'}</h2><p>${r ? 'Your next upgrade is on its way.' : 'Research permanently increases troop health and damage. Upgrade the laboratory to unlock higher levels.'}</p>${r ? `<div class="research-status"><strong data-research>${time((r.end - m.clock) / 1000)}</strong>${button('research-finish', `Finish ${gem} <span data-research-cost>${Math.max(1, Math.ceil((r.end - m.clock) / 10000))}</span>`, 'game-btn green')}</div>` : ''}</div></div><div class="training-grid research-grid">${TROOP_KEYS.map(
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
        return `<article class="training-card"><span class="role-tag">LEVEL ${level}${max ? ' · MAX' : ` → ${level + 1}`}</span><div class="training-art"><img src="${asset(k)}" alt=""></div><h3>${d.name}</h3><div class="research-stats"><span>${icon('Heart', 16)} Health <b>${d.hp}${max ? '' : ` <em>→ ${Math.round(TROOPS[k].hp * next)}</em>`}</b></span><span>${icon('Swords', 16)} Damage <b>${d.damage}${max ? '' : ` <em>→ ${Math.round(TROOPS[k].damage * next)}</em>`}</b></span></div>${button(`research-start:${k}`, label, 'game-btn ' + (max || gated ? 'stone' : 'green'), max || gated || !!r || m.state.elixir < m.researchCost(k) ? 'disabled' : '')}<small>${max ? 'Ready for the toughest battles' : `${time(30 + 15 * level)} research · permanent upgrade`}</small></article>`;
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
          `<rect x="${x + 1}" y="${y + 1}" width="${BUILDINGS[k].size - 0.18}" height="${BUILDINGS[k].size - 0.18}" rx=".25" fill="${k === 'wall' ? '#b9ada0' : k === 'townhall' ? '#f3a442' : BUILDINGS[k].damage ? '#655666' : '#e0cf97'}"/>`,
      )
      .join('')}</svg>`;
  }
  private campaign() {
    return `<div class="campaign-summary">${icon('Map', 23)} <span>12 villages to conquer</span><b>${this.model.state.stars.reduce((a, b) => a + b, 0)} / 36 ${icon('Star', 17)}</b></div><div class="modal-body campaign-list">${CAMPAIGN.map(
      (v, i) => {
        const locked = i > 0 && !this.model.state.stars[i - 1],
          stars = this.model.state.stars[i] ?? 0;
        return `<article class="campaign-card ${locked ? 'locked' : ''}"><div class="campaign-number">${locked ? icon('LockKeyhole', 22) : i + 1}</div>${this.campaignMap(i)}<div class="campaign-info"><span>${v.difficulty}</span><h3>${v.name}</h3><p>${CAMPAIGN_LAYOUTS[i].hint}</p><small class="campaign-recommendation">Suggested army: ${CAMPAIGN_LAYOUTS[i].recommended} spaces${i > 6 ? ' · researched troops' : ''}</small><div>${coin} ${n(v.gold)} ${elixir} ${n(v.elixir)}</div></div><div class="campaign-action"><div class="campaign-stars">${'★'.repeat(stars)}<span>${'★'.repeat(3 - stars)}</span></div>${button(`attack:${i}`, locked ? 'Locked' : `Attack ${icon('ArrowRight', 17)}`, 'game-btn ' + (locked ? 'stone' : 'orange'), locked ? 'disabled' : '')}</div></article>`;
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
      )}<div class="save-section"><h3>${icon('Save', 20)} Your village, saved</h3><p>Progress is saved automatically in this browser. Export a backup to keep it safe or move to another device. Importing replaces this village.</p><div>${button('export', `${icon('Download', 18)} Export village`, 'game-btn blue')}${button('import', `${icon('Upload', 18)} Import backup`, 'game-btn stone')}</div></div><div class="settings-note">Frontend-only · Playable offline after your first visit<br>Version 0.1 · Original artwork created for Crown & Clan</div></div>`;
  }
  private achievements() {
    const s = this.model.state;
    return `<div class="modal-body"><div class="league-banner">${icon('Trophy', 49)}<div><h2>${this.model.league}</h2><p>${n(s.trophies)} trophies · Chief level ${this.model.chiefLevel}</p></div></div><div class="quest-list">${this.model.quests.map((q) => `<article class="quest"><div class="quest-icon">${icon(q.icon, 28)}</div><div><h3>${q.title} ${q.claimed ? '<span class="completed">Claimed</span>' : ''}</h3><p>${q.description}</p><div class="quest-progress"><i style="width:${Math.min(100, (q.progress / q.target) * 100)}%"></i></div><small class="quest-count">${n(Math.min(q.progress, q.target))} / ${n(q.target)}</small></div>${q.claimed ? `<b class="claimed-check">${icon('ShieldCheck', 23)}</b>` : button(`claim:${q.id}`, `${gem} ${q.reward}`, 'game-btn green quest-claim', q.progress < q.target ? 'disabled' : '')}</article>`).join('')}</div></div>`;
  }
  private help() {
    return `<div class="modal-body help-body"><div class="guide-hero"><img src="${asset('swordsman')}" alt="Your swordsman guide"><div><h2>Good to see you, Chief!</h2><p>The builders are ready, the gold is flowing, and your troops are itching for an adventure. Let's make this village a kingdom.</p></div></div><div class="help-steps"><article><b>1</b><div><h3>Build something great</h3><p>Open the Shop, choose a building, and place it on clear ground. Select any building to move or upgrade it.</p></div></article><article><b>2</b><div><h3>Keep your village growing</h3><p>Collect gold and elixir from the floating bubbles. Builders handle construction. Your collectors keep working while you're away, up to 8 hours.</p></div></article><article><b>3</b><div><h3>Raise an army. Raid the valley.</h3><p>Train troops, then open Attack! Select your troops and deploy outside enemy defenses. Giants target defenses; archers and wizards attack from range.</p></div></article></div><div class="help-controls"><span>Drag <b>Move camera</b></span><span>Scroll / pinch <b>Zoom</b></span><span>WASD / arrows <b>Pan</b></span><span>Esc <b>Close / cancel</b></span></div>${button('tutorial', `Let's build ${icon('ArrowRight', 19)}`, 'game-btn green start-btn')}</div>`;
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
    const research = document.querySelector('[data-research]');
    if (research && this.model.state.research)
      research.textContent = time((this.model.state.research.end - this.model.clock) / 1000);
    const researchCost = document.querySelector('[data-research-cost]');
    if (researchCost && this.model.state.research)
      researchCost.textContent = String(
        Math.max(1, Math.ceil((this.model.state.research.end - this.model.clock) / 10000)),
      );
    const queue = document.querySelector('[data-queue]');
    if (queue && m.state.queue[0])
      queue.textContent = time((m.state.queue[0].end - m.clock) / 1000);
    const b = m.battle;
    if (b) {
      const timer = document.querySelector('#battle-timer');
      if (timer) timer.textContent = time(180 - b.elapsed);
      const val = document.querySelector('#destruction-value');
      if (val) val.textContent = `${b.destruction}%`;
      const stars = document.querySelector('#battle-stars');
      if (stars) stars.innerHTML = `${'★'.repeat(b.stars)}<span>${'★'.repeat(3 - b.stars)}</span>`;
      for (const k of ['gold', 'elixir'] as const) {
        const el = document.querySelector(`[data-loot="${k}"]`);
        if (el) el.textContent = n(CAMPAIGN[b.index][k] - b.loot[k]);
      }
    }
  }
}
