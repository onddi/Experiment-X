// Full-screen view of one carousel item. A click on a cell opens it, growing
// out of the cell with the chosen transition; a click anywhere or Escape
// plays the same transition back into the cell.

export type OpenTransition = 'zoom' | 'reveal' | 'iris' | 'fade' | 'slide' | 'flip';

export const OPEN_TRANSITIONS: [OpenTransition | 'off', string][] = [
  ['off', 'Off'],
  ['zoom', 'Zoom'],
  ['reveal', 'Reveal'],
  ['iris', 'Iris'],
  ['flip', 'Flip'],
  ['fade', 'Fade'],
  ['slide', 'Slide up'],
];

const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

export class Viewer {
  readonly el: HTMLElement;
  private source: HTMLElement | null = null;
  private transition: OpenTransition = 'zoom';
  private anim: Animation | null = null;
  private closing = false;
  /** Set by a press that starts on the open viewer; only such a press closes it. */
  private armed = false;

  constructor(
    parent: HTMLElement,
    private opts: () => { transition: OpenTransition; duration: number; radius: number },
  ) {
    this.el = document.createElement('div');
    this.el.className = 'viewer';
    this.el.hidden = true;
    this.el.title = 'Click or press Escape to close';
    parent.append(this.el);
    // iOS Safari follows a tap with a synthetic click at the same spot, which
    // would land on the freshly opened viewer and close it straight away. So a
    // click only closes the viewer when its press also began on the viewer.
    this.el.addEventListener('pointerdown', () => {
      this.armed = this.isOpen;
    });
    this.el.addEventListener('click', () => {
      if (this.armed) this.close();
      this.armed = false;
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) this.close();
    });
  }

  get isOpen() {
    return !this.el.hidden && !this.closing;
  }

  /** Show `item` (an .item element) full screen, growing out of `from`. */
  open(item: HTMLElement, from: HTMLElement) {
    if (!this.el.hidden) return;
    const { transition, duration } = this.opts();
    this.transition = transition;
    this.source = from;
    const clone = item.cloneNode(true) as HTMLElement;
    for (const p of ['transform', 'visibility', 'opacity', 'z-index', '--turn']) clone.style.removeProperty(p);
    this.el.replaceChildren(clone);
    this.el.style.setProperty('--cell', `${Math.min(innerWidth, innerHeight) * 0.6}px`);
    this.el.hidden = false;
    this.closing = false;
    this.armed = false;
    // Flush layout so WebKit starts the animation from the first keyframe
    // instead of jumping to the end on an element that was display: none.
    void this.el.getBoundingClientRect();
    this.play(false, duration);
    from.blur();
  }

  close() {
    if (this.el.hidden || this.closing) return;
    this.closing = true;
    this.play(true, this.opts().duration);
  }

  private play(reverse: boolean, duration: number) {
    this.anim?.cancel();
    const frames = this.frames();
    const anim = this.el.animate(reverse ? [...frames].reverse() : frames, {
      duration,
      easing: EASE,
      fill: 'both',
    });
    this.anim = anim;
    anim.onfinish = () => {
      if (!reverse) return;
      this.el.hidden = true;
      this.el.replaceChildren();
      this.closing = false;
      anim.cancel();
      this.source?.focus({ preventScroll: true });
    };
  }

  /** Keyframes from "in the cell" to "full screen". */
  private frames(): Keyframe[] {
    const r = this.source!.getBoundingClientRect();
    const W = innerWidth;
    const H = innerHeight;
    const rad = `${Math.min(this.opts().radius, Math.min(r.width, r.height) * 0.25)}px`;
    switch (this.transition) {
      case 'zoom':
        return [
          { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, borderRadius: rad },
          { left: '0px', top: '0px', width: `${W}px`, height: `${H}px`, borderRadius: '0px' },
        ];
      case 'reveal':
        return [
          { clipPath: `inset(${r.top}px ${W - r.right}px ${H - r.bottom}px ${r.left}px round ${rad})` },
          { clipPath: `inset(0px 0px 0px 0px round 0px)` },
        ];
      case 'iris': {
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const far = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy));
        return [
          { clipPath: `circle(${Math.min(r.width, r.height) / 2}px at ${cx}px ${cy}px)`, opacity: 0.6 },
          { clipPath: `circle(${far}px at ${cx}px ${cy}px)`, opacity: 1 },
        ];
      }
      case 'flip': {
        // Swings open like a door turning towards you while it grows out of the cell.
        const sx = r.width / W;
        const sy = r.height / H;
        const dx = r.left + r.width / 2 - W / 2;
        const dy = r.top + r.height / 2 - H / 2;
        const p = `perspective(${W * 1.5}px)`;
        return [
          { transform: `${p} translate(${dx}px, ${dy}px) scale(${sx}, ${sy}) rotateY(-85deg)`, borderRadius: rad, opacity: 0.3 },
          { transform: `${p} translate(${dx * 0.3}px, ${dy * 0.3}px) scale(${sx + (1 - sx) * 0.7}, ${sy + (1 - sy) * 0.7}) rotateY(-30deg)`, opacity: 1, offset: 0.5 },
          { transform: `${p} translate(0px, 0px) scale(1, 1) rotateY(0deg)`, borderRadius: '0px', opacity: 1 },
        ];
      }
      case 'fade':
        return [
          { opacity: 0, transform: 'scale(1.06)' },
          { opacity: 1, transform: 'scale(1)' },
        ];
      case 'slide':
        return [{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }];
    }
  }
}
