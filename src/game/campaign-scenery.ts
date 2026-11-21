import decorationCatalog from '../../reference/decorations/catalog.json' with { type: 'json' };
import obstacleCatalog from '../../reference/obstacles/catalog.json' with { type: 'json' };
import { NATIVE_SCENERY } from './native-campaign';
import { DECORATIONS, DECORATION_GROUND, DECORATION_SCALE } from './decorations';
import { OBSTACLES, obstacleArtPlacement } from './obstacles';

const portraitKey = (entry: { export: string; size: number }) => `${entry.export}:${entry.size}`;
const obstaclePortraits = new Map(
  obstacleCatalog.obstacles.map((row) => [portraitKey(row), row.id]),
);
const decorationPortraits = new Map(
  decorationCatalog.decorations.map((row) => [portraitKey(row), row.id]),
);

/** Matched retained exports. Registration follows the corresponding Home Village prop. */
export function nativeSceneryArt(data: number) {
  const source = NATIVE_SCENERY[data];
  if (!source) return undefined;
  const key = portraitKey(source);
  const decoration = decorationPortraits.get(key);
  if (decoration) {
    const { texture, art } = DECORATIONS[decoration];
    return {
      texture,
      path: '/' + art.path,
      width: art.width * DECORATION_SCALE,
      height: art.height * DECORATION_SCALE,
      originX: art.originX,
      originY: art.originY + DECORATION_GROUND / art.height,
    };
  }
  const obstacle = obstaclePortraits.get(key);
  if (obstacle) {
    const def = OBSTACLES[obstacle];
    return { ...obstacleArtPlacement(def), texture: def.texture, path: '/' + def.art.path };
  }
}
export const SCENERY_SPRITES = [
  'pine',
  'rock',
  'sharp-rock',
  'stump',
  'log',
  'mushrooms',
  'tombstone',
  'torch',
  'pole',
  'windmeter',
  'campfire',
  'statue',
  'skull-flag',
  'arrow-flag',
  'flowers',
  'christmas',
] as const;
export type ScenerySprite = (typeof SCENERY_SPRITES)[number];
export const sceneryAsset = (kind: ScenerySprite) => `/assets/environment/campaign/${kind}-v1.webp`;
/** Native identity/position remains intact; several visual variants share authored silhouettes. */
export function sceneryArt(data: number) {
  const d = NATIVE_SCENERY[data],
    exp = d.export.toLowerCase();
  const kind: ScenerySprite = exp.includes('xmas')
    ? 'christmas'
    : exp.includes('tree') && !exp.includes('trunk') && !exp.includes('fallen')
      ? 'pine'
      : exp.includes('sharpstone') || exp.includes('pillar')
        ? 'sharp-rock'
        : exp.includes('stone') && !exp.includes('tomb')
          ? 'rock'
          : exp.includes('fallen') || exp.includes('trunk_b')
            ? 'log'
            : exp.includes('trunk')
              ? 'stump'
              : exp.includes('mushroom')
                ? 'mushrooms'
                : exp.includes('torch')
                  ? 'torch'
                  : exp.includes('windmeter')
                    ? 'windmeter'
                    : exp.includes('fireplace')
                      ? 'campfire'
                      : exp.includes('statue')
                        ? 'statue'
                        : exp.includes('downarrow') || exp.includes('uparrow')
                          ? 'arrow-flag'
                          : exp.includes('flag')
                            ? 'skull-flag'
                            : exp.includes('goblin_pole')
                              ? 'pole'
                              : exp.includes('flower') ||
                                  exp.includes('bush') ||
                                  exp.includes('plant')
                                ? 'flowers'
                                : 'tombstone';
  const width =
    kind === 'pine' || kind === 'christmas'
      ? (140 * d.size) / 2
      : kind === 'torch' || kind === 'pole' || kind === 'windmeter' || kind.endsWith('flag')
        ? 110
        : kind === 'tombstone'
          ? 55
          : 48 * d.size;
  return { texture: `campaign-${kind}`, width, size: d.size };
}
