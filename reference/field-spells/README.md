# Original spell fields at battle completion

The [effect index](effects.json) retains the pinned client **18.400.21** source phases and
fingerprints. Its original finite graphs already contain the Lightning bolt, impact and crater
needed for a finishing strike. A real level-13 Lightning pulse destroys a two-defense practice
layout at 0.9 seconds, immediately setting the battle's finished state on that same sample.

The field renderer previously cleared every view as soon as the battle finished. It now samples
the shared presentation clock: simulation time while running, then up to the existing two-second
grace window for an observed live battle. Only phases whose start time has already been reached
by the physical battle can appear. Advancing presentation time after an early End Battle cannot
invent later deployment, charging, end or unresolved hit phases. An already started finite phase
can continue through the grace window. The simulation and captured cast remain unchanged.

The normal frame memo also records whether the battle is in that grace window. Its expiration
forces one cleanup frame, retiring spell and other transient views before unchanged-frame
skipping resumes. Without this transition, the last rendered crater could remain indefinitely
even though a forced redraw correctly cleared it.

Opening a replay directly at its finished state grants no grace; it stays settled. Reduced
motion keeps moving field views empty. The existing source-presentation version gates remain,
and combat version 141, recorded outcomes, damage, source graphs and audio files are unchanged.

`tests/finishing-spell-presentation.test.ts` drives the real winning battle through the field
renderer with only its GPU layer replaced. It checks the final hit, progressing presentation
time with frozen combat, cancellation, immediate settling, cold imports and reduced motion.
Browser tests check native meshes on desktop and phone, complete Node/browser battle equality,
portable finished replay imports, cancellation and the normal frame memo. At grace expiration
they require exactly one full cleanup draw, followed by a skipped unchanged frame. Neighboring
spell and finishing-projectile checks retain their original presentation behavior.
