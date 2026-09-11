import Phaser from 'phaser';
import './style.css';
import { GameModel } from './game/model';
import { VillageScene } from './game/scene';
import { AudioManager } from './game/audio';
import { loadSave, saveGame } from './game/save';
import { acquireVillage, SessionUnavailableError } from './game/session';
import { HUD } from './ui/hud';
import { developerToolsEnabled } from './dev/access';
async function boot() {
  const releaseSession = await acquireVillage();
  const saved = await loadSave(),
    model = new GameModel(saved);
  const audio = new AudioManager();
  audio.enabled = model.state.settings.sound;
  document.documentElement.classList.toggle('reduce-motion', model.state.settings.reducedMotion);
  document.addEventListener(
    'pointerdown',
    () => {
      audio.unlock();
      if (model.state.settings.music) audio.music(true);
    },
    { once: true },
  );
  const scene = new VillageScene(model, audio);
  const hud = new HUD(model, scene, audio);
  const game = new Phaser.Game({
    type: Phaser.WEBGL,
    parent: 'game',
    backgroundColor: '#45623d',
    antialias: true,
    roundPixels: false,
    powerPreference: 'high-performance',
    scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
    render: { pixelArt: false, antialias: true },
    input: { activePointers: 3 },
    scene: [scene],
    fps: { target: 60, smoothStep: true },
  });
  let ownsSession = true;
  let lastSavedRevision = -1;
  let saving = false;
  const persist = async () => {
    if (!ownsSession || saving || lastSavedRevision === model.revision) return;
    saving = true;
    const revision = model.revision;
    const ok = await saveGame(model.state);
    hud.setSaveState(ok);
    if (ok) lastSavedRevision = revision;
    saving = false;
  };
  const economyTimer = setInterval(() => {
    model.tick(Date.now());
    void persist();
  }, 1000);
  window.addEventListener('pagehide', () => {
    clearInterval(economyTimer);
    model.tick(Date.now());
    // saveGame writes its local backup synchronously before yielding to IndexedDB.
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
      void saveGame(model.state);
      audio.music(false);
    } else {
      model.tick(Date.now());
      if (model.state.settings.music) audio.music(true);
    }
  });
  scene.onReady = () => {
    void saveGame(model.state);
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
        obstacles: model.battle ? [] : model.obstacles.map((o) => ({
          id: o.id, type: o.kind, x: o.x, y: o.y, size: 2,
          removalSeconds: o.removeEnd === undefined ? null : Math.max(0, (o.removeEnd - model.clock) / 1000),
        })),
        buildings: model.buildings
          .filter((b) => model.visibleBuilding(b))
          .map((b) => ({
            id: b.id,
            type: b.kind,
            x: b.x,
            y: b.y,
            hp: Math.round(b.hp),
            level: b.level,
            upgrading: !!b.upgradeEnd,
          })),
        battle: model.battle
          ? {
              time: model.battle.elapsed,
              destruction: model.battle.destruction,
              stars: model.battle.stars,
              remaining: model.battle.remaining,
              hero: model.battle.hero,
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
                })),
              shells: model.battle.shells,
              loot: model.battle.loot,
              finished: model.battle.finished,
            }
          : null,
        coordinates: '28×28 isometric grid; x toward lower-right, y toward lower-left',
      }),
  });
  if (developerToolsEnabled(import.meta.env.DEV, location.hostname, location.search)) {
    const { installDeveloperTools } = await import('./dev/panel');
    installDeveloperTools(model, scene);
  }
  if ('serviceWorker' in navigator && !import.meta.env.DEV)
    void navigator.serviceWorker.register('/sw.js');
}
boot().catch((error) => {
  console.error(error);
  const label = document.querySelector('#load-label');
  if (label)
    label.textContent =
      error instanceof SessionUnavailableError
        ? error.message
        : 'Your village could not start. Refresh the page to try again.';
});
