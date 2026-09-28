#!/usr/bin/env node
// Builds reference/heroes-journey/catalog.json from the Hero's Journey wiki snapshot
// (reference/official-wiki/heroes-pets/heros-journey.md). The client has no table for the
// track; its rewards are server-configured, so the wiki is the only source.
// Usage: node scripts/import-heroes-journey.mjs [--check]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(root, 'reference/official-wiki/heroes-pets/heros-journey.md');
const target = path.join(root, 'reference/heroes-journey/catalog.json');
const source = fs.readFileSync(sourcePath, 'utf8');
const fail = (message) => {
  console.error(`Hero's Journey import: ${message}`);
  process.exit(1);
};

const HEROES = {
  'Barbarian King': 'king',
  'Archer Queen': 'queen',
  'Minion Prince': 'prince',
  'Grand Warden': 'warden',
  'Royal Champion': 'champion',
  'Dragon Duke': 'duke',
};
const ORES = { Shiny: 'shiny', Glowy: 'glowy', Starry: 'starry' };
const amount = (text) => Number(text.replace(/,/g, ''));

function reward(text) {
  let m;
  if ((m = /^([\d,]+) (Dark Elixir|Elixir)$/.exec(text)))
    return { type: m[2] === 'Elixir' ? 'elixir' : 'dark', amount: amount(m[1]) };
  if ((m = /^([\d,]+) (Shiny|Glowy|Starry) Ore$/.exec(text)))
    return { type: 'ore', ore: ORES[m[2]], amount: amount(m[1]) };
  if ((m = /^(\d+)x (.+)$/.exec(text))) return { type: 'item', item: m[2], count: Number(m[1]) };
  if ((m = /^Quest - (.+)$/.exec(text)))
    return HEROES[m[1]]
      ? { type: 'quest', hero: HEROES[m[1]] }
      : { type: 'quest', equipment: m[1] };
  if ((m = /^Equipment - (.+) \(level (\d+)\)$/.exec(text)))
    return HEROES[m[1]]
      ? { type: 'equipment', hero: HEROES[m[1]], level: Number(m[2]) }
      : fail(`unknown hero in ${text}`);
  if ((m = /^Majestic (.+) skin$/.exec(text)))
    return HEROES[m[1]] ? { type: 'skin', hero: HEROES[m[1]] } : fail(`unknown hero in ${text}`);
  return fail(`unrecognized reward "${text}"`);
}

function table(heading) {
  const start = source.indexOf(heading);
  if (start < 0) fail(`missing ${heading}`);
  const rows = [];
  for (const line of source.slice(start).split('\n').slice(1)) {
    if (line.startsWith('### ') || line.startsWith('## ')) break;
    // A blank line after the rows ends the table (the Ore Chest heading holds two).
    if (!line.trim() && rows.length) break;
    if (!line.startsWith('|') || line.startsWith('|---')) continue;
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());
    if (/^\d/.test(cells[0])) rows.push(cells);
  }
  return rows;
}

const tiers = table('### Wiki table(s): Rewards').map(([level, text]) => ({
  level: Number(level),
  reward: reward(text),
}));
for (let i = 1; i < tiers.length; i++)
  if (tiers[i].level <= tiers[i - 1].level) fail(`tiers out of order at ${tiers[i].level}`);

const range = (text) => text.replace(/,/g, '').split('-').map(Number);
const chests = (heading) =>
  Object.fromEntries(
    table(heading).map(([th, shiny, glowy, starry]) => [
      th,
      { shiny: range(shiny), glowy: range(glowy), starry: range(starry) },
    ]),
  );

// "Equipment reward tiers give the first not-yet-owned Epic item from a fixed per-hero list (...)".
const listText = /per-hero list \(([^)]*)\)/.exec(source)?.[1] ?? fail('missing Epic item list');
const epics = {};
for (const part of listText.split(';')) {
  const [who, items] = part.split(':').map((s) => s.trim());
  const hero = {
    King: 'king',
    Queen: 'queen',
    Prince: 'prince',
    Warden: 'warden',
    Champion: 'champion',
    Duke: 'duke',
  }[who];
  if (!hero) fail(`unknown hero ${who}`);
  epics[hero] = items.split(',').map((s) => s.trim());
}

const catalog = {
  source: 'reference/official-wiki/heroes-pets/heros-journey.md',
  wikiRevision: Number(/Wiki revision:\*\* (\d+)/.exec(source)?.[1] ?? fail('missing revision')),
  scope:
    "Hero's Journey track from the wiki: the cumulative hero level of each tier and its reward, " +
    'the per-hero Epic item order, and the Ore Chest ranges by Town Hall.',
  townHall: 7,
  questStars: 15,
  questDays: 14,
  allOwnedStarry: 50,
  tiers,
  epics,
  oreChests: chests('### Wiki table(s): Ore Chests'),
  acceleratedOreChests: (() => {
    const start = source.indexOf('| Accelerated Rewards Table');
    const rows = source
      .slice(start)
      .split('\n')
      .filter((l) => /^\| \d/.test(l))
      .map((l) =>
        l
          .split('|')
          .slice(1, -1)
          .map((c) => c.trim()),
      );
    return Object.fromEntries(
      rows.map(([th, shiny, glowy, starry]) => [
        th,
        { shiny: range(shiny), glowy: range(glowy), starry: range(starry) },
      ]),
    );
  })(),
};

const text = JSON.stringify(catalog, null, 2) + '\n';
if (process.argv.includes('--check')) {
  if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== text)
    fail('committed catalog differs from the wiki snapshot');
  console.log(`Hero's Journey catalog reproduces ${tiers.length} tiers.`);
} else {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, text);
  console.log(`Wrote ${path.relative(root, target)} (${tiers.length} tiers)`);
}
