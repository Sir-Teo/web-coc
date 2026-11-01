# Physical release contact poses

The pinned **18.400.21** troop graph packs declare a one-based `actionFrame` and
source clip FPS. Existing phased attacks draw that contact at `(actionFrame - 1) / FPS`,
with a captured charge/recovery offset. The source assets and timing adapter are unchanged.

A version-215 read-only probe of actual first attacks found frame 0 drawn at release for
Archer, Minion, Wizard and Dragon. Their level-one contact frames are 4, 7, 13 and 1.
With zero recovery, the simulation correctly schedules the next full charge immediately;
its negative animation offset then projects the release tick back to the first frame.

Version 216 selects the source contact pose when a phased offset is negative and the
unit's `lastAttackAt` equals the current battle time. The adjustment is a renderer-local
value. The model's charge metadata, damage, projectiles, statuses and movement retain
exactly the same values. On the next simulation tick, the next charge draws normally.
Nonnegative recovery offsets retain their projection. Reduced-motion rendering still
uses frame 0. Version 215 and earlier retain their original presentation.

The original baked Booger atlas already aligns its release in version 215; this change
uses the ordinary troop graph renderer and adds no art or audio asset. Native executable
attack timing remains outside the existing older-engine timing adapter's verified scope.

Model checks compare complete version-215/216 battles after removing only the new
presentation flag, across near/far approaches and base/maximum Archer, Minion, Wizard,
Dragon and Root Rider tiers. Root Rider is a nonzero-recovery control. Portable recordings
cover forward/reverse complete states in both versions. Presentation checks load the
shipped source graphs to verify first/repeat contact frames, historical frames,
reduced-motion drawing and read-only backward redraws.

Chromium and WebKit checks verify original visible troop meshes and first/repeat source
contact frames across base/maximum profiles on phone and desktop. They compare complete
Node states in both seek directions, retain the historical release frame, and check
read-only/reduced-motion rendering, asset loads and WebGL health.
