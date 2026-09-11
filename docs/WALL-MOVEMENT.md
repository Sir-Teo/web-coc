# Moving and rotating wall rows

Connected wall rows can be moved and rotated from the normal village and from edit mode. Select a wall, Select row, then Move row. The complete row is previewed on the grid with its links; tap ground to position its selected anchor, or drag any previewed piece while retaining the grab offset. Dragging elsewhere still pans the camera. Rotate (or R) turns the row 90 degrees around the anchor. Place commits the whole row; Cancel or Escape discards the preview.

The village remains unchanged until Place. Gold, elixir, gems, builder availability, wall IDs, levels, hitpoints and timers are unaffected by movement. The destination is rechecked against current buildings, obstacles and the village boundary before any coordinates change. The row may overlap its own old footprint, but every piece must fit. A newly grown tree or a changed source wall can invalidate the preview; the status explains why and Place is disabled. Invalid previews tint every piece red.

A completed edit-mode move creates one undo entry regardless of the number of drag updates or rotations. Cancel and a four-turn rotation back to the starting position create none. Undo, redo and saved-layout restoration validate the complete arrangement before restoring it; a newly built structure cannot be overlapped by a historical wall position. Blocked history entries remain available after the obstruction is moved. Temporary previews are excluded from saves, so reloading during a preview restores the original village. Opening another activity, selecting another object, entering a battle or ending edit mode discards the preview. Escape cancels the preview while keeping edit mode open.

## Reference and local interaction choices

The [Home Village wall reference](https://clashofclans.fandom.com/wiki/Wall/Home_Village?page=3), available in indexed excerpts on September 11, 2026, describes selecting a row to move or rotate its pieces together. Supercell's [June 2021 quality-of-life update](https://supercell.com/en/games/clashofclans/blog/game-updates/quality-of-life-improvements-june21/) also documents village rotation in 90-degree increments and wall rotation behavior in the layout editor.

The anchored preview, Place/Cancel controls, keyboard shortcuts and collision messages are this project's desktop/touch interaction design. This increment does not claim exact reproduction of every native drag gesture or menu arrangement. Same-level bulk upgrade selections are not necessarily contiguous, so only a connected row exposes Move row.

## Verification

Model tests cover four-turn identity preservation, overlapping the row's old footprint, one blocked piece rejecting the whole transaction, obstacles and village bounds, stale sources, unchanged resources and IDs, preview reload/cancel, single-step edit undo/redo and battle guards. Browser checks exercise real wall selection, tap placement, rotation, dragging with an offset, blocked red previews, source/ghost visibility, persisted coordinates, edit-mode keyboard controls, and 44px controls on 320px portrait and 844px landscape screens. Existing wall-upgrade flows run alongside these checks.

Remaining wall fidelity work includes higher-level art and closer native connection geometry, live-game price/HP tables, Wall Rings and higher Town Hall content. Whole-village rotation and additional layout conveniences remain separate work.

Level 1–8 material artwork and shared placement/preview connections are documented in [WALL-ART.md](WALL-ART.md).
