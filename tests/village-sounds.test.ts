import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import catalog from '../reference/village-sounds/sounds.json' with { type: 'json' };
import { SampleAudio } from '../src/game/sample-audio';
import { GameModel, makeBuilding, type FX } from '../src/game/model';

describe('village sounds', () => {
  it('pins each client effect and ships its sound unchanged', () => {
    expect(Object.keys(catalog.effects)).toHaveLength(13);
    expect(catalog.effects['Collect Gold']).toEqual({
      sound: 'sfx/coins_collect_01.ogg',
      volume: 0.7,
      minPitch: 1,
      maxPitch: 1,
    });
    // Start Building plays the construction sound a quarter lower, as the client does.
    expect(catalog.effects['Start Building'].minPitch).toBe(0.75);
    for (const [source, sound] of Object.entries(catalog.sounds)) {
      const bytes = readFileSync(`public/${sound.path}`);
      expect(bytes.length).toBe(sound.bytes);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(catalog.sources[source]);
    }
    for (const effect of Object.values(catalog.effects))
      expect(catalog.sounds[effect.sound as keyof typeof catalog.sounds]).toBeDefined();
  });

  it('plays a decoded sample as a one-shot at the client volume and pitch', async () => {
    const started: { rate: number; gain: number }[] = [];
    const node = () => ({ connect() {}, disconnect() {} });
    const context = {
      state: 'running',
      destination: {},
      decodeAudioData: async () => ({ duration: 1 }),
      createGain: () => ({ ...node(), gain: { value: 0 } }),
      createBufferSource() {
        const gain = { value: 0 };
        const source = {
          ...node(),
          buffer: null,
          playbackRate: { value: 1 },
          onended: null,
          start: () => started.push({ rate: source.playbackRate.value, gain: gain.value }),
        };
        return source;
      },
    } as unknown as AudioContext;
    const samples = new SampleAudio(() => context);
    expect(samples.shot('village-click', 0.6)).toBe(false); // Not registered yet.
    samples.register('village-click', new ArrayBuffer(8));
    await Promise.resolve();
    await Promise.resolve();
    expect(samples.shot('village-click', 0.7, 0.75)).toBe(true);
    expect(started).toHaveLength(1);
    expect(started[0].rate).toBe(0.75);
  });

  it('marks finished research and hero upgrades at their buildings', () => {
    const m = new GameModel();
    m.state.obstacles = [];
    m.state.buildings = [
      makeBuilding(1, 'townhall', 20, 20, 9),
      makeBuilding(2, 'laboratory', 10, 10, 5),
      makeBuilding(3, 'herohall', 30, 10, 2),
    ];
    m.tick(m.clock);
    const effects: FX[] = [];
    m.onEffect = (fx) => effects.push(fx);
    m.state.research = { kind: 'archer', end: m.clock + 1000 };
    m.tick(m.clock + 2000);
    expect(effects).toContainEqual({ type: 'upgrade', x: 11.5, y: 11.5, finished: 'research' });
    const king = m.heroProgress('king')!;
    king.upgradeStart = m.clock;
    king.upgradeEnd = m.clock + 1000;
    effects.length = 0;
    m.tick(m.clock + 2000);
    expect(effects).toContainEqual({ type: 'upgrade', x: 32, y: 12, finished: 'hero' });
  });
});
