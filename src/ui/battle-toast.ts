type Insets = { top: number; right: number; bottom: number; left: number };
type Box = { left: number; top: number; right: number; bottom: number };
const GAP = 8;
const overlaps = (a: Box, b: Box) =>
  a.left < b.right + GAP &&
  a.right > b.left - GAP &&
  a.top < b.bottom + GAP &&
  a.bottom > b.top - GAP;

/** Find space for a transient message without covering the battle's labels or controls. */
export function positionBattleToast(root: HTMLElement, insets: Insets) {
  const toast = root.querySelector<HTMLElement>('#toast');
  if (!toast) return;
  toast.removeAttribute('data-battle-anchor');
  if (!toast.classList.contains('show') || !root.querySelector('.battle-clock')) return;
  const bounds = root.getBoundingClientRect();
  const area: Box = {
    left: insets.left + GAP,
    top: insets.top + GAP,
    right: bounds.width - insets.right - GAP,
    bottom: bounds.height - insets.bottom - GAP,
  };
  const blockers = Array.from(
    root.querySelectorAll<HTMLElement>(
      '.battle-enemy,.battle-clock,.destruction,.prep-banner,.practice-guide,' +
        '.battle-bottom > button,.deploy-tray,.replay-controls',
    ),
  ).flatMap((element): Box[] => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return !rect.width || !rect.height || style.visibility === 'hidden' || style.display === 'none'
      ? []
      : [
          {
            left: rect.left - bounds.left,
            right: rect.right - bounds.left,
            top: rect.top - bounds.top,
            bottom: rect.bottom - bounds.top,
          },
        ];
  });
  const preferredTop = parseFloat(getComputedStyle(toast).top) || area.top;
  const originalWidth = Math.min(toast.getBoundingClientRect().width, area.right - area.left);
  toast.dataset.battleAnchor = '';
  for (const width of new Set([
    originalWidth,
    ...[320, 260, 200, 160].map((n) => Math.min(n, originalWidth)),
  ])) {
    toast.style.setProperty('--toast-width', `${width}px`);
    const height = toast.getBoundingClientRect().height;
    const preferredLeft = (bounds.width - width) / 2;
    const xs = [
      preferredLeft,
      area.left,
      area.right - width,
      ...blockers.flatMap((b) => [b.right + GAP, b.left - width - GAP]),
    ];
    const ys = [
      preferredTop,
      area.top,
      area.bottom - height,
      ...blockers.flatMap((b) => [b.bottom + GAP, b.top - height - GAP]),
    ];
    let best: { left: number; top: number; distance: number } | undefined;
    for (const left of xs)
      for (const top of ys) {
        const rect = { left, top, right: left + width, bottom: top + height };
        if (
          left < area.left ||
          top < area.top ||
          rect.right > area.right ||
          rect.bottom > area.bottom ||
          blockers.some((b) => overlaps(rect, b))
        )
          continue;
        const distance = Math.hypot(left - preferredLeft, top - preferredTop);
        if (!best || distance < best.distance) best = { left, top, distance };
      }
    if (best) {
      toast.style.setProperty('--toast-left', `${best.left}px`);
      toast.style.setProperty('--toast-top', `${best.top}px`);
      return;
    }
  }
  // An unusually tall guide can leave no free box; retain the normal notification layout.
  toast.removeAttribute('data-battle-anchor');
}
