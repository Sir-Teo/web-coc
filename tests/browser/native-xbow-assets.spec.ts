import { test, expect } from '@playwright/test';
import native from '../../reference/xbow/native.json' with { type: 'json' };

test('native X-Bow mesh textures and seven original sounds decode in the browser', async ({
  page,
}) => {
  await page.goto('/');
  const reference = { textures: native.textures, sounds: native.sounds };
  const report = await page.evaluate(async (source) => {
    const images = [];
    for (const [id, texture] of Object.entries(source.textures)) {
      const image = new Image();
      image.src = '/' + texture.path;
      await image.decode();
      images.push({ id, width: image.naturalWidth, height: image.naturalHeight });
    }
    const context = new AudioContext();
    try {
      const sounds = [];
      for (const [name, sound] of Object.entries(source.sounds)) {
        const response = await fetch('/' + sound.path);
        if (!response.ok) throw Error(`Missing ${sound.path}`);
        const audio = await context.decodeAudioData(await response.arrayBuffer());
        sounds.push({ name, duration: audio.duration, channels: audio.numberOfChannels });
      }
      return { images, sounds };
    } finally {
      await context.close();
    }
  }, reference);
  expect(report.images).toEqual(
    Object.entries(native.textures).map(([id, t]) => ({
      id,
      width: t.width,
      height: t.height,
    })),
  );
  expect(report.sounds).toHaveLength(7);
  expect(report.sounds.every((s) => s.duration > 0 && s.duration < 10 && s.channels > 0)).toBe(
    true,
  );
});
