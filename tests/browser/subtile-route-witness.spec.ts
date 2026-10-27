import { expect, test } from '@playwright/test';

for (const [witness, count, hash] of [
  ['subtileRouteWitness', 391, '51051fefba698e3b95134b5affb8f11e09570530d19d6ccb587fc8dc9965d583'],
  [
    'subtileMeleeBoundaryWitness',
    512,
    'cdfd9daccad1c548fa0caa48196443b01387700049f1689a3ebe08d7d45cbde3',
  ],
] as const)
  test(`native subtile route witnesses match the original simulation exactly: ${witness}`, async ({
    page,
  }) => {
    // Exercise browser arithmetic without competing with rendering or asset uploads.
    await page.route('**/subtile-route-test', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><title>Route witness</title>',
      }),
    );
    await page.goto('/subtile-route-test');
    const result = await page.evaluate(async (witness) => {
      const witnesses = await import('/tests/fixtures/subtile-route-witness.ts');
      const serialized: string[] = [];
      const count = witnesses[witness]((route) => serialized.push(JSON.stringify(route)));
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
    }, witness);
    expect(result).toEqual({ count, hash });
  });
