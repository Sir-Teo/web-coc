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

function harness(withContext = true) {
  const el = new FakeElement();
  const stings: string[] = [];
  const fetched: string[] = [];
  const pending: (() => void)[] = [];
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
      return new TextEncoder().encode(path).buffer as ArrayBuffer;
    },
    objectUrl: (_bytes, path) => `blob:${path}`,
  });
  const finishStings = () => pending.splice(0).forEach((end) => end());
  return { player, el, stings, fetched, finishStings };
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
});
