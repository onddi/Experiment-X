// Full-screen view of one carousel item. A click on a cell opens it, growing
// out of the cell with the chosen transition; a click anywhere or Escape
// plays the same transition back into the cell.
//
// Every transition animates only transform and opacity, so the browser can run
// it on the GPU without repainting. (Animating size or clip-path repaints the
// filtered, blended full-screen image every frame, which stutters on Safari.)
// A growing box is an outer layer scaled from the cell's rect to the screen,
// with the image in an inner layer counter-scaled so it never stretches.

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
const ease = cubicBezier(0.2, 0.8, 0.2, 1);

export class Viewer {
  readonly el: HTMLElement;
  private readonly box: HTMLElement;
  private readonly inner: HTMLElement;
  private source: HTMLElement | null = null;
  private transition: OpenTransition = 'zoom';
  private anims: Animation[] = [];
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
    this.box = document.createElement('div');
    this.box.className = 'viewer-box';
    this.inner = document.createElement('div');
    this.inner.className = 'viewer-inner';
    this.box.append(this.inner);
    this.el.append(this.box);
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
    for (const p of ['transform', 'visibility', 'opacity', 'z-index', '--turn', 'will-change']) clone.style.removeProperty(p);
    this.inner.replaceChildren(clone);
    this.el.style.setProperty('--cell', `${Math.min(innerWidth, innerHeight) * 0.6}px`);
    this.el.hidden = false;
    this.closing = false;
    this.armed = false;
    this.place();
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

  /** Lay the box and image out at their final, full-screen place. */
  private place() {
    const b = this.box.style;
    const i = this.inner.style;
    const W = innerWidth;
    const H = innerHeight;
    if (this.transition === 'iris') {
      // The box is a circle around the cell's centre, big enough to cover the screen.
      const { cx, cy, far } = this.iris();
      Object.assign(b, { left: `${cx - far}px`, top: `${cy - far}px`, width: `${far * 2}px`, height: `${far * 2}px`, borderRadius: '50%', transformOrigin: '50% 50%' });
      Object.assign(i, { left: `${far - cx}px`, top: `${far - cy}px`, width: `${W}px`, height: `${H}px`, transformOrigin: `${cx}px ${cy}px` });
    } else {
      Object.assign(b, { left: '0px', top: '0px', width: `${W}px`, height: `${H}px`, borderRadius: '0px', transformOrigin: '0 0' });
      Object.assign(i, { left: '0px', top: '0px', width: `${W}px`, height: `${H}px`, transformOrigin: '0 0' });
    }
  }

  private iris() {
    const r = this.source!.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const far = Math.hypot(Math.max(cx, innerWidth - cx), Math.max(cy, innerHeight - cy));
    return { r, cx, cy, far };
  }

  private play(reverse: boolean, duration: number) {
    for (const a of this.anims) a.cancel();
    const { box, inner, sampled } = this.frames(reverse);
    // Sampled frames already carry the easing (Safari only runs multi-keyframe
    // animations on the GPU when the overall timing is linear); two-keyframe
    // ones are eased as a whole and simply played backwards to close.
    const run = (el: HTMLElement, frames: Keyframe[]) =>
      el.animate(sampled || !reverse ? frames : [...frames].reverse(), {
        duration,
        easing: sampled ? 'linear' : EASE,
        fill: 'both',
      });
    this.anims = [run(this.box, box), run(this.inner, inner)];
    this.anims[0].onfinish = () => {
      if (!reverse) return;
      this.el.hidden = true;
      this.inner.replaceChildren();
      this.closing = false;
      for (const a of this.anims) a.cancel();
      this.source?.focus({ preventScroll: true });
    };
  }

  /** Keyframes for the box and the image, from "in the cell" to "full screen". */
  private frames(reverse: boolean): { box: Keyframe[]; inner: Keyframe[]; sampled: boolean } {
    const r = this.source!.getBoundingClientRect();
    const W = innerWidth;
    const H = innerHeight;
    const STEPS = 24;
    // Sample the rect from the cell to the screen so the image stays
    // undistorted between keyframes. The easing is baked into the samples.
    const sampled = (f: (p: number, x: number, y: number, w: number, h: number) => [Keyframe, Keyframe]) => {
      const box: Keyframe[] = [];
      const inner: Keyframe[] = [];
      for (let s = 0; s <= STEPS; s++) {
        const t = s / STEPS;
        const p = reverse ? 1 - ease(t) : ease(t);
        const x = r.left * (1 - p);
        const y = r.top * (1 - p);
        const w = r.width + (W - r.width) * p;
        const h = r.height + (H - r.height) * p;
        const [b, i] = f(p, x, y, w, h);
        box.push({ ...b, offset: t });
        inner.push({ ...i, offset: t });
      }
      return { box, inner, sampled: true };
    };
    // Box: the screen-sized layer squeezed onto rect (x, y, w, h).
    const boxAt = (x: number, y: number, w: number, h: number) => `translate(${x}px, ${y}px) scale(${w / W}, ${h / H})`;
    // Image covering that rect, centred (like background-size: cover).
    const cover = (w: number, h: number) => {
      const k = Math.max(w / W, h / H);
      return `translate(${W / 2}px, ${H / 2}px) scale(${(k * W) / w}, ${(k * H) / h}) translate(${-W / 2}px, ${-H / 2}px)`;
    };
    const none = { transform: 'none', opacity: 1 };
    switch (this.transition) {
      case 'zoom':
        return sampled((_p, x, y, w, h) => [{ transform: boxAt(x, y, w, h) }, { transform: cover(w, h) }]);
      case 'reveal':
        // The window grows but the image stays put underneath it.
        return sampled((_p, x, y, w, h) => [
          { transform: boxAt(x, y, w, h) },
          { transform: `scale(${W / w}, ${H / h}) translate(${-x}px, ${-y}px)` },
        ]);
      case 'flip':
        // Swings open like a door turning towards you while it grows out of the cell.
        return sampled((p, x, y, w, h) => {
          const cx = x + w / 2;
          const cy = y + h / 2;
          const turn = `translate(${cx}px, ${cy}px) perspective(${W * 1.5}px) rotateY(${-85 * (1 - p)}deg) translate(${-cx}px, ${-cy}px)`;
          return [{ transform: `${turn} ${boxAt(x, y, w, h)}`, opacity: Math.min(1, 0.3 + p * 1.4) }, { transform: cover(w, h) }];
        });
      case 'iris': {
        const { r: rect, far } = this.iris();
        const s0 = Math.min(rect.width, rect.height) / 2 / far;
        // The circle grows while the image inside is scaled back by the same
        // amount, so it stays put; sampled so the two cancel at every step.
        return sampled((p) => {
          const s = s0 + (1 - s0) * p;
          return [{ transform: `scale(${s})`, opacity: 0.6 + 0.4 * p }, { transform: `scale(${1 / s})` }];
        });
      }
      case 'fade':
        return { box: [{ opacity: 0, transform: 'scale(1.06)' }, none], inner: [{ transform: 'none' }, { transform: 'none' }], sampled: false };
      case 'slide':
        return { box: [{ transform: 'translateY(100%)' }, { transform: 'none' }], inner: [{ transform: 'none' }, { transform: 'none' }], sampled: false };
    }
  }
}

/** CSS cubic-bezier timing function as a JS function of progress 0..1. */
function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const at = (a: number, b: number, t: number) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  return (x: number) => {
    if (x <= 0 || x >= 1) return x;
    let lo = 0;
    let hi = 1;
    for (let k = 0; k < 30; k++) {
      const mid = (lo + hi) / 2;
      if (at(x1, x2, mid) < x) lo = mid;
      else hi = mid;
    }
    return at(y1, y2, (lo + hi) / 2);
  };
}
