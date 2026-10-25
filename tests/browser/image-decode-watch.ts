import { expect, type Page } from '@playwright/test';

/** Observe the original decode promise, including cancellation before a gated body arrives. */
export async function watchTroopImageDecodes(page: Page) {
  await page.addInitScript(() => {
    window.__troopImageDecodes = [];
    const decode = HTMLImageElement.prototype.decode;
    HTMLImageElement.prototype.decode = function () {
      const promise = decode.call(this);
      if (this.src.includes('/troops-native/') || this.src.includes('/assets/native-pages/')) {
        const entry = { src: this.src, outcome: 'pending' };
        window.__troopImageDecodes.push(entry);
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
  });
}

export async function expectCancelledTroopDecode(page: Page, glob: string) {
  await expect
    .poll(() =>
      page.evaluate(
        (suffix) => {
          const requests = window.__troopImageDecodes.filter((entry) => entry.src.endsWith(suffix));
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
