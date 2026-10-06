# Layout sharing

The live game's layout editor can copy a layout as a link that other players open to put it in one of their layout slots. Here each saved layout has a **Share** button, and the layouts panel has a **Shared layout** box that takes a link.

## Sharing

Share turns a saved slot into a link: `https://<host>/#layout=<code>`. A phone offers its share sheet (`navigator.share`). Elsewhere the link is copied to the clipboard. Where neither works (an insecure page, a denied permission), the link appears in the box to copy by hand.

The code lists every building's place by kind:

```
1.<town hall>.<kind>:<xy><xy>….<kind>:<xy>…
```

Each coordinate is one character of the URL-safe base-64 alphabet, since the field is 48 tiles. A starter village's 41 buildings make a 196-character code, and 300 walls add about 600. Building modes (an X-Bow's target, an Inferno's mode, an Air Sweeper's facing) are not in the code; each village keeps its own. The format is this game's: the original's links point at its servers, and this game has none.

## Receiving

Opening a layout link starts the game with the layouts panel open, and so does pasting one into the address of an open tab. The link is then dropped from the address, so a reload does not offer it again. A link can also be pasted into the box. The box names the Town Hall the layout was made at and how many buildings it places; a damaged link is reported, and its copy buttons stay disabled.

**Copy to Layout N** maps the layout onto this village and stores it in that slot. The village itself does not move until **Restore** applies the slot, which Undo reverses as before. Copying over a filled slot can be undone from its card, as a save can.

The mapping works kind by kind. A village's buildings of each kind, in the order they were built, take that kind's places in the code in order. A building the code has no place for is set aside on the first free tiles, scanning from the top corner of the buildable field, clear of the other buildings and of obstacles; the original moves such buildings to its layout storage instead. This covers a village with more Cannons or walls than the layout's village, and a place now under an obstacle. A layout that leaves no room for every building is refused.

## Tests

`tests/layout-share.test.ts` checks:

- the code format and its round trip;
- the damaged codes it rejects: version, Town Hall, unknown kinds, odd coordinates, places off the field, overlaps;
- reading a link;
- the mapping by kind and id, and setting aside past an obstacle;
- a starter village's layout shared into another village with other ids, stored, restored, undone and saved.

`tests/browser/layout-share.spec.ts` runs at 390 × 844 and checks:

- a link pasted into an open tab, and a link opened in a new tab;
- the address cleared, the copy into Layout 2 and the restore;
- a Share falling back to the clipboard;
- a damaged pasted link;
- the page's own width.
