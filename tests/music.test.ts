import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import catalog from '../reference/music/catalog.json' with { type: 'json' };
import { MusicPlayer, musicScene, type MusicElement } from '../src/game/music';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

class FakeElement implements MusicElement {
  src = '';
  loop = false;
  volume = 1;
  paused = true;
  plays: string[] = [];
  private ended?: () => void;
  play() {
    this.paused = false;
    this.plays.push(this.src);
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  addEventListener(_: 'ended', listener: () => void) {
    this.ended = listener;
  }
  end() {
    this.paused = true;
    this.ended?.();
  }
}

function harness(withContext = true, delayStings = false) {
  const el = new FakeElement();
  const stings: string[] = [];
  const fetched: string[] = [];
  const pending: (() => void)[] = [];
  const stopped: string[] = [];
  const downloads: (() => void)[] = [];
  const context = {
    decodeAudioData: async (bytes: ArrayBuffer) => ({ name: new TextDecoder().decode(bytes) }),
    createBufferSource: () => {
      const source = {
        buffer: null as { name: string } | null,
        onended: null as null | (() => void),
        connect: () => {},
        disconnect: () => {},
        start: () => {
          stings.push(source.buffer!.name);
          pending.push(() => source.onended?.());
        },
        stop: () => {
          stopped.push(source.buffer!.name);
          source.onended?.();
        },
      };
      return source;
    },
    createGain: () => ({ gain: { value: 1 }, connect: () => {}, disconnect: () => {} }),
    destination: {},
  } as unknown as AudioContext;
  const player = new MusicPlayer(() => (withContext ? context : null), {
    element: () => el,
    fetch: async (path) => {
      fetched.push(path);
      if (delayStings && /new_battle_intro|winwinwin|battle_lost/.test(path))
        await new Promise<void>((resolve) => downloads.push(resolve));
      return new TextEncoder().encode(path).buffer as ArrayBuffer;
    },
    objectUrl: (_bytes, path) => `blob:${path}`,
  });
  const finishStings = () => pending.splice(0).forEach((end) => end());
  const finishDownloads = () => downloads.splice(0).forEach((done) => done());
  return { player, el, stings, fetched, stopped, finishStings, finishDownloads };
}

describe('music', () => {
  it('ships the original files byte for byte', () => {
    for (const tracks of Object.values(catalog.tracks))
      for (const track of tracks) {
        const bytes = readFileSync(`public/${track.path}`);
        expect(bytes.length).toBe(track.bytes);
        expect(createHash('sha256').update(bytes).digest('hex')).toBe(track.sha256);
      }
    expect(catalog.tracks.home.map((t) => t.source)).toEqual([
      'music/home_music_part_1.ogg',
      'music/home_music_part_2.ogg',
      'music/home_music_part_3.ogg',
    ]);
  });

  it('follows the battle on screen', () => {
    expect(musicScene(null)).toBe('home');
    expect(musicScene({ started: false, stars: 0 })).toBe('planning');
    expect(musicScene({ started: true, stars: 1 })).toBe('combat');
    expect(musicScene({ started: true, finished: true, stars: 1 })).toBe('victory');
    expect(musicScene({ started: true, finished: true, stars: 0 })).toBe('defeat');
  });

  it('plays the three Home parts in order and starts over', async () => {
    const { player, el } = harness();
    player.setScene('home');
    player.setEnabled(true);
    await flush();
    expect(el.src).toBe('blob:assets/audio/music/home_music_part_1.ogg');
    expect(el.loop).toBe(false);
    expect(el.volume).toBe(0.5);
    for (const part of [2, 3, 1]) {
      el.end();
      await flush();
      expect(el.src).toBe(`blob:assets/audio/music/home_music_part_${part}.ogg`);
      expect(el.paused).toBe(false);
    }
  });

  it('opens a battle with the intro, then loops planning and combat music', async () => {
    const { player, el, stings, finishStings } = harness();
    player.setEnabled(true);
    player.setScene('home');
    await flush();
    player.setScene('planning');
    expect(el.paused).toBe(true);
    await flush();
    expect(stings).toEqual(['assets/audio/music/new_battle_intro_01.mp3']);
    expect(el.src).toContain('home_music_part_1');
    finishStings();
    await flush();
    expect(el.src).toBe('blob:assets/audio/music/combat_planning_music.mp3');
    expect(el.loop).toBe(true);
    player.setScene('combat');
    await flush();
    expect(el.src).toBe('blob:assets/audio/music/combat_music.ogg');
    expect(el.loop).toBe(true);
    player.setScene('victory');
    await flush();
    expect(el.paused).toBe(true);
    expect(stings.at(-1)).toBe('assets/audio/music/winwinwin.mp3');
    player.setScene('home');
    await flush();
    expect(el.src).toBe('blob:assets/audio/music/home_music_part_1.ogg');
    player.setScene('planning');
    await flush();
    finishStings();
    player.setScene('defeat');
    await flush();
    expect(stings.at(-1)).toBe('assets/audio/music/battle_lost_02.mp3');
  });

  it('downloads nothing and stays silent while music is off', async () => {
    const { player, el, stings, fetched } = harness();
    player.setScene('home');
    player.setScene('planning');
    player.setScene('victory');
    await flush();
    expect(fetched).toEqual([]);
    expect(stings).toEqual([]);
    expect(el.plays).toEqual([]);
  });

  it('pauses in place and resumes the same track', async () => {
    const { player, el } = harness();
    player.setEnabled(true);
    player.setScene('home');
    await flush();
    el.end();
    await flush();
    player.setEnabled(false);
    expect(el.paused).toBe(true);
    player.setEnabled(true);
    await flush();
    expect(el.src).toBe('blob:assets/audio/music/home_music_part_2.ogg');
    expect(el.paused).toBe(false);
  });

  it('does not start a loop the screen has already left', async () => {
    const { player, el, finishStings } = harness();
    player.setEnabled(true);
    player.setScene('planning');
    await flush();
    player.setScene('combat');
    await flush();
    finishStings();
    await flush();
    expect(el.src).toBe('blob:assets/audio/music/combat_music.ogg');
  });

  it('stops an active intro when music is switched off', async () => {
    const { player, el, stopped, finishStings } = harness();
    player.setEnabled(true);
    player.setScene('planning');
    await flush();
    player.setEnabled(false);
    expect(stopped).toEqual(['assets/audio/music/new_battle_intro_01.mp3']);
    finishStings();
    await flush();
    expect(el.plays).toEqual([]);
    player.setEnabled(true);
    await flush();
    expect(el.src).toBe('blob:assets/audio/music/combat_planning_music.mp3');
    expect(el.paused).toBe(false);
  });

  it.each(['combat', 'home'] as const)(
    'stops an active intro when leaving for %s',
    async (scene) => {
      const { player, el, stopped, finishStings } = harness();
      player.setEnabled(true);
      player.setScene('planning');
      await flush();
      player.setScene(scene);
      await flush();
      expect(stopped).toEqual(['assets/audio/music/new_battle_intro_01.mp3']);
      const track = el.src;
      finishStings();
      await flush();
      expect(el.src).toBe(track);
    },
  );

  it.each(['victory', 'defeat'] as const)('stops the %s sting on return home', async (scene) => {
    const { player, stopped } = harness();
    player.setEnabled(true);
    player.setScene(scene);
    await flush();
    player.setScene('home');
    expect(stopped).toHaveLength(1);
  });

  it.each(['combat', 'home'] as const)(
    'discards a delayed intro after moving to %s',
    async (scene) => {
      const { player, stings, el, finishDownloads } = harness(true, true);
      player.setEnabled(true);
      player.setScene('planning');
      player.setScene(scene);
      await flush();
      const track = el.src;
      finishDownloads();
      await flush();
      expect(stings).toEqual([]);
      expect(el.src).toBe(track);
    },
  );

  it('does not resurrect a delayed intro after switching music off and on', async () => {
    const { player, stings, el, finishDownloads } = harness(true, true);
    player.setEnabled(true);
    player.setScene('planning');
    player.setEnabled(false);
    player.setEnabled(true);
    finishDownloads();
    await flush();
    expect(stings).toEqual([]);
    expect(el.src).toBe('blob:assets/audio/music/combat_planning_music.mp3');
  });

  it('reuses a delayed intro download for a later planning visit without playing it twice', async () => {
    const { player, stings, fetched, el, finishDownloads, finishStings } = harness(true, true);
    player.setEnabled(true);
    player.setScene('planning');
    player.setScene('home');
    player.setScene('planning');
    finishDownloads();
    await flush();
    expect(stings).toEqual(['assets/audio/music/new_battle_intro_01.mp3']);
    expect(fetched.filter((path) => path.includes('new_battle_intro'))).toHaveLength(1);
    finishStings();
    await flush();
    expect(el.src).toBe('blob:assets/audio/music/combat_planning_music.mp3');
  });
});
