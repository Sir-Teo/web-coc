/** CPU-only sticky-target benchmark. Optional --baseline=REF loads that revision's
 * defense implementation without changing the working tree. Compare hashes and
 * medians on the same idle host; this is a targeting workload, not an FPS claim. */
import { createServer } from 'vite';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const baseline = process.argv.find((arg) => arg.startsWith('--baseline='))?.slice(11);
const source = baseline
  ? execFileSync('git', ['show', `${baseline}:src/game/native-defenses.ts`], { encoding: 'utf8' })
  : null;
const server = await createServer({
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, watch: null },
  plugins: source
    ? [
        {
          name: 'defense-benchmark-baseline',
          enforce: 'pre',
          load(id) {
            if (id.endsWith('/src/game/native-defenses.ts')) return source;
          },
        },
      ]
    : [],
});
try {
  const { GameModel, makeBuilding } = await server.ssrLoadModule('/src/game/model.ts');
  const { stepNativeDefense } = await server.ssrLoadModule('/src/game/native-defenses.ts');
  const results = [];
  const hashes = [];
  for (let run = 0; run < 7; run++) {
    const model = new GameModel();
    model.startBattle(0, true);
    const battle = model.battle;
    battle.buildings = Array.from({ length: 40 }, (_, i) =>
      makeBuilding(100 + i, 'monolith', 20, 20),
    );
    battle.units = Array.from({ length: 512 }, (_, i) => ({
      id: 1000 + i,
      kind: 'giant',
      level: 1,
      x: 21.5,
      y: 14,
      hp: 1000000,
      maxHp: 1000000,
      cooldown: 0,
      target: null,
      path: [],
      pathAt: 0,
      attacking: false,
    }));
    // A late-array target exposes a full ID lookup too, rather than measuring
    // only the first unit. Hold fire so this isolates target validation.
    battle.nativeDefenses = Object.fromEntries(
      battle.buildings.map((b) => [
        b.id,
        {
          clock: 0,
          readyAt: 1e9,
          target: 1511,
          awakeAt: 0,
        },
      ]),
    );
    const ctx = { battle, defenseScale: 1, effect() {} };
    const start = performance.now();
    for (let tick = 1; tick <= 400; tick++) {
      battle.elapsed = tick * 0.05;
      // Invalidate the lock once, exercising the unchanged replacement path.
      if (tick === 200) battle.units[511].hp = 0;
      for (const tower of battle.buildings) stepNativeDefense(ctx, tower, 0.05);
    }
    const duration = performance.now() - start;
    if (run >= 2) results.push(duration);
    hashes.push(createHash('sha256').update(JSON.stringify(battle)).digest('hex'));
  }
  if (hashes.some((hash) => hash !== hashes[0])) throw Error('Non-deterministic target state');
  console.log(
    JSON.stringify(
      {
        implementation: baseline ?? 'working tree',
        scenario: '40 sticky defenses, 512 units, 400 ticks, one target death',
        warmup: 2,
        runs: results,
        medianMs: results.toSorted((a, b) => a - b)[2],
        hash: hashes[0],
      },
      null,
      2,
    ),
  );
} finally {
  await server.close();
}
