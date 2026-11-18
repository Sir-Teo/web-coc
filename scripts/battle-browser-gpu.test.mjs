import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gpuExpectationFailure } from './battle-browser-gpu.mjs';

test('matches a specific unmasked GPU model case-insensitively', () => {
  const gpu = {
    unmasked: true,
    vendor: 'Google Inc. (Apple)',
    renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M3, Unspecified Version)',
  };
  assert.equal(gpuExpectationFailure(gpu, 'apple m3'), null);
  assert.match(gpuExpectationFailure(gpu, 'Apple M2'), /Expected the GPU model/);
  assert.match(gpuExpectationFailure({ ...gpu, unmasked: false }, 'Apple M3'), /unmasked/);
  assert.match(gpuExpectationFailure({ ...gpu, renderer: null }, 'Apple M3'), /unmasked/);
});

test('rejects known software renderers even when the expected substring matches', () => {
  for (const renderer of [
    'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)',
    'llvmpipe (LLVM 19.1.7, 256 bits)',
    'lavapipe',
    'Microsoft Basic Render Driver',
    'D3D11 WARP',
  ]) {
    assert.match(
      gpuExpectationFailure({ unmasked: true, vendor: '', renderer }, renderer),
      /software renderer/,
    );
  }
});
