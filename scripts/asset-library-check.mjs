import { chromium, webkit } from '@playwright/test';
import fs from 'node:fs/promises';
const reports = [];
const baseUrl = process.env.ASSET_LIBRARY_URL ?? 'http://localhost:5173';
for (const [name, type] of [
  ['chromium', chromium],
  ['webkit', webkit],
]) {
  const browser = await type.launch();
  for (const [device, viewport] of [
    ['desktop', { width: 1440, height: 1050 }],
    ['phone', { width: 390, height: 844 }],
  ]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(new URL('/asset-catalog.html', baseUrl).href);
    await page.getByText('823 transparent PNGs').waitFor();
    await page.locator('.card').first().waitFor();
    await page.screenshot({ path: `output/asset-library-${name}-${device}.png`, fullPage: false });
    const th18 = await page.locator('.card').count();
    await page.locator('#search').fill('Revenge Tower');
    if ((await page.locator('.card').count()) !== 1) throw Error('Missing TH18 Revenge Tower');
    await page.locator('#townhall').selectOption('8');
    if ((await page.locator('.card').count()) !== 0) throw Error('TH8 includes TH18 asset');
    await page.locator('#search').fill('Town Hall');
    if (
      !(await page
        .locator('.card')
        .innerText()
        .then((t) => t.includes('Level 8')))
    )
      throw Error('TH8 wrong Hall');
    await page.locator('#townhall').selectOption('18');
    await page.locator('#latest').uncheck();
    if ((await page.locator('.card').count()) !== 18) throw Error('Missing Hall progression');
    await page.screenshot({
      path: `output/asset-library-halls-${name}-${device}.png`,
      fullPage: true,
    });
    await page.locator('#search').fill('');
    await page.locator('#category').selectOption('hero');
    if ((await page.locator('.card').count()) !== 8) throw Error('Missing hero icons');
    await page.screenshot({
      path: `output/asset-library-heroes-${name}-${device}.png`,
      fullPage: false,
    });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    if (overflow || errors.length) throw Error(JSON.stringify({ overflow, errors }));
    const decoded = await page.evaluate(async () => {
      const manifests = await Promise.all(
        ['catalog', 'roster'].map((n) =>
          fetch('/assets/catalog-native/' + n + '.json').then((r) => r.json()),
        ),
      );
      let n = 0;
      for (const c of manifests)
        for (const r of c.portraits) {
          const img = new Image();
          img.src = '/' + r.path;
          await img.decode();
          if (img.naturalWidth !== r.width || img.naturalHeight !== r.height) throw Error(r.path);
          n++;
        }
      return n;
    });
    reports.push({ browser: name, device, th18, decoded, errors, overflow });
    await page.close();
  }
  await browser.close();
}
await fs.writeFile('output/asset-library-browser-report.json', JSON.stringify(reports, null, 2));
console.log(JSON.stringify(reports));
