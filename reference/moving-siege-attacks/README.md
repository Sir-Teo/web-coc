# Moving-fire siege cooldowns and original attack takes

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
The [character tables](../full-client/combat.json) declare `CanAttackWhileMoving`
for Battle Blimp and Log Launcher. Their existing local moving-fire controllers
retain their release periods, routes, damage, projectile behavior and stock.
This boundary adds no stationary charge before a moving release.

Before version 231, the model decremented both machines' ordinary cooldowns
while native Freeze/stun prevented their native controllers from acting. A
half-second hold could therefore leave the next release at its original time.
Version **231** pauses that cooldown during native `frozenUntil`/`stunUntil`.
If the hold ends inside a simulation sample, only the sample's active remainder
advances the timer. Overlapping holds use the later expiry; boundary comparisons
avoid spending floating-point noise as active time. Other native units retain
their existing controllers, including Inferno Dragon's separate version-209
clock. Legacy Freeze Trap holds retain their existing path.

Only initial armies carrying either moving-fire siege enable
`nativeMovingSiegeFreezeClock`. Version 230 and earlier keep their complete old
states and countdown behavior. Four complete old recordings, covering both
machines at source tiers 1/6, were captured twice and reconstructed through
portable forward/backward seeks before the clock change. Their full-state hashes
remain pinned. Without a hold, new states equal old states after removing the
new capability flag.

The renderer previously selected walking whenever the unit's `attacking` flag
was false, even when a moving release had just occurred. It now uses the native
release record and remaining cooldown to sample the original attack take while
the machine continues traveling. The Blimp's `Siege_Machine_Balloon1..6_attack1_*`
takes have **18 timeline frames at 30 FPS**, action frame four; source frame
**three** aligns with release. Log Launcher's `SM_LogLauncher1..6_attack1_*`
takes have **80 timeline frames at 30 FPS**, action frame one; source frame
**zero** aligns with release. Their natural tails finish before returning to
walking. Facing follows the next path point or the movement destination,
including a cold seek. Reduced motion samples frame zero.

This body selection is read-only and also improves older recordings; it follows
each recording's own cooldown behavior. Current version-231 native holds pause
the body take with the cooldown. Damage, projectile contact ordering, body
position and the replay-file envelope are unchanged by the renderer. The
[rolling-log geometry and audio rules](../attacking-log-launcher/README.md) are
retained. This does not establish exact modern executable timing for moving
siege controllers.

Model checks cover both machines at minimum/maximum source tiers, native Freeze
and stun, overlapping holds, partial expiry, unchanged unheld states, capability
scope and full portable replay reconstruction. Source-body sampling checks real
moving releases, natural take completion, held poses, cold/backward seeks,
read-only rendering and reduced motion. Inferno Dragon cadence and rolling-log
regressions exercise adjacent paths. Browser checks cover current/historical
portable states, original visible bodies, release frames, injected native hold
timing, read-only drawing and canonical replay reset on phone/desktop views.
