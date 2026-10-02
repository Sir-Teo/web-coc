import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';

const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'));
const page = readFileSync('index.html', 'utf8');
const css = readFileSync('src/style.css', 'utf8');

describe('home-screen install', () => {
  it('launches the game full screen at the root, in the game colors', () => {
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
    expect(manifest.display).toBe('fullscreen');
    expect(manifest.display_override).toEqual(['fullscreen', 'standalone']);
    expect(manifest.short_name.length).toBeLessThanOrEqual(12);
    // The splash and title bar match the page, so launch does not flash another color.
    expect(page).toContain(`<meta name="theme-color" content="${manifest.theme_color}" />`);
    expect(css).toMatch(new RegExp(`body \\{[^}]*background: ${manifest.background_color};`));
  });

  it('declares icons that exist at their stated sizes', async () => {
    const purposes = new Set<string>();
    for (const icon of manifest.icons) {
      const meta = await sharp(`public${icon.src}`).metadata();
      expect(`${meta.width}x${meta.height}`).toBe(icon.sizes);
      expect(meta.format).toBe('png');
      purposes.add(`${icon.purpose} ${icon.sizes}`);
    }
    // Android installs need 192 and 512 px icons; launchers that mask use the maskable one.
    expect([...purposes].sort()).toEqual(['any 192x192', 'any 512x512', 'maskable 512x512']);
  });

  it('gives iOS an opaque 180 px touch icon and home-screen app tags', async () => {
    expect(page).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
    expect(page).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png" />');
    expect(page).toContain('<meta name="apple-mobile-web-app-capable" content="yes" />');
    expect(page).toContain(
      '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />',
    );
    const touch = sharp('public/apple-touch-icon.png');
    const meta = await touch.metadata();
    expect([meta.width, meta.height]).toEqual([180, 180]);
    // iOS paints transparent pixels black.
    const { data, info } = await touch.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let i = 3; i < data.length; i += info.channels) expect(data[i]).toBe(255);
  });

  it('keeps the maskable crown inside the 80% safe zone', async () => {
    const { data, info } = await sharp('public/app-icon-maskable-512.png')
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const at = (x: number, y: number) => data.subarray((y * 512 + x) * 4, (y * 512 + x) * 4 + 3);
    const [r, g, b] = at(0, 0);
    let farthest = 0;
    for (let y = 0; y < 512; y++)
      for (let x = 0; x < 512; x++) {
        const [pr, pg, pb] = at(x, y);
        if (Math.abs(pr - r) + Math.abs(pg - g) + Math.abs(pb - b) > 24)
          farthest = Math.max(farthest, Math.hypot(x + 0.5 - 256, y + 0.5 - 256));
      }
    expect(farthest).toBeGreaterThan(0);
    expect(farthest / 512).toBeLessThan(0.4);
  });

  it('matches what scripts/app-icons.mjs renders from the favicon', () => {
    expect(() =>
      execFileSync(process.execPath, ['scripts/app-icons.mjs', '--check'], { stdio: 'pipe' }),
    ).not.toThrow();
  });
});
