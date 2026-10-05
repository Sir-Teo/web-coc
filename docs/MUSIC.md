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
- The loops stream through one media element, so a three-minute track is never held decoded in memory. Each file is fetched whole and played from a blob URL: a media element's range requests bypass the service worker's cache, while a whole-file fetch is kept for offline play once heard.
- The stings are seconds long and play through Web Audio.
- Music plays at half volume under the effects. iOS ignores a media element's volume, so the Home and battle loops play at full volume there; the stings still follow it.
- Hiding the page or turning Music off pauses the current track in place, and it resumes from the same point.
- A track that fails to download stays silent and is tried again on the next scene change.
- Ogg Vorbis needs Safari 18.4 or later on iOS and macOS 15.4 or later; older Safari stays silent for the Ogg files and still plays the MP3 planning loop and stings.

Verified October 5, 2026: `tests/music.test.ts` checks the shipped bytes, scene selection, Home part order, the intro-then-planning sequence, silence while off, pause and resume, and stale downloads. `tests/browser/music.spec.ts` turns Music on in Chromium and follows a practice attack from planning to combat to its result. WebKit was not available in this environment.
