import type Phaser from 'phaser';
import { RenderQuality } from './render-quality';

// Keep a single backbuffer below 16 megapixels (64 MB of color pixels before
// depth/stencil and driver buffers). Ordinary Retina desktops and 3× phones
// render at their native density; very large displays stay within this budget.
const MAX_RENDER_PIXELS = 16_000_000;

export function displaySize(width: number, height: number, density: number, maxDimension = 8192) {
  const ratio = Math.min(
    Number.isFinite(density) && density > 0 ? density : 1,
    Math.sqrt(MAX_RENDER_PIXELS / (width * height)),
    maxDimension / width,
    maxDimension / height,
  );
  // Round, don't floor: at fractional devicePixelRatio (1.25/1.5) flooring
  // loses a pixel, leaving the backbuffer smaller than the element so the
  // browser rescales every frame.
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

/** Phaser's NONE scale mode maps DOM input into the physical canvas buffer. */
export function configureDisplay(game: Phaser.Game) {
  const gl = (game.renderer as Phaser.Renderer.WebGL.WebGLRenderer).gl;
  const viewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
  const maxDimension = Math.min(
    8192,
    gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
    gl.getParameter(gl.MAX_TEXTURE_SIZE),
    viewport[0],
    viewport[1],
  );
  const parent = game.canvas.parentElement!;
  const quality = new RenderQuality();
  quality.reset(performance.now());
  const resize = () => {
    const rect = parent.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const size = displaySize(
      rect.width,
      rect.height,
      window.devicePixelRatio * quality.scale,
      maxDimension,
    );
    if (game.scale.width !== size.width || game.scale.height !== size.height)
      game.scale.resize(size.width, size.height);
    else game.scale.refresh();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(parent);
  let resolution: MediaQueryList;
  let density = 0;
  const watchDensity = () => {
    if (density === window.devicePixelRatio) return;
    density = window.devicePixelRatio;
    quality.scale = 1;
    quality.reset(performance.now());
    resolution?.removeEventListener('change', watchDensity);
    resolution = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    resolution.addEventListener('change', watchDensity);
    resize();
  };
  // Chromium's device-metrics override can change density without emitting a
  // media-query or window resize event. This also covers delayed notifications
  // when a background window moves between displays; no allocation per frame.
  const checkDensity = () => {
    if (density !== window.devicePixelRatio) watchDensity();
    // Resizing cancels active drags in the scene: defer quality changes until pointers are up.
    const scenes = game.scene.scenes;
    const active =
      !document.hidden &&
      !(game.renderer as Phaser.Renderer.WebGL.WebGLRenderer).contextLost &&
      scenes.some((scene) => scene.sys.isActive()) &&
      scenes.every(
        (scene) =>
          !scene.load.isLoading() && !(scene as Phaser.Scene & { paused?: boolean }).paused,
      ) &&
      !game.input.pointers.some((pointer) => pointer.isDown);
    if (quality.sample(performance.now(), active, density)) resize();
  };
  watchDensity();
  game.events.on('prestep', checkDensity);
  game.events.once('destroy', () => {
    observer.disconnect();
    resolution.removeEventListener('change', watchDensity);
    game.events.off('prestep', checkDensity);
  });
}
