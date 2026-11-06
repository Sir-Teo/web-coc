# Original HUD artwork

`native.json` records the original client bundle, source hash, selected child and
frame, captured geometry, bounds and encoded/decoded pixel hashes. The PNGs use
the embedded ASTC textures from `sc/hud.sc` and `sc/ui.sc`, rendered through the existing native
scene compositor with two transparent pixels around its source bounds.

The Attack button uses `hud_button_fight`'s `icon` child (clip 201), frame zero
(`no_stars`). This is the campaign map, without star-bonus counters. Other named
children in the parent are alternative modes, not layers to flatten together.
The DOM keeps the accessible label and the existing responsive touch target.
The button also uses the parent's unnamed first child (shape 55) for its original
gold and brown background. Its 125×123 capture is displayed with a local 12-pixel
CSS border-image slice to preserve corners across responsive button sizes. The
surrounding layout, label positioning and slice width are local styling.

`ui_bottom_right` supplies the normal Shop graphic (shape 21791, coins and a
hammer) and Settings body (clip 22637, its original plate and gears). Each record
stores the verified parent/child slot path. The Shop label and green button
styling remain local; its source `Normal` frame's text and notification badges
are excluded. Settings excludes its parent's `number_of_entrys` badge.
Only sheets used by these graphics are decoded during reconstruction. All four
static images retain the original source geometry and colors; they add no
per-frame animation work.

Reproduce with the dependencies in `scripts/native_art/requirements.txt`:

```sh
python scripts/import-native-hud.py
python scripts/import-native-hud.py --check
```
