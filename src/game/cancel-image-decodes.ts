/**
 * A local replacement settles the old decode promise in both engines. Removing `src` can
 * leave Chromium's promise pending; WebKit can keep transferring the old image for its cache.
 */
const CANCELLED_IMAGE =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/** Only pending images: registered texture sources must remain intact for context recovery. */
export function cancelImageDecodes(images: Set<HTMLImageElement>) {
  for (const image of images) image.src = CANCELLED_IMAGE;
  images.clear();
}
