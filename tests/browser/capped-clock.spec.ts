import { expect, test } from '@playwright/test';

test('capped Phaser callbacks account for elapsed time once across refresh rates and cap changes', async ({
  page,
}) => {
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  const reports = await page.evaluate(async () => {
    const { correctCappedClock } = await import('/src/game/capped-clock.ts');
    const game = window.__game.game;
    const TimeStep = game.loop.constructor;
    const reports = [];
    for (const smoothStep of [false, true]) {
      for (const fps of [15, 30, 60]) {
        for (const intervals of [
          [50],
          [1000 / 60],
          [1000 / 90],
          [1000 / 144],
          [7, 21, 80, 11, 130, 5],
        ]) {
          const make = (limit, fixed) => {
            const loop = new TimeStep(game, { target: 60, limit, min: 1, panicMax: 0, smoothStep });
            loop.raf.start = () => {};
            loop.raf.stop = () => {};
            if (fixed) {
              correctCappedClock(loop);
              correctCappedClock(loop); // Installation must be idempotent.
            }
            return loop;
          };
          const fixed = make(fps, true),
            stock = make(fps, false),
            reference = make(0, false);
          let total = 0,
            referenceTotal = 0,
            stockTotal = 0,
            error = 0,
            calls = 0,
            stockCalls = 0;
          reference.start((_at, delta) => {
            referenceTotal += delta;
          });
          fixed.start((_at, delta) => {
            total += delta;
            calls++;
            error = Math.max(error, Math.abs(total - referenceTotal));
          });
          stock.start((_at, delta) => {
            stockTotal += delta;
            stockCalls++;
          });
          const loops = [fixed, stock, reference];
          const rebase = (time) => {
            for (const loop of loops) {
              loop.resetDelta();
              loop.inFocus = true;
              loop.lastTime = loop.time = loop.now = time;
            }
            // A reset deliberately discards time pending before its first callback.
            total = referenceTotal = stockTotal = 0;
          };
          let now = 0;
          rebase(now);
          for (let segment = 0; segment < 4; segment++) {
            const limit = segment === 1 ? 0 : segment === 2 ? 30 : fps;
            fixed.setFPSLimit(limit);
            stock.setFPSLimit(limit);
            for (let i = 0; i < 120; i++) {
              now += intervals[i % intervals.length];
              reference.step(now);
              for (const loop of [fixed, stock]) {
                if (loop.hasFpsLimit) loop.stepLimitFPS(now);
                else loop.step(now);
              }
            }
            if (segment === 2) rebase(now);
          }
          reports.push({ smoothStep, fps, intervals, error, calls, stockCalls, stockTotal, total });
          for (const loop of loops) loop.stop();
        }
      }
    }
    return reports;
  });
  expect(reports).toHaveLength(30);
  for (const report of reports) {
    expect(report.error, JSON.stringify(report)).toBeLessThan(1e-7);
    expect(report.calls).toBe(report.stockCalls);
  }
  const reproduction = reports.find((r) => !r.smoothStep && r.fps === 30 && r.intervals[0] === 50)!;
  expect(reproduction.stockTotal).toBeGreaterThan(reproduction.total * 1.3);
});

test('the booted game delivers two seconds once through its actual Phaser step callback', async ({
  page,
}) => {
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  const delivered = await page.evaluate(() => {
    const { game, scene } = window.__game;
    const loop = game.loop;
    loop.stop();
    scene.paused = true;
    loop.setFPSLimit(30);
    loop.smoothStep = false;
    loop.resetDelta();
    loop.lastTime = loop.time = loop.now = 0;
    let elapsed = 0;
    game.events.on('prestep', (_at, delta) => {
      elapsed += delta;
    });
    for (let i = 1; i <= 40; i++) loop.stepLimitFPS(i * 50);
    return elapsed;
  });
  expect(delivered).toBeCloseTo(2000, 7);
});
