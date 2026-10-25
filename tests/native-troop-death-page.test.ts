import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import sharp from 'sharp';
import { expect, it } from 'vitest';
import { nativeMeshTexture } from '../src/game/native-mesh';

it('shares the exact pinned skull page across every troop characters scene that declares it', async () => {
  const root = 'public/assets/troops-native';
  const path = 'assets/garrison-death-native/texture/texture-2.png';
  const affected: string[] = [];
  for (const kind of readdirSync(root)) {
    const graph = `${root}/${kind}/graph.json`;
    if (!existsSync(graph)) continue;
    const pack = JSON.parse(readFileSync(graph, 'utf8'));
    const texture = pack.scenes.characters?.textures['2'];
    if (!texture) continue;
    affected.push(kind);
    expect(texture, kind).toEqual({ path, width: 128, height: 43 });
    for (const id of [2, '2'])
      expect(nativeMeshTexture(`troop:${kind}:characters`, id)).toBe(
        'troop:shared:characters:mesh:2',
      );
    expect(nativeMeshTexture(`troop:${kind}:characters`, 0)).toBe(
      `troop:${kind}:characters:mesh:0`,
    );
    for (const scene of Object.keys(pack.scenes).filter((scene) => scene !== 'characters'))
      expect(nativeMeshTexture(`troop:${kind}:${scene}`, 2)).toBe(`troop:${kind}:${scene}:mesh:2`);
  }
  expect(affected).toHaveLength(59);
  expect(nativeMeshTexture('garrison-dragonDeath', 2)).toBe('garrison-dragonDeath:mesh:2');
  const pixels = await sharp(`public/${path}`).ensureAlpha().raw().toBuffer();
  expect(pixels.length).toBe(22_016);
  expect(createHash('sha256').update(pixels).digest('hex')).toBe(
    '7a86657cc27cb68e70c727b9bb5398c2eaf14e705286d1c5d37c46e2eda4fbc7',
  );
});
