import { it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import heroes from '../reference/full-client/hero-art.json';
import guardians from '../reference/full-client/guardian-art.json';
import type { BakedState } from '../src/game/hero-native-scene';
for (const manifest of [heroes, guardians])
  for (const [key, row] of Object.entries(manifest.characters)) {
    it(`${key}: ships every pinned atlas frame and image within its bounds`, () => {
      const file = path.join('public', row.atlas.path),
        atlasBytes = fs.readFileSync(file);
      expect(createHash('sha256').update(atlasBytes).digest('hex')).toBe(row.atlas.sha256);
      const atlas = JSON.parse(atlasBytes.toString()) as { states: Record<string, BakedState> };
      for (const [name, image] of Object.entries(
        row.images as Record<string, { sha256: string }>,
      )) {
        const bytes = fs.readFileSync(path.join(path.dirname(file), name));
        expect(createHash('sha256').update(bytes).digest('hex')).toBe(image.sha256);
      }
      for (const state of Object.values(atlas.states)) {
        expect(state.frames).toHaveLength(8);
        expect(state.fps).toBeGreaterThan(0);
        for (const frames of state.frames) {
          expect(frames.length).toBeGreaterThan(0);
          for (const frame of frames) {
            const image = (row.images as Record<string, { width: number; height: number }>)[
              frame.image
            ];
            expect(frame.x).toBeGreaterThanOrEqual(0);
            expect(frame.y).toBeGreaterThanOrEqual(0);
            expect(frame.x + frame.w).toBeLessThanOrEqual(image.width);
            expect(frame.y + frame.h).toBeLessThanOrEqual(image.height);
          }
        }
      }
    });
  }
