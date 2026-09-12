import { it, expect } from 'vitest';
import sharp from 'sharp';
import { asset } from '../src/game/data';

it('ships seven complete transparent Blacksmith assets without green matte', async () => {
  const files = [
    asset('blacksmith'),
    ...['puppet', 'vial', 'boots', 'shiny', 'glowy', 'starry'].map(
      (k) => `/assets/equipment/${k}-v1.webp`,
    ),
  ];
  for (const [i, file] of files.entries()) {
    const { data, info } = await sharp(`public${file}`).raw().toBuffer({ resolveWithObject: true });
    expect(info.channels).toBe(4);
    expect(info.width).toBe(i === 0 ? 512 : 256);
    expect(info.height).toBe(info.width);
    let border = 0,
      visible = 0,
      matte = 0;
    for (let y = 0; y < info.height; y++)
      for (let x = 0; x < info.width; x++) {
        const p = (y * info.width + x) * 4,
          a = data[p + 3];
        if (x < 4 || y < 4 || x >= info.width - 4 || y >= info.height - 4) border += a;
        if (a > 32) {
          visible++;
          if (i && data[p + 1] - Math.max(data[p], data[p + 2]) > 30) matte++;
        }
      }
    expect(border, file).toBe(0);
    expect(visible, file).toBeGreaterThan(i === 0 ? 70000 : 15000);
    expect(matte, file).toBe(0);
  }
});
