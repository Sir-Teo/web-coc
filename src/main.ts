import Phaser from 'phaser';
import './style.css';
import './ui/compact-hud.css';
import { GameModel } from './game/model';
import { VillageScene, prepareHomeArt } from './game/scene';
import { AudioManager } from './game/audio';
import {
  loadSave,
  parseSaveFile,
  preserveDamagedSave,
  saveGame,
  SaveRecoveryError,
  MAX_SAVE_FILE_BYTES,
} from './game/save';
import { acquireVillage, SessionUnavailableError } from './game/session';
import { HUD } from './ui/hud';
import { developerToolsEnabled } from './dev/access';
import { configureDisplay, displaySize } from './game/display';
import { recordBootResources, registerOfflineSupport } from './offline';
import { decodeLoadedImages } from './game/image-decode';
import { watchSystemMotion } from './ui/motion';
recordBootResources();
decodeLoadedImages();
/** A 1×1 fully transparent PNG. */
const TRANSPARENT_PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWNgYGBgAAAABQABh6FO1AAAAABJRU5ErkJggg==';
async function boot() {
  const releaseSession = await acquireVillage();
  try {
    let saved;
    try {
      saved = await loadSave();
    } catch (error) {
      releaseSession();
      throw error;
    }
    const model = new GameModel(saved);
    const audio = new AudioManager();
    audio.enabled = model.state.settings.sound;
    watchSystemMotion(model);
    document.addEventListener(
      'pointerdown',
      () => {
        audio.unlock();
        if (model.state.settings.music) audio.music(true);
      },
      { once: true },
    );
    // Graphs kept out of the startup bundle, for the families this village already owns.
    await prepareHomeArt(model.buildings);
    const scene = new VillageScene(model, audio);
    const hud = new HUD(model, scene, audio);
    const game = new Phaser.Game({
      type: Phaser.WEBGL,
      parent: 'game',
      backgroundColor: '#45623d',
      antialias: true,
      roundPixels: false,
      powerPreference: 'high-performance',
      scale: {
        mode: Phaser.Scale.NONE,
        ...displaySize(window.innerWidth, window.innerHeight, 1),
      },
      callbacks: { postBoot: configureDisplay },
      render: { pixelArt: false, antialias: true },
      input: { activePointers: 3 },
      // A long press on a phone (streaming troops, holding a building) fires contextmenu;
      // the canvas has no menu of its own to offer.
      disableContextMenu: true,
      scene: [scene],
      fps: { target: 60, smoothStep: true },
      // Phaser's stock placeholder for a texture that has not loaded (lazy art still in
      // flight, a failed fetch) is an opaque black square; draw nothing instead.
      images: { missing: TRANSPARENT_PIXEL },
      loader: {
        // Hundreds of boot images: let the browser fetch and decode them as plain images
        // instead of XHR → Blob → object URL → Image, which copies every file twice on the
        // main thread. Phaser caps Android at 6 parallel requests (an HTTP/1.1 heuristic);
        // the host serves HTTP/2, so the boot queue should not drain six files at a time.
        imageLoadType: 'HTMLImageElement',
        maxParallelDownloads: 32,
      },
    });
    let ownsSession = true;
    let lastSavedRevision = -1;
    let lastSavedStructural = -1;
    let lastPersistAt = 0;
    /** Collector drift alone (no structural change) is written this often, not every 5 s. */
    const PASSIVE_SAVE_MS = 60_000;
    let saving = false;
    // A forced save (tab hidden) that arrives while a persist is in flight.
    let pendingForce = false;
    const persist = async (force = false) => {
      if (!ownsSession || lastSavedRevision === model.revision) return;
      if (saving) {
        // Never drop a forced save: a finished raid would be lost if the tab
        // is evicted before the in-flight persist lands.
        if (force) pendingForce = true;
        return;
      }
      // Battles mutate revision every step and collectors bump it every second:
      // persist at most every 5s so the full stringify stays off the hot path.
      // During an attack or replay only transient battle state changes, so timed
      // saves wait for the battle to settle (see the economy timer); a forced persist
      // (tab hidden, battle finished) skips both gates but keeps the in-flight guard.
      const now = Date.now();
      if (!force && (model.battle || model.replay)) return;
      if (!force && now - lastPersistAt < 5000) return;
      // Only collector ticks since the last save: production is recomputed from lastTick on
      // load, so the full stringify and two storage writes wait for a real change or a minute.
      const structural = model.structuralRevision;
      if (!force && structural === lastSavedStructural && now - lastPersistAt < PASSIVE_SAVE_MS)
        return;
      saving = true;
      try {
        const revision = model.revision;
        // A raid in progress has spent its deployed troops but settles only on pagehide, which a
        // discarded hidden tab may never fire. Store the raid settled at its current score; if
        // the player returns, the raid continues and its real result is saved over it.
        const ok = await saveGame(model.battle ? model.settledState() : model.state);
        hud.setSaveState(ok);
        // A failed write waits for the next window too, instead of retrying every second.
        lastPersistAt = now;
        if (ok) {
          lastSavedRevision = revision;
          lastSavedStructural = structural;
        }
      } finally {
        saving = false;
        if (pendingForce) {
          pendingForce = false;
          void persist(true);
        }
      }
    };
    // 'none' | 'active' | 'finished': a finished raid's result and the return home
    // are written as soon as they happen rather than on the next timed save.
    const battlePhase = () =>
      !model.battle ? 'none' : model.battle.finished ? 'finished' : 'active';
    let lastBattlePhase = battlePhase();
    const economyTimer = setInterval(() => {
      model.tick(Date.now());
      const phase = battlePhase();
      const settled = phase !== lastBattlePhase && phase !== 'active';
      lastBattlePhase = phase;
      void persist(settled);
    }, 1000);
    window.addEventListener('pagehide', () => {
      audio.samples.stop();
      clearInterval(economyTimer);
      model.tick(Date.now());
      // A raid in progress has already spent its troops; settle it before the state is stored.
      model.suspendBattle();
      // saveGame writes its local backup synchronously before yielding to IndexedDB.
      // Unconditional: a concurrent persist's sync write holds the pre-settle state,
      // and loadSave picks the newer lastTick on next boot.
      void saveGame(model.state);
      ownsSession = false;
      releaseSession();
    });
    window.addEventListener('pageshow', (event) => {
      // A restored document must reacquire ownership and reload the latest state.
      if (event.persisted) window.location.reload();
    });
    document.addEventListener('visibilitychange', () => {
      if (!ownsSession) return;
      if (document.hidden) {
        audio.samples.stop();
        void persist(true);
        audio.music(false);
      } else {
        model.tick(Date.now());
        if (model.state.settings.music) audio.music(true);
      }
    });
    scene.onReady = () => {
      hud.showMapUpgrade();
      void saveGame(model.state);
      // After the boot preload, on idle: the worker install must not compete with it.
      if (!import.meta.env.DEV) registerOfflineSupport();
    };
    // Structured browser QA surface; no renderer internals in saved data.
    const debug = { model, scene, game, hud, audio };
    if (import.meta.env.DEV)
      Object.assign(window, {
        __game: debug,
        advanceTime: (ms: number) => {
          for (let t = 0; t < ms; t += 50) model.step(0.05);
          model.tick(model.clock + ms);
          model.changed();
        },
      });
    Object.assign(window, {
      render_game_to_text: () =>
        JSON.stringify({
          mode: model.battle ? 'battle' : 'village',
          resources: {
            gold: model.state.gold,
            elixir: model.state.elixir,
            dark: model.state.dark,
            gems: model.state.gems,
          },
          army: model.state.army,
          capacity: model.capacity,
          hero: model.state.king,
          selectedWalls: model.selectedWalls.map((b) => b.id),
          wallPreview: model.wallPreview,
          obstacles: model.battle
            ? []
            : model.obstacles.map((o) => ({
                id: o.id,
                type: o.kind,
                x: o.x,
                y: o.y,
                size: 2,
                removalSeconds:
                  o.removeEnd === undefined
                    ? null
                    : Math.max(0, (o.removeEnd - model.clock) / 1000),
              })),
          buildings: model.buildings
            .filter((b) => model.visibleBuilding(b))
            .map((b) => ({
              id: b.id,
              type: b.kind,
              ...(b.npc ? { npc: b.npc } : {}),
              x: b.x,
              y: b.y,
              hp: Math.round(b.hp),
              level: b.level,
              upgrading: !!b.upgradeEnd,
              ...(b.kind === 'skeletontrap' ? { skeletonMode: b.skeletonMode ?? 'ground' } : {}),
              ...(b.kind === 'inferno' ? { infernoMode: b.infernoMode ?? 'single' } : {}),
              ...(b.kind === 'xbow' ? { xbowMode: b.xbowMode ?? 'ground' } : {}),
            })),
          replay: model.replay,
          battle: model.battle
            ? {
                time: model.battle.elapsed,
                catalog: model.battle.catalog,
                scenery: model.battle.scenery,
                timeLimit: model.battle.practice ? 180 : null,
                scouting: !model.battle.started,
                availableLoot: model.battle.availableLoot,
                lootTaken: model.battle.lootTaken,
                loot: model.battle.loot,
                result: model.battle.result,
                destruction: model.battle.destruction,
                stars: model.battle.stars,
                remaining: model.battle.remaining,
                hero: model.battle.hero,
                heroes: model.battle.nativeHeroes,
                units: model.battle.units.filter((u) => u.hp > 0).length,
                troops: model.battle.units
                  .filter((u) => u.hp > 0)
                  .map((u) => ({
                    kind: u.kind,
                    hero: u.hero,
                    summoned: u.summoned,
                    x: u.x,
                    y: u.y,
                    hp: Math.round(u.hp),
                    target: u.target,
                    defenderTarget: u.defenderTarget,
                    ...(u.shrink ? { shrink: u.shrink } : {}),
                  })),
                shells: model.battle.shells,
                mortars: model.battle.mortars ?? {},
                legacyMortarFlight: !!model.battle.legacyMortarFlight,
                cannons: model.battle.cannons ?? {},
                legacyCannonFlight: !!model.battle.legacyCannonFlight,
                projectiles: model.battle.projectiles ?? [],
                xbows: model.battle.xbows ?? {},
                airSweepers: model.battle.airSweepers ?? {},
                sweepers: model.battle.sweepers ?? {},
                gusts: model.battle.gusts ?? [],
                seekingMines: Object.entries(model.battle.traps).flatMap(([id, state]) => {
                  const mine = model.battle!.buildings.find((b) => b.id === Number(id));
                  return mine?.kind === 'seekingairmine'
                    ? [{ sourceId: mine.id, level: mine.level, ...state }]
                    : [];
                }),
                shrinkTraps: Object.entries(model.battle.traps).flatMap(([id, state]) =>
                  state.shrink ? [{ sourceId: Number(id), ...state }] : [],
                ),
                defenders: (model.battle.defenders ?? [])
                  .filter((d) => d.hp > 0)
                  .map((d) => ({
                    id: d.id,
                    mode: d.mode,
                    x: d.x,
                    y: d.y,
                    hp: d.hp,
                    target: d.target,
                  })),
                deathBombs: Object.values(model.battle.deathBombs ?? {}).filter(
                  (b) => !b.resolved && !b.cancelled,
                ),
                finished: model.battle.finished,
              }
            : null,
          coordinates: '48×48 isometric grid; x toward lower-right, y toward lower-left',
        }),
    });
    if (developerToolsEnabled(import.meta.env.DEV, location.hostname, location.search)) {
      const { installDeveloperTools } = await import('./dev/panel');
      installDeveloperTools(model, scene);
    }
  } catch (error) {
    releaseSession();
    throw error;
  }
}
boot().catch((error) => {
  console.error(error);
  const label = document.querySelector('#load-label');
  if (label)
    label.textContent =
      error instanceof SessionUnavailableError || error instanceof SaveRecoveryError
        ? error.message
        : 'Your village could not start. Refresh the page to try again.';
  if (error instanceof SaveRecoveryError) {
    document.querySelector('.load-track')?.remove();
    const actions = document.createElement('div');
    actions.className = 'save-recovery-actions';
    for (const copy of error.copies) {
      const button = document.createElement('button');
      button.className = 'game-btn blue';
      button.textContent = `Download ${copy.source}`;
      button.onclick = () => {
        recoveryDownloaded = true;
        const url = URL.createObjectURL(new Blob([copy.text], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = `crown-and-clan-${copy.source}-recovery.json`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      };
      actions.append(button);
    }
    actions.append(recoveryImport(error), recoveryRetry());
    document.querySelector('#loading')?.append(actions);
  }
});

/** The player downloaded the damaged copies from the recovery screen. */
let recoveryDownloaded = false;
/** Try loading again, for a save another tab or a storage hiccup had made unreadable. */
function recoveryRetry() {
  const retry = document.createElement('button');
  retry.className = 'game-btn stone';
  retry.textContent = 'Try again';
  retry.onclick = () => window.location.reload();
  return retry;
}

/**
 * Restore a village from a backup file without reaching Settings. The damaged copies are kept
 * under their own keys first; the backup is validated exactly as the Settings import does.
 */
function recoveryImport(error: SaveRecoveryError) {
  const label = document.querySelector('#load-label');
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.hidden = true;
  input.id = 'recovery-import-file';
  const button = document.createElement('button');
  button.className = 'game-btn green';
  button.textContent = 'Import backup';
  button.onclick = () => input.click();
  input.onchange = async () => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const data =
      file.size <= MAX_SAVE_FILE_BYTES ? parseSaveFile(await file.text().catch(() => '')) : null;
    const say = (message: string) => {
      if (label) label.textContent = message;
    };
    if (!data) return say('That backup is not a valid Crown & Clan village.');
    // A copy the player downloaded counts as kept.
    if (!(await preserveDamagedSave(error.copies)) && !recoveryDownloaded)
      return say('The damaged save could not be kept aside. Download it first, then import again.');
    if (!(await saveGame(data)))
      return say(
        'The backup could not be saved in this browser. Check your storage and try again.',
      );
    window.location.reload();
  };
  const wrapper = document.createElement('span');
  wrapper.append(button, input);
  return wrapper;
}
