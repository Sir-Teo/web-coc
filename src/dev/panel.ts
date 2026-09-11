import { GameModel, type Save } from '../game/model';
import {
  TROOPS,
  SPELLS,
  TROOP_KEYS,
  SPELL_KEYS,
  type TroopKind,
  type SpellKind,
} from '../game/data';
import { VillageScene } from '../game/scene';
import { DeveloperControls } from './controls';
import './style.css';

const checkpointKey = 'crown-clan-developer-checkpoint';
export function installDeveloperTools(model: GameModel, scene: VillageScene) {
  let saved: Save | undefined;
  try {
    saved = JSON.parse(sessionStorage.getItem(checkpointKey) ?? 'null') ?? undefined;
  } catch {
    /* A fresh checkpoint replaces malformed JSON. */
  }
  const controls = new DeveloperControls(model, saved);
  const remember = () => {
    try {
      sessionStorage.setItem(checkpointKey, JSON.stringify(controls.checkpointSave));
    } catch {
      /* The in-memory checkpoint still works when storage is unavailable. */
    }
  };
  remember();
  Object.assign(window, { __dev: controls });
  const launcher = document.createElement('button');
  launcher.className = 'developer-launch';
  launcher.textContent = 'DEV';
  launcher.title = 'Developer tools (Ctrl/⌘ Shift D)';
  launcher.setAttribute('aria-label', 'Open developer tools');
  const dialog = document.createElement('dialog');
  dialog.className = 'developer-panel';
  dialog.setAttribute('aria-labelledby', 'developer-title');
  const field = (name: string, label: string, value: number, max: number, min = 0) =>
    `<label>${label}<input name="${name}" type="number" min="${min}" max="${max}" step="1" value="${value}" required></label>`;
  const button = (action: string, label: string) =>
    `<button type="button" data-dev="${action}">${label}</button>`;
  const render = () => {
    dialog.innerHTML = `<header><div><small>LOCAL TESTING</small><h1 id="developer-title">Developer tools</h1></div>${button('close', 'Close')}</header>
      <p class="developer-note">Changes save to this village. A checkpoint is kept in this tab across reloads. Resource and army edits can exceed normal capacity. Close this panel to resume play.</p>
      <div class="developer-actions">${button('checkpoint', 'Take checkpoint')}${button('restore', 'Restore checkpoint')}${button('refresh', 'Refresh values')}</div>
      <p class="developer-status" role="status">${model.battle ? 'Attack paused. Return home to edit your village.' : 'Village ready for testing.'}</p>
      <form data-form="resources"><h2>Resources</h2><div class="developer-grid">${(['gold', 'elixir', 'dark', 'gems'] as const).map((k) => field(k, k === 'dark' ? 'Dark elixir' : k[0].toUpperCase() + k.slice(1), model.state[k], 999999999)).join('')}</div><div class="developer-actions"><button>Set balances</button>${button('fill', 'Fill storage + 10,000 gems')}</div></form>
      <form data-form="army"><h2>Army &amp; spells</h2><div class="developer-grid">${TROOP_KEYS.map((k) => field(k, TROOPS[k].name, model.state.army[k], 9999)).join('')}${SPELL_KEYS.map((k) => field(k, SPELLS[k].name, model.state.spells[k], 999)).join('')}</div><div class="developer-actions"><button>Set army</button>${button('army20', '20 of each troop + 5 of each spell')}${button('clear', 'Clear army')}${button('research', 'Max troop research')}</div></form>
      <h2>Progression</h2><form data-form="townhall" class="developer-actions">${field('townhall', 'Town Hall', model.townhallLevel, 8, 1)}<button>Set Town Hall</button></form><div class="developer-actions">${button('max', 'Max existing buildings at this TH')}${button('timers', 'Finish all timers')}${button('campaign', 'Unlock campaign')}${button('king', 'Unlock King (TH4+)')}</div>
      <form data-form="hero" class="developer-actions">${field('kingLevel', 'King level', model.state.king?.level ?? 1, 20, 1)}<button>Set King level</button></form>
      <h2>Battle</h2><div class="developer-actions">${button('win', 'Finish with 3 stars')}${button('end', 'End with current result')}</div>`;
  };
  let resume = false;
  const open = () => {
    if (dialog.open) return;
    render();
    resume = scene.sys.isActive();
    if (resume) scene.scene.pause();
    dialog.showModal();
  };
  dialog.addEventListener('close', () => {
    if (resume) scene.scene.resume();
    resume = false;
    launcher.focus();
  });
  launcher.addEventListener('click', open);
  const run = (fn: () => void, message: string) => {
    try {
      const active = document.activeElement;
      const focusIndex = Array.from(dialog.querySelectorAll('button, input')).indexOf(active!);
      fn();
      render();
      dialog
        .querySelectorAll<HTMLElement>('button, input')
        [focusIndex]?.focus({ preventScroll: true });
      dialog.querySelector('.developer-status')!.textContent = message;
    } catch (error) {
      dialog.querySelector('.developer-status')!.textContent =
        error instanceof Error ? error.message : 'Change failed.';
    }
  };
  dialog.addEventListener('click', (event) => {
    const action = (event.target as HTMLElement).closest<HTMLElement>('[data-dev]')?.dataset.dev;
    if (!action) return;
    if (action === 'close') {
      dialog.close();
      return;
    }
    const actions: Record<string, () => void> = {
      checkpoint: () => {
        controls.checkpoint();
        remember();
      },
      restore: () => controls.restore(),
      refresh: () => {},
      fill: () => controls.fillResources(),
      army20: () =>
        controls.setArmy(
          Object.fromEntries(TROOP_KEYS.map((k) => [k, 20])),
          Object.fromEntries(SPELL_KEYS.map((k) => [k, 5])),
        ),
      clear: () =>
        controls.setArmy(
          Object.fromEntries(TROOP_KEYS.map((k) => [k, 0])),
          Object.fromEntries(SPELL_KEYS.map((k) => [k, 0])),
        ),
      research: () => controls.maxResearch(),
      max: () => controls.maxBuildings(),
      timers: () => controls.finishTimers(),
      campaign: () => controls.unlockCampaign(),
      king: () => controls.unlockKing(),
      win: () => controls.endBattle(true),
      end: () => controls.endBattle(false),
    };
    if (actions[action])
      run(
        actions[action],
        action === 'restore'
          ? 'Checkpoint restored.'
          : action === 'checkpoint'
            ? 'Checkpoint saved for this tab.'
            : 'Done.',
      );
  });
  dialog.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    const values: Record<string, number> = {};
    new FormData(form).forEach((value, key) => {
      values[key] = Number(value);
    });
    run(() => {
      switch (form.dataset.form) {
        case 'resources':
          controls.setResources(values);
          break;
        case 'army':
          controls.setArmy(
            Object.fromEntries(TROOP_KEYS.map((k) => [k, values[k]])) as Record<TroopKind, number>,
            Object.fromEntries(SPELL_KEYS.map((k) => [k, values[k]])) as Record<SpellKind, number>,
          );
          break;
        case 'townhall':
          controls.setTownHall(values.townhall);
          break;
        case 'hero':
          controls.setKingLevel(values.kingLevel);
          break;
      }
    }, 'Applied.');
  });
  window.addEventListener(
    'keydown',
    (event) => {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (dialog.open) dialog.close();
        else open();
      } else if (dialog.open) event.stopImmediatePropagation();
    },
    true,
  );
  document.body.append(launcher, dialog);
}
