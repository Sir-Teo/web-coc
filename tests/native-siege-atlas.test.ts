import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { expect, it } from 'vitest';
import { nativeMeshTexture } from '../src/game/native-mesh';

it('shares only the pinned identical characters page across five siege packs', async () => {
  const kinds = ['battledrill', 'flameflinger', 'loglauncher', 'trooplauncher', 'wallwrecker'];
  const shared = 'assets/troops-native/battledrill/characters/texture-8.png';
  for (const kind of kinds) {
    const pack = JSON.parse(readFileSync(`public/assets/troops-native/${kind}/graph.json`, 'utf8'));
    expect(pack.scenes.characters.textures['8']).toEqual({ path: shared, width: 950, height: 958 });
    expect(nativeMeshTexture(`troop:${kind}:characters`, 8)).toBe(
      'troop:battledrill:characters:mesh:8',
    );
    expect(nativeMeshTexture(`troop:${kind}:characters`, 0)).toBe(
      `troop:${kind}:characters:mesh:0`,
    );
    for (const name of Object.keys(pack.scenes).filter((name) => name !== 'characters'))
      expect(nativeMeshTexture(`troop:${kind}:${name}`, 8)).toBe(`troop:${kind}:${name}:mesh:8`);
  }
  const pixels = await sharp(`public/${shared}`).ensureAlpha().raw().toBuffer();
  // The independent importer alias pins every RGBA byte, including transparent RGB.
  expect(createHash('sha256').update(pixels).digest('hex')).toBe(
    'd5a6cb13619dedb06df08b85e30d5a5c9abccf9b4e518cbaaba892229db89a20',
  );
});
