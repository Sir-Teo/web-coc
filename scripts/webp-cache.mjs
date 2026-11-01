import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

function completeWebp(bytes) {
  return (
    bytes.length >= 12 &&
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP' &&
    bytes.readUInt32LE(4) + 8 === bytes.length
  );
}

/** Share duplicate encodes and publish only complete files, including across build processes. */
export function createWebpCache(directory) {
  const pending = new Map();
  return function cachedWebp(hash, encode) {
    const file = path.join(directory, hash + '.webp');
    const existing = pending.get(file);
    if (existing) return existing;
    const task = (async () => {
      try {
        const bytes = await fs.readFile(file);
        if (completeWebp(bytes)) return bytes;
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      const bytes = await encode();
      if (!completeWebp(bytes)) throw Error('The WebP encoder returned an incomplete file.');
      await fs.mkdir(directory, { recursive: true });
      const temporary = file + '.' + randomUUID() + '.tmp';
      try {
        await fs.writeFile(temporary, bytes);
        await fs.rename(temporary, file);
      } finally {
        await fs.rm(temporary, { force: true });
      }
      return bytes;
    })().finally(() => pending.delete(file));
    pending.set(file, task);
    return task;
  };
}
