import { expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { nativePages } from '../scripts/vite-native-pages.mjs';

it('leaves production output alone when the development server closes', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'native-pages-close-'));
  try {
    const directory = path.join(root, 'dist/assets/troops-native/giant');
    await fs.mkdir(directory, { recursive: true });
    // A concurrent build may be midway through writing a pack when the dev server restarts.
    const file = path.join(directory, 'graph.json');
    const partial = '{"levels":[';
    await fs.writeFile(file, partial);
    const plugin = nativePages();
    plugin.configResolved({
      command: 'serve',
      root,
      publicDir: path.join(root, 'public'),
      build: { outDir: 'dist' },
    });
    await expect(plugin.closeBundle()).resolves.toBeUndefined();
    expect(await fs.readFile(file, 'utf8')).toBe(partial);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
