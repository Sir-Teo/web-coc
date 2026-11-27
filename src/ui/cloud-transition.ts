/** Non-blocking Clash-style cloud-parting transition across village/battle switches. */
export class CloudTransition {
  private readonly el: HTMLElement;
  private timer: number | null = null;

  constructor(host: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'cloud-veil';
    this.el.setAttribute('aria-hidden', 'true');
    this.el.hidden = true;
    this.el.innerHTML =
      '<div class="cloud-bank mid left"></div><div class="cloud-bank mid right"></div><div class="cloud-bank left"></div><div class="cloud-bank right"></div><div class="cloud-sunburst"></div>';
    host.append(this.el);
  }

  play(reducedMotion: boolean) {
    this.clear();
    if (reducedMotion || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    this.el.hidden = false;
    this.el.dataset.cloudActive = 'true';
    // Force reflow so rapid battle-to-battle transitions restart the parting animation cleanly.
    void this.el.offsetWidth;
    this.el.classList.add('parting');
    this.timer = window.setTimeout(() => this.clear(), 580);
  }

  clear() {
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
    this.el.classList.remove('parting');
    delete this.el.dataset.cloudActive;
    this.el.hidden = true;
  }

  destroy() {
    this.clear();
    this.el.remove();
  }
}
