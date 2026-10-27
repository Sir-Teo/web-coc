import { defineConfig } from 'vitest/config';
import { availableParallelism } from 'node:os';
export default defineConfig({
  test: {
    include: ['tests/*.test.ts'],
    // The historical determinism suites replay whole battles step by step and take tens of
    // seconds of real work each; the default cap fails them on a slow or contended machine
    // long before anything is actually stuck.
    testTimeout: 180_000,
    hookTimeout: 180_000,
    // Large simulation files contend on smaller runners. Retain the eight-worker ceiling,
    // while respecting the CPU parallelism reported by the runtime (including container quotas).
    maxWorkers: Math.min(8, availableParallelism()),
  },
});
