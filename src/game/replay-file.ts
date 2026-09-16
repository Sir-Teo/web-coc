import { compatibleReplayVersion, validateReplay, type ReplayData } from './replay';
import { TROOP_KEYS, SPELL_KEYS } from './data';
import { EQUIPMENT_KEYS, type KingEquipment } from './equipment';
import { campaignResources } from './campaign-loot';

export const MAX_REPLAY_FILE_BYTES = 512_000;
export interface ReplayFile {
  format: 'crown-clan-replay';
  version: 1;
  replay: ReplayData;
}
/** Only combat data travels; never serialize a village or unknown imported fields. */
export function makeReplayFile(replay: ReplayData): ReplayFile {
  if (!validateReplay(replay)) throw Error('This recording is invalid.');
  if (!compatibleReplayVersion(replay.version))
    throw Error('This replay needs a different game version.');
  const s = replay.initial;
  const army = (v: typeof s.army) =>
    Object.fromEntries(TROOP_KEYS.map((k) => [k, v[k]])) as typeof v;
  const spells = Object.fromEntries(SPELL_KEYS.map((k) => [k, s.spells[k]])) as typeof s.spells;
  return {
    format: 'crown-clan-replay',
    version: 1,
    replay: {
      version: replay.version,
      initial: {
        index: s.index,
        ...(s.catalog ? { catalog: s.catalog } : {}),
        ...(s.scenery ? { scenery: s.scenery.map((o) => ({ data: o.data, x: o.x, y: o.y })) } : {}),
        practice: s.practice,
        nextId: s.nextId,
        ...(s.availableLoot ? { availableLoot: campaignResources(s.availableLoot) } : {}),
        ...(s.lootRoom ? { lootRoom: campaignResources(s.lootRoom) } : {}),
        army: army(s.army),
        spells,
        troopLevels: army(s.troopLevels),
        spellLevels: Object.fromEntries(
          SPELL_KEYS.map((k) => [k, s.spellLevels![k]]),
        ) as typeof s.spells,
        ...(s.hero
          ? {
              hero: {
                level: s.hero.level,
                townhall: s.hero.townhall,
                equipment: {
                  levels: Object.fromEntries(
                    EQUIPMENT_KEYS.map((k) => [k, s.hero!.equipment!.levels[k]]),
                  ) as KingEquipment['levels'],
                  loadout: [...s.hero.equipment!.loadout] as KingEquipment['loadout'],
                },
              },
            }
          : {}),
        // Version 46 carries the whole hero roster, its equipment and pets.
        ...(s.heroes
          ? {
              heroes: s.heroes.map((hero) => ({
                kind: hero.kind,
                level: hero.level,
                items: hero.items.map((item) => ({ slug: item.slug, level: item.level })),
                ...(hero.pet ? { pet: { kind: hero.pet.kind, level: hero.pet.level } } : {}),
              })),
            }
          : {}),
        ...(s.townhall !== undefined ? { townhall: s.townhall } : {}),
        ...(s.garrisons
          ? {
              garrisons: s.garrisons.map((g) => ({
                castleId: g.castleId,
                mode: g.mode,
                troops: g.troops.map((t) => ({ kind: t.kind, level: t.level, count: t.count })),
              })),
            }
          : {}),
        buildings: s.buildings.map((b) => ({
          id: b.id,
          kind: b.kind,
          ...(b.npc !== undefined ? { npc: b.npc } : {}),
          x: b.x,
          y: b.y,
          level: b.level,
          hp: b.hp,
          maxHp: b.maxHp,
          stored: 0,
          cooldown: 0,
          ...(b.direction !== undefined ? { direction: b.direction } : {}),
          ...(b.skeletonMode !== undefined ? { skeletonMode: b.skeletonMode } : {}),
          ...(b.infernoMode !== undefined ? { infernoMode: b.infernoMode } : {}),
          ...(b.infernoAmmo !== undefined ? { infernoAmmo: b.infernoAmmo } : {}),
          ...(b.xbowMode !== undefined ? { xbowMode: b.xbowMode } : {}),
          ...(b.spellMode !== undefined ? { spellMode: b.spellMode } : {}),
          ...(b.gearMode !== undefined ? { gearMode: b.gearMode } : {}),
          ...(b.weaponLevel !== undefined ? { weaponLevel: b.weaponLevel } : {}),
          ...(b.geared !== undefined ? { geared: b.geared } : {}),
          ...(b.supercharge !== undefined ? { supercharge: b.supercharge } : {}),
          ...(b.guardian !== undefined ? { guardian: b.guardian } : {}),
          ...(b.guardianLevel !== undefined ? { guardianLevel: b.guardianLevel } : {}),
          ...(b.constructing !== undefined ? { constructing: b.constructing } : {}),
          ...(b.upgradeEnd !== undefined ? { upgradeEnd: b.upgradeEnd } : {}),
          ...(b.upgradeStart !== undefined ? { upgradeStart: b.upgradeStart } : {}),
        })),
      },
      steps: [...replay.steps],
      actions: replay.actions.map((a) => {
        const base = { step: a.step, type: a.type };
        if (a.type === 'troop' || a.type === 'spell')
          return { ...base, type: a.type, kind: a.kind, x: a.x, y: a.y } as typeof a;
        if (a.type === 'hero')
          return { ...base, type: a.type, x: a.x, y: a.y, ...(a.hero ? { hero: a.hero } : {}) };
        if (a.type === 'ability')
          return { ...base, type: a.type, ...(a.hero ? { hero: a.hero } : {}) };
        return { ...base, type: a.type };
      }),
    },
  };
}
export function parseReplayFile(text: string): ReplayData {
  if (new TextEncoder().encode(text).length > MAX_REPLAY_FILE_BYTES)
    throw Error('Replay files must be smaller than 512 KB.');
  let file: unknown;
  try {
    file = JSON.parse(text);
  } catch {
    throw Error('That file is not valid replay JSON.');
  }
  if (
    !file ||
    typeof file !== 'object' ||
    !('format' in file) ||
    file.format !== 'crown-clan-replay' ||
    !('version' in file) ||
    file.version !== 1 ||
    !('replay' in file) ||
    !validateReplay(file.replay)
  )
    throw Error('Choose a Crown & Clan replay file, not a village backup.');
  return makeReplayFile(file.replay).replay;
}
export function exportReplayFile(data: ReplayData) {
  const text = JSON.stringify(makeReplayFile(data));
  if (new TextEncoder().encode(text).length > MAX_REPLAY_FILE_BYTES)
    throw Error('This recording is too large to share.');
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'crown-and-clan.crown-replay.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
