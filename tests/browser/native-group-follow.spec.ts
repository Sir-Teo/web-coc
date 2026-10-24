import { expect, test } from '@playwright/test';

test('native group followers retain the original snapshot timing and exact movement', async ({
  page,
}) => {
  await page.route('**/native-group-test', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Group witness</title>',
    }),
  );
  await page.goto('/native-group-test');
  const witness = await page.evaluate(async () => {
    const { nativeGroupSnapshotWitness } = await import('/tests/fixtures/native-group-snapshot.ts');
    return nativeGroupSnapshotWitness();
  });
  expect(witness).toEqual({
    attack: { attacking: true, x: 16, y: 21 },
    current: { x: 8.11180339887499, y: 20.944098300562505 },
    next: { x: 8.046423834544264, y: 21.116059586360656 },
  });
});
