# Retained projectile axis trace interpretation

`scripts/native-projectile-axis-audit.mjs` is an isolated diagnostic model of the
[18 retained synthetic axis fixtures](../reference/native-projectile-step-18.400.22.json).
It is not used by the game. It neither runs original ARM64 code nor adds native REA
coverage. Agreement means this interpretation is consistent with these saved records,
not that it is a uniquely identified model or a verified general projectile engine.

## Reproduce

```sh
node --test scripts/native-projectile-axis-audit.test.mjs
node scripts/native-projectile-axis-audit.mjs
```

The report fingerprints both the actual oracle JSON and diagnostic script using
SHA-256. It separately labels the *recorded* original APK and recovered-image digests.
Hashing a retained JSON file does not reauthenticate those original binaries.
A mismatch in any recorded speed, step, hold, contact or sampled-position field causes
a nonzero exit. A resource limit fails explicitly instead of accepting truncated traces.

## Exact observed scope

The fixtures contain two source speeds (`1500`, `2000`), three distances per speed
(one movement step, one sublogic unit farther, and ten tiles), and three initial stop
counters (`0`, `15`, `32`). They cover only positive-axis synthetic objects with the
listed external fixture boundaries. There are six cases per counter value.

The existing production hold tests exercise the six counter-15 cases for the two
source equipment projectiles. The counter-0 and counter-32 controls are additionally
checked by this **diagnostic interpretation**, not newly supported production modes.
The source equipment rows both declare counter 15; counter 32 is a synthetic control.
No off-axis movement, negative coordinates, changing targets, dynamic collision,
external scene effects or unobserved parameter range is established by these records.

## Two ages, not one

The retained contact callback observes the age **before** the update increments it.
The fixture's position sample observes the age **after** that increment. Contact is
checked before consuming a stop counter or advancing the recorded position.

For source speed 1500, the derived movement step is 976 sublogic units:

| Distance / initial stop | Recorded contact age | Final sampled age | Recorded positions |
| --- | --- | --- | --- |
| 976 / 32 | 0 | 16 | 0 |
| 977 / 32 | 48 | 64 | 0, 0, 976, 976 |
| 40960 / 15 | 672 | Only the first four updates are retained | 0, 976, 1952, 2928 |

For the second row, two updates consume the hold; one advances position; the fourth
observes contact. The terminal position sample remains at 976, not at the target at 977.
This describes the retained observer/fixture boundary, not a claim that live-game
collision presentation must leave the projectile there. The diagnostic retains the
same limited first-four sample window rather than inventing additional native traces.

Treating post-update age as contact age would introduce a 16-unit discrepancy. Tests
include that deliberate mutation and confirm it is rejected. The diagnostic derives
movement from source speed and checks the recorded derived fields instead of trusting
them as inputs.

## Remaining production and evidence gap

The production `nativeProjectileBouncePause` ports the observed hold branch into a
continuous flight model. `launchProjectile` still derives flight duration from distance
and source speed; `nativeProjectileFlight` interpolates presentation continuously.
This diagnostic does not replace those functions or claim complete position/arrival
quantization parity. Changing them would require separately established off-axis,
collision, target-motion and replay semantics, with versioned integration tests.

In particular, the native event-age origin is not established as the same wall-clock
origin as a web launch timestamp. Subtracting those values does not by itself prove
that a web hit is a given number of milliseconds early or late. No new live Android
capture, executable rerun, absolute-clock proof, or end-to-end parity claim is made.
