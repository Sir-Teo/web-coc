import type Phaser from 'phaser';

/** Add simulation-driven motion at Phaser's camera transform stage, before its inverse is built. */
export class CameraShakeLayer {
  private readonly original: () => void;
  private readonly render: () => void;
  constructor(
    private camera: Phaser.Cameras.Scene2D.Camera,
    sample: () => { x: number; y: number },
  ) {
    const effect = camera.shakeEffect;
    this.original = effect.preRender;
    this.render = () => {
      this.original.call(effect);
      const offset = sample();
      camera.getViewMatrix(true).translate(offset.x, offset.y);
    };
    effect.preRender = this.render;
  }
  destroy() {
    if (this.camera.shakeEffect.preRender === this.render)
      this.camera.shakeEffect.preRender = this.original;
  }
}
