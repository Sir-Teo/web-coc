#!/usr/bin/env node
// Builds reference/crafted-defenses/catalog.json from the Crafting Station and Crafted Defense
// wiki snapshots (reference/official-wiki/defenses). Those pages were checked field by field
// against client 18.400.21 (seasonal_defense_modules.csv, special_abilities.csv); where the
// two differ the pinned client wins, as the constants below note.
// Usage: node scripts/import-crafted-defenses.mjs [--check]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wiki = (name) =>
  fs.readFileSync(path.join(root, 'reference/official-wiki/defenses', `${name}.md`), 'utf8');
const target = path.join(root, 'reference/crafted-defenses/catalog.json');
const fail = (message) => {
  console.error(`Crafted defense import: ${message}`);
  process.exit(1);
};
const number = (text) => Number(String(text).replace(/[,s]/g, ''));
/** "1d 19h", "6h", "10d" -> seconds. */
function duration(text) {
  if (text === 'N/A') return 0;
  let seconds = 0;
  for (const [, n, unit] of text.matchAll(/(\d+)([dhms])/g))
    seconds += Number(n) * { d: 86400, h: 3600, m: 60, s: 1 }[unit];
  if (!seconds) fail(`unreadable duration ${text}`);
  return seconds;
}

/** The rows of the table under a bold heading, keyed by its column names. */
function moduleTable(source, heading) {
  const start = source.indexOf(`**${heading}**`);
  if (start < 0) fail(`missing ${heading}`);
  const lines = source.slice(start).split('\n').slice(1);
  const rows = [];
  let header = null;
  for (const line of lines) {
    if (!line.startsWith('|')) {
      if (rows.length) break;
      continue;
    }
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());
    if (line.startsWith('|---')) continue;
    if (cells[0] === 'Level') header = cells;
    else if (/^\d+$/.test(cells[0]))
      rows.push(Object.fromEntries(header.map((h, i) => [h, cells[i]])));
  }
  if (rows.length !== 10) fail(`${heading} has ${rows.length} levels, expected 10`);
  return rows;
}
const RESOURCE = { Gold: 'gold', Elixir: 'elixir', 'Dark Elixir': 'dark' };
/** "`XModule` (Module 2: Damage): resource Gold" in the client interpretation notes. */
function moduleResource(source, n) {
  const m = new RegExp(`\\(Module ${n}: [^)]*\\): resource (Dark Elixir|Elixir|Gold)`).exec(source);
  return m ? RESOURCE[m[1]] : fail(`no resource for module ${n}`);
}
const common = (row) => ({
  cost: row.Cost === 'N/A' ? 0 : number(row.Cost),
  seconds: duration(row['Build Time']),
  townHall: number(row['Town Hall Level Required']),
});

function candle() {
  const source = wiki('hot-candle');
  const hp = moduleTable(source, 'Module 1: Hitpoints'),
    damage = moduleTable(source, 'Module 2: Damage'),
    melt = moduleTable(source, 'Module 3: Seconds Active');
  return {
    key: 'candle',
    name: 'Hot Candle',
    client: 'Inferno Candle',
    // SeasonalDefenseInfernoCandle: AttackRange 1050, air+ground; attack module AttackSpeed 500,
    // MultiTargets with NumMultiTargets 6, MultiHitsTarget. Melt stages 4 then 3 targets.
    range: 10.5,
    minRange: 0,
    attackSeconds: 0.5,
    targets: 'both',
    stageTargets: [6, 4, 3],
    modules: [
      {
        name: 'Hitpoints',
        stat: 'hp',
        resource: moduleResource(source, 1),
        levels: hp.map((r) => ({ value: number(r.Hitpoints), ...common(r) })),
      },
      {
        name: 'Damage',
        stat: 'damage',
        resource: moduleResource(source, 2),
        levels: damage.map((r) => ({ value: number(r['Damage per Hit']), ...common(r) })),
      },
      {
        name: 'Seconds Active',
        stat: 'melt',
        resource: moduleResource(source, 3),
        // Base form lasts until the first number; the second decay begins at the last.
        levels: melt.map((r) => ({
          value: number(r['Base Form']),
          second: number(/(\d+)s\+/.exec(r['Second Decay'])?.[1] ?? fail('melt stage')),
          ...common(r),
        })),
      },
    ],
  };
}

function hunter() {
  const source = wiki('hero-hunter');
  const hp = moduleTable(source, 'Module 1: Hitpoints'),
    damage = moduleTable(source, 'Module 2: Damage'),
    poison = moduleTable(source, 'Module 3: Poison Level');
  return {
    key: 'hunter',
    name: 'Hero Hunter',
    client: 'Headhunter Tower',
    // SeasonalDefenseHeadhunterTower: AttackRange 950, PreferHeroes, HeroDamageMultiplier 200;
    // attack module AttackSpeed 600; PoisonOnHitSpell Poison for 3000 ms.
    range: 9.5,
    minRange: 0,
    attackSeconds: 0.6,
    targets: 'both',
    heroMultiplier: 2,
    poisonSeconds: 3,
    modules: [
      {
        name: 'Hitpoints',
        stat: 'hp',
        resource: moduleResource(source, 1),
        levels: hp.map((r) => ({ value: number(r.Hitpoints), ...common(r) })),
      },
      {
        name: 'Damage',
        stat: 'damage',
        resource: moduleResource(source, 2),
        levels: damage.map((r) => ({ value: number(r['Damage per Hit']), ...common(r) })),
      },
      {
        name: 'Poison Level',
        stat: 'poison',
        resource: moduleResource(source, 3),
        levels: poison.map((r) => ({ value: number(r['Poison Spell Level']), ...common(r) })),
      },
    ],
  };
}

function cake() {
  const source = wiki('cake-a-pult');
  const hp = moduleTable(source, 'Module 1: Hitpoints'),
    damage = moduleTable(source, 'Module 2: Damage'),
    blast = moduleTable(source, 'Module 3: Explosion Damage');
  return {
    key: 'cake',
    name: 'Cake-A-Pult',
    client: 'Cake Thrower',
    // SeasonalDefenseCakeThrower: AttackRange 1200, MinAttackRange 300, DamageRadius 250 on the
    // target's layer; AttackSpeed 3000. CakeThrowerExplosion: Radius 250, both layers, detonating
    // after DeployTimeMS 1999 (the wiki rounds this to 3 s; the client value is used).
    range: 12,
    minRange: 3,
    attackSeconds: 3,
    targets: 'both',
    splashRadius: 2.5,
    bombRadius: 2.5,
    bombDelay: 1.999,
    modules: [
      {
        name: 'Hitpoints',
        stat: 'hp',
        resource: moduleResource(source, 1),
        levels: hp.map((r) => ({ value: number(r.Hitpoints), ...common(r) })),
      },
      {
        name: 'Damage',
        stat: 'damage',
        resource: moduleResource(source, 2),
        levels: damage.map((r) => ({ value: number(r['Damage per Hit']), ...common(r) })),
      },
      {
        name: 'Explosion Damage',
        stat: 'bomb',
        resource: moduleResource(source, 3),
        levels: blast.map((r) => ({ value: number(r['Explosion Damage']), ...common(r) })),
      },
    ],
  };
}

const defenses = [candle(), hunter(), cake()];
// The pinned client requires Town Hall 12 for every module's first level (the wiki says 11,
// after the August 2026 change) and places the Crafting Station only at Town Hall 18.
for (const d of defenses) for (const m of d.modules) m.levels[0].townHall = 12;
const catalog = {
  sources: [
    'reference/official-wiki/defenses/crafting-station.md',
    'reference/official-wiki/defenses/hot-candle.md',
    'reference/official-wiki/defenses/hero-hunter.md',
    'reference/official-wiki/defenses/cake-a-pult.md',
  ],
  scope:
    'Crafting Station (client: 3x3, 1,000 hitpoints, free, Town Hall 18) and the three Crafted ' +
    'Defenses of Crafting Phase 4 with their module tables.',
  station: { size: 3, hp: 1000, townHall: 18, sparkyStonesPerLevel: 8 },
  defenses,
};
const text = JSON.stringify(catalog, null, 2) + '\n';
if (process.argv.includes('--check')) {
  if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== text)
    fail('committed catalog differs from the wiki snapshots');
  console.log(`Crafted defense catalog reproduces ${defenses.length} defenses.`);
} else {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, text);
  console.log(`Wrote ${path.relative(root, target)}`);
}
