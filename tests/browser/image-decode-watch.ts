import { expect, type Page } from '@playwright/test';

/** Observe the original decode promise, including cancellation before a gated body arrives. */
export async function watchImageDecodes(
  page: Page,
  prefixes = ['/troops-native/', '/assets/native-pages/'],
) {
  await page.addInitScript((prefixes) => {
    window.__imageDecodes = [];
    const decode = HTMLImageElement.prototype.decode;
    HTMLImageElement.prototype.decode = function () {
      const promise = decode.call(this);
      if (prefixes.some((prefix) => this.src.includes(prefix))) {
        const entry = { src: this.src, outcome: 'pending' };
        window.__imageDecodes.push(entry);
        promise.then(
          () => {
            entry.outcome = 'fulfilled';
          },
          () => {
            entry.outcome = 'rejected';
          },
        );
      }
      return promise;
    };
  }, prefixes);
}

export async function expectCancelledImageDecode(page: Page, glob: string) {
  await expect
    .poll(() =>
      page.evaluate(
        (suffix) => {
          const requests = window.__imageDecodes.filter((entry) => entry.src.endsWith(suffix));
          return requests.length
            ? requests
                .filter((entry) => entry.outcome !== 'rejected')
                .map((entry) => `${entry.src}: ${entry.outcome}`)
            : ['No matching decode'];
        },
        glob.startsWith('**') ? glob.slice(2) : glob,
      ),
    )
    .toEqual([]);
}

export const watchTroopImageDecodes = watchImageDecodes;
export const expectCancelledTroopDecode = expectCancelledImageDecode;
