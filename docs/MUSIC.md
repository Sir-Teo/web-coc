# Music

The Music switch in Settings now plays the original client's music instead of three synthesized sine tones. See the [music reference](../reference/music/README.md) for the files and why they were chosen.

## What plays

| Screen | Music |
| --- | --- |
| Home village | The classic Home theme, parts 1, 2 and 3 in order, then from the start. |
| Battle, before the first deployment | The battle intro sting, then the planning loop. |
| Battle, once it has started | The combat loop. |
| Battle result | The victory sting with at least one star, the defeat sting with none; the loop stops. |

Campaign raids, ladder matches, practice attacks and replays all follow the same rule; the first-run Goblin raid plays as a replay. Returning home starts the Home theme from part 1.

## Playback

- Music is off by default, as before, and nothing is downloaded until it is turned on.
- A saved Music preference starts on the first pointer gesture, printable key, Tab or Enter.
  Modifiers, Escape, browser chords and key repeat leave that activation available. Music-only
  playback can also recover its audio context through feedback while effects stay muted.
- The loops stream through one media element, so a three-minute track is never held decoded in memory. Each file is fetched whole and played from a blob URL: a media element's range requests bypass the service worker's cache, while a whole-file fetch is kept for offline play once heard.
- The stings are seconds long and play through Web Audio.
- Music starts at 50% volume under the effects. The retained media element streams through a
  Web Audio gain, shared with the short stings, so the Music slider works on iOS too. If a media
  source cannot be created, playback uses the element's own volume instead.
- Hiding the page or turning Music off pauses the current loop in place, and it resumes from the same point. Short intro/result stings stop immediately; they do not resume or spill into the next screen.
- A sting that finishes downloading after its screen has changed stays silent, including after an off/on cycle. Its decoded bytes remain available for the next time that screen is entered.
- A track that fails to download stays silent and is tried again on the next scene change.
- Ogg Vorbis needs Safari 18.4 or later on iOS and macOS 15.4 or later; older Safari stays silent for the Ogg files and still plays the MP3 planning loop and stings.

`tests/music.test.ts` checks the shipped bytes, scene selection, Home part order, the intro-then-planning sequence, silence while off, and pause and resume. `tests/audio-lifecycle.test.ts` covers delayed stings, scene changes, mute/re-enable races and stale completion callbacks. `tests/browser/music.spec.ts` follows a practice attack from planning to combat to its result; `tests/browser/audio-lifecycle.spec.ts` delays the real intro download until combat, checks that result music stops at home, and mutes native effects while the music loop keeps playing.

`tests/first-audio-gesture.test.ts` checks first-gesture selection and cleanup.
`tests/audio-activation.test.ts` checks music-only recovery and all-off silence.
`tests/browser/audio-activation.spec.ts` reloads saved music-only preferences, starts playback
with Tab after ignored keys, and resumes an interrupted context without playing effects.

## Volume controls

Settings has separate **Sound effects volume** and **Music volume** sliders. Effects start at
100% and Music at 50%; the on/off switches retain their own state. A muted channel can have
its volume prepared before turning it on. Zero remains zero through reload and import.

Positive volume changes update active sounds without restarting them. Setting effects to
zero releases their voices and skips new playback/decoding work until raised; the effects
switch and haptic feedback keep their own state. Native shots, battle loops and
fallback tones share the effects output; the streamed music loop and stings share the music
output. Live gain changes avoid invalid exponential ramps. Each long track remains streamed
rather than decoded as a complete Web Audio buffer.

`settings.effectsVolume` and `settings.musicVolume` are optional numbers from 0 to 1. Existing
villages use the defaults. Invalid imported values are rejected. Startup and backup restoration
apply levels before enabling playback. During a drag the range input stays mounted across
model refreshes; Home, End and arrow keys work, focus survives completed changes, and muted
state is included in the slider's accessible value.

`tests/audio-volume.test.ts` checks live effects/music routing, lazy outputs and media fallback.
`tests/audio-volume-save.test.ts` checks old saves, bounds, zero and backup reconstruction.
`tests/browser/audio-volume.spec.ts` exercises pointer retention, native keyboard input, real
channel gains, independent switches, reload/import, 44px controls and compact layouts, with
phone and desktop captures in Chromium and WebKit.
