import Phaser from 'phaser';

const NAME = 'NativeGroupColor';
const registered = new WeakSet<Phaser.Renderer.WebGL.RenderNodes.RenderNodeManager>();
const SOURCE = `
#pragma phaserTemplate(shaderName)
precision highp float;
uniform sampler2D uMainSampler;
uniform vec3 uMultiply;
uniform vec3 uAdd;
varying vec2 outTexCoord;
void main () {
  vec4 pixel = texture2D(uMainSampler, outTexCoord);
  if (pixel.a <= 0.0) {
    gl_FragColor = vec4(0.0);
    return;
  }
  vec3 color = clamp(pixel.rgb / pixel.a * uMultiply + uAdd, 0.0, 1.0);
  gl_FragColor = vec4(color * pixel.a, pixel.a);
}`;

class NativeGroupColorNode extends Phaser.Renderer.WebGL.RenderNodes.BaseFilterShader {
  constructor(manager: Phaser.Renderer.WebGL.RenderNodes.RenderNodeManager) {
    super(NAME, manager, undefined, SOURCE);
  }
  setupUniforms(controller: NativeGroupColor) {
    this.programManager.setUniform('uMultiply', controller.multiply);
    this.programManager.setUniform('uAdd', controller.add);
  }
}

/** Color changes happen after children compose, with clamping before premultiplication. */
export class NativeGroupColor extends Phaser.Filters.Controller {
  multiply = [1, 1, 1];
  add = [0, 0, 0];
  constructor(image: Phaser.GameObjects.RenderTexture) {
    const renderer = image.scene.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
    if (!registered.has(renderer.renderNodes)) {
      renderer.renderNodes.addNodeConstructor(NAME, NativeGroupColorNode);
      registered.add(renderer.renderNodes);
    }
    image.enableFilters();
    super(image.filterCamera!, NAME);
    image.filters!.internal.add(this);
  }
  setColor(multiply: readonly number[], add: readonly number[]) {
    this.multiply = multiply.slice(0, 3);
    this.add = add.slice(0, 3);
  }
}
