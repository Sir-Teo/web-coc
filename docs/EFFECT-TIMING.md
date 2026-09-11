# Battle feedback timing

Weapon muzzle flashes and impacts, bomb rings, spell rings and lightning bolts, trap labels, destruction smoke and sparks now advance from the battle's elapsed simulation time. Their initial positions and delays are captured when the combat event occurs. Pausing holds the pose; faster playback advances it with the simulation. Finishing a battle settles pending effects. Returning home, replacing a battle during a seek, enabling reduced motion, and scene shutdown cancel their objects without firing delayed completion callbacks into the next village.

Spell aura pulses also use battle time. Reduced motion fixes the aura radius, keeps feedback in place while fading, and omits flying sparks. Home-village feedback still uses the normal scene clock, so resource collection and construction feedback continue without an active battle.

The timeline only changes presentation, not damage or replay compatibility. Reconstruction clears transient effects instead of replaying historical sound and particle events. Defeat poses are reconstructed separately from each unit's simulation timestamp. Camera shake and short audio samples still use their existing real-time systems; dedicated directional attack/death artwork remains separate work.

Five focused timeline tests cover delays, pause, scale interpolation, completion, cancellation and external destruction. Browser checks cover actual weapon/spell/debris objects, aura command stability, reduced-motion feedback, and transition cleanup, alongside existing projectile and destruction scenarios.
