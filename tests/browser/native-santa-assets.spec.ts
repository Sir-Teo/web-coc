import { test, expect } from '@playwright/test';
import source from '../../reference/santa-trap/native.json' with { type: 'json' };

test('all native Santa images and original Ogg sounds decode in the browser', async ({ page }) => {
  await page.goto('/');
  const report = await page.evaluate(async (reference) => {
    const images = [];
    for (const group of Object.values(reference.groups))
      for (const info of group.pages) {
        const image = new Image();
        image.src = '/' + info.path;
        await image.decode();
        images.push({ path: info.path, width: image.naturalWidth, height: image.naturalHeight });
      }
    for (const state of ['setup', 'spent']) {
      const image = new Image();
      image.src = `/assets/effects/santa-native/${state}.png`;
      await image.decode();
      images.push({ path: image.src, width: image.naturalWidth, height: image.naturalHeight });
    }
    const context = new AudioContext();
    try {
      const sounds = [];
      for (const [name, sound] of Object.entries(reference.sounds)) {
        const response = await fetch('/' + sound.path);
        if (!response.ok) throw Error(`Missing ${sound.path}`);
        const audio = await context.decodeAudioData(await response.arrayBuffer());
        sounds.push({ name, duration: audio.duration, channels: audio.numberOfChannels });
      }
      return { images, sounds };
    } finally {
      await context.close();
    }
  }, source);
  expect(report.images).toHaveLength(7);
  expect(
    report.images.every(
      (im) => im.width > 0 && im.height > 0 && Math.max(im.width, im.height) <= 4096,
    ),
  ).toBe(true);
  expect(report.sounds).toHaveLength(4);
  expect(report.sounds.every((s) => s.duration > 0 && s.duration < 30 && s.channels > 0)).toBe(
    true,
  );
});

test('native sleigh scene graph renders loaded, tipping and empty sack poses', async ({
  page,
  browserName,
}) => {
  await page.goto('/');
  const count = await page.evaluate(async (reference) => {
    const group = reference.groups.sleigh;
    const images = await Promise.all(
      group.pages.map(async (p) => {
        const image = new Image();
        image.src = '/' + p.path;
        await image.decode();
        return image;
      }),
    );
    const canvas = document.createElement('canvas');
    canvas.width = 960;
    canvas.height = 360;
    canvas.id = 'native-santa-source';
    canvas.style.cssText = 'position:fixed;inset:0;z-index:999999;width:960px;height:360px';
    document.body.append(canvas);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#74923b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const labels = ['Loaded · frame 108', 'Tipping · frame 114', 'Empty · frame 120'];
    for (const [column, frame] of [108, 114, 120].entries()) {
      const placements = reference.tracks.sleigh.frames[frame];
      const origin = placements[0].matrix;
      for (const p of placements) {
        const clip = Object.values(group.clips).find((c) => c.id === p.id)!;
        const f = group.frames[clip.frames[p.frame]];
        const [a, c, x, b, d, y] = p.matrix;
        ctx.save();
        ctx.globalAlpha = p.multiply[3];
        ctx.setTransform(
          a * 2,
          b * 2,
          c * 2,
          d * 2,
          column * 320 + 210 + (x - origin[2]) * 2,
          175 + (y - origin[5]) * 2,
        );
        ctx.drawImage(
          images[f.page],
          (f.cell % group.columns) * group.width,
          Math.floor(f.cell / group.columns) * group.height,
          group.width,
          group.height,
          group.bounds[0],
          group.bounds[1],
          group.width / 2,
          group.height / 2,
        );
        ctx.restore();
      }
      ctx.fillStyle = '#fff';
      ctx.font = '16px sans-serif';
      ctx.fillText(labels[column], column * 320 + 20, 330);
    }
    return reference.tracks.sleigh.frames.length;
  }, source);
  expect(count).toBe(320);
  await page
    .locator('#native-santa-source')
    .screenshot({ path: `output/playtest/santa-source-poses-${browserName}.png` });
});
