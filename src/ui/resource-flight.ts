type Point = { x: number; y: number };

/** HUD particles live in screen space, independent of the village camera. */
export class ResourceFlights {
  private active = new Map<Animation, HTMLElement>();

  emit(from: Point, to: Point, resource: 'gold' | 'elixir' | 'dark') {
    for (let i = 0; i < 7; i++) {
      const x = from.x + (Math.random() - 0.5) * 30;
      const y = from.y + (Math.random() - 0.5) * 18;
      const dot = document.createElement('span');
      dot.className = `resource-flight ${resource}`;
      dot.setAttribute('aria-hidden', 'true');
      dot.style.left = `${x - 5}px`;
      dot.style.top = `${y - 5}px`;
      document.body.append(dot);
      const dx = to.x - x;
      const dy = to.y - y;
      const arcSpread = (i - 3) * 14;
      const midX = dx * 0.45 + arcSpread;
      const midY = dy * 0.45 - (34 + (i % 3) * 12);
      const animation = dot.animate(
        [
          { transform: 'translate(0, 0) scale(1)', opacity: 1, offset: 0 },
          {
            transform: `translate(${midX}px, ${midY}px) scale(1.16)`,
            opacity: 1,
            offset: 0.44,
          },
          { transform: `translate(${dx}px, ${dy}px) scale(0.38)`, opacity: 0.55, offset: 1 },
        ],
        {
          duration: 440 + i * 44,
          delay: i * 36,
          easing: 'cubic-bezier(.45, 0, .82, .55)',
          fill: 'both',
        },
      );
      this.active.set(animation, dot);
      const remove = () => {
        dot.remove();
        this.active.delete(animation);
      };
      animation.onfinish = remove;
      animation.oncancel = remove;
    }
  }

  clear() {
    for (const [animation, dot] of this.active) {
      animation.cancel();
      dot.remove();
    }
    this.active.clear();
  }
}
