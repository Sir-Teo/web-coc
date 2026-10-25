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

test('native group snapshots forget retired cells and refresh new waves at the original tick', async ({
  page,
}) => {
  await page.route('**/native-group-test', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Group lifecycle</title>',
    }),
  );
  await page.goto('/native-group-test');
  const witness = await page.evaluate(async () => {
    const { nativeGroupLifecycleWitness } =
      await import('/tests/fixtures/native-group-snapshot.ts');
    return nativeGroupLifecycleWitness();
  });
  expect(witness).toEqual({
    initial: { x: 8.11180339887499, y: 20.944098300562505 },
    sameTick: { x: 8.11180339887499, y: 20.944098300562505 },
    grown: { x: 8.046423834544264, y: 21.116059586360656 },
    shrunk: { x: 8.121267812518166, y: 21.030316953129542 },
    moved: { x: 8.08838834764832, y: 20.91161165235168 },
  });
});
