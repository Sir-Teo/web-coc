import { expect, test } from '@playwright/test';

test('native subtile route witnesses match the original simulation exactly', async ({ page }) => {
  // Exercise browser arithmetic without competing with rendering or asset uploads.
  await page.route('**/subtile-route-test', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Route witness</title>',
    }),
  );
  await page.goto('/subtile-route-test');
  const result = await page.evaluate(async () => {
    const { subtileRouteWitness } = await import('/tests/fixtures/subtile-route-witness.ts');
    const serialized: string[] = [];
    const count = subtileRouteWitness((route) => serialized.push(JSON.stringify(route)));
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(serialized.join('')),
    );
    return {
      count,
      hash: Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(
        '',
      ),
    };
  });
  expect(result).toEqual({
    count: 391,
    hash: '51051fefba698e3b95134b5affb8f11e09570530d19d6ccb587fc8dc9965d583',
  });
});
