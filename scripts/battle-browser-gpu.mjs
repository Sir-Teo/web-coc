// Browser-reported renderer check. It supplements the operator's GPU diagnostics.
const softwareRenderer =
  /swiftshader|llvmpipe|softpipe|lavapipe|software rasterizer|microsoft basic render driver|\bwarp\b|mesa offscreen/i;

export function gpuExpectationFailure({ renderer, vendor, unmasked }, expected) {
  if (!unmasked || typeof renderer !== 'string' || !renderer.trim())
    return 'The browser did not expose its unmasked WebGL renderer.';
  if (softwareRenderer.test(`${vendor} ${renderer}`))
    return `WebGL reported a software renderer: ${renderer}`;
  if (!renderer.toLowerCase().includes(expected.toLowerCase()))
    return `Expected the GPU model "${expected}" in the WebGL renderer, received "${renderer}".`;
  return null;
}
