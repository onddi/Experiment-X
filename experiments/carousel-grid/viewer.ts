// Full-screen view of one carousel item. A click on a cell opens it, growing
// out of the cell with the chosen transition; a click anywhere or Escape
// plays the same transition back into the cell.
//
// The transitions use the browser's View Transitions API: it takes a picture
// of the cell and of the full-screen view, then animates those flat pictures.
// Animating the live elements instead meant redrawing the colour-graded,
// blended image on every frame, which stutters badly in Safari. The
// full-screen view is the cell magnified, so Zoom grows the cell's own
// picture with no change of crop or label size.
// Browsers without View Transitions open and close instantly.
//
// Hand-over: once the cell fills the screen it can fade to black. The black
// screen is where another visualisation takes over (onHandover gets an empty
// container to render into), so nothing expensive lives in the grid itself.
// Closing gives the screen back (onRelease), fades the cell back in and
// zooms it home.

export type OpenTransition = 'zoom' | 'iris';

export const OPEN_TRANSITIONS: [OpenTransition | 'off', string][] = [
  ['off', 'Off'],
  ['zoom', 'Zoom'],
  ['iris', 'Iris'],
];

/** Named timing curves (cubic-bezier control points). */
export const CURVES: Record<string, { label: string; points: [number, number, number, number] }> = {
  smooth: { label: 'Smooth', points: [0.2, 0.8, 0.2, 1] },
  expo: { label: 'Fast start', points: [0.16, 1, 0.3, 1] },
  inout: { label: 'Ease in-out', points: [0.65, 0, 0.35, 1] },
  gentle: { label: 'Gentle', points: [0.4, 0, 0.2, 1] },
  overshoot: { label: 'Overshoot', points: [0.34, 1.4, 0.64, 1] },
  linear: { label: 'Linear', points: [0, 0, 1, 1] },
};

export interface ViewerOptions {
  transition: OpenTransition;
  /** Opening and closing durations, ms. */
  duration: number;
  closeDuration: number;
  /** cubic-bezier control points for both directions. */
  curve: [number, number, number, number];
  /** The cell's corner radius, px. */
  radius: number;
  /** Share of the zoom (0..1) for which the corners stay as round as the cell's. */
  cornerHold: number;
  /** How far the grid behind sinks back while the cell zooms (0 = not at all). */
  recede: number;
  /** Fade to black after opening, in ms (0 = stay on the image). */
  fade: number;
}
const NAME = 'cg-view';

interface ViewTransitionLike {
  finished: Promise<void>;
  skipTransition(): void;
}
type StartViewTransition = (update: () => void) => ViewTransitionLike;

export class Viewer {
  readonly el: HTMLElement;
  private readonly css: HTMLStyleElement;
  private source: HTMLElement | null = null;
  private transition: OpenTransition = 'zoom';
  private running: ViewTransitionLike | null = null;
  private readonly fade: HTMLElement;
  /** Empty container on top of the black, for whatever takes over. */
  readonly slot: HTMLElement;
  private fadeAnim: Animation | null = null;
  private handedOver = false;
  /** Called once the screen is black: render the next visualisation into `slot`. */
  onHandover: ((slot: HTMLElement) => void) | null = null;
  /** Called when closing starts after a hand-over: tear that visualisation down. */
  onRelease: (() => void) | null = null;
  /** Set by a press that starts on the open viewer; only such a press closes it. */
  private armed = false;

  constructor(
    parent: HTMLElement,
    private opts: () => ViewerOptions,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'viewer';
    this.el.hidden = true;
    this.el.title = 'Click or press Escape to close';
    parent.append(this.el);
    this.fade = document.createElement('div');
    this.fade.className = 'viewer-fade';
    this.slot = document.createElement('div');
    this.slot.className = 'viewer-slot';
    this.css = document.createElement('style');
    document.head.append(this.css);
    // iOS Safari follows a tap with a synthetic click at the same spot, which
    // could land on the freshly opened viewer and close it straight away. So a
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
    return !this.el.hidden;
  }

  /** Show `item` (an .item element) full screen, growing out of `from`. */
  open(item: HTMLElement, from: HTMLElement) {
    if (this.isOpen || this.running) return;
    const { transition } = this.opts();
    this.transition = transition;
    this.source = from;
    const clone = item.cloneNode(true) as HTMLElement;
    for (const p of ['transform', 'visibility', 'opacity', 'z-index', '--turn', 'will-change']) clone.style.removeProperty(p);
    // The full-screen view is the cell itself, magnified until it covers the
    // screen: same crop, same label, just bigger. That way growing out of the
    // cell and shrinking back into it is a pure zoom with nothing to jump.
    const r = from.getBoundingClientRect();
    const k = Math.max(innerWidth / r.width, innerHeight / r.height);
    Object.assign(clone.style, {
      inset: 'auto',
      left: '50%',
      top: '50%',
      width: `${r.width}px`,
      height: `${r.height}px`,
      transform: `translate(-50%, -50%) scale(${k})`,
    });
    clone.style.setProperty('--cell', getComputedStyle(from).getPropertyValue('--cell'));
    this.fade.style.opacity = '0';
    this.slot.replaceChildren();
    this.el.replaceChildren(clone, this.fade, this.slot);
    this.armed = false;
    from.blur();
    this.run(false, () => {
      this.el.hidden = false;
    });
  }

  /** After the cell fills the screen: fade to black, then hand over. */
  private afterOpen() {
    const { fade } = this.opts();
    if (!fade || !this.isOpen) return;
    const anim = this.fade.animate([{ opacity: 0 }, { opacity: 1 }], { duration: fade, easing: 'ease-in-out', fill: 'forwards' });
    this.fadeAnim = anim;
    anim.onfinish = () => {
      if (this.fadeAnim !== anim) return;
      this.handedOver = true;
      this.onHandover?.(this.slot);
    };
  }

  close() {
    if (!this.isOpen || this.running) return;
    const anim = this.fadeAnim;
    if (anim) {
      // Give the screen back, fade the image in again, then zoom home.
      this.fadeAnim = null;
      if (this.handedOver) {
        this.handedOver = false;
        this.onRelease?.();
        this.slot.replaceChildren();
      }
      const from = Number(getComputedStyle(this.fade).opacity);
      anim.cancel();
      this.fade.style.opacity = '0';
      const back = this.fade.animate([{ opacity: from }, { opacity: 0 }], {
        duration: this.opts().fade * from * 0.6,
        easing: 'ease-in-out',
      });
      this.running = { finished: back.finished.then(() => {}), skipTransition: () => back.finish() };
      back.onfinish = () => {
        this.running = null;
        this.close();
      };
      return;
    }
    this.run(true, () => {
      this.el.hidden = true;
      this.el.replaceChildren();
    });
  }

  private run(closing: boolean, update: () => void) {
    const start = (document as Document & { startViewTransition?: StartViewTransition }).startViewTransition;
    const source = this.source!;
    if (!start) {
      update();
      if (closing) source.focus({ preventScroll: true });
      else this.afterOpen();
      return;
    }
    // Zoom morphs the cell into the viewer, so both carry the shared name on
    // their side of the change; Iris only animates the viewer.
    const morph = this.transition === 'zoom';
    this.css.textContent = this.styles(closing);
    if (morph && !closing) source.style.viewTransitionName = NAME;
    if (closing) this.el.style.viewTransitionName = NAME;
    const vt = start.call(document, () => {
      update();
      if (closing) {
        this.el.style.viewTransitionName = '';
        if (morph) source.style.viewTransitionName = NAME;
      } else {
        source.style.viewTransitionName = '';
        this.el.style.viewTransitionName = NAME;
      }
    });
    this.running = vt;
    vt.finished.finally(() => {
      source.style.viewTransitionName = '';
      this.el.style.viewTransitionName = '';
      this.running = null;
      if (closing) source.focus({ preventScroll: true });
      else this.afterOpen();
    });
  }

  /** CSS for the transition's snapshot pseudo-elements. */
  private styles(closing: boolean) {
    const o = this.opts();
    const r = this.source!.getBoundingClientRect();
    const W = innerWidth;
    const H = innerHeight;
    const rad = Math.min(o.radius, Math.min(r.width, r.height) * 0.25);
    const ms = closing ? o.closeDuration : o.duration;
    const ease = `cubic-bezier(${o.curve.join(', ')})`;
    // Closing plays the same curve forwards (big to small), not mirrored.
    const time = `${ms}ms ${ease} both`;
    // Keyframes are written "cell end" to "screen end"; closing swaps them.
    const frames = (cell: string, screen: string, mid = '') =>
      closing ? `from { ${screen} } ${mid} to { ${cell} }` : `from { ${cell} } ${mid} to { ${screen} }`;
    let css = `
      ::view-transition-old(root), ::view-transition-new(root) { animation: none; }
      ::view-transition-group(${NAME}) { animation-duration: ${ms}ms; animation-timing-function: ${ease}; overflow: clip; }
      ::view-transition-old(${NAME}), ::view-transition-new(${NAME}) {
        width: 100%; height: 100%;
        animation-duration: ${ms}ms; animation-timing-function: ${ease};
      }`;
    if (o.recede > 0) {
      // The grid sinks back and darkens a little as the cell comes forward.
      const s = 1 - o.recede * 0.12;
      css += `
        ::view-transition-old(root) { display: none; }
        ::view-transition-new(root) { animation: cg-recede ${time}; }
        @keyframes cg-recede { ${frames('transform: none; opacity: 1;', `transform: scale(${s}); opacity: ${1 - o.recede * 0.5};`)} }`;
    }
    if (this.transition === 'zoom') {
      // The full-screen view is the cell magnified, so its picture fits inside
      // the morphing box ("contain") exactly where the cell's picture covers
      // it. Laid over the cell's picture with no cross-fade, the two line up
      // at every size, so nothing ghosts or jumps; the cell's picture only
      // fills the edges the full-screen one doesn't reach.
      const big = `::view-transition-${closing ? 'old' : 'new'}(${NAME})`;
      const small = `::view-transition-${closing ? 'new' : 'old'}(${NAME})`;
      const hold = Math.round(Math.min(0.95, o.cornerHold) * 100);
      // Corners stay as round as the cell's for the first part of the zoom.
      const mid = hold > 0 ? `${closing ? 100 - hold : hold}% { border-radius: ${rad}px; }` : '';
      css += `
        ${big} { object-fit: contain; z-index: 1; animation: none; opacity: 1; }
        ${small} { object-fit: cover; animation: none; opacity: 1; }
        ::view-transition-image-pair(${NAME}) { overflow: clip; animation: cg-round ${time}; }
        @keyframes cg-round { ${frames(`border-radius: ${rad}px;`, 'border-radius: 0px;', mid)} }`;
    } else {
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const far = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy));
      const view = `::view-transition-${closing ? 'old' : 'new'}(${NAME})`;
      css += `
        ${view} { animation: cg-iris ${time}; }
        @keyframes cg-iris { ${frames(
          `clip-path: circle(${Math.min(r.width, r.height) / 2}px at ${cx}px ${cy}px);`,
          `clip-path: circle(${far}px at ${cx}px ${cy}px);`,
        )} }`;
    }
    return css;
  }
}
