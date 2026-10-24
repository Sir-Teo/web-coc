/** CPU-only counterpart to battle-load-benchmark: 400 deterministic 50-ms steps after the
 * same TH18 half-level army deploys around stage 61. No browser, presentation or audio.
 * Run from the repository root: node scripts/battle-sim-benchmark.mjs [--profile].
 * The battle hash checks equivalent results across optimization comparisons.
 */
import { createServer } from 'vite';
import inspector from 'node:inspector/promises';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
const server = await createServer({
  cacheDir: 'node_modules/.vite-battle-sim',
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false, watch: null },
});
try {
  const { GameModel } = await server.ssrLoadModule('/src/game/model.ts');
  const { developedSave } = await server.ssrLoadModule('/tests/fixtures/developed-village.ts');
  const { TROOP_KEYS, maxTroopLevel, BUILDINGS } = await server.ssrLoadModule('/src/game/data.ts');
  const { emptyArmy, emptySpells } = await server.ssrLoadModule('/src/game/army.ts');
  const { freshNativeCampaign } = await server.ssrLoadModule('/src/game/native-campaign.ts');
  const m = new GameModel();
  m.state = developedSave();
  m.state.spells = emptySpells();
  m.state.king = undefined;
  m.state.troopLevels = Object.fromEntries(
    TROOP_KEYS.map((k) => [k, Math.max(1, Math.ceil(maxTroopLevel(k) / 2))]),
  );
  m.state.army = {
    ...emptyArmy(),
    swordsman: 90,
    archer: 90,
    goblin: 40,
    wallbreaker: 10,
    giant: 10,
    wizard: 10,
    minion: 20,
    hogrider: 8,
    bowler: 4,
    witch: 2,
    healer: 2,
    balloon: 2,
  };
  m.state.nativeCampaign = freshNativeCampaign();
  m.state.nativeCampaign.stars.fill(1);
  m.startCampaign(61);
  m.discardRecording();
  const b = m.battle;
  const minX = Math.min(...b.buildings.map((v) => v.x)),
    minY = Math.min(...b.buildings.map((v) => v.y)),
    maxX = Math.max(...b.buildings.map((v) => v.x + BUILDINGS[v.kind].size)),
    maxY = Math.max(...b.buildings.map((v) => v.y + BUILDINGS[v.kind].size));
  const points = [];
  for (let i = 0; i < 6; i++) {
    const t = (i + 0.5) / 6;
    points.push(
      [minX - 2, minY + (maxY - minY) * t],
      [minX + (maxX - minX) * t, minY - 2],
      [maxX + 2, minY + (maxY - minY) * t],
      [minX + (maxX - minX) * t, maxY + 2],
    );
  }
  const clamp = (v) => Math.min(47, Math.max(1, v));
  const open = [];
  for (const [px, py] of points) {
    let x = clamp(px),
      y = clamp(py);
    for (let n = 0; m.deployBlocked(x, y) && n < 6; n++) {
      x = clamp(x + Math.sign(x - 24));
      y = clamp(y + Math.sign(y - 24));
    }
    if (!m.deployBlocked(x, y)) open.push([x, y]);
  }
  let n = 0;
  for (const k of TROOP_KEYS) {
    m.activeTroop = k;
    const count = b.remaining[k] ?? 0;
    for (let i = 0; i < count; i++) {
      const [x, y] = open[n++ % open.length];
      m.deploy(x, y);
    }
  }
  const session = process.argv.includes('--profile') ? new inspector.Session() : null;
  if (session) {
    session.connect();
    await session.post('Profiler.enable');
    await session.post('Profiler.start');
  }
  const times = [];
  for (let i = 0; i < 400; i++) {
    const start = performance.now();
    m.step(0.05);
    times.push(performance.now() - start);
  }
  await fs.mkdir('output/playtest', { recursive: true });
  if (session) {
    const { profile } = await session.post('Profiler.stop');
    session.disconnect();
    await fs.writeFile('output/playtest/battle-sim.cpuprofile', JSON.stringify(profile));
  }
  const sorted = times.slice().sort((a, b) => a - b);
  const report = {
    scenario: 'stage 61, TH18 army, half levels',
    steps: times.length,
    totalMs: times.reduce((a, b) => a + b, 0),
    medianMs: sorted[200],
    p95Ms: sorted[380],
    hash: createHash('sha256').update(JSON.stringify(b)).digest('hex'),
    living: b.units.filter((u) => u.hp > 0).length,
  };
  await fs.writeFile('output/playtest/battle-sim.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await server.close();
}
