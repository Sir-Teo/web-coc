import { BUILDINGS, type BuildingKind } from './data';
export type Blueprint = readonly [BuildingKind, number, number];
type Ring = readonly [number, number, number, number];
export interface CampaignLayout {
  buildings: readonly Blueprint[];
  rings: readonly Ring[];
  hint: string;
  recommended: number;
  health: number;
  defense: number;
}
export const CAMPAIGN_LAYOUTS: readonly CampaignLayout[] = [
  {
    buildings: [
      ['townhall', 11, 10],
      ['goldstorage', 7, 10],
      ['elixirstorage', 11, 6],
      ['cannon', 16, 10],
      ['archertower', 10, 15],
      ['goldmine', 6, 15],
      ['collector', 17, 6],
      ['barracks', 14, 16],
      ['camp', 18, 14],
      ['builder', 7, 7],
    ],
    rings: [[9, 9, 18, 19]],
    hint: 'Let giants absorb fire while your ranged troops follow.',
    recommended: 50,
    health: 0.65,
    defense: 0.7,
  },
  {
    buildings: [
      ['townhall', 12, 10],
      ['goldstorage', 7, 10],
      ['elixirstorage', 12, 5],
      ['barracks', 6, 16],
      ['camp', 18, 16],
      ['builder', 19, 7],
      ['goldmine', 5, 6],
      ['collector', 18, 11],
      ['cannon', 9, 15],
      ['archertower', 16, 6],
    ],
    rings: [[6, 8, 21, 20]],
    hint: 'The open west approach leads toward the treasury.',
    recommended: 55,
    health: 0.8,
    defense: 0.85,
  },
  {
    buildings: [
      ['townhall', 11, 11],
      ['goldstorage', 7, 7],
      ['elixirstorage', 16, 15],
      ['barracks', 6, 15],
      ['camp', 17, 5],
      ['goldmine', 3, 10],
      ['collector', 21, 13],
      ['archertower', 16, 9],
      ['cannon', 9, 16],
      ['mortar', 15, 11],
      ['builder', 8, 4],
    ],
    rings: [[6, 6, 20, 20]],
    hint: 'Mortar shells punish a crowded army. Deploy in two groups.',
    recommended: 65,
    health: 0.9,
    defense: 1,
  },
  {
    buildings: [
      ['townhall', 15, 10],
      ['goldstorage', 11, 5],
      ['goldmine', 5, 8],
      ['goldmine', 5, 12],
      ['goldstorage', 5, 16],
      ['elixirstorage', 11, 16],
      ['barracks', 17, 17],
      ['camp', 20, 5],
      ['collector', 20, 11],
      ['cannon', 9, 10],
      ['mortar', 13, 13],
      ['archertower', 16, 6],
      ['builder', 7, 20],
    ],
    rings: [[10, 8, 21, 20]],
    hint: 'The mines are exposed, but the keep is protected from the east.',
    recommended: 75,
    health: 1,
    defense: 1.1,
  },
  {
    buildings: [
      ['townhall', 11, 11],
      ['archertower', 7, 8],
      ['archertower', 17, 8],
      ['archertower', 8, 17],
      ['archertower', 17, 17],
      ['cannon', 12, 7],
      ['mortar', 12, 17],
      ['goldstorage', 7, 12],
      ['elixirstorage', 17, 12],
      ['barracks', 11, 3],
      ['camp', 3, 18],
      ['goldmine', 3, 10],
      ['collector', 21, 5],
      ['builder', 21, 20],
    ],
    rings: [
      [6, 6, 20, 20],
      [10, 10, 15, 15],
    ],
    hint: 'Four towers cover the corners. Giants can dismantle one flank.',
    recommended: 85,
    health: 1.1,
    defense: 1.25,
  },
  {
    buildings: [
      ['townhall', 11, 10],
      ['archertower', 7, 7],
      ['archertower', 18, 14],
      ['cannon', 8, 13],
      ['cannon', 16, 9],
      ['mortar', 12, 16],
      ['mortar', 16, 16],
      ['goldstorage', 5, 17],
      ['elixirstorage', 19, 6],
      ['goldmine', 4, 7],
      ['collector', 21, 17],
      ['barracks', 10, 20],
      ['camp', 3, 12],
      ['builder', 17, 21],
    ],
    rings: [[7, 6, 20, 19]],
    hint: 'Two mortars guard the south. Approach from the north with ranged support.',
    recommended: 95,
    health: 1.2,
    defense: 1.35,
  },
  {
    buildings: [
      ['townhall', 11, 10],
      ['elixirstorage', 7, 7],
      ['elixirstorage', 16, 7],
      ['elixirstorage', 11, 16],
      ['collector', 3, 12],
      ['collector', 20, 12],
      ['collector', 16, 20],
      ['goldstorage', 6, 18],
      ['barracks', 4, 4],
      ['camp', 20, 4],
      ['cannon', 8, 12],
      ['cannon', 16, 13],
      ['archertower', 10, 5],
      ['archertower', 19, 18],
      ['mortar', 8, 16],
      ['builder', 20, 21],
    ],
    rings: [[6, 6, 20, 20]],
    hint: 'Collectors distract your troops. Send giants straight toward the defenses.',
    recommended: 105,
    health: 1.3,
    defense: 1.45,
  },
  {
    buildings: [
      ['townhall', 12, 11],
      ['archertower', 8, 8],
      ['archertower', 18, 8],
      ['archertower', 8, 17],
      ['archertower', 18, 17],
      ['cannon', 12, 7],
      ['cannon', 12, 17],
      ['mortar', 7, 13],
      ['mortar', 18, 13],
      ['goldstorage', 3, 6],
      ['elixirstorage', 22, 14],
      ['goldmine', 3, 18],
      ['collector', 20, 3],
      ['barracks', 12, 3],
      ['camp', 3, 12],
      ['builder', 22, 20],
    ],
    rings: [
      [6, 6, 21, 20],
      [10, 10, 17, 16],
    ],
    hint: 'Break one compartment at a time. Upgrade your troops before this raid.',
    recommended: 115,
    health: 1.4,
    defense: 1.55,
  },
  {
    buildings: [
      ['townhall', 11, 10],
      ['camp', 5, 4],
      ['camp', 20, 20],
      ['barracks', 4, 19],
      ['archertower', 7, 9],
      ['archertower', 17, 9],
      ['archertower', 7, 17],
      ['archertower', 17, 17],
      ['cannon', 11, 6],
      ['cannon', 11, 17],
      ['mortar', 15, 6],
      ['mortar', 15, 14],
      ['goldstorage', 4, 12],
      ['elixirstorage', 20, 12],
      ['goldmine', 20, 5],
      ['collector', 11, 21],
      ['builder', 5, 7],
    ],
    rings: [
      [6, 5, 20, 20],
      [10, 9, 15, 14],
    ],
    hint: 'Layered walls protect the keep. Ranged troops can fire across them.',
    recommended: 125,
    health: 1.5,
    defense: 1.7,
  },
  {
    buildings: [
      ['townhall', 11, 11],
      ['archertower', 7, 7],
      ['archertower', 18, 7],
      ['archertower', 7, 18],
      ['archertower', 18, 18],
      ['cannon', 12, 6],
      ['cannon', 6, 12],
      ['cannon', 19, 12],
      ['cannon', 12, 19],
      ['mortar', 8, 11],
      ['mortar', 16, 14],
      ['goldstorage', 7, 3],
      ['elixirstorage', 18, 3],
      ['camp', 3, 19],
      ['barracks', 20, 21],
      ['goldmine', 3, 7],
      ['collector', 22, 7],
      ['builder', 5, 16],
    ],
    rings: [[5, 5, 22, 22]],
    hint: 'Every approach is defended. Keep your wizards behind a strong frontline.',
    recommended: 135,
    health: 1.6,
    defense: 1.85,
  },
  {
    buildings: [
      ['townhall', 11, 11],
      ['cannon', 7, 11],
      ['cannon', 17, 11],
      ['cannon', 11, 7],
      ['cannon', 11, 17],
      ['archertower', 7, 6],
      ['archertower', 18, 6],
      ['archertower', 7, 19],
      ['archertower', 18, 19],
      ['mortar', 7, 15],
      ['mortar', 17, 15],
      ['mortar', 15, 7],
      ['goldstorage', 3, 10],
      ['elixirstorage', 21, 10],
      ['barracks', 11, 21],
      ['camp', 11, 2],
      ['goldmine', 3, 4],
      ['collector', 22, 19],
      ['builder', 3, 18],
    ],
    rings: [
      [6, 5, 20, 21],
      [10, 10, 15, 15],
    ],
    hint: 'A reinforced inner keep and three mortars demand a veteran army.',
    recommended: 145,
    health: 1.7,
    defense: 2,
  },
  {
    buildings: [
      ['townhall', 11, 11],
      ['goldstorage', 7, 7],
      ['elixirstorage', 16, 7],
      ['goldstorage', 7, 16],
      ['elixirstorage', 16, 16],
      ['archertower', 5, 10],
      ['archertower', 20, 10],
      ['archertower', 10, 5],
      ['archertower', 10, 20],
      ['cannon', 5, 14],
      ['cannon', 20, 14],
      ['cannon', 14, 5],
      ['cannon', 14, 20],
      ['mortar', 8, 12],
      ['mortar', 16, 12],
      ['mortar', 12, 8],
      ['mortar', 12, 16],
      ['barracks', 2, 3],
      ['camp', 21, 21],
      ['goldmine', 2, 20],
      ['collector', 21, 3],
      ['builder', 3, 17],
    ],
    rings: [
      [4, 4, 22, 22],
      [10, 10, 15, 15],
    ],
    hint: 'The final fortress. Scout the gaps and commit your strongest army.',
    recommended: 160,
    health: 1.8,
    defense: 2.15,
  },
];
/** Authored structure footprints plus rings with deliberate gates and no overlapping posts. */
export function campaignBlueprint(index: number): Blueprint[] {
  const layout = CAMPAIGN_LAYOUTS[index];
  if (!layout) throw new RangeError('Unknown campaign stage');
  const result: Blueprint[] = [...layout.buildings];
  const occupied = new Set<string>();
  for (const [k, x, y] of result)
    for (let dx = 0; dx < BUILDINGS[k].size; dx++)
      for (let dy = 0; dy < BUILDINGS[k].size; dy++) occupied.add(`${x + dx},${y + dy}`);
  const wall = (x: number, y: number) => {
    const key = `${x},${y}`;
    if (occupied.has(key)) return;
    occupied.add(key);
    result.push(['wall', x, y]);
  };
  for (const [x0, y0, x1, y1] of layout.rings) {
    const mid = Math.floor((x0 + x1) / 2);
    for (let x = x0; x <= x1; x++) {
      if (x !== mid) wall(x, y0);
      if (x !== mid && x !== mid + 1) wall(x, y1);
    }
    for (let y = y0 + 1; y < y1; y++) {
      if (y !== Math.floor((y0 + y1) / 2)) wall(x0, y);
      if (y !== Math.floor((y0 + y1) / 2) + 1) wall(x1, y);
    }
  }
  return result;
}
