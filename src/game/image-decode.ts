import Phaser from 'phaser';

const RECOVERABLE_BOOT_IMAGE_WAIT_MS = 8000;
const recoverableBootImages = new WeakSet<Phaser.Loader.File>();

/** Only boot images with an independent fallback and a late loader may time out. */
export function markRecoverableBootImage(file: Phaser.Loader.File) {
  recoverableBootImages.add(file);
}

export function isRecoverableBootImage(file: Phaser.Loader.File) {
  return recoverableBootImages.has(file);
}

interface ElementImageFile {
  state: number;
  src: string;
  data: HTMLImageElement;
  crossOrigin?: string;
  loader: Phaser.Loader.LoaderPlugin;
}

/**
 * Makes the loader's image-element path (`loader.imageLoadType: 'HTMLImageElement'`) hand an
 * image over only once it is decoded. Browsers decode an `<img>` lazily: without this, the first
 * `texImage2D` of each page decodes the whole PNG synchronously on the main thread, which turned
 * the deferred art batches after boot into a string of 200–350 ms frames. `decode()` does that
 * work off the main thread, so the upload is only an upload.
 *
 * Call before the game boots; every ImageFile (and SpriteSheetFile) created afterwards uses it.
 */
export function decodeLoadedImages() {
  const proto = Phaser.Loader.FileTypes.ImageFile.prototype as unknown as {
    loadImage(this: ElementImageFile): void;
  };
  proto.loadImage = function (this: ElementImageFile) {
    this.state = Phaser.Loader.FILE_LOADING;
    this.src = Phaser.Loader.GetURL(
      this as unknown as Phaser.Loader.File,
      this.loader.baseURL,
    ) as string;
    const image = new Image();
    this.data = image;
    if (this.crossOrigin !== undefined) image.crossOrigin = this.crossOrigin;
    image.decoding = 'async';
    const file = this as unknown as Phaser.Loader.File;
    let settled = false;
    const finish = (success: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (success) this.state = Phaser.Loader.FILE_LOADED;
      this.loader?.nextFile(file, success);
    };
    const timer = isRecoverableBootImage(file)
      ? setTimeout(() => {
          image.removeAttribute('src');
          finish(false);
        }, RECOVERABLE_BOOT_IMAGE_WAIT_MS)
      : undefined;
    image.src = this.src;
    // decode() rejects for a failed request and for an undecodable file alike.
    void image.decode().then(() => finish(true), () => finish(false));
  };
}
