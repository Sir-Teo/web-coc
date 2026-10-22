/** Read tint inputs without a 2D canvas's premultiplied-alpha round trip. */
let sourceContext: WebGLRenderingContext | null = null;
export const NATIVE_SOURCE_PAGE_LIMIT = 4 << 20;

export function readNativeSourcePixels(image: HTMLImageElement): ImageData | undefined {
  if (!image.width || !image.height) return undefined;
  if (image.width * image.height * 4 > NATIVE_SOURCE_PAGE_LIMIT) return undefined;
  let texture: WebGLTexture | null = null;
  let framebuffer: WebGLFramebuffer | null = null;
  let gl: WebGLRenderingContext | null = null;
  try {
    if (!sourceContext || sourceContext.isContextLost()) {
      // A separate, reused context keeps the game's renderer bindings untouched.
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      sourceContext = canvas.getContext('webgl', {
        antialias: false,
        depth: false,
        stencil: false,
        premultipliedAlpha: false,
      });
    }
    gl = sourceContext;
    if (!gl) return undefined;
    const limit = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    if (image.width > limit || image.height > limit) return undefined;
    texture = gl.createTexture();
    framebuffer = gl.createFramebuffer();
    if (!texture || !framebuffer) return undefined;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) return undefined;
    const bytes = new Uint8Array(image.width * image.height * 4);
    gl.readPixels(0, 0, image.width, image.height, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
    if (gl.getError() !== gl.NO_ERROR) return undefined;
    return new ImageData(new Uint8ClampedArray(bytes.buffer), image.width, image.height);
  } catch {
    // Keep the existing canvas path available when an auxiliary context cannot be used.
    return undefined;
  } finally {
    if (gl) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      if (framebuffer) gl.deleteFramebuffer(framebuffer);
      if (texture) gl.deleteTexture(texture);
    }
  }
}
