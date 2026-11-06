# Original campaign HUD icon

`native.json` records the original client bundle, source hash, selected child and
frame, captured geometry, bounds and encoded/decoded pixel hashes. The PNG uses
the embedded ASTC texture from `sc/hud.sc`, rendered through the existing native
scene compositor with two transparent pixels around its source bounds.

The Attack button uses `hud_button_fight`'s `icon` child (clip 201), frame zero
(`no_stars`). This is the campaign map, without star-bonus counters. Other named
children in the parent are alternative modes, not layers to flatten together.
The DOM keeps the accessible label and the existing responsive touch target.
The surrounding button layout remains local styling.

Reproduce with the dependencies in `scripts/native_art/requirements.txt`:

```sh
python scripts/import-native-hud.py
python scripts/import-native-hud.py --check
```
